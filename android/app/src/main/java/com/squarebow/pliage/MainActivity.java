package com.squarebow.pliage;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the Pliage interface and its file/download bridge. Native MIDI and
 * AAudio can run independently of the page for low-latency practice audio.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PICK_FILE = 1, PICK_FOLDER = 2;
    private static final String MEDIA_FILE = "(?i).*\\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$";

    private WebView web;
    private File root;
    private final NativePiano nativePiano = new NativePiano();
    private NativeMidiInput nativeMidi;
    private final java.util.concurrent.ExecutorService pianoWorker = java.util.concurrent.Executors.newSingleThreadExecutor();
    private volatile boolean destroyed;
    private int pendingPick;
    private final Map<Integer, HttpURLConnection> downloads = Collections.synchronizedMap(new HashMap<>());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        root = getFilesDir();
        nativeMidi = new NativeMidiInput(this, nativePiano);
        extractResources();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web = new WebView(this);
        web.setBackgroundColor(0xFFF1E8DE); // paper, not a white flash before the splash paints
        setContentView(web);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        web.addJavascriptInterface(new Bridge(), "PliageBridge");
        web.setWebChromeClient(new WebChromeClient() {
            // Newer WebViews ask before Web MIDI; only MIDI is ever granted
            @Override public void onPermissionRequest(PermissionRequest r) {
                if (r.getOrigin() != null && HOST.equals(r.getOrigin().getHost())
                        && r.getResources().length == 1
                        && PermissionRequest.RESOURCE_MIDI_SYSEX.equals(r.getResources()[0])) r.grant(r.getResources());
                else r.deny();
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (!HOST.equals(r.getUrl().getHost())) return null;
                return "/homeart".equals(r.getUrl().getPath()) ? homeArt(r.getUrl().getQueryParameter("u")) : serve(r.getUrl().getPath());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (HOST.equals(r.getUrl().getHost())) return false;
                openUrl(r.getUrl().toString());
                return true;
            }
        });
        web.loadUrl("https://" + HOST + "/index.html");
    }

    private void hideBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }

    @Override protected void onResume() { super.onResume(); nativePiano.setSuspended(false); web.onResume(); hideBars(); }
    @Override protected void onPause() {
        nativeMidi.enable(false);
        nativePiano.setSuspended(true);
        pianoWorker.execute(nativePiano::stop);
        web.onPause(); super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed = true; nativePiano.setSuspended(true);
        nativeMidi.close();
        pianoWorker.execute(nativePiano::stop); pianoWorker.shutdown();
        web.destroy(); super.onDestroy();
    }

    /** The page's close path, so unsaved edits get asked about just like on desktop. */
    @Override public void onBackPressed() { web.evaluateJavascript("window.__pliageBack && __pliageBack()", null); }

    // ── The app itself, and the sound sets the page reads as /fs/<path> ─────
    private WebResourceResponse serve(String path) {
        try {
            InputStream in = path.startsWith("/fs/")
                    ? new FileInputStream(safe(path.substring(3)))
                    : getAssets().open("web" + path, AssetManager.ACCESS_STREAMING);
            String ext = MimeTypeMap.getFileExtensionFromUrl(path).toLowerCase();
            String mime = ext.equals("js") ? "text/javascript" : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            return new WebResourceResponse(mime != null ? mime : "application/octet-stream", null, in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", null, 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
        }
    }

    /** Demo songs and PDF fonts as real files, where main.ts looks for them. */
    private void extractResources() {
        SharedPreferences p = getPreferences(MODE_PRIVATE);
        long version;
        try { version = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime; }
        catch (Exception e) { version = 0; }
        if (p.getLong("extracted", -1) == version) return;
        try {
            copyAssets("web/Demo", new File(root, "resources/demo"));
            copyAssets("web/fonts", new File(root, "resources/fonts"));
            p.edit().putLong("extracted", version).apply();
        } catch (IOException e) { android.util.Log.e("Pliage", "extract failed", e); }
    }

    private void copyAssets(String from, File to) throws IOException {
        String[] kids = getAssets().list(from);
        if (kids == null || kids.length == 0) {
            to.getParentFile().mkdirs();
            try (InputStream in = getAssets().open(from); OutputStream out = new FileOutputStream(to)) { pump(in, out); }
            return;
        }
        for (String k : kids) copyAssets(from + "/" + k, new File(to, k));
    }

    private static void pump(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[65536];
        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
    }

    /** The bridge is the page's whole reach: nothing outside the app's own folder. */
    private File safe(String path) throws IOException {
        File f = new File(path).getCanonicalFile();
        String base = root.getCanonicalPath();
        if (!f.getPath().equals(base) && !f.getPath().startsWith(base + File.separator)) throw new IOException("outside app storage: " + path);
        return f;
    }

    private void answer(int id, Object... args) {
        StringBuilder js = new StringBuilder("__pliage(").append(id);
        for (Object a : args) js.append(',').append(a == null ? "null" : a instanceof String ? JSONObject.quote((String) a) : a.toString());
        String call = js.append(')').toString();
        runOnUiThread(() -> web.evaluateJavascript(call, null));
    }

    private void openUrl(String url) {
        if (url.startsWith("https://") || url.startsWith("http://")) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    // ── System pickers: what comes back is copied in, so it has a real path ──
    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        int id = pendingPick;
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (uri == null) { answer(id, (Object) null); return; }
        new Thread(() -> {
            try {
                File dest = request == PICK_FOLDER ? importFolder(uri) : importFile(uri);
                answer(id, dest.getPath());
            } catch (Exception e) {
                android.util.Log.e("Pliage", "import failed", e);
                answer(id, (Object) null);
            }
        }).start();
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && c.getString(0) != null) return new File(c.getString(0)).getName();
        }
        return "file";
    }

    private File importFile(Uri uri) throws IOException {
        File dest = new File(root, "Imports/" + System.currentTimeMillis() + "/" + displayName(uri));
        dest.getParentFile().mkdirs();
        try (InputStream in = getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(dest)) { pump(in, out); }
        return dest;
    }

    private File importFolder(Uri tree) throws IOException {
        String id = DocumentsContract.getTreeDocumentId(tree);
        String name = new File(id.substring(id.indexOf(':') + 1)).getName();
        File dest = new File(root, "Library/" + (name.isEmpty() ? "Music" : name));
        dest.mkdirs();
        copyTree(tree, id, dest);
        return dest;
    }

    private void copyTree(Uri tree, String parent, File dest) throws IOException {
        Uri kids = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parent);
        String[] cols = {DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME, DocumentsContract.Document.COLUMN_MIME_TYPE};
        try (Cursor c = getContentResolver().query(kids, cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                String name = new File(c.getString(1)).getName();
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c.getString(2))) {
                    copyTree(tree, c.getString(0), new File(dest, name));
                } else if (name.matches(MEDIA_FILE)) {
                    dest.mkdirs();
                    File f = new File(dest, name);
                    if (f.exists()) continue; // a re-import never overwrites edits
                    Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
                    try (InputStream in = getContentResolver().openInputStream(doc); OutputStream out = new FileOutputStream(f)) { pump(in, out); }
                }
            }
        }
    }

    /** A secure page can't show a plain-HTTP image, so song art from the home server comes through here. */
    private WebResourceResponse homeArt(String url) {
        try {
            if (url == null || !new URL(url).getPath().equals("/api/art") || !onHomeNetwork(url)) throw new IOException("not song art");
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(2000);
            c.setReadTimeout(10000);
            if (c.getResponseCode() != 200) throw new IOException("server answered " + c.getResponseCode());
            return new WebResourceResponse(c.getContentType(), null, c.getInputStream());
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", null, 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
        }
    }

    /** The app allows plain HTTP for the song server alone, so nothing else may use it. */
    private static boolean onHomeNetwork(String url) throws IOException {
        URL u = new URL(url);
        InetAddress a = InetAddress.getByName(u.getHost());
        return "http".equals(u.getProtocol()) && (a.isSiteLocalAddress() || a.isLinkLocalAddress());
    }

    /** Runs on WebView's bridge thread; a thrown exception becomes a JS exception. */
    private class Bridge {
        @JavascriptInterface public void pianoStart(int id, String path, double gain, int rate, boolean exclusive) {
            pianoWorker.execute(() -> {
                try {
                    File sf = new File(root, "resources/GeneralUser-GS.sf2");
                    if (!sf.exists()) {
                        File temporary = new File(root, "resources/GeneralUser-GS.sf2.tmp");
                        try (InputStream in = getAssets().open("web/GeneralUser-GS.sf2"); OutputStream out = new FileOutputStream(temporary)) { pump(in, out); }
                        if (!temporary.renameTo(sf)) throw new IOException("Couldn't prepare the bundled piano sound set.");
                    }
                    nativePiano.start(sf.getCanonicalPath(), path.isEmpty() ? "" : safe(path).getCanonicalPath(), (float) gain, rate, exclusive);
                    nativeMidi.enable(true);
                    if (!destroyed) answer(id, (Object) null);
                } catch (Exception e) { if (!destroyed) answer(id, e.getMessage()); }
            });
        }
        @JavascriptInterface public void pianoStop() { nativeMidi.enable(false); nativePiano.stop(); }
        @JavascriptInterface public void pianoMidi(int status, int a, int b) { nativePiano.midi(status, a, b); }
        @JavascriptInterface public void pianoGain(double gain) { nativePiano.gain((float) gain); }
        @JavascriptInterface public String pianoStatus() {
            try {
                JSONObject status = new JSONObject(nativePiano.status()), midi = nativeMidi.status();
                java.util.Iterator<String> keys = midi.keys(); while (keys.hasNext()) { String key = keys.next(); status.put(key, midi.get(key)); }
                return status.toString();
            } catch (Exception e) { return "{\"running\":false}"; }
        }
        @JavascriptInterface public void pianoMidiConfig(String json) throws Exception { nativeMidi.configure(json); }
        @JavascriptInterface public boolean pianoOwnsDevice(String key) { return nativeMidi.owns(key); }
        @JavascriptInterface public void pianoMidiRescan() { nativeMidi.rescan(); }
        @JavascriptInterface public void pianoMidiReset() { nativeMidi.requestReset(); }
        @JavascriptInterface public void pianoCommand(String json) {
            pianoWorker.execute(() -> {
                try { JSONObject request = new JSONObject(json); nativePiano.command(request.getString("method"), request.getJSONArray("args")); }
                catch (Exception e) { android.util.Log.e("PliageAudio", "Native audio command failed", e); }
            });
        }
        @JavascriptInterface public String dirs() throws Exception {
            return new JSONObject().put("files", root.getCanonicalPath()).put("resources", new File(root, "resources").getCanonicalPath()).toString();
        }
        @JavascriptInterface public String stat(String p) throws Exception {
            File f = safe(p);
            if (!f.exists()) return "";
            return new JSONObject().put("dir", f.isDirectory()).put("size", f.length()).put("mtime", f.lastModified()).toString();
        }
        @JavascriptInterface public String list(String p) throws Exception {
            File[] kids = safe(p).listFiles();
            if (kids == null) throw new IOException("ENOENT: " + p);
            JSONArray out = new JSONArray();
            for (File k : kids) out.put(new JSONObject().put("name", k.getName()).put("dir", k.isDirectory()));
            return out.toString();
        }
        @JavascriptInterface public String read(String p) throws Exception {
            try (InputStream in = new FileInputStream(safe(p))) {
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                pump(in, out);
                return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            }
        }
        @JavascriptInterface public void write(String p, String base64) throws Exception {
            File f = safe(p), tmp = new File(f.getPath() + ".tmp");
            f.getParentFile().mkdirs();
            // Whole file or nothing: a full disk must not leave half a saved song
            try (OutputStream out = new FileOutputStream(tmp)) { out.write(Base64.decode(base64, Base64.NO_WRAP)); }
            if (!tmp.renameTo(f)) { tmp.delete(); throw new IOException("write failed: " + p); }
        }
        @JavascriptInterface public void mkdir(String p) throws Exception { safe(p).mkdirs(); }
        @JavascriptInterface public void remove(String p) throws Exception {
            if (!safe(p).delete()) throw new IOException("delete failed: " + p);
        }
        @JavascriptInterface public void rename(String a, String b) throws Exception {
            if (!safe(a).renameTo(safe(b))) throw new IOException("rename failed: " + a);
        }
        @JavascriptInterface public void copy(String a, String b) throws Exception {
            try (InputStream in = new FileInputStream(safe(a)); OutputStream out = new FileOutputStream(safe(b))) { pump(in, out); }
        }
        @JavascriptInterface public void pick(int id, boolean folder) {
            pendingPick = id;
            Intent i = folder ? new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                    : new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            startActivityForResult(i, folder ? PICK_FOLDER : PICK_FILE);
        }
        @JavascriptInterface public void message(int id, String title, String text, String buttonsJson) throws Exception {
            JSONArray b = new JSONArray(buttonsJson);
            runOnUiThread(() -> {
                AlertDialog.Builder d = new AlertDialog.Builder(MainActivity.this).setTitle(title).setMessage(text).setCancelable(false);
                // Android shows at most three buttons
                if (b.length() > 0) d.setPositiveButton(b.optString(0), (x, w) -> answer(id, 0));
                if (b.length() > 1) d.setNegativeButton(b.optString(1), (x, w) -> answer(id, 1));
                if (b.length() > 2) d.setNeutralButton(b.optString(2), (x, w) -> answer(id, 2));
                d.show();
            });
        }
        /** Asks the home network for a song server: its address, or null. */
        @JavascriptInterface public void discover(int id) {
            new Thread(() -> {
                String found = null;
                try (DatagramSocket s = new DatagramSocket()) {
                    s.setBroadcast(true);
                    s.setSoTimeout(1500);
                    byte[] probe = "pliage-songs?".getBytes(StandardCharsets.UTF_8);
                    s.send(new DatagramPacket(probe, probe.length, InetAddress.getByName("255.255.255.255"), 8765));
                    DatagramPacket reply = new DatagramPacket(new byte[64], 64);
                    s.receive(reply);
                    String text = new String(reply.getData(), 0, reply.getLength(), StandardCharsets.UTF_8);
                    if (text.matches("pliage-songs:\\d{1,5}") && reply.getAddress().isSiteLocalAddress())
                        found = reply.getAddress().getHostAddress() + text.substring(text.indexOf(':'));
                } catch (IOException e) { android.util.Log.i("Pliage", "no song server: " + e.getMessage()); }
                answer(id, found);
            }).start();
        }
        @JavascriptInterface public void openUrl(String url) { MainActivity.this.openUrl(url); }
        @JavascriptInterface public void share(String p) throws Exception {
            File f = safe(p);
            String type = URLConnection.guessContentTypeFromName(f.getName());
            Intent i = new Intent(Intent.ACTION_SEND).setType(type != null ? type : "application/octet-stream")
                    .putExtra(Intent.EXTRA_STREAM, FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", f))
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, f.getName()));
        }
        @JavascriptInterface public void httpOpen(int id, String url) {
            new Thread(() -> {
                try {
                    boolean https = url.startsWith("https://");
                    if (!https && !onHomeNetwork(url)) throw new IOException("https or home network only");
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    // An unreachable song server is normal away from home: give up quickly, and stay on it
                    if (!https) { c.setInstanceFollowRedirects(false); c.setConnectTimeout(2000); c.setReadTimeout(10000); }
                    int status = c.getResponseCode();
                    if (status < 400) downloads.put(id, c); else c.disconnect();
                    answer(id, "head", status, c.getContentLengthLong());
                } catch (Exception e) { answer(id, "error", String.valueOf(e.getMessage())); }
            }).start();
        }
        @JavascriptInterface public void httpSave(int id, String path) {
            HttpURLConnection c = downloads.remove(id);
            if (c == null) return;
            new Thread(() -> {
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(safe(path))) {
                    byte[] buf = new byte[65536];
                    // Songs are small: report often enough for them to show a percentage
                    long length = c.getContentLengthLong();
                    long every = length > 0 ? Math.min(1 << 20, Math.max(length / 20, 4096)) : 1 << 20;
                    long sinceReport = 0;
                    for (int n; (n = in.read(buf)) > 0; ) {
                        out.write(buf, 0, n);
                        sinceReport += n;
                        if (sinceReport >= every) { answer(id, "data", sinceReport); sinceReport = 0; }
                    }
                    answer(id, "done");
                } catch (Exception e) {
                    answer(id, "error", String.valueOf(e.getMessage()));
                } finally { c.disconnect(); }
            }).start();
        }
        @JavascriptInterface public void exit() { runOnUiThread(MainActivity.this::finish); }
    }
}
