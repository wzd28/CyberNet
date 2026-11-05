# AI video tools for marketing (state as of 2026-11-05)

> **How this was researched.** Web searches run on 2026-11-05. Direct page fetching was blocked in the research session, so every fact below comes from pages surfaced by search (official pages where possible, flagged where only third-party). These products change monthly and prices drift: treat every price as "check current pricing" and confirm on the vendor page before quoting a client. Unverified claims are labelled.

## Comparison table

| Tool | Latest model (Nov 2026) | Max clip per generation | Resolution | Native audio | Image-to-video / references / consistency | Commercial use | Approx cost (date found) | Best for |
|---|---|---|---|---|---|---|---|---|
| **Google Veo** | Veo 3.1 (Oct 2025), plus 3.1 Fast and 3.1 Lite (preview Apr 2026) | 4, 6 or 8 s; Extend chains clips | 720p, 1080p, 4K (upscale; 1080p/4K reported only at 8 s) | Yes: dialogue, SFX, ambience | Up to 3 reference images ("Ingredients"), first + last frame, native 9:16 | Paid Gemini API / Vertex / Flow; read Google's terms | Third-party: about $0.40/s Standard, Fast about $0.12/s, Lite cheaper (2026, unverified) | Hero shots with sound, dialogue, ad spots |
| **OpenAI Sora** | Sora 2 - **discontinued** | n/a (was roughly 10-25 s by tier) | n/a | Was yes | Was "cameos" / Characters | App closed 26 Apr 2026; API shut 24 Sep 2026 | n/a | Do not plan on it |
| **Runway** | Gen-4.5 (1 Dec 2025); Aleph 2.0 (Jun 2026); Act-Two | Gen-4.5: 2-10 s; Act-Two up to 30 s; Aleph input 2-30 s | 720p (HDR / post formats via API from Aug 2026) | Not listed for Gen-4.5 | Image-to-video, Aleph keyframe edits (up to 5 images), Act-Two performance transfer | Paid plans (check terms) | Standard $12/mo annual (625 credits), Pro $28/mo annual, Max about $76/mo annual; Gen-4.5 = 12 credits/s | Directed shots, editing real footage, performance capture |
| **Kling** | Kling 3.0 / 3.0 Omni (Feb 2026); 4.0 in staged rollout (Oct 2026, unconfirmed GA) | 3.0: up to 15 s; 4.0: up to 30 s (reported) | Up to 1080p / native 4K (third-party) | Yes, speech in 5+ languages, lip-sync | Multi-shot storyboards (up to 6 shots, reported), Element Library for consistency, keyframes | Paid plans only; free output watermarked, non-commercial | Standard tier roughly $7-10/mo (sources conflict) | Longer multi-shot clips, human motion, cheap volume |
| **Pika** | Pika H3 Flex (29 Oct 2026, built on MiniMax H3); Pika 2.5; also hosts third-party models | H3 Flex 15 s (reported); Pikaframes up to 25 s (third-party) | 480p to 4K depending on model (third-party) | H3 Flex: yes | Pikaframes keyframes, Pikaswaps, first/last frame and multimodal refs (H3 Flex) | Starter and above; Free has no commercial rights | Starter $10/mo ($8 annual), Creator $35/mo, Fancy from $95/mo (pika.art) | Fast social effects, playful edits, cheap tests |
| **HeyGen** | Avatar V (Apr/May 2026); Avatar IV; Video Agent | Minutes (billed per minute) | 1080p+ (check plan) | Yes (TTS / voice clone, lip-sync) | Custom digital twin from about a 15 s consent clip; outfit/scene swaps | Consent of depicted person required | Creator $29, Pro $49, Business $149/mo; Avatar IV credit rate reportedly raised Oct 2026 (unverified) | Talking-head explainers, localisation, sales video |
| **Luma** | Ray3.14 (26 Jan 2026); Ray3 (HDR, Draft Mode) | 5 or 10 s text-to-video; 5 s image-to-video; Modify Video 18 s | Draft, 540p, 720p, native 1080p; Ray3 HDR / 4K via HiFi | Not stated | Image-to-video, keyframes, Modify Video (video-to-video) | Conflicting: newer pages say all plans; older said Plus+ only | Plus $30, Pro $90, Ultra $300/mo (lumalabs.ai, labels inconsistent) | Cheap drafting, HDR finishing, restyling footage |
| **ElevenLabs** | Eleven v4 / v4 Turbo TTS (28 Sep 2026); Eleven Music (Aug 2025, Music v2 reported May 2026); SFX v3 (reported Oct 2026) | n/a (audio) | n/a | Audio only | Voice cloning (pre-v4 clones need retraining), 17,500+ voice library | Starter and above; music excludes streaming and enterprise-only uses | Starter $6/mo, Creator $22/mo (elevenlabs.io) | VO, music beds, SFX layers |

