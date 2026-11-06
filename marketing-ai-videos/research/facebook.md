# Facebook video: research notes

Last researched: 2026-11-05. Official pages were read through search-result extracts (direct fetches were blocked from the research environment). Vendor-only figures are labelled "(vendor data, unverified)".

## 1. Specs

**Big structural change (June 2025):** Meta announced that **all videos on Facebook are shared as Reels**. The upload choice between "video" and "Reel" is gone, and Reels no longer have length or format limits, "from a quick 30-second vertical clip to an in-depth, 20-minute-plus horizontal episode." The Video tab was renamed Reels. Live video stays separate, and older uploads stay as they were [1][2]. Before this, Facebook Reels were capped at 90 s, so guides quoting "90 s max" are out of date [2].

**Ideal length (evidence).** Meta gives no number. It recommends videos regardless of length on Feed and in the video surface [4], and says authentic storytelling performs well across Reels, medium-length and long videos [9]. Working rule: 15-60 s for reach in Reels; 3-10 min horizontal or vertical "episodes" only when the story holds. Meta warns that uploading unedited, longer content from other platforms is unlikely to perform well [3].

**Max length / file size.** Ads: Meta's guide lists up to 60 min and 4 GB for feed placements (the snippet seen was the Instagram Feed spec; Facebook Feed is believed to match) [5]. Organic: third-party guides cite up to 240 min for feed video (unverified) [21].

**Aspect ratio.** Meta's creator guidance: **try 9:16 vertical regardless of length**. The full-screen player supports every format, but most people watch vertically [3]. Horizontal videos get a full-screen option to rotate to landscape [4]. 4:5 suits feed ad placements (third-party consensus) [21].

**Resolution / format.** 9:16 at 1080x1920, H.264 video, AAC audio [5]. Some guides recommend 1440x2560; sources conflict, and 1080x1920 is Meta's listed figure [5][21]. MP4/MOV. Use Meta's **Reels safe-zone checker** templates to keep key elements clear of UI. The "14% top/bottom" figure comes only from an unofficial community page [6].

## 2. Hooks (first 1-3 s)

- Meta: make the first few seconds count, because many videos compete for attention. Consider re-editing the intro before posting [9]. The "first 3 seconds" advice comes from Meta's community Fb Answers pages, not official policy [9].
- Meta's advice for entertaining content: a clear hook and authentic storytelling [9].
- A Meta-attributed claim seen only in secondary sources (no primary URL found): three times more people engage when the brand name, logo and message appear clearly in the first 10 s. It conflicts with conversion-focused advice to delay branding [22].

Patterns:
- **Person plus problem in frame 1:** "I almost lost a client because of this one spreadsheet mistake."
- **Visual transformation:** the before/after in the first second, explained after.
- **Story opener:** "Last Tuesday a customer called us at 2 a.m...." Story beats are what Meta says works.
- **Shown product benefit:** the product in use, with a one-line on-screen caption.
- Don't use "watch till the end" unless the payoff is genuinely worth it; Meta's creators blog warns against it [20].

## 3. Retention & pacing rules

- Recommended Reels are ranked on predicted engagement and watch time. Meta has cited watch-time lifts from ranking changes, and the March 2026 creator post says views and watch time on original Reels roughly doubled in H2 2025 versus H2 2024 [12][18].
- Cut to the beat of the story, not to arbitrary cuts; keep a visible change every 2-4 s in short Reels (practice).
- For longer video, use a story arc (setup, tension, payoff) with a mini-payoff every 30-60 s (practice).
- Loop short Reels: make the final frame lead back into the first.
- Recent content gets priority: Meta reportedly said it would prioritise 50% more recent content in Reels [18].

## 4. Captions & text overlays

- Feed video usually autoplays muted, and users can change autoplay and sound in settings [8][23].
- Meta's long-standing advice: **build for sound off, delight with sound on**. In one Meta study, 41% of video ads were essentially meaningless without sound, and captioned ads increased view time by about 12% (older internal figures) [8]. Another Meta post said 70% of mobile video watching was with sound on. The sources conflict, so design for both [8].
- Ads Manager can auto-generate captions (English only, for US/Canada advertisers) or accept uploaded SRT files [7].
- Keep text inside the safe zone; large, high-contrast, on screen for a full read [6].

## 5. Audio & sound

