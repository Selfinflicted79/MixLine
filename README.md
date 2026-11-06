# MixLine

A small **Windows desktop mixer + stream soundboard**.

Made for live streams / party games: play “you failed” style audio cues, mix them with your mic, optionally pull in **one app at a time**, and send that mix **into Discord as the microphone** — not into your headphones.

## Discord mic setup

1. Install [VB-Audio Virtual Cable](https://vb-audio.com/Cable/) (free) — you may already have it
2. MixLine → **Mic** → leave **TO MIX** on  
3. MixLine → mix output = **CABLE Input**  
4. Discord → Input = **CABLE Output**  
5. Leave **Headphone monitor** off unless you want to hear the mix locally

## Application audio (YouTube, etc.) — isolated

Windows “window capture” usually grabs **all PC audio** (games, cues, everything). MixLine does **not** use that for Application strips anymore.

**Do this instead:**

1. Get a **second** virtual cable (VoiceMeeter VAIO, Hi-Fi Cable, etc.) — keep Cable A for Discord
2. Windows **Settings → System → Sound → Volume mixer** → set **YouTube Music** output to that second cable
3. MixLine → **Application** → pick that second cable’s **recording/input** device  
4. Leave **System sounds** off the mix (its **TO MIX** defaults off)

Now the YouTube strip is only YouTube. Games stay out of Discord unless you punch **System sounds** → **TO MIX**.

## Features

- Mic / isolated app / system-sounds strips with faders, meters, mute, solo, **MIX** / **MON**
- Stream cue pads + **hotkeys** (Razer mini / stream deck) — work in the background
- **Cue Send** master strip next to **Mix** — one fader for all sound cues into Discord
- **EQ** on every channel, Cue Send, and Main Mix (bands + graph; click the name to leave)
- PreSonus × X32–inspired lit faders with tick marks
- **Autosave** including application device strips (reconnect if the cable isn’t present yet)

## Build

```bash
npm install
npm run dist:win
```
