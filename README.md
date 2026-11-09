<div align="center">

# 🔥 Yule Log 🪵

**A fireplace that runs on Christmas carols nobody will ever read.**

[![Build & release](https://github.com/DUR6NA/yule-log/actions/workflows/build.yml/badge.svg)](https://github.com/DUR6NA/yule-log/actions/workflows/build.yml)
[![Download the latest](https://img.shields.io/badge/download-latest%20release-e8590c)](https://github.com/DUR6NA/yule-log/releases/latest)
![Windows, macOS, Linux](https://img.shields.io/badge/burns%20on-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-8b4513)
![Fuel: tokens](https://img.shields.io/badge/fuel-tokens-ff922b)

![Yule Log at full roar: carol 75, 21,786 tokens burned at 41 tok/s, the thermometer reading 354 BTU/h](docs/hearth.jpg)

<sub><i>Carol #75. 21,786 tokens on the fire. 354 BTU/h coming off the graphics card. Nobody read a single verse.</i></sub>

</div>

---

Winter has reached the Midwest and the furnace is a graphics card.

Yule Log is a desktop fireplace. A local AI model (Gemma 4 E4B in LM Studio by default) writes Christmas carols one after another: a Wisconsin polka about a thermostat war, a Motown number about lake-effect snow, a barbershop quartet tribute to tater tot hotdish. Every token it streams goes on the fire. Nobody reads the carols. They're burned for heat and thrown away.

It's a space heater with a sense of occasion. 🎄

## 🪵 How the fire works

```
   🎅  "Write a slow crooner ballad about the furnace dying"
    │
    ▼
 ┌──────────────────┐   token token token token token token…
 │   local model    │ ───────────────────────────────────────┐
 │ (your GPU sweats)│                                        │
 └──────────────────┘                                        ▼
         │                                     🔥 GPU fluid simulation 🔥
         │ watts                               buoyant heat · vorticity · sparks
         ▼                                     one spark per token, roars while
  🌡️  real thermometer                          they flow, sulks when they stop
     °F / °C + BTU/h
```

- 🔥 **The fire is a real-time fluid simulation** on the GPU (buoyant heat, vorticity, a pressure solve) licking at procedurally shaded logs. It roars while tokens flow, throws a spark per token, and dies back to embers when the model stops.
- 🌡️ **The little outdoor thermometer reads your actual GPU** through NVIDIA's driver. The column is GPU temperature (°F and °C), and the number under it is heat output in BTU/h (watts × 3.412). On non-NVIDIA machines it just stays blank and looks festive.

<div align="center">
<img src="docs/embers.jpg" width="560" alt="The fire burned down to glowing embers after the model stopped writing" />
<br><sub><i>Model stopped. Embers. The cat is disappointed.</i></sub>
</div>

## 🎁 Install

Grab the newest installer from **[Releases](https://github.com/DUR6NA/yule-log/releases/latest)**:

| Your computer | Grab this | Notes |
| --- | --- | --- |
| 🪟 Windows 10/11 | `Yule-Log_x.y.z_x64-setup.exe` | Installs for the current user, no admin needed. It isn't code-signed, so SmartScreen may ask: **More info → Run anyway**. |
| 🍎 macOS (Apple Silicon + Intel) | `Yule-Log_x.y.z_universal.dmg` | Not notarized. If macOS calls it "damaged", run `xattr -cr "/Applications/Yule Log.app"` once. |
| 🐧 Debian / Ubuntu | `Yule-Log_x.y.z_amd64.deb` | `sudo apt install ./Yule-Log_*.deb` |
| 🎩 Fedora / openSUSE | `Yule-Log-x.y.z-1.x86_64.rpm` | `sudo dnf install ./Yule-Log-*.rpm` |
| 📦 Any other Linux | `Yule-Log_x.y.z_amd64.AppImage` | `chmod +x` it and double-click. |

### Then get some firewood (a model)

1. In [LM Studio](https://lmstudio.ai), download `google/gemma-4-e4b` and start the server (Developer tab, port 1234).
2. Leave **Just-in-Time Model Loading** on (LM Studio's default). Yule Log loads the model itself the first time you light the fire, and LM Studio unloads it after 10 idle minutes.

Any other local server with an OpenAI-compatible API burns too (Ollama, llama.cpp, Jan, vLLM...). Set it up under the ⚙️ gear.

## 🕯️ Using it

- **Light** starts the fire. **Put out** stops generation immediately.
- **Auto-off** (the ⏱️ clock in the dock): 15m, 30m, 1h, 2h, Never, or a custom time like `45m`, `1h30`, `2:15` or `3d` (up to 7 days). Changing it while the fire burns restarts the countdown. When it runs out, the carol in progress gets up to 45 seconds to finish. Nobody likes a song cut off mid-chorus, even if nobody's listening.
- **Settings** (the ⚙️ gear): server URL, model (picked from the server's list), and an API key if your server wants one. Changes apply from the next carol. They're saved in the app's config folder:
  - Windows: `%APPDATA%\com.midwest.yulelog\settings.json`
  - macOS: `~/Library/Application Support/com.midwest.yulelog/settings.json`
  - Linux: `~/.config/com.midwest.yulelog/settings.json`
- **Full screen**: the button, **F**, or double-click the fire. **Esc** leaves.
- While the fire burns, the controls fade away. Wiggle the mouse to bring them back.

## 🧯 Fire safety (it won't burn tokens all night)

- Every fire gets an auto-off timer, 15 minutes unless you choose otherwise. Burning forever only happens if you pick **Never**, and then that's between you and your power company.
- Closing the window puts the fire out. The dropped connection makes LM Studio stop generating (`Client disconnected. Stopping generation...` in its log).
- Each carol is capped at 700 tokens, and Gemma's hidden "thinking" is turned off. No overthinking by the hearth.
- The fire draws at most 60 fps, and 20 fps once it's out, so it shares the GPU politely: about 52 tok/s with the fire on screen versus 60 without, on an RTX 4060 Ti.

## ❓ Questions nobody asked

**Can I read the carols?**
No. That would be like reading the firewood.

**Does it actually heat the room?**
Your GPU really does turn electricity into heat, and the thermometer reports exactly how much. Whether that beats a $30 space heater is a question for people who don't own a Yule log.

**Does it work without an NVIDIA card?**
The fire burns on any GPU, Mac included. Only the thermometer needs NVIDIA; without it the reading stays empty.

**Why the Midwest?**
Because the prompts know about lake-effect snow, supper clubs, the Packers, and Santa's sleigh stuck in a snowdrift outside Fargo. Write what you know.

## 🛠️ Build from source

You need Node 20+, stable Rust, and your platform's [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Windows: the MSVC toolchain and WebView2; macOS: Xcode Command Line Tools; Linux: `libwebkit2gtk-4.1-dev` and friends).

```sh
npm install
npm run dev     # run the app
npm run build   # release app and installer for this platform
```

On Windows there's a dev-only shortcut for testing your changes: `scripts\dev-run.bat` starts dev mode, and `scripts\dev-run.bat release` compiles a release build of the current code (no installer) and launches it. It isn't part of the app and never ends up in an installer.

To look at the fire without the app (or a model), serve `src/` with any static file server and open `index.html?fire=0.9`. Any level from 0 (embers) to 1 (roaring) works.

### 🗺️ Where things live

- `src/` is the frontend, plain files with no bundler: `fire.js` (the simulation), `glass.js` (the liquid-glass refraction), `app.js` (everything else).
- `src-tauri/src/` is the Rust side: `engine.rs` runs the fire and talks to the model server, `settings.rs` stores the server settings, `gpu.rs` reads the GPU, `carols.rs` has the prompts (14 musical styles × a pile of Midwestern subjects).
- `src-tauri/installer/` holds the Windows installer's art and theme (`hooks.nsh`).
- `scripts/` is dev tooling only. Installers contain just the compiled app and `src/`, so nothing in here ships.
- Before any settings are saved, the `LMSTUDIO_URL` and `MODEL` environment variables set the defaults.

## 🏭 The elves (CI)

Every push to `main` runs [`.github/workflows/build.yml`](.github/workflows/build.yml), which builds on all three platforms at once and publishes a GitHub release with every installer attached:

| Runner | Makes |
| --- | --- |
| Windows | NSIS installer (`.exe`) |
| Ubuntu 22.04 | `.deb`, `.rpm`, `.AppImage` |
| macOS | universal `.dmg` (Apple Silicon + Intel) |

**Version numbers:** you own the major and minor in `src-tauri/tauri.conf.json`; the patch is the CI build number. With `"version": "1.0.0"` in the config, build #27 ships as **1.0.27**, tagged `v1.0.27`. Bump the config to `1.1.0` when something big changes and the next build comes out as `1.1.<build>`.

The release only goes out if all three platforms build. A newer push cancels a build that's still running, and you can kick one off by hand from the Actions tab (**Run workflow**). The installers are also kept as workflow artifacts for 14 days.

---

<div align="center"><sub>Stay warm out there. 🧣</sub></div>
