# TikTok - short-form video research (as of 2026-11-05)

Evidence note: official TikTok pages (newsroom, transparency center, Ads Help Center) were read through search-result excerpts; direct page fetches were blocked in this session. Treat exact wording as close paraphrase and re-check before quoting publicly. Vendor-only figures are marked "(vendor data, unverified)".

## 1. Specs

| Item | Value | Evidence |
|---|---|---|
| Aspect ratio | 9:16 vertical (1:1 and 16:9 accepted for ads) | TikTok Ads Help, auction In-Feed specs [2] |
| Resolution | Upload 1080x1920. Ads minimum 540x960; TikTok creative guide says shoot at least 720p | [2][3] |
| File | .mp4 or .mov, up to 500 MB for ads; bitrate >= 516 kbps (auction) vs >= 2,500 kbps (reservation/TopView) - TikTok's own pages conflict, so export at >= 2,500 kbps | [2] |
| Max length | In-app recording 10 min; uploads up to 60 min were a limited test in 2024 and access still varies by account | [9] |
| Ideal length (ads) | TikTok's creative tips PDF: In-Feed ads 5-60 s, 21-34 s "recommended". Reservation ads: 9-15 s recommended | [3][2] |
| Ideal length (organic) | No official number. Counter-signal: Creator Rewards Program only pays for original videos over 1 minute, which pushes creators to 60 s+ | [10] |

Safe zones (1080x1920). TikTok does not publish fixed pixel values for organic posts; for ads it supplies downloadable safe-zone templates whose size depends on caption length, anchors and add-ons [2]. Third-party estimates conflict:
- Conservative: content area 840x1280 - keep text 160 px from top, 480 px from bottom, 120 px from each side (vendor data, unverified) [11].
- Looser: top 120-200 px, bottom 250-370 px, right 120-164 px, left 50-60 px (vendor data, unverified) [11].
- Working rule: keep captions and faces in roughly y=200-1440, x=60-940. The right rail (like/comment/share/sound) and the bottom caption block are the danger areas; long captions push the bottom zone higher.

## 2. Hooks (first 1-3 s)

TikTok's own ad guidance: introduce your proposition in the first 3 seconds (for recall) and land a hook by second 6 using suspense, surprise or emotion (for engagement and watch time) [1]. The often-quoted "63% of top ads deliver the message in 3 s" and "71% decide in 3 s" figures appear only in blogs citing TikTok (vendor data, unverified).

Patterns that work, with examples for a SaaS or AI product:
- Result first: open on the finished output, then rewind. "This took 40 seconds. Here's how."
- Problem callout with on-screen text: "If you still write proposals by hand, watch this."
- Pattern interrupt: unexpected motion or a hard cut in frame 1, not a logo or title card.
- Direct address, face in frame within 0.5 s, speaking the keyword (also helps search, see section 7).
- Contrarian claim: "Stop using templates for cold emails." Pay it off fast.
- Native formats: stitch/green-screen reacting to a real comment or question.

## 3. Retention & pacing

- TikTok's transparency page says the system scores candidates by predicted interaction and counts videos you "watched, finished, liked, or skipped" [4]. Skips are an explicit negative signal, so dead air in the first seconds is costly.
- Cut frequency: no official number. Typical practice is a visual change (cut, zoom, b-roll, text pop) every 2-4 s; treat as craft guidance, not platform data.
- Re-hook at about the midpoint of anything over 30 s ("but here's the part nobody tells you").
- Payoff: deliver the promised result before the video ends; do not withhold it for a "follow for part 2" unless the series is real.
- Loops: ending that cuts cleanly back to frame 1 increases rewatches; rewatches and completion are reported as top signals by third parties (vendor data, unverified) [12].
- For 60 s+ videos (Creator Rewards), structure in chapters with a visible counter ("3 of 5") to keep people past the minute mark.

## 4. Captions & text overlays

