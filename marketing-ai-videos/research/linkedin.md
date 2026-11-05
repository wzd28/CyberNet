# LinkedIn video: research notes

Last researched: 2026-11-05. Official pages were read through search-result extracts (direct fetches were blocked from the research environment). Vendor-only figures are labelled "(vendor data, unverified)".

## 1. Specs

**Ideal length (evidence).** LinkedIn's own video-ad guidance says short videos are more likely to be watched to the end: 7-15 s videos showed up to a 300% lift in completion rate (2025 LinkedIn data). It also says longer formats can drive as many clicks and views when the story is complex [2]. For ads, LinkedIn recommends 15-30 s so the video qualifies for every placement; videos under 30 s loop until they reach 30 s of playback [1]. For organic posts there is no official ideal. Working rule: 30-90 s for a single idea, and longer only for demos or talks that viewers deliberately watch.

**Max length.**
- Ads: 3 s to 30 min, depending on the objective [1].
- Organic: commonly cited as 15 min on desktop and 10 min on mobile, up to 5 GB. This comes from third-party guides, some of which say a flat 10 min, so it is a conflict to verify [4].

**Aspect ratios.** Ads accept 16:9, 1:1, 4:5 and 9:16 (5% tolerance), 360-1920 px per side. **4:5 vertical is the recommended ad ratio** (360x450 to 1080x1350) [1]. Organic posts take 9:16 at 1080x1920 according to third-party guides [4].

**Resolution / format.** MP4 with H.264 and AAC audio, under 30 fps. Ad files must be 75 KB to 500 MB; an older help page says 200 MB, so use 500 MB as the current figure [1][3]. Captions as SRT; optional thumbnail JPG/PNG up to 2 MB [1]. Thought Leader Ads must meet organic specs, not ad specs [4].

**Vertical vs horizontal: conflicting evidence.** One vendor says vertical gets 1.9x the impressions of horizontal; another reports horizontal beating vertical 2-4x in ad tests (both vendor data, unverified) [8]. LinkedIn recommends 4:5 for ads [1]. Default to 4:5 for the feed; test 9:16 for the vertical video feed.

## 2. Hooks (first 1-3 s)

LinkedIn's guidance: establish relevance in the first few seconds, because viewers did not plan to watch an ad [5]. Show the key content within the first 10 s [2]. For brand-consideration campaigns, make the point within 5 s [6].

Patterns that work for a professional audience:
- **Role-specific problem on screen at second 0:** text "Security teams waste 6 hrs/week on X" over a face talking, using your own customer data, not an invented number.
- **The result first:** show the finished dashboard or report, then "here's how we built it in 20 minutes."
- **A contrarian line from a named person:** "Most B2B demo videos fail for one reason." A real face and name beat a brand logo.
- **A visible artefact:** a screen recording of the actual product moment, not abstract motion graphics.

Avoid: logo intros, "Hi, I'm X from Y", and stock footage of handshakes or offices.

## 3. Retention & pacing rules

- Creators now see average watch time, total watch time and views; the metric is hard to compare across videos because it sits on each video's own analytics page [9]. Use it.
- One idea per video; cut every pause; change the visual every 3-5 s on short clips (practice).
- Put the "so what" before the explanation, because readers on LinkedIn scroll quickly.
- Under-30-second ads loop, so make the last frame flow back into the first [1].
- LinkedIn reported 36% year-on-year growth in total video viewership (fiscal Q1 2025) and 34% growth in uploads (fiscal Q4 2024) [7]. More video means more competition, so pacing matters more.

## 4. Captions & text overlays

- Ads autoplay **muted** in the feed. LinkedIn "strongly recommends" captions so the message is clear from the first frame, and suggests burned-in subtitles [1][2].
- LinkedIn repeatedly cites research that 79% of online videos are watched with the sound off. The figure is old (2020/2021 posts), so treat it as directional [5][2].
- Upload an SRT for accessibility and, for the hook, also burn in large text for the first 3 s.
- Keep text in the centre of a 4:5 frame; the UI covers the edges and the bottom.

## 5. Audio & sound

