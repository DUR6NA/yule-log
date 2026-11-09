<div align="center">

# Yule Log

### Heat. Reimagined.

[![Build & release](https://github.com/DUR6NA/yule-log/actions/workflows/build.yml/badge.svg)](https://github.com/DUR6NA/yule-log/actions/workflows/build.yml)
[![Download the latest](https://img.shields.io/badge/download-latest%20release-e8590c)](https://github.com/DUR6NA/yule-log/releases/latest)
![Windows, macOS, Linux](https://img.shields.io/badge/available%20in-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-8b4513)
![Fuel: tokens](https://img.shields.io/badge/fuel-tokens-ff922b)

![Yule Log at full roar: carol 75, 21,786 tokens burned at 41 tok/s, the thermometer reading 354 BTU/h](docs/hearth.jpg)

<sub><i>Carol #75. 21,786 tokens. 354 BTU/h. Zero verses read.</i></sub>

</div>

---

Every once in a while, a revolutionary product comes along that changes everything.

Today, we're introducing three revolutionary products.

**A fireplace.** **A Christmas songwriter.** **And a space heater.**

A fireplace. A songwriter. A space heater. A fireplace. A songwriter. Are you getting it?

These are not three separate devices. This is *one app*.

And we are calling it **Yule Log**. 🔥

---

## The most advanced fire we've ever made.

Winter has reached the Midwest, and the furnace is a graphics card.

Yule Log turns a local AI model into firewood. It writes Christmas carols, one after another, forever,[^forever] and every single token goes straight onto the fire.

Nobody reads the carols. That's the point. They're burned for heat and thrown away. We believe it's the most honest use of generative AI ever shipped.

## Token‑to‑Flame™. A breakthrough in combustion.

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

At the heart of Yule Log is a real-time fluid simulation running on your GPU: buoyant heat, vorticity confinement, and a full pressure solve, licking at procedurally shaded logs. Every token the model streams throws a spark. While tokens flow, the fire roars. When they stop, it dies back to embers.

It's not a video loop. It's not an animation. It's physics, powered by poetry nobody asked for.

## Thermometer. Now with actual temperature.

Other fireplaces show you a picture of warmth. Yule Log *measures* it.

The little outdoor thermometer reads your real GPU through NVIDIA's driver. The column is GPU temperature in °F and °C, and the number underneath is heat output in BTU/h (watts × 3.412).[^watts] That's not a metaphor. That's your living room getting warmer.

Without an NVIDIA card, the thermometer stays blank and simply looks festive. We call that design.

## Embers. Pro.

<div align="center">
<img src="docs/embers.jpg" width="560" alt="The fire burned down to glowing embers after the model stopped writing" />
<br><sub><i>Model stopped. Embers. The cat is visibly disappointed.</i></sub>
</div>

When the model goes quiet, the fire doesn't just stop. It *settles*: glowing cracks, lit end grain, a slow fade. Meanwhile the renderer drops from 60 fps to 20 to sip your GPU instead of gulping it. We call it **EmberMotion**.

## Bring your own brain.

Yule Log doesn't come with a model, and it doesn't pick one for you. Run whatever model you like on your own machine with [LM Studio](https://lmstudio.ai), [Ollama](https://ollama.com), llama.cpp, Jan, vLLM, or anything else that speaks the OpenAI API, then connect Yule Log to it.

Whatever you run gets the same brief: Wisconsin polkas about thermostat wars, Motown numbers about lake-effect snow, and barbershop-quartet tributes to tater tot hotdish, in 14 musical styles across a whole pile of Midwestern subjects. Santa gets stuck in a snowdrift outside Fargo. The Packers play on Christmas Day. Somebody shovels the neighbor's walk before they wake up.

Every carol is completely original. Every carol is completely unread.

## Privacy. That's Yule Log.

- **It never reads the carols. Not even itself.** Yule Log counts each token as it streams in and drops the words right there. They never reach the screen, the disk, or a log file. The only record that a carol existed is that your room is slightly warmer.
- **It ships with zero addresses.** The connection fields come completely blank. Yule Log has no idea where your model lives until you tell it, and then it tells only one place: your own settings file.
- **Local, if you want it local.** Point it at a model on your own machine and nothing leaves the house. Except heat. Through the ceiling.

## Safety. Built right in.

- **Auto-off, on by default.** Every fire gets a timer, 15 minutes unless you choose otherwise. Burning forever only happens if you pick **Never**, and then that's between you and your power company.
- **Close the window, the fire goes out.** The dropped connection makes LM Studio stop generating on the spot (`Client disconnected. Stopping generation...` in its log).
- **Portion control.** Each carol is capped at 700 tokens.
- **We removed the thinking.** Models are asked to skip their hidden "thinking" and get straight to singing. It took courage.
- **A polite houseguest.** The fire draws at most 60 fps (20 once it's out), so it shares the GPU: about 52 tok/s with the fire on screen versus 60 without.[^bench]

## Tech Specs

| | **Yule Log** |
| --- | --- |
| **Fuel** | Tokens, from any OpenAI-compatible local model |
| **Model** | Yours. Not included. |
| **Heat output** | Your GPU's power draw × 3.412 BTU/h |
| **Carol length** | Up to 700 tokens |
| **Musical styles** | 14, from traditional church carol to Wisconsin polka |
| **Thinking** | Skipped (if your model listens) |
| **Frame rate** | Up to 60 fps lit, 20 fps as embers |
| **Auto-off** | 15m, 30m, 1h, 2h, custom up to 7 days, or Never |
| **Thermometer** | °F, °C and BTU/h (NVIDIA GPUs) |
| **Carols read** | 0 |
| **Weight** | 0 g. The lightest Yule log ever made. |
| **Chimney** | Not required |
| **Available finishes** | Windows, macOS, Linux |

## Available now. In three finishes.

Grab the newest installer from **[Releases](https://github.com/DUR6NA/yule-log/releases/latest)**:

| Your computer | Grab this | Notes |
| --- | --- | --- |
| 🪟 Windows 10/11 | `Yule-Log_x.y.z_x64-setup.exe` | Installs for the current user, no admin needed. It isn't code-signed yet, so SmartScreen may ask: **More info → Run anyway**. |
| 🍎 macOS (Apple Silicon + Intel) | `Yule-Log_x.y.z_universal.dmg` | Not notarized. If macOS calls it "damaged", run `xattr -cr "/Applications/Yule Log.app"` once. |
| 🐧 Debian / Ubuntu | `Yule-Log_x.y.z_amd64.deb` | `sudo apt install ./Yule-Log_*.deb` |
| 🎩 Fedora / openSUSE | `Yule-Log-x.y.z-1.x86_64.rpm` | `sudo dnf install ./Yule-Log-*.rpm` |
| 📦 Any other Linux | `Yule-Log_x.y.z_amd64.AppImage` | `chmod +x` it and double-click. |

## Setup is magical.

Three steps. Zero IP addresses. Zero models included.

1. **Run a model locally.** Use [LM Studio](https://lmstudio.ai), [Ollama](https://ollama.com), llama.cpp, Jan, or any other app that serves a model over an OpenAI-compatible API, and start its server. Any chat model you like will do.
2. **Connect it.** In Yule Log, hit **Light**. The connection fields start out blank, so Settings opens: pick your server from the presets (or type its address), choose a model from the list your server offers, add an API key if it wants one, and **Save**.
3. **Hit Light again.** Feel the warmth.

> **LM Studio tip:** leave **Just-in-Time Model Loading** on (its default). Yule Log then loads your model the first time you light the fire, and LM Studio unloads it after 10 idle minutes.

## Intuitive by design.

- **Light** starts the fire. **Put out** stops generation immediately.
- **Auto-off** (the ⏱️ clock in the dock): 15m, 30m, 1h, 2h, Never, or a custom time like `45m`, `1h30`, `2:15` or `3d` (up to 7 days). Changing it mid-burn restarts the countdown. When time runs out, the carol in progress gets up to 45 seconds to finish. Nobody likes a song cut off mid-chorus, even if nobody's listening.
- **Settings** (the ⚙️ gear): server URL, model (picked from the server's list), and an optional API key. Changes apply from the next carol. They're saved in your own config folder and nowhere else:
  - Windows: `%APPDATA%\com.midwest.yulelog\settings.json`
  - macOS: `~/Library/Application Support/com.midwest.yulelog/settings.json`
  - Linux: `~/.config/com.midwest.yulelog/settings.json`
- **Full screen**: the button, **F**, or double-click the fire. **Esc** leaves.
- **The controls get out of the way.** While the fire burns, the dock fades. Wiggle the mouse to bring it back.

## What people are saying.

> "I haven't read a single carol. Best Christmas we've had in years."
> <br>— *Dad, Duluth*

> "It's beautiful. Who's paying for the electricity?"
> <br>— *Mom*

> "We had a furnace. Now we have a story."
> <br>— *A family in Green Bay, December*

> "Mrrp."
> <br>— *The cat, asleep in front of the monitor*

## One more thing…

**Continuous Yuletide.**

Every push to `main` runs [`.github/workflows/build.yml`](.github/workflows/build.yml): three platforms built at once, in parallel, in the cloud, then shipped as a GitHub release with every installer attached. Automatically. While you sleep. (With the auto-off timer set, of course.)

| Runner | Makes |
| --- | --- |
| Windows | NSIS installer (`.exe`) |
| Ubuntu 22.04 | `.deb`, `.rpm`, `.AppImage` |
| macOS | universal `.dmg` (Apple Silicon + Intel) |

**Version numbers:** you own the major and minor in `src-tauri/tauri.conf.json`; the patch is the CI build number. With `"version": "1.0.0"` in the config, build #27 ships as **1.0.27**, tagged `v1.0.27`. Bump the config to `1.1.0` when something big changes, and the next build comes out as `1.1.<build>`.

A release only goes out if all three platforms build. A newer push cancels a build that's still running, and you can kick one off by hand from the Actions tab (**Run workflow**). The installers also stay around as workflow artifacts for 14 days.

## For developers.

You need Node 20+, stable Rust, and your platform's [Tauri prerequisites](https://tauri.app/start/prerequisites/) (Windows: the MSVC toolchain and WebView2; macOS: Xcode Command Line Tools; Linux: `libwebkit2gtk-4.1-dev` and friends).

```sh
npm install
npm run dev     # run the app
npm run build   # release app and installer for this platform
```

On Windows there's a dev-only shortcut for testing your changes: `scripts\dev-run.bat` starts dev mode, and `scripts\dev-run.bat release` compiles a release build of the current code (no installer) and launches it. It isn't part of the app and never ends up in an installer.

To admire the fire without the app (or a model), serve `src/` with any static file server and open `index.html?fire=0.9`. Any level from 0 (embers) to 1 (roaring) works.

### Where things live

- `src/` is the frontend, plain files with no bundler: `fire.js` (the simulation), `glass.js` (the liquid-glass refraction), `app.js` (everything else).
- `src-tauri/src/` is the Rust side: `engine.rs` runs the fire and talks to the model server, `settings.rs` stores the server settings, `gpu.rs` reads the GPU, `carols.rs` has the prompts.
- `src-tauri/installer/` holds the Windows installer's art and theme (`hooks.nsh`).
- `scripts/` is dev tooling only. Installers contain just the compiled app and `src/`, so nothing in here ships.
- The server and model start out blank, so no address ships with the app. For development, the `LMSTUDIO_URL` and `MODEL` environment variables fill them in (read at run time on your machine) until settings are saved.

---

<div align="center">

**Yule Log.** Designed in the Midwest. Assembled by your graphics card.

<sub>Yule Log is not a furnace, a smoke detector, or a substitute for either. No carols were read in the making of this app.</sub>

</div>

[^forever]: "Forever" means until the auto-off timer runs out, 15 minutes by default. **Never** is available for the brave.
[^watts]: Board power as reported by NVIDIA's driver, summed across your GPUs. Actual coziness depends on your room, your GPU, and your relationship with your power company.
[^bench]: Measured on an RTX 4060 Ti, in a living room, in December. Your tokens may vary.
