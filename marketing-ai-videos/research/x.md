# X (Twitter) video: research notes

Last researched: 2026-11-05. Official pages were read through search-result extracts (direct fetches were blocked from the research environment). Vendor-only figures are labelled "(vendor data, unverified)". X changes its rules often and announces many of them in executives' posts, so dates matter here more than on other platforms.

## 1. Specs

**Ideal length (evidence).** X's ad help centre recommends **under 15 s** for video ads [1]. There is no official ideal for organic posts. Working rule: 15-45 s for feed clips that make one point; longer cuts only for Premium accounts posting talks or demos that viewers choose to watch.

**Max length.**
- Free accounts: 140 s (2:20), 512 MB [3].
- Premium: about 3 hours / 8 GB on web and iOS. Videos over 2 hours must be 720p; 1080p applies under 2 hours [3][4]. An older help article said 2 hours, so check before uploading very long files [3].
- Video ads: up to 2:20 [1]. Pre-roll ads: files up to 1 GB, MP4 or MOV [1].

**Aspect ratio.** The current ad help page **recommends 9:16 vertical** (also accepts 4:5), 720x1280 up to 1080x1920 [1]. A legacy business.x.com page still lists 16:9 or 1:1 at 800x450 - it is out of date [2]. In the main feed, 1:1 or 4:5 take up the most space without cropping (practice). Use 9:16 for the vertical video tab.

**Resolution / format.** MP4 (or MOV for ads), H.264 (Baseline, Main or High profile, 4:2:0 colour), AAC audio [1][2]. 1080p for anything under 2 hours.

## 2. Hooks (first 1-3 s)

X publishes no official hook guidance; the practice below is general short-form advice adapted to X's culture.
- **The post text is part of the hook.** The text above the video is read first. Make it the claim, and let the video be the proof: "We shipped dark mode in 4 hours with Claude. Here's the raw screen recording."
- **Motion and a result in frame 1:** the finished output, a chart moving, a before/after split.
- **News angle:** X rewards timeliness. "[Vendor] just changed [API] - here's what it breaks for your app" (only if true and timely).
- **Founder face plus a blunt opinion** in the first second; no intro card.
- Avoid black frames, logo bumpers and slow fades, because autoplay begins on the first frame.

## 3. Retention & pacing rules

- The ranking model predicts several actions including dwell and "video quality view" (per third-party readings of the open-sourced code); weights were not published [7][8]. Holding attention past the first seconds is the likely lever.
- Cut every second of dead air; add a visible change every 2-4 s on short clips (practice).
- Put the payoff by the halfway point. Many people watch in the feed without opening the player.
- Ads under 15 s: one message, product visible throughout [1].
- X launched a dedicated vertical video tab in the US on 19 Jan 2025; reports say it later went global, with a redesigned immersive player on iOS in Feb 2026 [11]. X claims video is watched in 8 of 10 sessions and video views grew 40% year on year. Critics note autoplay may inflate "watching" [11].

## 4. Captions & text overlays

- Feed video autoplays, usually **muted** (secondary source) [12]. Burn in captions for the hook and key claims.
- Keep overlays short. The post text already carries the message, so the video's text should show proof (numbers, UI), not repeat the copy.
- Put a large one-line headline in the top third of 9:16; the bottom is covered by player UI.

## 5. Audio & sound

- Must make sense with no sound; voice for people who unmute.
- No official X guidance on music. Avoid copyrighted tracks, which risk takedowns and rule out Original Content Rewards.
- Raw audio (a phone mic in a quiet room) suits X's culture better than polished ad voiceover (practice).

## 6. What the algorithm rewards

- **Open-sourced ranking (Jan 2026).** xAI published the "For You" algorithm at github.com/xai-org/x-algorithm on 20 Jan 2026 (Apache 2.0). It uses a Grok-derived transformer (the "Phoenix" model) for retrieval and ranking [5][6]. A major update landed on 15 May 2026, adding a downloadable Phoenix model and an ads module [6]. Update cadence is unclear (every four weeks vs monthly) [5].
- **Many actions predicted, weights withheld.** Third-party audits describe about 19 predicted actions. Favourites/likes are the base signal; reply, repost, share, profile click, dwell, video quality view and follow-author are positive; "not interested", block, mute and report are strongly negative. The weight values sit in a params module that was not released [7][8].
- **Old 2023 weights are out of date.** The 2023 Twitter heavy-ranker README gave reply 13.5, repost 1.0, like 0.5, reply-that-the-author-answers 75, and video 50% playback only 0.005 [9]. Twitter later said these were legacy weights. Use them only as a directional hint: conversation, and especially author replies, counted far more than passive views.
- **Links.** Head of product Nikita Bier says "there is no code that is deboosting links"; he attributes their low reach to lower engagement. Creators dispute this [10]. X tested keeping like/reply buttons visible over the in-app browser (Oct 2025) so link posts get engagement signals [10]. Native video plus the link in a reply remains the safer pattern.
- **Payouts follow Premium attention.** Revenue sharing moved to verified Home Timeline impressions, then was retired on 7 Sept 2026 and replaced by **Original Content Rewards** [13][14]. Reposted or copied content is not original. From May 2026, impressions from identified reposts are reportedly redirected to the original author [14].

## 7. Views vs conversion

- **Reach** comes from replies and conversation: hot takes, live news and founder threads. Views from the video tab are cheap and often low-intent.
- **Conversion** comes from build-in-public demos, threads that show a working product, a pinned post with a clear CTA, and a link in a reply or the bio. For B2B dev tools, X still reaches developers and founders well. Measure sign-ups with UTMs; X analytics impressions are inflated by autoplay and past link preloading (X said a "fix for false impressions" shipped) [10].
- Reply to every substantive comment in the first hour. In the 2023 weights, a reply the author engaged with was worth 150 likes [9].