- TikTok recommends captions or text overlays for context and about 5-10 words per second when text is used [1].
- Sound is the default on TikTok: a TikTok-commissioned Kantar study (2021) found 88% of users say sound is essential to the experience (platform-commissioned, older data) [5]. Captions are still needed for accessibility and for sound-off viewers, but do not design TikTok as a silent medium the way you might for feed ads elsewhere.
- Font size: no official minimum. Practical rule: 48-72 px cap height on a 1080 px-wide canvas, max two lines, high-contrast outline or box.
- Keep overlays inside the safe zone in section 1; use TikTok's native auto-captions where possible so text is also machine-readable.
- Put the main keyword in on-screen text in the first seconds (search reads on-screen text and speech according to multiple guides; vendor data, unverified) [13].

## 5. Audio & sound

- Business accounts only get the Commercial Music Library (CML) in the in-app editor; reports say over 1 million pre-cleared tracks (vendor data, unverified) [6].
- The rule follows purpose, not account type: a personal account posting promotional content is still bound by commercial-music rules [6].
- Any track brought in from outside the app needs its own commercial license, and CML licenses cover TikTok only, not cross-posts to Reels or Shorts [6].
- Conflict: one source says personal accounts can also use the CML; others describe it as business-only [6]. Either way, brands should assume trending chart songs are off-limits.
- Practical play: trending "sounds" that are original audio (voiceover, meme dialogue) or CML tracks, plus your own voiceover. Original audio can become a reusable sound others pick up.

## 6. What the algorithm rewards

Official (TikTok transparency center) [4]:
- Candidates are scored by estimated likelihood of interaction; signals include videos viewed, liked, shared, watched, finished, skipped, plus context (region, language, device).
- Users can steer via "Not interested", refresh, and Manage Topics sliders (including an AI-generated content slider added Nov 2025) [7].

Not official: precise weights. TikTok does not publish them [12]. Third-party guides commonly rank watch time/completion > shares and saves > comments > likes (vendor data, unverified) [12]. One blog claims TikTok stopped testing new videos on a random interest pool in late 2025; not confirmed by TikTok.

Monetization signal: Creator Rewards weighs originality, play duration, search value and audience engagement; views under 5 s, paid, promoted or artificial views do not qualify [10].

## 7. Views vs conversion

- Reach comes from completion, rewatches and shares among non-followers. Conversion comes from intent: search traffic, profile visits, and comments asking "what app is this?"
- Search: guides say captions, on-screen text and spoken words are all matched; put the keyword in speech and text early and limit to 3-5 key phrases (vendor data, unverified) [13]. Creator Search Insights shows trending queries in a niche [13].
- Write captions as a search snippet: "AI proposal generator for agencies - how to draft a client proposal in 1 minute".
- CTA should be specific and low-friction: "comment PROPOSAL and I'll send the template" beats "link in bio".
- Pin a comment with the next step; make the profile bio state what the product does in one line plus one link.
- For paid reach, use Spark Ads on top-performing organic posts rather than producing separate "ad-looking" creative [2].

## 8. Common mistakes & "AI slop" signals

- Logo or title card in the first second; slow intros; horizontal footage letterboxed.
- Stock b-roll plus robotic text-to-speech plus generic captions - the stereotypical faceless AI template.
- Reposting Reels/Shorts with watermarks or reposting others' content; guidelines effective 13 Sept 2025 state some content stays up but is ineligible for the For You feed, and the IP section bars reposting copyrighted material without permission [8].
- AI labelling: TikTok auto-labels AI content via C2PA Content Credentials (since 2024), requires creators to label realistic AI content, and may remove improperly labeled AI content [14]. In Nov 2025 it added an AIGC slider in Manage Topics so users can see less AI content, and began testing invisible watermarks on content made with TikTok AI tools and on C2PA-tagged uploads [7]. Implication: heavily AI-generated videos may reach fewer people who turned the slider down.
- Over-polished ad aesthetic; TikTok rewards native, creator-style footage.
- Keyword stuffing in captions, which reads as spam [13].

## 9. Quick checklist