## Per-tool notes

### Google Veo 3.1 (Gemini API, Vertex AI, Flow, Gemini app)
- **Strengths:** Best-in-class native audio in one MP4 (dialogue, SFX, ambience). "Ingredients to video" takes up to three reference images for character, object or style consistency. First-and-last-frame mode generates the transition between two stills, with audio. Native 9:16 output instead of cropping. Flow adds Insert (add objects to a scene) and audio on Frames to Video and Extend.
- **Weaknesses:** 8 s ceiling per generation. Community reports that first/last-frame requests fail unless duration is 8 s. 1080p/4K reported only at 8 s. Veo 2 and Veo 3 are being retired (third-party report: by 30 June 2026), so pin model IDs (`veo-3.1-generate-001`, `veo-3.1-fast-generate-001`).
- **Cost:** check current pricing. Third-party figures (2026): about $0.40/s Standard with audio (about $3.20 per 8 s clip), about $0.96 per 8 s on Fast; Google says Lite costs under 50% of Fast.
- **Best use:** 8 s hero shots, product moments with sound design, dialogue snippets, vertical ads.
- **Provenance:** SynthID invisible watermark on all output. Google added a visible watermark in May 2025 to all videos except those made by Ultra members in Flow. Vertex AI output is also C2PA-signed by Google ("Content Credentials").
- **Prompting (Google's Veo 3.1 guide):** formula `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`. Put dialogue in quotation marks, describe SFX and background soundscape as separate lines, specify voice ("a polished British accent, serious, urgent tone"). For image-to-video, prompt the motion only; the image already supplies subject and style. Describe what you want rather than what you don't. Google also suggests meta-prompting: ask Gemini to expand a brief into a Veo prompt.

### OpenAI Sora 2 (discontinued)
- Launched with a social app on 30 Sep 2025. OpenAI announced discontinuation on 24 Mar 2026; the app and sora.com ended 26 Apr 2026; the Videos API and all `sora-2` / `sora-2-pro` snapshots were removed 24 Sep 2026 with no replacement listed. OpenAI staff said there are no plans for open weights.
- **Lesson for us:** do not build a pipeline around one vendor. Archive project files and prompts locally.
- **Provenance (historical):** visible moving watermark with creator name, plus C2PA metadata on all outputs; likeness only via opt-in cameos.

### Runway (Gen-4.5, Aleph 2.0, Act-Two)
- **Strengths:** Gen-4.5 (1 Dec 2025) ranked #1 on Artificial Analysis text-to-video at launch (1,247 Elo, per Runway) for motion quality and prompt adherence. Aleph edits *existing* footage by text (relight, change weather, add/remove objects) with up to 5 keyframe images. Act-Two maps a real actor's performance (movement, speech, expression) onto a character image, up to 30 s at 5 credits/s. Strongest editor-style toolset.
- **Weaknesses:** Gen-4.5 outputs 720p in the help centre (upscale for delivery). 10 s cap. Aleph is not a lip-sync model, so re-run Act-Two after environment edits. Unlimited plan retired (legacy users move to Max on 30 Nov 2026).
- **Cost:** Standard $12/mo annual ($15 monthly, 625 credits), Pro $28/mo annual ($35 monthly, 2,250 credits), Max about $76/mo annual (9,500 credits, one month rollover). Gen-4.5 costs 12 credits/s, so a 10 s clip is 120 credits.
- **Provenance:** no Runway page confirming C2PA on exports was found. Check help centre before promising provenance to a client.
- **Prompting (Runway's Gen-4 guide and camera glossary):** start simple, then add one layer at a time: subject motion, camera motion, scene motion, style. For image-to-video, describe motion, not what's already in the frame. **No negative phrasing** - it can produce the opposite; write "Locked camera. The camera remains still." instead of "no camera movement". Use its camera vocabulary (pan, tilt, dolly, tracking, crane, orbit, arc, crash zoom, static). Pick one primary movement: big camera move *or* complex action, not both. Use 10 s for prompts with several movements.

### Kling (Kuaishou)
- **Strengths:** Kling 3.0 (5 Feb 2026) brought up to 15 s clips, native audio with lip-sync in English, Chinese, Japanese, Korean and Spanish, multi-shot storyboarding and element consistency. Historically strong at complex human motion (Coca-Cola's 2024 team reportedly added Kling for that). Kling 4.0 was announced late Sep 2026 with up to 30 s clips and up to 10 keyframes; the Flash variant (20 s, 720p SDR) went to annual Ultra subscribers first. General availability of the full 4.0 was not confirmed at research time.
- **Weaknesses:** Spec claims (4K/60fps) come mostly from third parties. Terms are confusing: the general ToS reportedly restricts commercial use, while the paid-service terms grant it to subscribers.
- **Cost:** check current pricing. Standard tier reported at $6.99 first month to about $10 list.
- **Provenance:** free exports carry a Kling watermark; paid members may remove it. Removing it with third-party tools on free plans breaches ToS. No C2PA confirmation found.
- **Prompting:** use the multi-shot storyboard to write shot-by-shot (shot 1: wide establishing; shot 2: medium; shot 3: close-up) rather than one long paragraph; lock characters via the Element Library.

### Pika
- **Strengths:** Cheapest playground for social-native tricks (Pikaswaps object/character replacement, Pikaframes keyframe interpolation, effects). New H3 Flex (29 Oct 2026) is an open-weight LoRA pair on MiniMax H3 that generates video with synchronised audio in six sampling steps, about 15 s clips (Pika's own speed claims, not independently verified). Pika.art now also hosts third-party models (e.g. Seedance 2.5).
- **Weaknesses:** Less cinematic than Veo/Runway/Kling at the top end; pricing per model varies.
- **Cost:** Free $0 (no monthly credits, no commercial rights), Starter $10/mo ($8 annual, 900 credits), Creator $35/mo ($28 annual, 3,150 credits), Fancy from $95/mo (pika.art).
- **Provenance:** Pika says all current plans export without a watermark; older watermarked files stay watermarked. No C2PA statement found.
- **Best use:** quick reactive trend content, visual gags, testing concepts before spending Veo/Runway credits.

### HeyGen
- **Strengths:** Avatar V (research release Apr 2026, main launch reported Apr/May 2026) builds a digital twin from a short (about 15 s) consent recording, then lets you change outfit and scene without re-filming; May 2026 added Custom Motion. Video Agent turns a brief into a full avatar video. Excellent for localisation and personalised sales video. HeyGen also integrates Seedance 2 for b-roll.
- **Weaknesses:** Talking heads are banned in our TASTE.md unless the head *is* the wow factor. Lip-sync and micro-expressions are still the most common "AI tell". Credits per minute are the hidden cost: a third-party tracker reports an Oct 2026 increase (Avatar IV 16-31 credits/min, Video Agent 80/min) - unverified.
- **Cost:** Creator $29, Pro $49, Business $149/mo (third-party, 2026). Check current pricing.
- **Provenance / consent:** subject must read a security code on camera (Avatar V combines footage and consent in one recording). HeyGen states it is a C2PA member; whether exports carry C2PA was not confirmed.

### Luma (Ray3, Ray3.14)
- **Strengths:** Ray3 (Sep 2025) was the first "reasoning" video model with native HDR output; Draft Mode gives cheap previews before a HiFi pass to 4K HDR. Ray3.14 (26 Jan 2026) added native 1080p, 4x faster and 3x cheaper than Ray3 (at 720p, per Luma). Modify Video restyles real footage up to 18 s. Native 24 fps.
- **Weaknesses:** Short clips (5/10 s text-to-video, 5 s image-to-video). Pricing pages are internally inconsistent (Plus/Pro prices swapped on one page). Luma says Dream Machine and Ray2 are deprecated names.
- **Cost:** Plus $30/mo (10,000 credits), Pro $90 (40,000), Ultra $300 (150,000) per lumalabs.ai plans page. Check current pricing.
- **Provenance:** older licensing pages: Free/Lite outputs carry permanent watermarks and are non-commercial. Newer plan pages list commercial use on all plans. Confirm on the licensing page.
- **Best use:** drafting many variations cheaply, HDR finishing, restyling a phone-shot plate.

### ElevenLabs (voice, music, SFX)
- **Strengths:** Eleven v4 / v4 Turbo (28 Sep 2026 per ElevenLabs) is its most emotive TTS, 90+ languages, inline audio tags for delivery control, 10,000-character request limit. Eleven Music (5 Aug 2025) launched with Merlin and Kobalt licensing deals and is marketed as cleared for commercial use. SFX v3 (reported late Oct 2026, API `eleven_text_to_sound_v3`) handles multi-part prompts better.
- **Weaknesses:** Instant/professional clones made before v4 need retraining. Generic "AI narrator" cadence is a TASTE.md hard ban: direct the read with audio tags and pacing, or use a real VO for hero pieces.
- **Cost:** Starter $6/mo (30,000 credits), Creator $22/mo (121,000 credits) on elevenlabs.io. Free tier is non-commercial and needs attribution.
- **Commercial terms:** Starter+ includes commercial rights for ads, YouTube, podcasts, apps. Music can be used commercially on Starter+ **excluding streaming and enterprise-only use cases** - read this before putting a track on Spotify.

## Cross-tool playbook

### 1. Reusable prompt structure
Write one line per slot, then collapse to prose for the model. Order follows Google's formula with our additions.

```
SHOT / LENS:   Medium close-up, 50mm, eye level, shallow depth of field
SUBJECT + ACTION: A night-shift baker in a flour-dusted apron slaps dough onto a steel bench, flour bursting into the light
SETTING:       Cramped 4am bakery kitchen, stacked proofing racks, condensation on the window
LIGHTING:      Single tungsten work lamp camera left, hard shadows, cool blue spill from the street
CAMERA MOVE:   Slow push-in, handheld micro-shake (ONE move only)
STYLE / STOCK: 35mm film, Kodak Vision3 500T, visible grain, slight halation on highlights
COLOUR:        Warm tungsten #E8A25C vs street blue #2F4A6D, blacks lifted to #141414
AUDIO:         Dull thud of dough, oven fan hum, distant tram; no music. Baker mutters: "Forty more."
```

Rules: be specific and physical (verbs, materials, weights); one camera move per clip; describe what *is* there, never "no X"; for image-to-video drop subject/setting and prompt motion + audio only; keep a prompt log per project.

### 2. Brand and character consistency
- **Lock keyframes first.** Generate or photograph the hero still(s), approve them, then animate. Every tool above respects an approved first frame better than text.
- **Use references:** Veo Ingredients (up to 3 images), Kling Element Library, Runway Aleph keyframes (up to 5), Pika H3 Flex multimodal refs, HeyGen avatars for people.
- **Start/end frames** (Veo, Pikaframes, Kling keyframes) to control where a shot lands, so cuts match.
- **Style reference board:** one locked image for grade and texture, reused in every shot.
- **Character sheet:** front, 3/4, profile of the character in fixed wardrobe; reuse the exact description string verbatim in every prompt.
- **Real product photos as references:** the Volvo EX30 spec team trained on 65 real product images and still admitted fidelity was not 100%. Products drift; plan to composite.

### 3. Logos, packaging and on-screen text
- **Never generate the logo or label.** Models warp letterforms and invent text. Generate the shot with a clean or blank surface, then track and composite the real vector logo / pack shot in post (Resolve Fusion, After Effects, or Premiere/CapCut tracking).
- Real product in hero frames: shoot or 3D-render the pack and use it as first frame, or composite it.
- All supers, captions, prices and legal lines are added in the editor, inside platform safe zones.

### 4. Recommended pipeline
1. **Brief** (templates/video-brief.md) and TASTE.md check: niche viewer, one visual device, hook in 1-3 s.
2. **Keyframes:** image model or photography; approve stills with the client before any video credits.
3. **Draft motion cheaply:** Luma Draft Mode, Pika, Kling, or Veo 3.1 Lite / Fast.
4. **Final image-to-video:** Veo 3.1 (shots with sound), Runway Gen-4.5 (directed camera), Kling 3.0/4.0 (longer multi-shot or human motion). Expect waste: Kalshi's ad took 300-400 generations for 15 usable clips.
5. **Fix and extend:** Runway Aleph for relighting / object edits, Act-Two for performances, Veo Extend or Kling keyframes for longer beats.
6. **Edit:** CapCut (fast social), Premiere or DaVinci Resolve (grade, Fusion composites). Cut on action, vary shot length, add real camera-style imperfections.
7. **Audio:** keep Veo/Kling native SFX where good; ElevenLabs v4 VO or real voice; Eleven Music or licensed track; layer SFX v3. Mix to platform loudness.
8. **Composite brand assets:** logo, pack shot, end card, legal.
9. **Captions:** burned-in, safe-zone-correct, checked for typos.
10. **Provenance and disclosure:** keep SynthID/C2PA intact where present, follow platform AI-label rules, archive prompts and source files (Sora's shutdown shows why).

### 5. "AI slop" tells to avoid
| Tell | Fix |
|---|---|
| Plastic, poreless skin; waxy faces | Prompt film stock and grain, real skin texture; keep faces small or in motion; avoid extreme close-ups of skin |
| Floaty, weightless physics | Specify weight and contact ("slams", "drags", "sinks"); add real SFX on impact; cut before physics breaks |
| Slow motion on everything | Request "real-time speed", vary clip speed in the edit, cut faster |
| Morphing objects, hands, logos | Shorter clips, locked first frame, cut at 3-5 s, composite logos |
| Generic orange-teal grade | Pick a specific palette in hex and grade it yourself in Resolve |
| Symmetric, centred compositions | Ask for off-centre framing, foreground occlusion, rule of thirds, Dutch angle when motivated |
| Uncanny lip-sync | Avoid dialogue close-ups; use VO over action; if needed, Act-Two with a real performance |
| Endless smooth drone/dolly moves | One motivated move per shot; mix in locked-off and handheld |
| Everything glossy and clean | Add dirt, wear, practical light sources, lens imperfections |
| Montage of unrelated "wow" shots | One idea, one device, tied to the product (see case studies) |

## Sources (retrieved via web search, 2026-11-05)
- Google DeepMind Veo page: https://deepmind.google/models/veo/
- Google Developers Blog, Introducing Veo 3.1: https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/
- Google, Veo 3.1 Ingredients to Video: https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/
- Google, Veo 3.1 Lite: https://blog.google/innovation-and-ai/technology/ai/veo-3-1-lite/
- Google, Veo updates in Flow: https://blog.google/innovation-and-ai/products/veo-updates-flow/
- Google Cloud, Ultimate prompting guide for Veo 3.1: https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1
- Vertex AI video prompt guide: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide
- Vertex AI first and last frames: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-first-and-last-frames
- Vertex AI best practices: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/best-practice
- Vertex AI content credentials: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/content-credentials
- Google, Veo 3 expansion and visible watermark: https://blog.google/products-and-platforms/products/gemini/veo-3-expansion-mobile/
- Google, meta-prompting for Veo: https://blog.google/products/gemini/meta-prompting-veo-gemini-tips/
- Veo pricing (third-party): https://wavespeed.ai/blog/cost-and-billing/google-veo-3-pricing/
- OpenAI, What to know about the Sora discontinuation: https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation
- OpenAI deprecations: https://developers.openai.com/api/docs/deprecations
- OpenAI, Launching Sora responsibly: https://openai.com/index/launching-sora-responsibly/
- Sora 2 System Card: https://cdn.openai.com/pdf/50d5973c-c4ff-4c2d-986f-c72b5d0ff069/sora_2_system_card.pdf
- 9to5Google on Sora shutdown: https://9to5google.com/2026/03/24/openai-shutting-down-sora-video-generation-app-but-without-explaining-why/
- Runway, Introducing Gen-4.5: https://runwayml.com/research/introducing-runway-gen-4.5
- Runway help, Creating with Gen-4.5: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5
- Runway, Gen-4 Video Prompting Guide: https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide
- Runway, Camera Terms, Prompts & Examples: https://help.runwayml.com/hc/en-us/articles/47313504791059-Camera-Terms-Prompts-Examples
- Runway API changelog: https://docs.dev.runwayml.com/api-details/api_changelog/
- Runway, Act-Two: https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two
- Runway pricing: https://runwayml.com/pricing ; Unlimited to Max: https://help.runwayml.com/hc/en-us/articles/52068047744019-Unlimited-plan-is-switching-to-Max
- Kling 3.0 press release: https://www.prnewswire.com/news-releases/kling-ai-launches-3-0-model-ushering-in-an-era-where-everyone-can-be-a-director-302679944.html
- Kling release notes: https://kling.ai/release-notes ; API updates: https://kling.ai/document-api/apiReference/updateNotice
- Kling 4.0 rollout (third-party): https://aiweekly.co/alerts/kuaishous-kling-ships-kling-40-flash-to-annual-subscribers-30-second-4khdr-ai
- Kling pricing and terms (third-party): https://magichour.ai/blog/kling-ai-pricing
- Pika pricing: https://pika.art/pricing ; FAQ: https://pika.art/faq
- Pika H3 Flex (third-party): https://wavespeed.ai/blog/minimax-h3/pika-h3-flex-explained/
- HeyGen, Avatar V: https://www.heygen.com/blog/introducing-seedance-2-and-heygen ; May 2026 release: https://www.heygen.com/blog/heygen-may-2026-release ; ethics: https://www.heygen.com/ethics
- HeyGen Avatar V webinar recap: https://community.heygen.com/public/resources/avatar-v-live-webinar-recap-top-questions-answered-2026-04-16
- HeyGen credit change (third-party): https://www.usagepricing.com/blueprint/activity/heygen-2026-10-15-avatar-credit-rate-increase
- Luma, Ray3.14: https://lumalabs.ai/news/ray3_14 ; FAQ: https://lumalabs.ai/learning-hub/ray3-faq ; Ray3: https://lumalabs.ai/news/ray3
- Luma plans: https://lumalabs.ai/learning-hub/dream-machine-support-pricing-information ; licensing: https://lumalabs.ai/learning-hub/licensing
- ElevenLabs pricing: https://elevenlabs.io/pricing ; Eleven v4: https://elevenlabs.io/de/blog/eleven-v4
- Eleven Music launch: https://musicbusinessworldwide.com/eleven-music-new-ai-rival-to-suno-launches-with-merlin-kobalt-licensing-deals-in-the-bag
- ElevenLabs SFX v3 (third-party): https://www.stork.ai/blog/elevenlabs-sound-effects-2026
- Volvo EX30 spec ad: https://creativepool.com/bottomlineai/projects/volvo-ex30-ai-spec-ad
