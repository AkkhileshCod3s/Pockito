<div align="center">

# Pockito

**A little 3D buddy that lives on your desktop and helps you get work done.**

[![Latest release](https://img.shields.io/github/v/release/AkkhileshCod3s/Pockito?label=release)](https://github.com/AkkhileshCod3s/Pockito/releases/latest)
[![License: MIT](https://img.shields.io/github/license/AkkhileshCod3s/Pockito)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS-blue)
![Status](https://img.shields.io/badge/status-early%20development-orange)

</div>

<!--
Add a screenshot or a short GIF of your pet here, for example:
![Pockito on the desktop](docs/screenshot.png)
-->

Pockito is a desktop pet companion. A small 3D character walks along the bottom of your screen, naps when you're idle, reacts when you pick it up, and uses AI to help when you ask.

## Features

- **3D desktop pets.** Choose a pet from the tray menu. Pets walk, sleep, wave, dance, and react when you pet, pick up or throw them.
- **Chat.** Open a small chat window from the tray icon and ask anything. Replies stream in with formatted text and code blocks (with a Copy button).
- **Summarize files.** Drop a file on your pet, or use the attach button, and get a short summary.
- **Hints when you're stuck.** Click your pet while you're looking at a problem and it gives you a hint without spoiling the answer. Ask for the full solution when a hint isn't enough.
- **Screen capture.** Use the camera button to select an area of your screen and ask a question about it.
- **Stays out of the way.** The window is transparent and click-through, so everything outside your pet works as normal. Pockito lives in the system tray and has no taskbar button.
- **Windows and macOS.**

## Download

Get the latest installer from the [Releases page](https://github.com/AkkhileshCod3s/Pockito/releases/latest).

| System | File |
|---|---|
| Windows 10 / 11 | `Pockito Setup x.x.x.exe` |
| macOS (Apple Silicon) | `Pockito-x.x.x-arm64.dmg` |

The installers are **not code-signed yet**, so your system will warn you the first time:

- **Windows:** if SmartScreen shows "Windows protected your PC", click **More info**, then **Run anyway**.
- **macOS:** if the app is blocked, open **System Settings → Privacy & Security** and click **Open Anyway** next to Pockito.

> Intel Macs aren't covered by the current macOS build.

## Set up the AI features

The pet works without any setup. To use chat, summaries, hints and screen questions, add your own **Groq API key**:

1. Create a key at [console.groq.com/keys](https://console.groq.com/keys).
2. Right-click the Pockito tray icon, open **Settings**, paste the key and press **Test**.

Your key is stored encrypted on your computer and is never exposed to the app's interface. Never paste it into a file or share it publicly. Free plans have rate limits, so if you see a "rate limit" message, wait a moment and try again.

### Screen capture on macOS

The first time you use screen capture, macOS asks for **Screen Recording** permission. Grant it in **System Settings → Privacy & Security → Screen Recording**, then restart Pockito.

## Privacy

- Nothing is sent to the AI unless you chat, drop or attach a file, ask for a hint, or confirm a screen capture.
- Only what you choose to send goes to [Groq](https://groq.com): your message, the text of a file, or the selected screen area.
- Screenshots are cropped to the area you select and are not saved to disk.
- Pockito has no analytics or telemetry.

## Run from source

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/AkkhileshCod3s/Pockito.git
cd Pockito
npm install
npm run dev      # development, with hot reload
npm start        # build, then run
```

Build an installer for your system:

```bash
npm run dist:win    # Windows installer, run on Windows
npm run dist:mac    # macOS installer, run on a Mac
```

Releases are built automatically by GitHub Actions when a version tag is pushed, for example:

```bash
# 1. set "version" in package.json, commit and push
# 2. then tag the commit
git tag v0.3.3
git push origin v0.3.3
```

## Project structure

```
.github/workflows/   Release build (Windows and macOS)
assets/              3D models and tray icons
build/               App icons used by the installer
electron/            Main process: windows, tray, settings, AI and capture
scripts/             Dev launcher and icon generation
src/                 The pet: 3D scene, animation, interaction, chat UI
```

## Roadmap

- [ ] Code-signed installers for Windows and macOS
- [ ] Intel Mac build
- [ ] Auto-update
- [ ] More built-in pets, and adding your own `.glb` models

## Credits

Pockito is built on [minecraft_pet_v2](https://github.com/gprem09/minecraft_pet_v2) by gprem09, released under the MIT License.

3D models:

| Pet | Author | License | Source |
|---|---|---|---|
| Wolf | Matt Alexander | CC-BY-4.0 | [Sketchfab](https://sketchfab.com/3d-models/minecraft-wolf-f9181c2d3ea546988187be74173b406b) |
| Fish | _add author_ | _add license_ | _add link_ |
| Guinea pig | _add author_ | _add license_ | _add link_ |
| Bunny | _add author_ | _add license_ | _add link_ |
| Duckling | _add author_ | _add license_ | _add link_ |

Models were recoloured or adjusted where noted in the release notes. Pockito is not affiliated with, endorsed by or sponsored by Mojang Studios or Microsoft. Minecraft is a trademark of Mojang Studios.

## License

[MIT](LICENSE). Third-party models keep their own licenses, listed above.
