# AI content mastery: what's new or missing (researched 2026-11-07)

This file only adds what isn't already in `SUMMARY.md`, `reference-reels.md`, `ai-video-tools.md` and `marketing-strategy.md`. Veo 3.1, Runway, Kling 3.0, Pika, HeyGen, Luma, ElevenLabs, the Sora shutdown, Trial Reels basics, Thought Leader Ads and Buffer's cadence data are all covered there, so they're only mentioned here when something has changed.

**Method.** Web searches on 2026-11-07. Page fetching was mostly blocked, so the facts below come from search-result content. Official pages are cited where possible. Anything from a single aggregator or vendor blog is marked *(third-party)*, and anything I couldn't confirm is marked *unverified*. Prices drift every month, so check the vendor page before you quote one.

---

## 1. Open-source tooling for video made in code

Our engine today: Canvas2D + Three.js, rendered frame by frame to ffmpeg (`reference-reels.md`). The tools below either replace that engine, plug into it, or supply the audio and captions around it.

### Rendering frameworks

| Tool | What it is | Best for | Licence | Maturity |
|---|---|---|---|---|
| **Remotion** | React components rendered to MP4 with headless Chrome + FFmpeg | Data-driven templates, captions, batch renders, Lambda/Cloud Run scale | **Not OSS.** Free for individuals, non-profits and for-profits with up to 3 employees; larger companies need a Company License ([licence](https://remotion.dev/license), [FAQ](https://www.remotion.dev/docs/license/faq)). "Automators" tier: $0.01/render, $100/month minimum ([terms](https://www.remotion.dev/docs/terms)) | Most mature in this table (~50k GitHub stars, per a [June 2026 snapshot](https://ghtrends.pages.dev/heygen-com/hyperframes), *third-party*) |
| **HyperFrames** (HeyGen) | Plain HTML/CSS + any seekable animation (GSAP, CSS, Lottie, Three.js, Anime.js, WAAPI) rendered to MP4 | Our approach almost exactly: HTML + GSAP, written by an agent, deterministic render. No React needed | **Apache 2.0** ([repo](https://github.com/heygen-com/hyperframes)) | Young: v0.4 launched mid-April 2026 ([review](https://dev.to/andrew-ooo/hyperframes-review-heygens-html-to-video-for-ai-agents-170i)); ~27k stars by June (*third-party*). Single-machine render, with a Lambda path listed. Needs Node 22+ and FFmpeg |
| **Motion Canvas** | TypeScript generator-based animation with a live editor | Explainer and diagram animation (math/code style), precise timing to voiceover | MIT ([listing](https://alternativeto.net/software/motion-canvas/about)) | Stable but slow-moving. ~8k weekly npm downloads ([pkgpulse 2026](https://www.pkgpulse.com/guides/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026)). No 2026 release confirmed |
| **Revideo** | Fork of Motion Canvas, rebuilt for headless/API rendering | Server-side templated video (a Motion Canvas you can call from an API) | MIT, per project metadata ([docs](https://docs.re.video/), [repo](https://github.com/redotvideo/revideo)) | Small team; check commit activity before you depend on it |
| **Theatre.js** | Keyframe/timeline editor for web animation and Three.js | Hand-tuning camera moves and easing in our Three.js scenes, then exporting values for the renderer | `@theatre/core` Apache 2.0; `@theatre/studio` AGPL 3.0, but only core ships in your bundle ([repo](https://github.com/theatre-js/theatre)) | Uncertain: development reportedly moved to a private repo, and 1.0 is still "around the corner" |
| **Lottie / dotLottie** | JSON vector animation (After Effects via Bodymovin) | Reusable icons, logo stings and UI micro-animations dropped into any renderer | dotLottie tooling MIT ([dotlottie-web](https://github.com/lottiefiles/dotlottie-web/wiki/State-Machines)); lottie-web licence not confirmed in search (it is widely known as MIT, *unverified here*) | Mature. State machines (interactive) are current as of Feb 2026, though irrelevant for linear video |
| **GSAP** | The standard JS animation engine (timelines, SplitText, MorphSVG, DrawSVG) | Kinetic typography: SplitText word/char reveals, MorphSVG shape morphs (C's "word becomes a button") | **Free including commercial use, all former Club plugins too**, since Webflow's 30 Apr 2025 change ([Webflow](https://webflow.com/blog/gsap-becomes-free)). Not OSS: Webflow keeps the IP, and the licence restricts building competing no-code animation tools ([licence](https://gsap.com/community/standard-license/)) | Very mature |
| **MoneyPrinterTurbo** | Python: topic, then LLM script, stock clips, TTS, subtitles, music, render | Learning an automated pipeline; *not* our taste bar (stock-footage slop) | MIT for the code; stock clips carry their own terms ([guide](https://www.verdent.ai/guides/moneyprinterturbo-github), *third-party*) | Popular hobby project |

**What to do with this.**
- **Try HyperFrames first.** It is the closest match to how we already work (HTML + GSAP, agent-written), it's Apache 2.0 with no seat limits, and it ships 19 agent skills (`npx skills add heygen-com/hyperframes`, which adds `/hyperframes` and `/gsap` in Claude Code) ([repo](https://github.com/heygen-com/hyperframes), [Apidog](https://apidog.com/blog/hyperframes-agentic-video/)). A good test is porting one existing CybernetAI reel and comparing render time and quality with our Canvas2D engine.
- **Remotion: check headcount before use.** Remotion is the most capable option, but Markable is unlikely to qualify for the free tier (3 employees or fewer). Its value to us is mostly the official agent skills (`npx skills add remotion-dev/skills`, with an umbrella `/remotion-best-practices` skill covering projects, rendering, captions and upgrades) ([docs](https://www.remotion.dev/docs/ai/skills)), plus `@remotion/captions`, below.
- **GSAP SplitText + MorphSVG are now free.** They're the fastest route to the "blur-in word" and "morph" devices in `reference-reels.md`. Usable inside HyperFrames, or in our Canvas engine via a DOM layer.

### Voice (open-source TTS)

| Model | Good for | Licence (weights) | Notes |
|---|---|---|---|
| **Kokoro-82M** (already in use) | Fast, cheap English narration on CPU | Apache 2.0 | 54 fixed voices, no cloning ([comparison](https://aivideosensei.com/compare/kokoro-vs-chatterbox-vs-xtts), *third-party*) |
| **Chatterbox / Chatterbox-Turbo / Multilingual** (Resemble AI) | Zero-shot voice cloning from ~5 s of audio, emotion-exaggeration control, **23 languages including Arabic** | MIT ([DeepInfra card](https://deepinfra.com/ResembleAI/chatterbox-multilingual)) | Turbo is 350M params. Outputs carry a built-in PerTh watermark. "Preferred over ElevenLabs 63.75% / 65.3%" figures are Resemble's own tests. Community Egyptian-Arabic fine-tune exists ([thread](https://reddit.sentinel-team.org/posts/1qx5xyc/snapshots/2026-02-06T08%3A30%3A23.666946Z)) |
| **Dia / Dia2** (Nari Labs) | Two-speaker dialogue with `[S1]`/`[S2]` tags and non-verbals (laughs, coughs): skits, "POV" banter | Apache 2.0, confirmed only via a fork ([repo](https://github.com/nari-labs/dia)) | English only (at least 1.6B). ~10 GB VRAM. Dia2 now released; capabilities unverified |
| **F5-TTS** | High-quality cloning research model | **Code MIT, weights CC-BY-NC-4.0: no commercial use** ([model card](https://huggingface.co/SWivid/F5-TTS/raw/4dcc16f297f2ff98a17b3726b16f5de5a5e45672/README.md)) | Don't use for client work |

**For the UAE/KSA market:** Chatterbox Multilingual is the only permissive open model found with Arabic. Test MSA versus Gulf dialect output with a native speaker before publishing, since open Arabic TTS is mostly MSA. Only clone voices with recorded consent (same rule as HeyGen in `SUMMARY.md`).

### Music (open models)

| Model | Licence | Use |
|---|---|---|
| **ACE-Step v1 (3.5B) / v1.5 (4B)** | v1 Apache 2.0; v1.5 reported MIT, and its card says generated music may be used commercially ([ComfyUI docs](https://docs.comfy.org/tutorials/audio/ace-step), [Friendli](https://friendli.ai/models/dgn1234567/acestep-5Hz-lm-4B), *third-party*) | The best open Suno alternative for full songs/beds. Confirm the licence on the official Hugging Face card |
| **Stable Audio Open / Stable Audio 3** | Stability Community License: free under $1M annual revenue ([Stability](https://stability.ai/news/stable-audio-open-research-paper), [MindStudio](https://www.mindstudio.ai/blog/stable-audio-3-open-weight-music-generation-content-creators)) | Short loops, risers, whooshes, SFX beds. Trained on CC audio |
| **MusicGen** (Meta) | Weights reportedly CC-BY-NC (*unverified*) | Avoid for commercial work |
| **YuE** | Licence not confirmed | Check before use |

Our synth-driven SFX engine (an event on every motion) is still the right core. Use ACE-Step for the ~100-110 BPM bed, and keep Suno or Eleven Music when the licence terms fit the platform.

### Auto-captions with word-level timestamps

- **whisper.cpp via `@remotion/install-whisper-cpp`** (MIT): runs locally and gives token timestamps. `convertToCaptions` groups tokens. Docs warn the required whisper.cpp version may crash ([Remotion](https://remotion.dev/docs/install-whisper-cpp)).
- **`@remotion/captions` → `createTikTokStyleCaptions()`**: turns word timings into "pages" with per-token `fromMs`/`toMs`. A low `combineTokensWithinMilliseconds` gives word-by-word display, a high one gives phrases. Each word needs a leading space ([docs](https://remotion.dev/docs/captions/create-tiktok-style-captions)). The logic is a useful reference even if we don't adopt Remotion.
- **WhisperX** (BSD-2-Clause, per [GitTrend](https://gittrend.io/repo/m-bain/whisperX), *third-party*): adds wav2vec2 forced alignment, so it gives more accurate word timing than raw Whisper. Raw Whisper isn't trained to output per-word times ([paper](https://www.arxiv.org/pdf/2303.00747)). Weak spot: numbers and symbols ("2014.", "£13.60") may get no timestamp, which matters for counters and prices ([SourcePulse](https://www.sourcepulse.org/projects/1473319)).
- **Our case is simpler.** We generate the VO from a known script, so align the *script* text to the TTS audio (WhisperX alignment) rather than trusting the transcription, and caption typos disappear.

---

## 2. Free Claude / agent skill packs (beyond the two we have)

| Pack | URL | Licence | What's inside |
|---|---|---|---|
| **remotion-dev/skills** (official) | [remotion.dev/docs/ai/skills](https://www.remotion.dev/docs/ai/skills) | Skills free; Remotion's own licence applies to renders | `/remotion-best-practices` umbrella, plus create, markup, Studio, render, captions and upgrade skills. Installs to `.agents/skills`, symlinked for Claude Code |
| **heygen-com/hyperframes** skills | [github.com/heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) | Apache 2.0 | 19 on-demand skills, including `/hyperframes` and `/gsap` |
| **digitalsamba/claude-code-video-toolkit** | [ecosyste.ms listing](https://awesome.ecosyste.ms/projects/github.com%2Fdigitalsamba%2Fclaude-code-video-toolkit) | MIT (*third-party listing*) | Video-production toolkit with a Remotion skill synced from the official repo |
| **anthropics/skills** (official) | [overview](https://joshuaberkowitz.us/blog/github-repos-8/anthropic-skills-teaching-ai-agents-how-to-work-like-experts-2063) | Examples Apache 2.0; docx/pdf/pptx/xlsx are source-available only | brand-guidelines, algorithmic-art, canvas/theme design, skill-creator. Good templates for a "Markable brand" skill |
| **alirezarezvani/claude-skills** | [skills.sh](https://www.skills.sh/alirezarezvani/claude-skills) | MIT | ~42-44 marketing skills in 7 pods (content, SEO, CRO, channels, growth, intelligence, sales), including content-creator and social-media-analyzer. The whole repo has 300+ skills |
| **thatrebeccarae/claude-marketing** | [site](https://thatrebeccarae.github.io/claude-marketing/) | MIT (per product page) | 56 skills, 3 agents, GA4-to-GTM pipeline, copywriting frameworks |
| **social-media-skills/skills** | via [Ascendants guide](https://ascendants.in/spotlight/free-github-claude-ai-skills-instagram-youtube-creators/) | Not confirmed | Reported 106 skills: brand voice, pillars, calendars, repurposing (counts are the author's claims) |
| **charlie947/social-media-skills** | via [Mika Reyes guide](https://mikareyes.com/ai/how-to-install-free-marketing-skills-claude) | Not confirmed | 17 skills; run the voice-builder skill first |
| **tenfoldmarc/video-edit-skill** | [github.com/tenfoldmarc/video-edit-skill](https://github.com/tenfoldmarc/video-edit-skill/wiki) | Not confirmed | `/video-edit`: phone talking-head clips to a finished Reel (ffmpeg + Node + Python). Relevant for the split-screen format |
| **Tella skills directory** | [tella.com/skills](https://www.tella.com/skills) | Each skill open source on GitHub | Cut dead air, clip long recordings, add zooms |
| **wshuyi/remotion-video-skill**, **louisedesadeleer** Cut Video / Clipify | via [Ascendants guide](https://ascendants.in/spotlight/free-github-claude-ai-skills-instagram-youtube-creators/) | Not confirmed | Remotion production; long-to-short clipping |

**Caution:** many packs share the same underlying skills, and star or skill counts mostly come from aggregators. Read every SKILL.md before installing (skills run with your agent's permissions), and keep the repo public-safe per `CLAUDE.md`.

---

## 3. Generative models to combine with code-rendered motion (late 2026)

Rule of thumb: **code renders the text, UI, logos, numbers and transitions; generative models supply only the "impossible" plates** (photoreal hero shots, textures, b-roll, voices). This keeps logos and claims exact.

| Model | Status (Nov 2026) | Best for | Typical cost | Commercial terms |
|---|---|---|---|---|
| **Veo 3.1** (Google) | Still current. **No Veo 4** from Google as of mid-Oct 2026; Google I/O 2026 showed "Gemini Omni Flash" (conversational video editing) instead ([eachlabs](https://www.eachlabs.ai/blog/veo-4-release-date-rumors-vs-confirmed), [dev.to](https://dev.to/tokenmixai/veo-4-doesnt-exist-yet-but-people-are-already-selling-it-3ch9)) | See `ai-video-tools.md` | See there | Ignore sites selling "Veo 4" |
| **Seedance 2.0 / 2.0 Mini** (ByteDance) | API priced by Volcengine in March 2026 ([CnTechPost](https://cntechpost.com/2026/03/04/bytedance-announces-api-pricing-seedance-2-0)); Mini mid-June; "2.5" announced (*unverified*) | Strong multi-shot motion, cheap volume via resellers | Atlas Cloud Fast ≈ $0.022/s ([Atlas](https://www.atlascloud.ai/blog/seedance-2.0-pricing-full-cost-breakdown-2026), *third-party*) | Commercial terms not found: **unverified**. Consumer app Dreamina has no API |
| **MiniMax Hailuo 03 / "H3"** | Released ~31 Jul 2026 (*third-party*). Pika H3 Flex is built on it | Expressive human motion, physics; good price/quality | ≈ $0.08/s at 768p, $0.13/s at 2K (Wireflow, 30 Oct 2026, *third-party*) ([Wireflow](https://www.wireflow.ai/blog/hailuo-pricing)) | Check MiniMax's terms (unverified) |
| **Kling 3.0 Turbo + Omni upgrade** | Turbo launched 17 Jun 2026: ¥0.8/s at 720p, ¥1/s at 1080p with audio, max 1080p. Omni edits 3-15 s at 4K ([Atlas](https://www.atlascloud.ai/th/blog/guides/kling-3.0-turbo-kling-omni), *third-party*). **Kling 4.0 still unconfirmed** | Cheap drafts (Turbo); 4K edits (Omni) | As left | Paid plans only (see `ai-video-tools.md`) |
| **Runway Gen-4.5** | No Gen-5 found. Later audio and multi-shot additions are single-source ([Runway news](https://alternativeto.net/news/2025/12/runway-unveils-gen-4-5-ai-model-with-realistic-text-to-video-and-benchmark-lead)) | As before | As before | As before |
| **Wan 2.2** (Alibaba) | **Last open-weights release**, Apache 2.0 (Jul 2025). Wan 2.5/2.6/2.7 appear API-only; "Wan 3.0 open" claims are unreliable ([howaiworks](https://howaiworks.ai/models/wan), [Vivideo](https://vivideo.ai/pl/modele-ai/wan-video)) | Self-hosted b-roll/plates, LoRA fine-tunes for a consistent style | GPU cost only | Apache 2.0 (2.2) |
| **LTX-2 / 2.3** (Lightricks) | Open weights released Jan 2026: synced audio+video, up to 20 s, native 4K, 50 fps, consumer GPUs ([OSFY](https://www.opensourceforu.com/2026/01/ltx-2-from-lightricks-delivers-native-4k-audio-video-with-fully-open-weights/)). 2.3 = 22B, native portrait. "2.5" (Aug 2026) is single-source | The best open model for local 9:16 plates with sound | GPU cost | **LTX-2 Community License**, reportedly free under ~$10M revenue ([innFactory](https://innfactory.ai/en/ai-models/lightricks-ltx/)); one source says Apache 2.0 for 2.3 (conflict) |
| **Higgsfield** | **An aggregator, not a model**: 15+ models (Kling, Veo, Seedance...) under one credit plan, plus camera-move presets. Raised $130M at $1.3B (Jan 2026) ([Imagine.art](https://www.imagine.art/blogs/higgsfield-ai-pricing)) | One login to compare models; preset camera moves | Roughly $15-129/month depending on tier and date; prices changed several times in 2026 ([Costbench](https://costbench.com/software/ai-video-generators/higgsfield/calculator/)) | Users report credits cost more than going direct |
| **FLUX.2** (Black Forest Labs) | [klein] 4B = Apache 2.0; [klein] 9B and [dev] = FLUX Non-Commercial; [pro]/[max]/[flex] via API ([BFL help](https://help.bfl.ai/articles/7424166364-wip-welcome-to-the-forest)) | Photoreal keyframes/stills, style consistency; 4B runs locally | From $0.014/image (4B API); [flex] $0.05/MP; [max] from $0.07/MP | Self-hosting 9B/dev commercially needs a paid BFL licence |
| **Ideogram 3.0 / 4.5** | 4.5 reported 30 Sep 2026 (*unverified*) | Best in-image typography (posters, signage plates) | ~$0.05/image API for 3.0 (*third-party*) ([Fluxnote](https://fluxnote.io/guides/ideogram-pricing-guide-2026)) | Paid plans; check terms |
| **Nano Banana Pro / Nano Banana 2** (Gemini image) | Nano Banana 2 = Gemini 3.1 Flash Image, 26 Feb 2026: cheaper, near-Pro quality, better text ([fal.ai](https://fal.ai/learn/devs/ideogram-v4-vs-nano-banana-2)) | Editing and consistency: put the same stand/booth into new scenes, multi-reference compositing | Pro ~5x Ideogram per image (*third-party*) | Google API terms; SynthID watermark |
| **GPT Image 2** (OpenAI) | Released with ChatGPT Images 2.0 (Apr 2026); API May 2026 (*third-party*) | Instruction-following edits, text in images, mockups | ≈ $5/M input and $30/M output tokens (aggregators conflict) ([dev.to](https://dev.to/tokenmixai/gpt-image-2-api-developer-guide-pricing-thinking-mode-and-production-integration-2026-28p5)) | OpenAI terms |

**Best combos for our two brands**
- **Markable:** use FLUX.2 or Nano Banana for photoreal renders of a stand concept from the client's CAD screenshot, then Kling Omni or Veo for a slow walk-through plate. Overlay dimensions, the build-day counter and the logo in code. Never generate the client's logo.
- **CybernetAI:** keep the phone UI, scan results and red-flag highlights 100% code-rendered (they must be accurate). Use LTX-2 or Wan 2.2 locally only for moody b-roll ("a phone buzzing on a bedside table at 2 a.m.") and Chatterbox for an Arabic VO version.

---

## 4. Viral short-form formats that work in 2025-26

Evidence here is mostly from creator and vendor blogs ([Opus](https://www.opus.pro/blog/editing-aesthetics-dominating-short-form-2026), [AIR](https://air.io/en/youtube-hacks/13-types-of-shorts-that-always-go-viral-with-examples), [ContentGrip](https://www.contentgrip.com/best-performing-tiktok-content-types/), [Swarmify](https://swarmify.com/blog/social-media-video-formats/)), plus the creators already analysed in `reference-reels.md`. Treat it as directional.

| Format | How it works | Named examples | B2B (Markable) | Consumer (CybernetAI) |
|---|---|---|---|---|
| **Split-screen explainer** | Motion-graphics panel on top, talking head below, captions on the seam | @duncanrogoff (Round 4) | ✅ Founder plus a stand build | ✅ Owner plus scan UI |
| **POV** | "POV: you..." puts the viewer inside the scenario | @fantiqmotion, @madebyext (Rounds 1-2) | ✅ "POV: 48 hours before the show opens" | ✅ "POV: you get a 'parcel held' text" |
| **A/B quiz ("Real or scam?")** | Two options, a pause, then the reveal; comments do the voting | Common format; no named source verified | ⚠️ "Which stand pulls more footfall?" | ✅✅ Best fit: guessing drives comments and replays |
| **Teardown / anatomy** | Freeze an object and annotate each part | No 2026 source names it as a format; it matches the "self-building UI" pattern (Round 3) | ✅✅ "Anatomy of a 200 m² stand": lighting, flooring, AV | ✅✅ "Anatomy of a scam text": sender, link, urgency |
| **Countdown / numbered list** | "5 signs...", with a step counter in the chrome | @jayantcreates.ai, @mrcreates.ai (Round 3) | ✅ | ✅ |
| **Before/after** | Split or wipe transformation; widely cited as high completion and shares ([ContentGrip](https://www.contentgrip.com/best-performing-tiktok-content-types/)) | Scrub Daddy mixes polished and lo-fi ([Ecommerce Fastlane](https://ecommercefastlane.com/best-brands-on-tiktok-tips-to-optimize-your-brand-presence/)) | ✅✅ Empty hall, then finished stand (timelapse plus a code wipe) | ✅ Phone "before scan / after scan" |
| **"I tested X"** | Creator runs a real test and reports the result | Common creator format; no named source verified | ⚠️ "I asked 3 builders for the same quote" (only if real) | ✅ "I clicked 10 scam links in a sandbox" (only if real and safe) |
| **Reaction / stitch** | Respond to someone else's clip (stitch, duet, green screen) | Platform-native | ⚠️ Stitch industry news | ✅ Stitch viral scam stories with "here's the tell" |
| **Faceless kinetic typography** | Type is the main character, plus VO | @edita.visuals; Kurzgesagt-style explainers are the faceless benchmark ([Teleprompter](https://www.teleprompter.com/blog/trending-youtube-shorts)) | ✅ | ✅ (our current strength) |
| **3D story shorts** | 20-45 s, fast vertical 3D narratives | Zack D. Films (22M+ subs per a freelancer listing, *unverified*), which outsources 3D work ([QuickDraw](https://quickdrawanimation.ca/opportunities/job-postings/zack-d-films-animator-wanted)) | ❌ | ⚠️ "What happens after you click" as a 3D journey |
| **Creator-led awareness** | Creators explain security in their own style | Kaspersky's TikTok campaign in Vietnam and Indonesia won silver in Sep 2026 ([Viet Nam News](https://vietnamnews.vn/advertisement/1800811/kaspersky-wins-silver-for-tiktok-cybersecurity-campaign-in-southeast-asia.html)); TikTok #BeCyberSmart; a 2026 SOUPS paper studied 150 anti-scam TikToks ([Google Research](https://research.google/pubs/you-have-been-selected-as-the-winner-characterizing-user-reported-scams-on-tiktok/)) | ❌ | ✅✅ Proof the category works with creators |
| **Episodic series** | Same frame chrome, numbered episodes | Listed as a top brand format ([ContentGrip](https://www.contentgrip.com/best-performing-tiktok-content-types/)) | ✅✅ "Build Diary" | ✅✅ "Scam of the Week" |

**B2B vs consumer in one line:** B2B wins with **proof formats** (teardown, before/after, series, split-screen with a real founder). Consumer wins with **participation formats** (quiz, POV, stitch, "send this to...").

**Scam-content guardrail (CybernetAI).** Attackers are using Reels and TikTok "tutorials" to spread the Vidar infostealer ([Hackread](https://hackread.com/scammers-tiktok-instagram-reels-vidar-infostealer/)). Never show a working malicious link or command on screen: blur or defang it (`hxxp://`), and never tell viewers to paste commands.

---

## 5. Growth mechanics (concise and practical)

**Comment-to-DM automation (ManyChat, Inro, InstantDM, etc.)**
- Meta's rules: a comment allows **one private reply within 7 days**. After that you can only message again inside a 24-hour window opened by the user replying ([Creatorflow](https://creatorflow.so/blog/automated-instagram-dms-creator-rules-safety/), [Kanal](https://getkanal.com/blog/manychat-instagram)). So the first DM must do everything: link, one line of value, and a question that makes them reply (which opens the 24 h window).
- Rate limits: 750 comment private replies per hour per account is cited from Meta docs. The "200/hour" figure is a tool pacing number, not a Meta limit (*unverified*).
- ManyChat price: not confirmed in search (one review cites $200+/month at 50K contacts). Check [manychat.com/pricing](https://manychat.com/pricing).
- Setup for CybernetAI: keyword **SCAN**, DM the cybernetai.app link with UTMs, and ask "What was the message about?" to open the window. For Markable on LinkedIn there's no native comment-to-DM automation, so use a "comment GUIDE" CTA and reply by hand within an hour (author replies matter; see `x.md`/`linkedin.md`).

**Trial Reels (update)**
- Auto-share is now an option: Instagram shares the trial to followers automatically if it performs well, judged in the **first 72 hours**. Metrics appear around 24 h, and sharing a winner doesn't hurt reach ([Planoly](https://www.planoly.com/blog/trial-reels-auto-share-vs-manual), [Publer](https://publer.com/blog/instagram-trial-reels-guide/)).
- Workflow: post 2-3 hook variants of the same body as trials, let the winner auto-share, and repost the losers' best idea with a new hook a week later.

**Collabs**
- Up to **5 collaborators per post/Reel** (6 accounts) as of Oct 2026, and collaborators can be added to live posts via Edit ([Sked](https://skedsocial.com/blog/instagram-collaboration-feature.md); Meta's 2023 newsroom still says 3).
- Mosseri: reach is higher when the **larger account creates the post** ([Buffer](https://buffer.com/resources/instagram-collab-post/)).
- Markable: collab with the event organiser, the client brand and the AV/lighting supplier on every build reel (four audiences, one post). CybernetAI: collab with local creators who post about scams, telecom or bank awareness accounts, and parenting creators.

**Series**
- Fixed chrome, numbered episodes and a fixed weekday make the feed read as a show (see Rounds 2-4). Plan series in batches of 6-8 episodes (one 2026 B2B guide suggests 5-8 short angles per topic ([Alsheikh Media](https://alsheikhmedia-staging.pages.dev/en/blog/short-form-video-b2b-what-actually-works/))).

**Posting cadence**
- Mosseri gives no official number: "the more you post, the more people you'll reach", with quality first ([RouteNote](https://routenote.com/blog/how-often-you-should-post-on-instagram/)). The "2-4 Reels a week" attributed to him is unsourced. Keep the 3-5/week floor from Buffer's data (`marketing-strategy.md`).

**LinkedIn: documents vs video (new data, conflicting)**
- AuthoredUp (3M personal-profile posts, Mar 2025 to Feb 2026): **document posts ~1.39x median reach, video 0.86x** ([Dataslayer](https://dataslayer.ai/blog/linkedin-algorithm-february-2026-whats-working-now)). Ordinal's data finds the opposite for reach: multi-image carousels beat PDFs ([Ordinal](https://www.tryordinal.com/blog/carousel-posts)). All vendor data.
- Vertical 9:16 video gets its own swipe feed, and landscape reportedly doesn't appear there ([Visla](https://www.visla.us/blog/guides/linkedin-video-in-2026-whats-working-and-how-to-make-it/), *third-party*). A claimed "up to 40% reach cut for links and sales language" (Apr 2026) is single-source.
- Markable plan: each hero video also ships as a **5-8 page PDF carousel** (key frames plus one line per page, last page = CTA), posted 2-3 days apart from the video. Keep links in comments. Post from a founder or employee profile and boost winners as Thought Leader Ads.

**Paid amplification (new: Meta Partnership Ads)**
- Boost a *creator's* post from their handle: the creator turns on "Allow brand partner to boost", the post carries the paid-partnership label, and dynamic optimisation tests creator, brand or dual handles ([Aspire](https://www.aspire.io/blog/insider-tips-meta-partnership-ads)). The Partnership Ads Hub (expanded Dec 2025) shows creators' organic stats so you can pick proven posts.
- Meta's own case data for Partnership Ads added to Reels campaigns: median **-18% CPC, +25% CTR, +22% ThruPlay rate** (vendor-reported) ([Blueprint](https://trainingworkshops.facebookblueprint.com/student/page/641248)).
- Rule: **only pay to amplify posts that already won organically** (trial-reel winners, top-decile sends per reach), and judge brand pieces on hold rate and branded search, not CTR (`SUMMARY.md` section 6).

---

## 6. One-page production checklist (every video)

Merged from `SUMMARY.md` sections 1, 3 and 7, `reference-reels.md`, and the new items above (marked **NEW**).

**Before you make it**
- [ ] One viewer, one moment, one problem; passes the logo-swap test
- [ ] Format chosen deliberately (section 4): proof format for Markable, participation format for CybernetAI
- [ ] Hook written as the viewer's own words; beats the 3 best hooks in the library
- [ ] **NEW** Series slot decided (episode number, chrome) and collaborators listed (up to 5)
- [ ] **NEW** Generative plates only where code can't do it; keyframes approved before spending video credits; licence of every model checked (no CC-BY-NC weights like F5-TTS or MusicGen; Remotion licence if over 3 staff)

**Hook (0-3 s)**
- [ ] Frame 1 is the ad: motion plus a readable line, no logo or fade
- [ ] Proposition or payoff by 1-2 s (Shorts) and 3 s (everywhere)
- [ ] Search keyword spoken and on screen early
- [ ] **NEW** Counters and prices are real, and their captions are typed rather than transcribed (Whisper drops timestamps on numbers)

**Body**
- [ ] A visual change every 2-4 s; re-hook at the midpoint; numbered chrome ("02 / 05")
- [ ] 2-4 words per caption beat; current word highlighted; one emphasis style
- [ ] Every motion has a sound; a dropout before the reveal; music ~100-110 BPM under the VO
- [ ] **NEW** Captions aligned from the *script* (forced alignment), not raw ASR, so there are zero typos
- [ ] Every opened loop closed; end on a peak; short videos loop cleanly
- [ ] One share moment ("send this to...")

**Craft and specs**
- [ ] 4K master (2160x3840) plus platform exports; 60 fps for motion-graphics pieces
- [ ] Text inside safe zones: TikTok x=60-940, y=200-1440; Reels x=65-990, y=270-1250 (3:4 grid crop centred); Shorts x=60-880, y=200-1500
- [ ] LinkedIn: 4:5 or **9:16 for the vertical feed (NEW)**, under 30 fps, burned-in captions plus SRT
- [ ] Loudness ~-14 LUFS integrated, true peak ≤ -1 dBTP *(owner's target; confirm per platform)*; voice clearly above music
- [ ] AI-slop check frame by frame: hands, warped text, morphing logos, orange-teal grade
- [ ] Logos, UI, prices and legal lines code-rendered or composited, never generated
- [ ] **NEW** CybernetAI: every malicious URL defanged or blurred; no copyable commands

**CTA and distribution**
- [ ] One CTA, matched word for word on the landing page; UTMs set
- [ ] **NEW** Comment-keyword CTA only if the automation is live; first DM = link + value + a question (one private reply per comment, within 7 days)
- [ ] **NEW** Instagram: post as a Trial Reel with auto-share on, plus 1-2 hook variants
- [ ] **NEW** LinkedIn: a PDF-carousel cut scheduled 2-3 days later; link in the first comment; post from a person
- [ ] Caption line 1 = hook + keyword; cover title centred for the grid
- [ ] Reply to comments in the first hour

**Legal and disclosure**
- [ ] Realistic AI labelled per platform; C2PA/SynthID/PerTh watermarks left intact
- [ ] Music licence covers this platform and commercial use
- [ ] Voice clones and likenesses have recorded consent; client sign-off
- [ ] No invented stats; every claim substantiated

**After 24-72 h**
- [ ] Read hook rate, hold rate, sends and saves per reach against your own baseline
- [ ] Winners: auto-shared trial, then a Partnership Ad or Thought Leader Ad boost. Losers: same body, new hook
- [ ] Log the hook, format and result in the hook library

---

## Sources

All are cited inline above. Key primary sources: [Remotion licence](https://remotion.dev/license), [Remotion agent skills](https://www.remotion.dev/docs/ai/skills), [Remotion TikTok-style captions](https://remotion.dev/docs/captions/create-tiktok-style-captions), [HyperFrames repo](https://github.com/heygen-com/hyperframes), [Webflow GSAP free](https://webflow.com/blog/gsap-becomes-free), [Theatre.js repo](https://github.com/theatre-js/theatre), [F5-TTS model card](https://huggingface.co/SWivid/F5-TTS/raw/4dcc16f297f2ff98a17b3726b16f5de5a5e45672/README.md), [Dia repo](https://github.com/nari-labs/dia), [WhisperX paper](https://www.arxiv.org/pdf/2303.00747), [BFL help](https://help.bfl.ai/articles/7424166364-wip-welcome-to-the-forest), [Instagram Partnership Ads](https://creators.instagram.com/earn-money/partnership-ads). Everything else is third-party and labelled as such.