- [ ] 1080x1920, 9:16, .mp4, >= 2,500 kbps, shot at >= 720p.
- [ ] Hook in 0-3 s; proposition stated by 3 s, emotional hook by 6 s.
- [ ] No logo or title card as the first frame.
- [ ] Visual change every 2-4 s; re-hook at the midpoint.
- [ ] Text and faces inside y=200-1440, x=60-940; verify with TikTok's safe-zone template.
- [ ] Captions on, 5-10 words per second max, keyword in first on-screen line.
- [ ] Keyword spoken aloud early and used in the caption naturally.
- [ ] Business account: CML or original audio only; no imported unlicensed tracks.
- [ ] AI-generated realistic content labeled; no watermarks from other apps.
- [ ] Specific CTA (comment keyword, pinned comment), bio with one-line value prop and link.
- [ ] Ads: 21-34 s for In-Feed per TikTok guide; test Spark Ads on winners.

## 10. Sources

All accessed 2026-11-05.

1. [TikTok Ads Help - Creative best practices for performance ads](https://ads.tiktok.com/help/article/creative-best-practices?lang=en) - undated, live page.
2. [TikTok Ads Help - TikTok Auction In-Feed Ads specs](https://ads.tiktok.com/resources/help/article/tiktok-auction-in-feed-ads?redirected=1) and [Reservation In-Feed ad specs](https://ads.tiktok.com/help/article/tiktok-reservation-in-feed-ads-reach-frequency?lang=en) - undated, live pages.
3. [TikTok for Business - 7 Top Tips for Making TikTok Videos (PDF)](https://ads.tiktok.com/business/library/7TopCreativeTips.pdf) - undated.
4. [TikTok Transparency Center - Introduction to the TikTok recommendation system](https://www.tiktok.com/transparency/recommendation-system/?lang=hi) - undated, live page.
5. [TikTok for Business - Kantar report: How brands are making noise with sound on TikTok](https://ads.tiktok.com/business/en-US/blog/kantar-report-how-brands-are-making-noise-and-driving-impact-with-sound-on-tiktok) - 2021.
6. [Soundstripe - TikTok music licensing rules](https://www.soundstripe.com/blogs/tiktok-music-licensing-rules) and [Lilach Bullock - TikTok Commercial Music Library](https://www.lilachbullock.com/tiktok-commercial-music-library/) - vendor blogs, undated.
7. [TikTok Newsroom - More ways to spot, shape and understand AI-generated content](https://newsroom.tiktok.com/more-ways-to-spot-shape-and-understand-ai-content?lang=en) - 2025-11-19; coverage: [TechRepublic](https://www.techrepublic.com/article/news-tiktok-ai-content/).
8. [TechCrunch - TikTok's new guidelines add subtle changes for LIVE creators, AI content and more](https://techcrunch.com/2025/08/15/tiktoks-new-guidelines-add-subtle-changes-for-live-creators-ai-content-and-more/) - 2025-08-15 (effective 2025-09-13).
9. [Search Engine Land - TikTok testing 60-minute video uploads](https://searchengineland.com/tiktok-testing-60-minute-video-uploads-440588) - 2024; [Metricool - TikTok video length](https://metricool.com/tiktok-video-length/) - 2025.
10. [TikTok Newsroom - Introducing the new Creator Rewards Program](https://newsroom.tiktok.com/introducing-the-new-creator-rewards-program) - 2024-03-18; [Publer - TikTok creator fund](https://publer.com/blog/tiktok-creator-fund) - vendor blog.
11. [Relevant Audience - TikTok video size for ads and safe zones](https://www.relevantaudience.com/tiktok-ads/tiktok-video-size-ad-specs/) and [Sovran - TikTok ad specs 2026](https://sovran.ai/blog/tiktok-video-ad-specs) - vendor blogs.
12. [Darkroom - TikTok algorithm guide 2026](https://www.darkroomagency.com/observatory/tiktok-algorithm-guide-2026) - vendor blog, 2026.
13. [Darkroom - TikTok SEO](https://www.darkroomagency.com/observatory/tiktok-seo) and [ViralMango - How to use TikTok Creator Search Insights](https://viralmango.com/blog/how-to-use-tiktok-creator-search-insights/) - vendor blogs.
14. [NBC News - TikTok will automatically label AI-generated content](https://www.nbcnews.com/tech/tech-news/tiktok-will-automatically-label-ai-generated-content-rcna151446) - 2024-05.
