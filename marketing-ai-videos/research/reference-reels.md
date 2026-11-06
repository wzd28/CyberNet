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

---

## Round 2: the viral mechanics (owner: "I want my videos to go super viral")

| # | Reel | Specs | Engagement |
|---|---|---|---|
| D | @edita.visuals ("Opus 5.5 cooked", Apple-Intelligence-style motion piece) | 12 s · 1080×1920 · **60 fps** · 1 cut | 530 likes |
| E | @jayantcreates.ai ("Claude grew my Instagram 0 → 29,752") | 47 s · 2 cuts | 1,844 likes |

### What makes these spread (beyond craft)
1. **Comment-keyword CTA → auto-DM.** "Comment CLAUDE for the full guide", "Comment GROW and I'll DM you". Every comment is a ranking signal, and the auto-DM (ManyChat, Ootto, etc.) turns it into a lead. In D it's a **persistent sticker at the top for the whole video**; in E it's an **animated comment box** typing "GROW" and showing "Sent ✓". *Only use it if a DM automation is set up, or the comments go unanswered.*
2. **Big number counter as the hook.** "0 → 29,752 followers" counting up on a clean card in second 1 of E; "7% → 100%" progress in D. Numbers in motion hold the eye, but they must be **real**.
3. **Save-worthy value.** E is a step-by-step tutorial ("connect once", "give it this prompt", "a 30-day content dashboard"). Saves and sends outrank likes for reach.
4. **Short and loopable.** D is 12 s at 60 fps, ending where it started.
5. **Persistent framing:** a sticker at the top and a @handle watermark at the bottom on every frame, like a branded series.
6. **Native "made on a real screen" look** (D is filmed off a monitor, like B): it reads as a person sharing, not an ad.
7. **Warm, cohesive palette** (E: cream background, orange emphasis, serif italic aside "you can do it too ✋"); one emphasis colour only.

### Applying this to our accounts
- **Every video gets one share trigger** that needs no automation, e.g. a top sticker "Send this to someone who clicks every link".
- **Comment-keyword CTA** only once a DM automation exists. Recommended: ManyChat (Instagram) with the keyword "SCAN" → DM the cybernetai.app link.
- **Counters:** only with real numbers (verified client counts, real stats). Never invented.
- **Series framing:** a consistent sticker or handle on every post so the feed reads as a recognisable series.

---

## Round 3: six more reels (2026-11-06)
@jayantcreates.ai ×2 (dark "0 → 31K" step tutorial; "MACHINE", reels written as code), @mrcreates.ai (4.2K likes), @softgirlnocode (3.0K), @aipranjal, @maxhasmotion8 (3.0K).

**The pattern in every one:**
1. **A voice tells the story, with word-by-word synced captions and the current word highlighted** (a coloured box or a serif-italic swap). This is the retention engine; fancy editing is secondary (jayant says so outright).
2. **Persistent frame chrome:** series tag, step counter ("01 / 06"), handle, and in @mrcreates a running **countdown/level bar** at the bottom ("58.2s · Level 1").
3. **Numbered structure:** "STEP 01…04" / "No.1 No.2 No.3". The viewer always knows where they are and how much is left.
4. **A host:** a face (talking head) or an **original mascot/avatar** of the creator. It builds recognition across a series.
5. **Self-building UI as the visual:** tables fill, matrices light up cell by cell, counters roll, progress bars run.
6. **Comment-keyword CTA** (MATRIX / MACHINE / MARKETING / SITE / EDITOR / LINK) with an auto-DM.
7. **Music fitted to the edit's pace** (softgirl uses Suno).

**Applied:** CybernetAI "How to spot a scam text" now has an AI voiceover (Kokoro, free, Apache-2.0) and karaoke captions synced word by word with the current word in a cyan box, plus step chrome and a progress line.
**Not yet:** an original CybernetAI mascot host (possible series asset; owner to approve the look first).
