# Reference reels: what makes them work (studied 2026-11-05)

Three reels the owner loves, downloaded (`reference-reels/`, not committed) and analysed frame by frame, with cut detection, audio onset/tempo analysis and spectrograms.

| # | Reel | What it is | Specs |
|---|---|---|---|
| A | @sam.john.creates | Creator explaining how he makes text animations (made with Claude + Invideo); talking head + kinetic type | 49 s · 1440×1080 · 30 fps · 48 cuts (median shot **0.63 s**) |
| B | @fantiqmotion, "Scaffold OS" | SaaS launch film, **filmed on a phone pointed at a laptop** ("POV: Your team shipped another banger for an AI company") | 87 s · 1440×2560 · **60 fps** · **0 cuts** |
| C | @madebyext | Motion-studio promo ("POV: what working with us looks like") | 16 s · 3 long shots, transitions inside the frame |

## The playbook

### 1. Kinetic typography is the main character
- **2–4 words per beat**, centred, lots of negative space.
- **Mixed styles in one line:** bold sans for the setup, then **one emphasis word in a contrasting style**: italic serif, brand colour or a different weight ("OK so *today*", "understanding & *taste*", "the *problem*").
- Words **blur in** (start soft-focused and slightly scaled, settle sharp) or **mask-reveal** from a baseline. Exits are fast and motion-blurred.
- Tiny graphic glyphs ride along with words (● ■ ▲ dots, an underline that draws itself).
- In A, text sits **in depth**, behind the subject or tracked onto surfaces.

### 2. Every motion has a sound
- 1.6–2.7 distinct sound hits **per second**: whoosh on every move, soft tick or pop on every word, click on every UI interaction, a low thump on big reveals.
- Music bed at **~100–110 BPM**, quiet under the SFX.
- **Silence before the reveal:** the audio drops to near-nothing for a beat right before a key moment, then hits (clear gaps in C's spectrogram).
- **A voice carries the story** in A and B (creator or founder). An AI VO is the closest equivalent.

### 3. UI rebuilt as motion graphics (not screen recordings)
- Chat bubbles flying in, input fields with a blinking cursor and typing, glass cards, a **hand cursor that clicks a button which morphs** into the next scene (C).
- Real product UI cards float in 3D (B).

### 4. Continuous flow
- B has **zero hard cuts in 87 s**: element-to-element morphs, circle wipes, push-through.
- C: a word becomes a button; code becomes the logo mark; the logo flips the whole frame from dark to white.
- A does the opposite (fast cuts on the beat), but every cut still has a sound.

### 5. Light and finish
- Near-black backgrounds with **soft coloured glows** (green, blue, orange) behind the subject, plus a vignette.
- **Glassmorphism** cards (blurred translucent panels with thin bright edges).
- **Motion blur** on anything fast; **60 fps** for butter-smooth motion (B).
- A tiny persistent "chrome" (logo top-left, small caption bottom) makes it feel like a designed piece.

### 6. Framing tricks
- **"POV:" captions** ("POV: your team shipped another banger…") turn an ad into a story about the viewer.
- **Phone-filming-a-screen** (B) feels authentic and behind-the-scenes. It needs a real camera shot; it can't be faked convincingly in code.

## How we apply it (our engine: Canvas2D + Three.js → ffmpeg)
| Technique | Implementation |
|---|---|
| Emphasis word | Instrument Serif *italic* in the brand colour (`@fontsource/instrument-serif`), mixed with Inter Display 800 |
| Blur-in words | per-word `ctx.filter = blur(n)` animating to 0, plus scale 1.06 → 1 and a slight y rise |
| Motion blur | directional smear: draw moving layers 4–6× along the motion vector at falling alpha |
| Glow | `shadowBlur` in the brand colour on key words and UI; radial light blooms behind the subject |
| Every event has SFX | timeline event list drives the synth (whoosh / tick / click / thump / dropout) |
| Dropouts | duck all audio to near-silence for 0.2–0.35 s before reveals |
| 60 fps | render at 60 fps (doubles render time) |
| UI as motion | glass cards, chat bubbles, cursor plus click ripple, typing cursor |