- Design for sound off, reward sound on: a clear human voice, light music or none (practice).
- Professional viewers watch at work, often in open offices. Every key claim has to work silently.
- Avoid trending audio and meme sounds. They read as off-platform reposts from TikTok/Reels.

## 6. What the algorithm rewards

- **Dwell time / skip prediction.** LinkedIn engineering documented dwell time as a feed signal, including a model that predicts the probability of a skip (P(skip)) [10].
- **2025-2026 LLM rebuild.** A March 2026 engineering post describes a single retrieval system built on LLM embeddings, plus a transformer-based sequential "Generative Recommender" that looks at more than a thousand of a member's past interactions [11][12]. In practice, topic consistency with what your audience already engages with matters more than one-off virality.
- **Implicit signals:** clicks, likes, comments, shares and time viewed, with connections' activity weighted heavily [13].
- **Fake engagement suppressed.** LinkedIn: "Our goal is to make engagement pods entirely ineffective" [14]. It is also cracking down on automated and AI-generated comments [15]. Marketing blogs claim that comments from people in your field count for more, and that "comment YES" bait is devalued; no primary source was found for either.
- **Conflict:** some vendors say watch-through rate has replaced likes as the main signal, citing unnamed internal documents. Not verified [8].

## 7. Views vs conversion (B2B)

