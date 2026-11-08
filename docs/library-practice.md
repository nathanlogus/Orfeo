# Library tools and recorded performances

Open **Library → Library tools** to manage imports, offline songs, personal
song details, practice setlists and recordings. The tools work on desktop and
Android; settings and personal edits belong to the device using them.

## Find new songs

Use **Recently added** to clear older filters and show the newest songs first.
Songs added in the last seven days have a **New** badge. The server index
refreshes every twenty seconds while the library is visible, and **Refresh**
checks immediately. Active search and filters are shown above the results.
The **Brazilian** genre includes MPB, bossa nova, samba, choro and the other
Brazilian subgenres; those subgenres are still available individually.

## Watch an import folder

Under **Import inbox**, choose the folder containing downloads and the folder
your collection (or home server) uses. Enable **Watch for new songs**. Watching
runs while Pliage is open; **Check now** also works without enabling watching.
Configure the computer's Downloads folder on that computer. Android folder
pickers use files available on the tablet.

The inbox skips identical source files using SHA-256 fingerprints. Review a
new song to convert supported notation into MIDI and check the playable note
count. Correct its title, artist and genre, optionally choose a Spotify cover,
then add it. The original file stays in its source folder; a score copy travels
beside the imported MIDI as `.sheet`. Existing files are never overwritten.
If a source changes after review, review it again before importing it.

Spotify searches use the existing private `~/.pliage-spotify.json` on the
computer. While browsing Home server, tablet lookups use that computer's
Spotify connection. No credentials are put into the app or exposed to the tablet.
Matching covers are shown for review; the app never silently assigns a cover
from an unrelated artist. Without configured credentials, an HTTPS image URL
can be entered manually.

## Take songs offline

Switch to **Home server**, narrow the library if desired, and open **Offline
songs**. Select individual songs or all matching songs, then Download. A
complete offline entry includes MIDI, the original score if supplied, artwork
if supplied, and song metadata. Failed downloads are reported individually;
retry them to finish. Stop a batch after its current song without discarding
the songs already saved.

Saved entries appear under **This device**, including their titles, covers and
genres, without needing the server. Named setlists use a saved local copy when
one is available. Existing song versions and practice progress are retained.

## Edit song details

Use a card's details button, a row's **Details**, or the **Song details** tab.
Change the title, artist/composer, genre and cover. Saved changes immediately
participate in library searching and filtering. Text edits preserve existing
covers. Restore original removes the personal override. These edits do not
rewrite MIDI files or change the read-only server's collection for other users.

## Save a practice setlist

Create a named list under **Practice setlists**, add songs, and move them up or
down. Each entry stores tempo percentage, hand-track focus and an optional
practice section in seconds. A section with an end loops for focused practice;
use the set player's Skip control when ready to move on. Hand focus mutes an
opposing, explicitly assigned hand track; mixed or unlabelled tracks remain
available. Files with no separate hand tracks keep their existing layout.

## Record and compare takes

Open a song and choose **Record take** in the practice header. Play a connected
MIDI keyboard, then stop the take to save it. Recordings retain note timing,
velocity, MIDI channels, sustain/controller events and pitch bend. A note still
held when recording stops is closed and sustain is released. Recordings are
saved separately from the song and from practice progress.

Under **Recordings**, listen to complete takes, export standard `.mid` files,
or delete individual takes. Select two takes to compare duration, note count
and average note density. These describe what was recorded and are not claimed
as note-accuracy scores. Recordings contain MIDI performance data, not microphone
audio or a sampled recording of the selected piano.
