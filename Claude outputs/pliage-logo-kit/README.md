# Pliage logo kit

**The idea:** one sheet, one fold. Folding the bottom corner of a sheet forward draws the P, and the flap shows the back of the paper.
Colours: **Ink + Sun**, the same pair as the app's main buttons.

## What's here

| Folder | Contents |
|---|---|
| `logo/` | SVG masters: `symbol`, `symbol-small` (for 32px and under), `horizontal`, `stacked`, `wordmark` |
| `png/` | Transparent PNGs of every SVG (symbols 1024px tall, lockups 1600px wide) |
| `android/res/` | Drop-in Android resources: adaptive icon, themed icon, notification icon, splash icon, legacy PNGs |
| `android/play-store/` | Play Store icon (512×512) and feature graphic (1024×500) |
| `web/` | favicon.ico/svg, apple-touch icon, PWA icons, `site.webmanifest`, `head-snippet.html` for the Electron/web build |

Each logo comes in five colourways:

| File suffix | Use on | Sheet | Back of fold | Word |
|---|---|---|---|---|
| `-color` | paper, linen, white | Ink | Sun | Ink |
| `-reversed` | ink, night, dark photos | Paper | Sun | Paper |
| `-on-sun` | the sun-yellow background | Ink | Paper | Ink |
| `-black` | one-colour print, stamps, fax-like uses | Black, fold shown by a crease gap | | |
| `-white` | one-colour on dark | White, fold shown by a crease gap | | |

## Colours

| Name | HEX | RGB | CMYK (approx., proof before print) |
|---|---|---|---|
| Ink | `#000000` | 0 0 0 | 60 40 40 100 (rich black) |
| Sun | `#FFDE3B` | 255 222 59 | 0 13 77 0 |
| Paper | `#FBF8F5` | 251 248 245 | 0 1 2 2 |
| Linen (background) | `#F1E8DE` | 241 232 222 | 0 4 8 5 |

Sun is a shape colour, never a text colour on paper (contrast is too low for words).

## Clear space and minimum size

- **Clear space:** keep a gap the width of the P's stem (the narrow black upright) on every side.
- **Minimum size:** symbol 16px on screen (use `symbol-small` at 32px and below) or 6mm in print. Horizontal lockup 96px wide or 25mm in print.

## Android: how to install

The project is at `android/app/src/main/res` and has `minSdk 26`, so adaptive icons work on every device it supports.

1. Copy everything in `android/res/` into `android/app/src/main/res/`. This replaces the five `mipmap-*/ic_launcher.png` files and adds the rest.
2. In `AndroidManifest.xml`, on `<application>`:
   - change `android:label="Orfeo"` to `android:label="Pliage"`
   - add `android:roundIcon="@mipmap/ic_launcher_round"` next to `android:icon`
3. **Themed icons (Android 13+):** nothing more to do. `ic_launcher_monochrome` is already wired in the adaptive icon XML.
4. **Notifications:** use `R.drawable.ic_stat_pliage` as the small icon.
5. **Splash screen (Android 12+):** the system shows the launcher icon on its own. To match the brand, add a theme with
   `android:windowSplashScreenBackground` = `@color/pliage_sun` and, if you want a bigger mark,
   `android:windowSplashScreenAnimatedIcon` = `@drawable/ic_splash_pliage`.

The launcher icon's mark is 52dp tall on the 108dp canvas, inside the 66dp safe circle, so no launcher mask crops it.

## Web / Electron

Copy `web/` files into the public folder and paste `head-snippet.html` into `index.html`'s `<head>`.

## Type

The wordmark is **Inter Display SemiBold**, converted to shapes, with one custom detail: the dot on the i is a tiny folded sheet. Inter is under the SIL Open Font License, which allows logo use. Never retype the name in a font; use the files.

## Please don't

Stretch, rotate or recolour the logo outside these colourways · add shadows, gradients or outlines · put the Ink version on dark or the Sun-backed version on yellow (the fold disappears) · move the symbol and word closer or further apart · retype the wordmark.