- **95-5 rule (LinkedIn B2B Institute):** only about 5% of business buyers are in market at any time. Video for the other 95% builds the memory that later turns into pipeline. Measure it with brand metrics, not last-click [16].
- **Gets reach:** personal posts from employees and founders, opinions, behind-the-scenes, short talking-head clips.
- **Converts:** product demos tied to a specific role and pain, customer stories with real numbers, webinar clips with a sign-up CTA, and retargeting video viewers with lead-gen forms.
- **Thought Leader Ads** (boosting an employee's post) report a median CTR of 2.68% versus 0.42% for single image and 0.24% for video (vendor data, unverified). That CTR counts all engagement; landing-page clicks were only about 0.29% [17]. Judge video ads on view rate and completion, not CTR [17].
- LinkedIn is pushing BrandLink, CTV ads, Thought Leader Ads and event ads as a full-funnel video stack [18]. No official BrandLink performance study was found.

## 8. Common mistakes & "AI slop" signals

- **AI labelling:** LinkedIn shows a C2PA "Content Credentials" icon on images and video that carry C2PA metadata. Clicking it shows whether AI was used and which tool made the file [19]. LinkedIn says it cannot yet detect all AI content; it reads attached metadata rather than analysing pixels, and re-exporting can strip it [19][20]. Reports differ on the badge's name and position ("CR", a C2PA tag, "AI info") [19].
- An AI avatar presenter with a generic script is easy to spot in a feed of real colleagues. Trust is the currency here.
- Mistakes: repurposed 9:16 TikToks with trending audio, logo-first intros, no captions, motion-graphics "explainers" with no product or person, inflated stats, engagement-bait CTAs, links to engagement pods.
- **Slop tells:** "In today's fast-paced digital landscape", generic stock b-roll, the same template each week, AI-written comments under your own post.

## 9. Quick checklist

- [ ] 4:5 (feed) or 9:16 (vertical feed), 1080 px wide, MP4 H.264/AAC
- [ ] Ads 15-30 s; organic single-idea clips under 90 s
- [ ] Relevance stated in the first 3 s; key content in the first 10 s
- [ ] Burned-in captions plus an uploaded SRT; works fully on mute
- [ ] A real person and a real product screen on camera
- [ ] One audience role, one pain, one CTA
- [ ] Post from an employee profile; consider boosting it as a Thought Leader Ad
- [ ] No engagement bait, pods or automated comments
- [ ] Track average watch time and completion, not just views
- [ ] AI-generated visuals: keep C2PA credentials intact and say how AI was used

## 10. Sources

Accessed 2026-11-05 through search results (direct fetch blocked).

1. [LinkedIn Video Ads Specifications](https://business.linkedin.com/advertise/ads/sponsored-content/video-ads/specs) - accessed 2026-11-05
2. [LinkedIn: Best practices for video ads](https://business.linkedin.com/advertise/ads/sponsored-content/video-ads/tips) - cites 2025 LinkedIn data, accessed 2026-11-05
3. [LinkedIn Help: Video ads advertising specifications](https://www.linkedin.com/help/linkedin/answer/a424737) - accessed 2026-11-05
4. [Brandwatch: LinkedIn video specs](https://www.brandwatch.com/blog/linkedin-video-specs/) and [Sendspark: LinkedIn video specs](https://blog.sendspark.com/linkedin-video-specs) - vendor, accessed 2026-11-05
5. [LinkedIn Marketing Solutions: LinkedIn Video and LinkedIn Live](https://business.linkedin.com/marketing-solutions/blog/video-marketing-/2020/video-marketing-linkedin-video) - 2020, accessed 2026-11-05
6. [LinkedIn Marketing Solutions: Tips for getting started with video ads](https://business.linkedin.com/marketing-solutions/blog/video-marketing-/2018/take-your-marketing-to-the-next-level-with-linkedin-video-ads) - 2018, accessed 2026-11-05
7. [Digiday: LinkedIn's video push appears to be working in 2025](https://digiday.com/marketing/linkedins-video-push-appears-to-be-working-in-2025/) - 2025, accessed 2026-11-05
8. [MConverter: LinkedIn video engagement statistics](https://mconverter.eu/blog/linkedin-video-engagement-statistics) - vendor, accessed 2026-11-05
9. [Net Influencer: LinkedIn focus on view duration](https://www.netinfluencer.com/linkedin-focus-on-view-duration-signals-growing-investment-in-video-content/) - accessed 2026-11-05
10. [LinkedIn Engineering: Understanding dwell time to improve feed ranking](https://www.linkedin.com/blog/engineering/feed/understanding-feed-dwell-time) - accessed 2026-11-05
11. [Search Engine Land: LinkedIn updates feed algorithm with LLM ranking and retrieval](https://searchengineland.com/linkedin-updates-feed-algorithm-llm-ranking-retrieval-471708) - 2026, accessed 2026-11-05
12. [ZenML LLMOps database: LinkedIn next-generation feed ranking](https://www.zenml.io/llmops-database/next-generation-feed-ranking-with-llms-and-sequential-transformers) - accessed 2026-11-05
13. [LinkedIn Engineering: Feed team](https://engineering.linkedin.com/teams/data/artificial-intelligence/feed) - accessed 2026-11-05
14. [Social Media Today: LinkedIn vows action against engagement pods](https://www.socialmediatoday.com/news/linkedin-vows-to-take-action-against-engagement-pods-fake-engagement/804970/) - 2025, accessed 2026-11-05
15. [Entrepreneur: LinkedIn is fighting back against AI slop and AI comments](https://www.entrepreneur.com/business-news/linkedin-is-fighting-back-against-ai-slop-and-ai-comments) - accessed 2026-11-05
16. [LinkedIn Ads Radio: The 95-5 rule with Ty Heath (B2B Institute)](https://linkedin-ads-radio.captivate.fm/episode/the-95-5-rule-will-improve-your-b2b-advertising-with-ty-heath-from-the-b2b-institute) - accessed 2026-11-05
17. [ZenABM: LinkedIn Thought Leader Ads benchmarks](https://zenabm.com/blog/tla-benchmarks.md) - vendor, accessed 2026-11-05
18. [LinkedIn webinar: Full-funnel B2B success with video](https://business.linkedin.com/advertise/webinars/25/11/full-funnel-b2b-success-driving-results-with-video-on-linkedin-apac) - Nov 2025, accessed 2026-11-05
19. [LinkedIn Help: Content credentials](https://www.linkedin.com/help/linkedin/answer/a6282984) and [ViralBrain: LinkedIn content credentials](https://www.viralbrain.ai/blog/linkedin-content-credentials) - accessed 2026-11-05
20. [Fortune: LinkedIn content credentials labeling challenges](https://fortune.com/2024/11/26/linkedin-content-credentials-labeling-challenges-c2pa) - 2024-11-26, accessed 2026-11-05
