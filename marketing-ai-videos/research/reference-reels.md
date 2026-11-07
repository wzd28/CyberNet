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

---

## Round 4: @duncanrogoff "54 specialists, zero payroll" (2026-11-07)
56 s · 1080×1920 · 30 fps · 6 hard cuts · 460 likes

**Format: split-screen explainer.**
- **Top ~60%:** motion-graphics panel (dark green-glow tech scenes alternating with off-white "paper" scenes).
- **Bottom ~40%:** creator talking to camera.
- **Word-by-word caption** sits on the seam between the two, one or two words at a time, in big bold sans.
- Cuts to a **full-frame talking head** for emotional or personal lines, then back to the split.

**Motion devices worth stealing:**
1. **Count-up + grid fill:** "00 → 54 AI SPECIALISTS" with a 6×9 grid of tiles lighting up green one by one. Number and visual tell the same story.
2. **Stacking list chips:** icon + label chips slide in and stack (VIRAL REEL → 10 HOOKS → SCRIPT), building a pipeline as the voice explains it.
3. **Org-chart chips:** a role title ("THE SCOUT") with a numbered sub-chip tree (01 TRENDING REELS / 02 REDDIT / 03 SCOUT) connected by a thin line with a dot; the active item is highlighted in orange.
4. **Theme switch as chapter break:** dark-green tech scenes switch to light-paper scenes for the "how it works" section.
5. **Proof shots:** real GitHub repo pages with a highlighted "221 STARS" pill and "OPEN SOURCE" / "FREE AGENCY" badges.
6. **Big-number price card** ("10 dollars / per week") in one accent colour.
7. **CTA:** "Comment" plus a speech-bubble chip that fills in with the keyword (HARBOR), and "for the link · IG · FB · YT ONLY".

**What it would take for CybernetAI:** the split-screen needs a real person on camera (the owner, filmed on a phone). Without footage, the top-panel devices (count-up grid, stacking chips, org-chart, theme switch, comment-keyword end card) can carry a full-frame video with the AI voice.

---

## Round 5: five more reels (2026-11-07; owner loved two of them)
### Dc5kaDjETLZ, @jayantcreates.ai "Connect Claude to your Instagram in 2 minutes" (5,981 likes, 40 s, 0 hard cuts)
- Warm cream "paper" background with faint line-drawn city skyline at the bottom (landmarks sketched in thin orange-brown lines). Very calm, premium, warm, not techy-dark.
- Persistent icon-to-icon link motif at top: Instagram icon ●—— dotted line ——● Claude icon; the dot travels along the line (connection metaphor).
- Headline: bold black serif-less + one orange emphasis word ("your Instagram") + small orange pill ("in 2 minutes").
- Benefit checklist builds in: green-check pills stacking ("what to post to go viral", "makes reels like this", "edits your reels for you").
- Dark macOS-style app window as the "screen" that the camera pushes into/out of; UI types itself (mcp.ootto.ai/mcp being typed with cursor), searches show "No results".
- Pattern-interrupt cards: "✋ Most people stop right here." (orange second line), "HERE'S THE MOVE" with an underline: tension, then turn.
- Every beat: window + single caption pill at the bottom of the window (white rounded pill, one key word orange).
- Demo payoff montage: profile breakdown with stats counting, competitor research rows, content calendar filling with colored bars, editor timeline, DM thread with auto-replies popping in.
- Self-referential "like this": a phone tilts in showing this same reel.
- CTA: "Comment" + a comment input box where the keyword types itself ("OOTT|"), Post button, then an "AUTO-REPLY → DM sent" chip slides in below.
- Handle watermark @JAYANTCREATES.AI bottom centre on every frame.

### DfcIoZvtYDD, @roshanstudio_ "POV: Your next demo video looks this" (OWNER LOVES), 36 s, 1440x2560, 0 cuts
- A real laptop filmed in a moody dark room (blue/cyan backlight, plant leaves, a toy figure on a Rubik's cube), slight handheld; the motion-graphics demo plays ON the laptop screen.
- Screen piece = SaaS launch: soft pastel gradient sky, logo mark draws, "Meet heyclicky|" type-on with cursor, app windows float and dock, cloud-sky wallpaper, kinetic words "your apps / your workflow / your ai buddy", "Create your own Clickys", end logo type-on.
- Static white-box POV caption at the top the whole time.

### DfaHvJiN5wf, @thejimmy.vision "What if one video could sell your SaaS product under a minute" (40 s, 60 fps, 0 cuts)
- Same device: laptop on a desk in a green-lit room; screen plays a dark premium launch: blurred kinetic type, glossy 3D glass icons, liquid teal-blue gradients, a 3D ribbon ring, pill chips stacking, dashboards with charts, a circle-dot pattern field, logo "UPLINQ" on an aurora gradient.

### DcGgRnVi2bn, @sumama_bashir (OWNER LOVES, 11.8K likes), 14 s, 60 fps
- Micro UI animation of one satisfying task (upload a file): sparks, logo pop, "+ New" pill grows, file card flips in with glow, EXTREME camera zoom into the UI (sidebar items macro), hand cursor grabs a folder, file-upload card, progress bar filling the whole frame in cyan, blue check pops, handle end card.
- Light minimal palette, one continuous task, dense layered sound design (shown as a "Sound Design" timeline under the picture).

### DfaqDFWmaP9, @duncanrogoff (Claude-made motion graphics library), 35 s
- Same split explainer format as round 4.


### What we took from round 5 (applied in round 6)
1. **Device framing (laptop in a moody room):** the product film plays on a 3D laptop screen with a white-box "POV:" sticker at the top. On a 9:16 phone the screen is only about a third of the frame, so **the camera has to push in on the screen** for every beat that carries text, and on-screen type needs to be about twice its desktop size (at least 90 px on a 1920-wide screen canvas).
2. **Micro-UI with extreme zoom:** one satisfying task, a light palette, and the camera diving into the detail that matters (one letter of a URL), then a progress bar and a result. The UI fills at least 70% of the frame width.
3. **Cream tutorial format:** paper background, a line-drawn skyline, an icon-to-icon connector with a travelling dot, green-check pills, a pattern interrupt ("Most people ... right here." then "HERE'S THE MOVE"), a dark app window acting by itself with one caption pill under it, and a save/share end beat.
4. **For B2B and formal brands:** the same craft without the gimmicks: real work as the hero (stands in a dark hall, a designer's swatch deck), in-world name signs instead of floating stickers, verbatim copy, and a formal voice.