- Voice-led storytelling suits Facebook's older, story-loving audience. Clear narration usually beats trending audio (practice).
- Use licensed music only (Meta's Sound Collection or tracks you own). Ripped audio risks muting and makes the video unoriginal.
- Make every point understandable in captions, then reward people who unmute.

## 6. What the algorithm rewards

- **Signals:** Meta's system cards list, among others, likes, shares, comments and **survey responses** (whether people say a post is worth their time). Meta says the published signals represent "the vast majority" used in Feed ranking, and models change frequently [16][17]. Feed ranks connected content and suggested content with separate systems [16].
- **Originality is the 2025-2026 theme.** July 2025: accounts that repeatedly reuse others' videos, photos or text lose monetisation for a period and get **reduced distribution on everything they share**. Meta uses duplicate-video detection and is testing attribution links [10][11]. March 2026: Meta expanded distribution for original content in Feed and Reels. "Original" means filmed or produced by the creator, or meaningfully transformed. Watch-alongs, face-only reactions, stitched clips and narration over existing footage are treated as unoriginal; duplicates get reduced reach, and repeat offenders may be made non-recommendable and demonetised [12].
- **Demotions:** engagement bait (explicit requests for likes, shares, tags or votes) and clickbait links [13][15].
- **Conflict worth knowing:** Meta's Content Distribution Guidelines changelog says that in July 2025 it removed the "Low Quality Videos" guideline and the "Pages posting unoriginal videos" guideline, because it no longer reduces distribution on those grounds. Yet the same month, its creator-facing policy promised reduced distribution for unoriginal reposters [10][14]. The likely reading: enforcement moved from a general content-quality demotion to account-level originality enforcement. Treat unoriginal content as penalised either way.
- **Social layer:** Reels "friend bubbles" show which friends liked a video and open a chat. Meta says these interactions correlate with more watch time, so shares in DMs matter [18].

## 7. Views vs conversion

- **Reach:** emotional or funny stories, local and community angles, and relatable people. Facebook's recommendation surface can send unconnected viewers to Pages.
- **Conversion:** Facebook is mainly a paid-acquisition channel for most brands. Use organic Reels to find winning hooks, then run them as ads with a clear offer, and retarget video viewers (for example, 50%+ viewers) with direct-response creative (practice).
- For B2B, Facebook reach is cheap but intent is low. Good fits are SMB owners, local services and communities in Groups. Lead with a relatable owner's story, not product features.
- Measure with Pixel/Conversions API events and UTMs. Views can be inflated by autoplay.

## 8. Common mistakes & "AI slop" signals

- **AI disclosure:** since 2024, Meta has required people to use its disclosure tool for organic posts with photorealistic video or realistic-sounding audio made or altered with AI. Failing to do so can bring penalties, and Meta may add a more prominent label for high-risk content [19]. Labels ("AI info") draw on detected industry signals or self-disclosure. No 2025-2026 change to this rule was found in this research [19].
- **Unoriginal = slop on Facebook:** reposting TikToks with watermarks, AI-narrated compilations of other people's clips, slideshow "facts" pages, and identical uploads across many Pages. All of these hit the originality rules [10][12].
- **Mistakes:** horizontal TV ads dropped into Reels, no captions, a logo-only first frame, engagement bait ("Type YES"), clickbait headlines on link posts [13][15], and AI-generated "heart-warming" images (a well-known Facebook slop genre).

## 9. Quick checklist

- [ ] 9:16, 1080x1920, H.264/AAC, key elements inside the safe zone
- [ ] Original footage, or a meaningful transformation of others' clips, credited
- [ ] Hook in the first 1-3 s: a person, a problem, a visual change
- [ ] Captions burned in or SRT uploaded; works on mute
- [ ] Clear story arc; short Reels loop cleanly
- [ ] Licensed audio only
- [ ] No engagement bait, no "watch till the end" without a real payoff
- [ ] Realistic AI video/audio disclosed with Meta's AI label
- [ ] Winning organic hooks recycled into ads with a clear offer
- [ ] Track conversions via Pixel/CAPI plus UTMs

## 10. Sources

Accessed 2026-11-05 through search results (direct fetch blocked).

1. [TechCrunch: All Facebook videos will be shared as Reels](https://techcrunch.com/2025/06/17/facebook-announces-that-all-videos-on-its-platform-will-soon-be-shared-as-reels) - 2025-06-17, accessed 2026-11-05
2. [Engadget: Facebook videos are all just going to be reels now](https://www.engadget.com/social-media/facebook-videos-are-all-just-going-to-be-reels-now-185807805.html) - 2025-06-17, accessed 2026-11-05
3. [Facebook for Creators: How to continue succeeding with video on Facebook](https://creators.facebook.com/blog/how-to-continue-succeeding-with-facebook-on-video) - accessed 2026-11-05
4. [Meta Newsroom: Exploring videos on Facebook just got easier](https://about.fb.com/news/2024/04/exploring-videos-on-facebook-just-got-easier/) - April 2024, accessed 2026-11-05
5. [Meta Ads Guide: Awareness video ad specs on Facebook Feed](https://www.facebook.com/business/ads-guide/update/video) and [Instagram Feed](https://www.facebook.com/business/ads-guide/update/video/instagram-feed) - accessed 2026-11-05
6. [Meta: Instagram & Facebook Reels ads (safe-zone checker)](https://www.facebook.com/business/ads/facebook-instagram-reels-ads) and [Fb Answers: Facebook post size guidelines](https://www.facebook.com/fb-answers/facebook-post-size-guidelines/) - accessed 2026-11-05
7. [Meta Business Help: Add captions to your video ad](https://www.facebook.com/business/help/1675722002698686) - accessed 2026-11-05
8. [Meta for Business: Capture attention with updated features for video ads](https://www.facebook.com/business/news/updated-features-for-video-ads) - older post, accessed 2026-11-05
9. [Meta Business Help: How to create interesting and valuable content](https://www.facebook.com/business/help/246791142703681) - accessed 2026-11-05
10. [Facebook for Creators: Combating unoriginal content](https://creators.facebook.com/blog/combating-unoriginal-content) - July 2025, accessed 2026-11-05
11. [TechCrunch: Meta announces crackdown on unoriginal Facebook content](https://techcrunch.com/2025/07/14/following-youtube-meta-announces-crackdown-on-unoriginal-facebook-content) - 2025-07-14, accessed 2026-11-05
12. [Meta Newsroom: Rewarding original creators on Facebook](https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/) and [exchange4media coverage](https://www.exchange4media.com/digital-news/meta-updates-policies-to-reward-original-creators-and-limit-reposted-content-152931.html) - March 2026, accessed 2026-11-05
13. [Meta Transparency Center: Engagement bait](https://transparency.meta.com/features/approach-to-ranking/content-distribution-guidelines/engagement-bait/) - accessed 2026-11-05
14. [Meta Transparency Center: CDG corrections and adjustments](https://transparency.meta.com/features/approach-to-ranking/cdgs-changes-corrections) - entry 7/2025, accessed 2026-11-05
15. [Meta Transparency Center: Types of content we demote](https://transparency.meta.com/features/approach-to-ranking/types-of-content-we-demote/) and [Clickbait links](https://transparency.meta.com/features/approach-to-ranking/content-distribution-guidelines/clickbait-links/) - accessed 2026-11-05
16. [Meta AI: How AI powers experiences on Facebook and Instagram (system cards)](https://ai.meta.com/blog/how-ai-powers-experiences-facebook-instagram-system-cards/) - June 2023, accessed 2026-11-05
17. [Meta Transparency Center: Explaining ranking](https://transparency.meta.com/features/explaining-ranking/) - accessed 2026-11-05
18. [Influencer Marketing Hub: Facebook Reels smart recommendations and friend bubbles](https://influencermarketinghub.com/facebook-reels-smart-recommendations-friend-bubbles/) - accessed 2026-11-05
19. [Axios: Facebook, Instagram posts with AI-generated images will be labeled](https://www.axios.com/2024/02/06/meta-ai-labeling-fix-oversight-board) and [Android Authority: Meta AI labels](https://www.androidauthority.com/meta-ai-labels-3411262/) - Feb 2024, accessed 2026-11-05
20. [Facebook for Creators: New tips to help you earn on Content Monetization](https://creators.facebook.com/blog/new-tips-to-help-you-earn-on-facebook-content-monetization/) - accessed 2026-11-05
21. [Zapcap: Best video size for Facebook (2026)](https://www.zapcap.ai/blog/best-video-size-for-facebook) and [Postiz: Facebook Reel size](https://postiz.com/blog/facebook-reel-size) - vendor, accessed 2026-11-05
22. [Conversion Sciences: Business video intros chase viewers away](https://conversionsciences.com/?p=19081) - vendor, accessed 2026-11-05
23. [Facebook Help: Stop videos playing automatically in your Feed](https://www.facebook.com/help/1406493312950827) - accessed 2026-11-05
