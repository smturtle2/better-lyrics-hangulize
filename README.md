<h1 align="center">Better Lyrics Hangulize</h1>

<p align="center"><strong>Sing along in Hangul.</strong></p>

<p align="center">Turns <a href="https://github.com/better-lyrics/better-lyrics">Better Lyrics</a> romanization into Hangul pronunciation guides on YouTube Music. Conversion runs locally in your browser.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tampermonkey-userscript-00485B?style=flat-square&amp;logo=tampermonkey&amp;logoColor=white" alt="Tampermonkey userscript">
  <img src="https://img.shields.io/badge/YouTube_Music-FF0000?style=flat-square&amp;logo=youtubemusic&amp;logoColor=white" alt="YouTube Music">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-EUPL--1.2-5865F2?style=flat-square" alt="License: EUPL-1.2"></a>
</p>

<p align="center"><a href="#installation"><strong>Get started</strong></a> · <a href="https://github.com/smturtle2/better-lyrics-hangulize/issues">Report an issue</a></p>

## Installation

Install **both extensions** for your browser:

| Browser | Tampermonkey | Better Lyrics |
| --- | --- | --- |
| Chrome | [Install](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) | [Install](https://chromewebstore.google.com/detail/better-lyrics/effdbpeggelllpfkjppbokhmmiinhlmg) |
| Edge | [Install](https://microsoftedge.microsoft.com/addons/detail/iikmkjmpaadaobahmlepeloendndfphd) | [Install](https://microsoftedge.microsoft.com/addons/detail/better-lyrics-lyrics-for/mjfeaklppoegooljmjicjdbiccgjdlhd) |
| Firefox | [Install](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) | [Install](https://addons.mozilla.org/en-US/firefox/addon/better-lyrics/) |

1. **Chrome/Edge:** right-click the Tampermonkey toolbar icon → **Manage extension** → enable **Allow User Scripts**. If that switch is absent, enable **Developer mode** at `chrome://extensions` or `edge://extensions`. Firefox users can skip this step. [Official guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).
2. Click **[Install Hangulize](https://raw.githubusercontent.com/smturtle2/better-lyrics-hangulize/main/better-lyrics-hangulize.user.js)**, then click **Install** on the Tampermonkey installation page. If the link is unavailable or shows code, use the manual steps below.
3. Open your browser's **Extensions** menu → **Better Lyrics** → **Language** → turn on **Romanization**.
4. Open or reload [YouTube Music](https://music.youtube.com/), play a song, and select the **Lyrics** tab. Its romanized lines will appear in Hangul.

<details>
<summary>Manual installation — also works from a local checkout</summary>

1. Copy the entire contents of [`better-lyrics-hangulize.user.js`](better-lyrics-hangulize.user.js).
2. Open **Tampermonkey → Dashboard → Add a new script**, and replace all starter code with the copied contents.
3. Click **Save**, then continue from step 3 above.

</details>

## Notes

- Readings are approximate and require romanization supplied by Better Lyrics.
- Hangul guides follow each lyric line in the main view; separate Picture-in-Picture windows are not modified.

## License

[EUPL-1.2](LICENSE) · Copyright © 2026 smturtle2.
