# Paid video ads: Meta, Google/YouTube, TikTok

Research date: 2026-11-05. Platform specs and policies change often; re-check the linked help page before a launch. Note on method: official help pages were located via web search but could not be opened directly from this environment (support.google.com and engineering.fb.com were blocked), so official figures below come from search-indexed text of those pages. Treat any number as "check before shipping". Figures from agencies or tool vendors are labelled (vendor data, unverified).

---

## 1. Meta Ads (Facebook, Instagram, Reels, Stories)

### How delivery works now
- **Andromeda** is Meta's ads *retrieval* engine: the first stage that narrows millions of candidate ads to a few thousand per impression before ranking and auction [1][2]. Meta introduced it in December 2024 as the engine "supercharging Advantage+ automation" [1]. An October 2026 Meta engineering follow-up says Andromeda has delivered a 2.4% increase in conversions on Facebook since 2025 [2] (Meta's own figure).
- **Practical consequence:** with broad targeting and Advantage+, the creative itself does much of the targeting. Different creatives get retrieved for different people. Meta's spokesperson has called creative diversification "a longstanding best practice" and reported guidance says ads sharing the same look or opening hook are treated as the same ad and will not rank as highly [3]. Meta has published no similarity threshold or recommended ad count [3].
- Industry commentary (Jon Loomer) notes the old "6 ads per ad set" language has disappeared, and that diversity matters more than raw volume [4]. Agency suggestions of "10-20 concepts per ad set" or "5-6 new variations weekly" are (vendor data, unverified) [5].