## 8. Common mistakes & "AI slop" signals

- **Policy:** X's synthetic and manipulated media policy (help page dated 2023) bans deceptive synthetic media that can cause harm. Penalties include labels, reduced visibility, or suspension [15]. From Nov 2025 X began adding "Manipulated media" labels; a creator "Made with AI" label exists, but its exact name varies in reports [16].
- **Monetisation:** from 3 March 2026, undisclosed AI videos of armed conflict mean a 90-day suspension from creator payouts, with permanent removal for repeat offences [14][17]. A third-party tool claims three engagement-solicitation strikes means removal from Original Content Rewards (unverified) [14].
- **Slop tells:** a cloned AI voiceover over stock clips, reposted TikToks with watermarks, "Thread 1/27" padding, AI images of fake events, AI-written reply-guy comments, and engagement bait ("Like if you agree").
- **Mistakes:** 16:9 ads with tiny text, links in the main post, a logo in the first second, no captions, ignoring replies.

## 9. Quick checklist

- [ ] Post text states the claim; the video is the proof
- [ ] 1:1 or 4:5 for the feed, 9:16 for the vertical tab and ads; 1080p MP4 H.264/AAC
- [ ] Ads under 15 s; organic one-point clips 15-45 s
- [ ] Motion and result in frame 1; no bumpers
- [ ] Burned-in captions; works on mute
- [ ] Native upload; link in the first reply, not the main post
- [ ] Reply to real comments quickly (conversation is the strongest signal)
- [ ] Original footage only; no reposts from other platforms
- [ ] Use the AI label for realistic synthetic media; never synthetic news or conflict footage
- [ ] Measure sign-ups via UTMs, not impressions

## 10. Sources

Accessed 2026-11-05 through search results (direct fetch blocked).

1. [X Help: Creative ad specifications](https://help.x.com/en/business-and-advertising/creative-ad-specifications) - accessed 2026-11-05
2. [X Business: Creative ad specs (legacy page)](https://business.x.com/en/help/campaign-setup/creative-ad-specifications-old) - accessed 2026-11-05
3. [X Help: About longer videos for Premium subscribers](https://help.twitter.com/en/using-twitter/blue-longer-videos) and [X Help: How to share and watch videos on X](https://help.twitter.com/en/using-x/x-videos) - accessed 2026-11-05
4. [X Help: Media Studio FAQs](https://help.twitter.com/en/using-x/media-studio-faqs) - accessed 2026-11-05
5. [VentureBeat: X open-sources its algorithm](https://venturebeat.com/ai/x-open-sources-its-algorithm-5-ways-businesses-can-benefit) - Jan 2026, accessed 2026-11-05
6. [Pasquale Pillitteri: X algorithm open source, 15 May 2026 major update](https://pasqualepillitteri.it/en/news/2594/x-algorithm-open-source-may-2026) - May 2026, accessed 2026-11-05
7. [DEV Community: X's feed ranking algorithm - how Grok ranks posts](https://dev.to/rams901/xs-feed-ranking-algorithm-how-grok-ranks-500m-posts-in-200ms-12gj) - third-party, accessed 2026-11-05
8. [GitHub: x-algorithm-explained (third-party)](https://github.com/cneuralnetwork/x-algorithm-explained) - accessed 2026-11-05
9. [Tian Pan: Twitter's recommendation algorithm (2023 weights)](https://tianpan.co/blog/2025/09/15/twitter-s-recommendation-algorithm) - 2025-09-15, accessed 2026-11-05
10. [Engadget: X is testing a new way of opening links](https://www.engadget.com/x-is-testing-a-new-way-of-opening-links-in-posts-to-improve-engagement-211210520.html?src=rss) and [Dataconomy: X's iOS link experiment](https://dataconomy.com/2025/10/20/xs-new-ios-experiment-changes-how-external-links-open) - Oct 2025, accessed 2026-11-05
11. [Engadget: X adds a dedicated video tab](https://www.engadget.com/big-tech/x-adds-a-dedicated-video-tab-to-fill-the-tiktok-void-150044169.html) - Jan 2025, accessed 2026-11-05
12. [dlvr.it: How to post videos on X (2025)](https://dlvrit.com/blog/?p=22249) - vendor, accessed 2026-11-05
13. [X Help: Creator Revenue Sharing](https://help.x.com/en/using-x/creator-revenue-sharing.html) and [X Business blog: Creator updates](https://business.x.com/en/blog/creator-updates-and-article-contest) - accessed 2026-11-05
14. [X Help: Original Content Rewards Program](https://help.x.com/en/using-x/original-content-rewards) and [TechCrunch: X replaces revenue sharing with Original Content Rewards](https://techcrunch.com/2026/08/08/x-replaces-misaligned-revenue-sharing-program-with-original-content-rewards/) - 2026-08-08, accessed 2026-11-05
15. [X Help: Synthetic and manipulated media policy](https://help.twitter.com/en/rules-and-policies/manipulated-media) - page dated 2023, accessed 2026-11-05
16. [PiunikaWeb: X launches manipulated media labels](https://piunikaweb.com/2025/11/26/x-launches-manipulated-media-labels-while-eyebrows-raise-as-edward-snowdens-account-shows-no-location) - 2025-11-26, accessed 2026-11-05
17. [Engadget: X to require AI labels on armed conflict videos](https://www.engadget.com/social-media/x-to-require-ai-labels-on-armed-conflict-videos-from-paid-creators-citing-times-of-war-183631400.html) - March 2026, accessed 2026-11-05