### Specs
- Reels/Stories: 9:16, 1080x1920 recommended. Feed: 4:5 or 1:1 works; supply 9:16 too so Advantage+ placements do not crop badly.
- Reels safe zone (most-cited figure, attributed to Meta's help centre by third parties): keep text, logos and key action out of the top ~14%, bottom ~35% and ~6% each side [6]. Other guides give different numbers, so use Meta's in-tool preview.
- Length: no hard creative rule; agencies report sub-30s Reels perform best, often 10-18s (vendor data, unverified) [7].

### Hooks, pacing, captions, audio
- Hook in 1-3s: motion, a face, a question, or the product in use. A Meta-attributed stat says branding and message in the first 5s makes ads 1.7x more likely to be in the top purchase-intent tier (reported secondhand, unverified) [7].
- Reels is largely sound-on (a Meta-attributed figure of 75%+ of Instagram Reels views with sound on, reported secondhand) [7], but burn in captions for muted viewers. Silent-viewing estimates range wildly (20-85%), so design for both.
- Facebook's 2016 research found people spend on average 1.7s with a piece of mobile feed content (vs 2.5s desktop) and that only 24% of tested video ads were understood without sound [8]. Old, but the direction still holds: front-load and caption.
- **Audio:** Meta Sound Collection is royalty-free for use on Meta products only, not YouTube or your site [9]. Advantage+ creative enhancements can auto-add music on top of your mix; turn off "Add music" per ad if your video already has audio [9].

### Views vs conversion
- Optimise campaigns for the conversion event, not ThruPlays. Creative signals that tend to lower CPA: product visible early, a concrete offer or proof (demo, before/after, testimonial with specifics), clear CTA matching the landing page. "Thumb-stop" without a buying reason inflates CTR and CPC efficiency while CPA rises.
- Each distinct *concept* (angle, persona, format) is a new retrieval opportunity; captions-only variations are not [3][4].

### Testing and fatigue
- Test concepts, not tweaks: different hook + visual + angle. Keep winners running; Loomer notes many advertisers can run the same ads for months without fatigue [10]. Meta's fatigue flag triggers when cost per result is roughly 2x its historic level [10].

### AI disclosure
- Meta labels ads created or significantly edited with its own generative AI tools; photorealistic AI people get an "AI info" label near "Sponsored" [11]. Meta's page notes an update extending automatic detection to third-party AI tools via industry-standard signals (C2PA-type metadata) [11].
- Political/social-issue ads must disclose photorealistic digitally created or altered content (since 2024); minor edits like cropping are exempt [12].

---

## 2. Google Ads (YouTube)

### Formats and specs
| Format | Length | Notes |
|---|---|---|
| Skippable in-stream | No max; under 3 min recommended | Skip after 5s [13] |
| Non-skippable in-stream | Up to 15-60s depending on campaign subtype | Older docs said 15-30s; check current table [13] |
| Bumper | 6s or shorter, non-skippable | Good for reach/frequency, one idea only [13] |
| Shorts ads | Vertical 9:16, 1080x1920, under 60s recommended | Served between Shorts; must feel native [14][15] |
| Demand Gen video | Min 5s; under 10s will not serve in YouTube in-stream | 9:16 recommended for Shorts; can run without sound [14] |
| Performance Max video | Supply landscape, square and vertical; at least one vertical 10-60s for Shorts | If you upload no video, Google auto-generates one from images and text [16] |

- PMax auto-generated video can show a different product from the landing page; upload your own in all three orientations to disable it [16]. A Google UK playbook says advertisers with one video in each orientation saw 20% more YouTube conversions than horizontal-only (Google's own figure) [17].

### Google's ABCD framework
From Google/Ipsos analysis of thousands of ads, later reviewed with Kantar and Nielsen [18][19]:
- **Attract (Attention):** hook from the first frame, front-load the story arc, tight framing, faces, movement.
- **Brand:** brand early and often, visually and in audio; YouTube is described as largely sound-on [18].
- **Connect:** make people think or feel something: humour, surprise, relatable people. Do not cram.
- **Direct:** a clear CTA, in text, voiceover and on screen.
Google says ABCD is "not a formula" for ideas [18]. Google cites Kantar data that ABCD-aligned ads lift short-term sales likelihood 30% and long-term brand contribution 17% (Google-commissioned, treat cautiously) [15]. In 2024 Google extended ABCD to Shorts: top Shorts ads "feel like part of the feed", creator-style and authentic [20].

### What the algorithm rewards
- Skippable: you pay on 30s/completion or interaction (depending on bidding), so a strong first 5s both keeps viewers and filters non-buyers cheaply. For conversion objectives, put the product and the reason to act before the skip button, and repeat the CTA at the end.
- Demand Gen/PMax use Google AI to mix assets; asset variety across orientation and length raises eligible inventory [16].

### Disclosure
- Election ads with synthetic or altered content depicting real or realistic people or events must tick "Altered or synthetic content"; Google auto-generates disclosures on some surfaces. Inconsequential edits are exempt [21]. No general commercial AI-label requirement was found in current sources; misrepresentation policies still apply.

---

## 3. TikTok Ads

### Formats
- **In-feed:** 9:16 recommended, minimum 540x960, export 1080x1920. Duration ranges vary by source (5-60s commonly cited; one guide says TikTok recommends 9-15s) [22]. Use TikTok's Ads Manager safe-zone templates: keep text away from the bottom caption area and the right-hand button column [22].
- **Spark Ads:** promote organic posts (your own or authorised creators') so likes, comments and follows accrue to the post; also available inside Smart+ [23][24].
- **TopView:** full-screen, sound-on ad shown when the app opens; reservation-bought, up to 20 ads per ad group [25].
- **Smart+:** TikTok's automated campaign type. Third-party summaries of TikTok guidance say add at least 6 creatives for Smart+ Web; older Smart Performance guidance said at least 3 [26]. Higher counts (50 per asset group, auto-selection of 10) are (vendor data, unverified) [26].

### Creative guidance
- TikTok's official best-practice page and Creative Codes say: make it for TikTok (native, creator-style), high resolution, 9:16, sound on, and keep key content out of UI zones [27][28]. Vendor summaries of TikTok guidance: deliver the proposition in the first 3s and prioritise the hook in the first 6s (vendor data, unverified) [29].
- Face-to-camera, talking to one person, captions plus on-screen text, quick visual change every 2-3s.
- **Creative Center:** "Top Ads" dashboard filters by country, industry, objective and format; use it for structure inspiration, not to clone [30].
- **Audio:** use the Commercial Music Library (cleared for ads; TikTok cites 600,000+ tracks) via a Business Account. TikTok warns that using the general music library to promote a business risks copyright infringement [30][31].

### TikTok Symphony
Symphony Creative Studio generates avatars, dubbing and video from product info; output gets an AI-generated label by default [32]. A July 2026 roundup reports Symphony renders now carry labels, invisible watermarks and C2PA Content Credentials by default (third-party, unverified) [33].

### AI disclosure
- Realistic AI-generated content in ads must be disclosed; Ads Manager has a toggle ("This ad contains AI-generated content") that adds a text label, for non-Spark ads [34]. TikTok also reads C2PA credentials. Enforcement has been reported as patchy (The Verge reporting via [35]).

---

## 4. Views vs conversions (all platforms)
Cheap views come from novelty, celebrities, trends and cliffhangers that never resolve. Cheap conversions come from:
1. The problem stated in the buyer's words in 1-3s (qualifies the viewer).
2. Product on screen early, in use, with a visible result.
3. Specific proof: numbers, demos, named reviewers, before/after.
4. One offer, one CTA, matching the landing page.
5. Native look per platform (creator-style for TikTok/Reels/Shorts).
Judge tests on CPA/ROAS and hold rate, not CTR alone.

## 5. What reads as generic AI slop in ads
- Uncanny AI avatars reading generic scripts; mismatched lip sync.
- Stock "cinematic" B-roll with no product in it; same swooping drone shots.
- Vague superlatives ("revolutionise your workflow") with no proof.
- Caption styles and voices that are identical across a whole account (also kills Andromeda diversity).
- Auto-generated videos built from static images (PMax default) and auto-added music you did not choose.
- Hidden AI. Surveys suggest consumers object to undisclosed AI more than AI itself: IAB/Sonata found only 45% of Gen Z and Millennials view AI ads positively vs 82% of executives who think they do; Canva found 69% worry about a flood of low-quality AI ads (survey data, methods vary) [36][37].

## 6. Cross-platform checklist
- [ ] Master 9:16 at 1080x1920; cut 4:5, 1:1 and 16:9 where needed (PMax needs all three).
- [ ] Key text and logo inside each platform's safe zone (check in-tool preview).
- [ ] Hook in 0-2s: face, motion, product, or a specific problem line on screen.
- [ ] Brand/product visible within 5s; sound-on mix plus burned-in captions.
- [ ] One idea per 6s bumper; 15-30s for most performance cuts; Shorts/Reels under 60s.
- [ ] Licensed audio from Meta Sound Collection / TikTok CML / owned music; disable auto-added music if you have a mix.
- [ ] 3-6+ genuinely different concepts per campaign (angle, persona, format), not caption swaps.
- [ ] Optimise for conversions; report CPA/ROAS, hold rate, then CTR.
- [ ] Refresh when cost per result drifts ~2x baseline; keep proven winners.
- [ ] AI disclosure: tick TikTok AI toggle where realistic; expect Meta "AI info"; election ads on all three need disclosure.
- [ ] No uncanny avatars, no stock-only B-roll, no unprovable claims.

---

## Sources
Dates are publication/last-updated where known; all accessed 2026-11-05.

1. [Meta Engineering: Meta Andromeda, supercharging Advantage+ automation (2024-12-02)](https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/)
2. [Meta Engineering: Andromeda next-gen ads retrieval through model-system co-design (2026-10-28)](https://engineering.fb.com/2026/10/28/ml-applications/meta-andromeda-next-gen-ads-retrieval-gpu-co-design/)
3. [Relevant Audience: Meta tells advertisers near-identical creative counts as the same ad (2026)](https://www.relevantaudience.com/meta/meta-ad-creative-diversification-same-hook-same-ad/)
4. [Jon Loomer: Meta Andromeda creative diversification (2025)](https://www.jonloomer.com/meta-andromeda-creative-diversification/)
5. [Segwise: Meta Andromeda 2026 creative strategy playbook (2026)](https://segwise.ai/blog/meta-andromeda-update-creative-strategy-2026)
6. [House of Marketers: Guide to safe zones on TikTok, Facebook, Instagram Stories and Reels](https://houseofmarketers.com/guide-to-safe-zones-tiktok-facebook-instagram-stories-reels/)
7. [Cropink: Reels ads (updated 2026-03-25)](https://cropink.com/reels-ads)
8. [Marketing Dive: Facebook on why mobile video ads must work fast (2016)](https://www.marketingdive.com/news/facebook-why-mobile-video-ads-must-work-fast/446217/)
9. [Foxi Music: Music for ads on Instagram, what's allowed in 2026](https://www.foximusic.com/blog/?p=587)
10. [Jon Loomer: Creative fatigue in Meta ads](https://www.jonloomer.com/creative-fatigue-meta-ads/)
11. [Meta Newsroom: Expanding GenAI transparency for Meta's ads products (2025-02, with later update)](https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/)
12. [TechCrunch: Meta will require disclosures for political ads manipulated with AI (2023-11-08)](https://techcrunch.com/2023/11/08/meta-will-start-requiring-disclosures-for-political-ads-manipulated-with-ai)
13. [Google Ads Help: About video ad formats](https://support.google.com/google-ads/answer/2375464?hl=en)
14. [Google Ads Help: Video asset specs for Demand Gen campaigns](https://support.google.com/google-ads/answer/17141078)
15. [Relevant Audience: YouTube Shorts ads, campaign types, specs and best practices](https://www.relevantaudience.com/youtube-ads/youtube-shorts-ads/)
16. [Google Ads Help: About video assets for Performance Max campaigns](https://support.google.com/google-ads/answer/14528532?hl=en)
17. [Think with Google: Google UKI Creative in Performance Max playbook (PDF)](https://www.thinkwithgoogle.com/_qs/documents/18344/Google_UKI___Creative_in_Performance_Max_Playbook.pdf)
18. [Think with Google: Creative best practices for YouTube ads (ABCD)](https://business.google.com/us/think/future-of-marketing/creative-best-practices-youtube-ads/)
19. [Think with Google: ABCD playbook (PDF)](https://thinkwithgoogle.com/_qs/documents/8472/ABCD_Complete_V7b_HR_1.pdf)
20. [Google Ads blog: YouTube Shorts ads, Select lineups and ABCDs (2024-04)](https://blog.google/products/ads-commerce/youtube-shorts-ads-select-lineups-abcds/)
21. [Search Engine Land: Google tightens disclosure rules for synthetic content in political ads (2024)](https://searchengineland.com/google-disclosure-rules-synthetic-content-political-ads-443868)
22. [Emplifi: TikTok ad specs and safe zone guide](https://emplifi.io/resources/blog/tiktok-ad-specs)
23. [TikTok Ads Help: Spark Ads](https://ads.tiktok.com/help/article/spark-ads)
24. [TikTok Ads Help: How to create Spark Ads for Smart+ campaigns (updated 2025-05)](https://ads.tiktok.com/help/article/how-to-create-spark-ads-for-smart-campaigns-on-tiktok-ads-manager)
25. [TikTok Ads Help: About TopView (updated 2026-08)](https://ads.tiktok.com/resources/help/article/about-topview) and [TopView ad specifications](https://ads.tiktok.com/help/article/tiktok-reservation-topview?lang=en)
26. [TikTok Ads Help: Smart Performance Campaign best practices](https://ads.tiktok.com/resources/help/article/smart-performance-campaign-best-practices?lang=en) and [Mobvista: Smart+ campaign guide](https://xmp.mobvista.com/en-blog/docs/tiktok-smart-plus-campaign-guide-for-business-growth)
27. [TikTok Ads Help: Creative best practices for performance ads](https://ads.tiktok.com/help/article/creative-best-practices?lang=en)
28. [TikTok: Creative Codes (PDF)](https://ads.tiktok.com/business/library/Creative_Codes_ENG.pdf)
29. [Stackmatix: TikTok creative best practices, hook-first 3 seconds (2026)](https://stackmatix.com/blog/tiktok-creative-best-practices-2026)
30. [TikTok Ads Help: About Creative Center](https://ads.tiktok.com/help/article/creative-center)
31. [TikTok Ads Help: How to use the Commercial Music Library](https://ads.tiktok.com/help/article/how-to-use-the-commercial-music-library)
32. [TikTok Business blog: Symphony Creative Studio](https://ads.tiktok.com/business/en/blog/symphony-creative-studio)
33. [Vidjet: Latest features on TikTok Symphony, July 2026 update](https://www.vidjet.com/blog/latest-features-on-tiktok-symphony-studio-july-2026-update)
34. [TikTok Ads Help: About ad disclaimers in TikTok Ads Manager](https://ads.tiktok.com/resources/help/article/about-ad-disclaimers-in-tiktok-ads-manager?lang=en)
35. [AI Productivity: TikTok AI ad disclosure rules not enforced (2026)](https://aiproductivity.ai/news/tiktok-ai-ad-disclosure-rules-not-enforced/)
36. [Fullcast: The AI advertising trust gap (IAB/Sonata data)](https://www.fullcast.com/content/the-ai-advertising-trust-gap-why-transparency-matters-more-than-ever/)
37. [MarTech: Consumers want AI ads with a human touch (Canva 2026 report)](https://martech.org/consumers-want-ai-ads-with-a-human-touch/)
