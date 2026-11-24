# YouTube Shorts - short-form video research (as of 2026-11-05)

Evidence note: official YouTube pages (YouTube Help, blog.youtube) were read through search-result excerpts; direct page fetches were blocked in this session. Most "how the Shorts algorithm works" commentary in 2025-2026 recycles a 2023 Creator Insider interview with Shorts product lead Todd Sherman. Vendor-only figures are marked "(vendor data, unverified)".

## 1. Specs

| Item | Value | Evidence |
|---|---|---|
| What counts as a Short | Square or vertical video up to 3 min, uploaded on/after 15 Oct 2024. 16:9 is a regular video even at 30 s. #shorts hashtag does not decide classification | YouTube Help [1] |
| Aspect ratio | 9:16 (1:1 allowed) | [1][9] |
| Resolution | 1080x1920 recommended | [9] |
| File | MP4 (H.264/AAC) is the safe default | [9] |
| Max length | 3 min | [1] |
| Copyright limit | Shorts over 1 min with any active Content ID claim are blocked globally and not monetized until the claim is resolved; under 1 min, no change | YouTube Help [1][2] |
| Ideal length | No official number. The 1-minute copyright threshold makes 60 s or less the safe default for anything with third-party music; go 1-3 min only for original audio and when the story holds retention | [2] |

Safe zones (1080x1920). YouTube publishes no pixel values; every number is an estimate [9]:
- Bottom (title, channel, subscribe, sound): estimates range 270-672 px; grows with long titles.
- Right (like, dislike, comment, share, remix): 96-192 px.
- Top (search, menu): 120-288 px.
- Conservative rule from aggregated guides: keep about 300 px clear at the bottom, 200 px at top, 200 px on the right (vendor data, unverified) [9]. Working zone: x=60-880, y=200-1500.

## 2. Hooks (first 1-3 s)

YouTube's own framing is that the audience decides: the key Shorts metric is how often viewers choose to watch versus swipe away (Sherman, 2023) [5]. There is no click; the first frame is the "thumbnail" and title combined.

Patterns, with examples:
- State the topic and the payoff in the first line spoken: "Here's how to cut your onboarding emails from 9 to 3."
- Visual proof first: screen recording of the result, then the steps.
- Question the viewer already has: "Why does ChatGPT keep making up citations?"
- Countdown or list framing visible on screen ("5 tools, 50 seconds").
- Start mid-action; no intro, no "hey guys", no channel bumper.
- Since Shorts can link to long-form (section 7), a hook can preview a deeper video: "Full breakdown linked below."

## 3. Retention & pacing

- Ranking inputs named by YouTube's Shorts team: percentage of viewers who chose to watch (vs swiped away), average view duration, average percentage viewed, plus likes and post-watch survey responses [5].
- New Shorts are first shown to a small seed audience; weak early engagement halts promotion (third-party description of YouTube's statements) [5].
- If viewers start but drop off, YouTube's advice (as reported) is to look at where pacing slows; a high swipe-away rate means the opening or audience fit is wrong [5].
- Cut frequency: no official number. YouTube suggests beginners use Shorts templates to learn edit pacing [7]. Practice: change shot or add a visual beat every 2-3 s.
- Loops: views now count every start and replay (since 31 Mar 2025), so loops inflate public views; "engaged views" (the old metric) still drive YPP eligibility and revenue [4]. Optimize for engaged views and average percentage viewed, not raw views.
- Payoff: deliver before the final 10% of runtime; keep the end tight so it rolls into a replay or the related-video link.

## 4. Captions & text overlays

- No official YouTube font-size or words-per-second guidance found. Practical: 52-72 px cap height, two lines max, inside x=60-880, y=200-1500.
- Long titles extend the bottom overlay upward, so keep on-screen text clear of the lower third [9].
- Burn in captions for muted viewing, and also upload/enable captions so YouTube can read the text.
- Title and description are searchable on YouTube; write the title as the query a viewer would type.
- AI labels on Shorts now appear as an overlay on the video itself (May 2026); check a test upload so the label does not collide with your own text [6].

## 5. Audio & sound

- Over 1 min: any Content ID claim, including on music from the Shorts library if claimed, blocks the Short globally [1][2]. Under 1 min: normal claim rules.
- Remix: creators can sample up to 60 s of sound from other videos; remix needs the source Short's music to be from the Shorts-eligible library and not from a music-network channel [8].
- Audio Library tracks are royalty-free and will not receive a Content ID claim [8]. Commercial use: a guide quotes YouTube's page as saying library music is for personal, non-commercial use unless you have licenses (secondhand, unverified) [8]. Shorts library permissions are not a portable license for edits made in CapCut or Premiere or for other platforms [8].
- For brands: use original voiceover, Audio Library tracks, or commercially licensed music you hold rights to; avoid trending chart songs in branded or sponsored Shorts.

## 6. What the algorithm rewards

Official or close-to-official:
- Viewed vs swiped away, average view duration, average percentage viewed, likes, and satisfaction surveys [5].
- Public view count = starts and replays with no minimum watch time (since 31 Mar 2025); YPP eligibility and revenue still use engaged views [4].
- Shares, comments and subscribes are not named as primary Shorts ranking signals in the official material found; blogs that rank them precisely are speculating.
- Quality direction: CEO Neal Mohan's 2026 letter (21 Jan 2026) named "managing AI slop" and fighting repetitive, clickbait and spam content as priorities [10].
- Inauthentic content: from 15 Jul 2025 the YPP policy renamed "repetitious content" to "inauthentic content" (mass-produced or repetitive, often seen as spam); YouTube called it a minor update and said such content was already ineligible; enforcement is channel-wide [3]. The separate reused-content policy covers compilations and clips without significant original commentary or modification, regardless of permission [11].

## 7. Views vs conversion

- Shorts views are cheap after the 2025 count change; judge Shorts by engaged views, subscribers gained, and clicks to long-form.
- Related video link: in YouTube Studio desktop, each Short can carry one link to another video on the same channel (long-form, livestream, or Short); it shows as a prompt at the bottom. Shorts cut from your own long-form link back automatically. Some scheduling tools cannot set it via the API [12].
- Conversion path: Short -> related long-form demo/tutorial -> description link or pinned comment. Long-form is where YouTube allows full description links.
- Search/SEO: titles and descriptions are searchable on YouTube; put the buyer's query in the title and first description line, and say it aloud in the video.
- Comment replies: YouTube suggests creators keep the conversation going by monitoring and replying [7]; video replies to comments are cheap follow-up content.

## 8. Common mistakes & "AI slop" signals

- Mass-produced template channels (same voice, same stock footage, slightly varied scripts) or narration-free slideshows: risk losing monetization for the whole channel under the inauthentic-content policy [3].
- Clips or compilations without real commentary (reused content) [11].
- Horizontal footage with blurred bars; it may not even classify as a Short [1].
- Music-backed Shorts longer than 60 s that get claimed and silently blocked [2].
- Chasing public view counts that now include replays and instant swipes [4].
- AI labelling: creators must disclose realistic altered or synthetic content; unrealistic or minor edits are exempt. Content made with YouTube's own tools (Veo, Dream Screen) is labeled automatically and permanently. Since May 2026 YouTube uses C2PA metadata and SynthID to add labels even when the creator did not disclose, and shows the label as an on-video overlay on Shorts. YouTube says disclosure itself does not limit audience or monetization [6].

## 9. Quick checklist

- [ ] 9:16, 1080x1920, MP4, under 3 min (under 60 s if any third-party audio).
- [ ] Topic and payoff clear in the first 1-2 s; no intro or bumper.
- [ ] Visual beat every 2-3 s; cut dead air.
- [ ] Text inside x=60-880, y=200-1500; check the bottom overlay with a long title.
- [ ] Captions burned in and the title written as a search query.
- [ ] Audio: original, Audio Library, or licensed; check for Content ID claims before publishing.
- [ ] Related-video link set to the matching long-form video.
- [ ] Measure engaged views, viewed-vs-swiped, and average percentage viewed - not public views.
- [ ] Disclose realistic AI content; add genuine commentary or editing to avoid inauthentic/reused flags.
- [ ] Reply to top comments; turn good questions into the next Short.

## 10. Sources

All accessed 2026-11-05.

1. [YouTube Help - Understand three-minute YouTube Shorts](https://support.google.com/youtube/answer/15424877?hl=en) - live page (rule effective 2024-10-15).
2. [YouTube Help - Understand three-minute YouTube Shorts (UK, Content ID blocking)](https://support.google.com/youtube/answer/15424877?hl=en-GB) and [YouTube Help - Learn about Content ID claims](https://support.google.com/youtube/answer/6013276?hl=en) - live pages.
3. [Search Engine Journal - YouTube targets mass-produced content in monetization update](https://searchenginejournal.com/youtube-targets-mass-produced-content-in-monetization-update/550337/) - 2025-07; [Social Samosa - YouTube clarifies monetisation policy update](https://www.socialsamosa.com/news-2/youtube-clarifies-monetisation-policy-targeting-inauthentic-content-9493155) - 2025-07.
4. [Tubefilter - YouTube is making Shorts views go up](https://www.tubefilter.com/2025/03/26/youtube-shorts-views-counting-stats/) - 2025-03-26; [Digiday - Shorts view count update](https://digiday.com/media/youtube-shorts-view-count-update-wins-over-brands-but-creators-arent-sold/) - 2025.
5. [Search Engine Journal - YouTube explains how the Shorts algorithm works](https://searchenginejournal.com/youtube-explains-how-shorts-algorithm-works/494953) - 2023-08; [OutlierKit - Shorts algorithm in YouTube's words](https://outlierkit.com/resources/youtube-shorts-algorithm/) - vendor blog, 2026.
6. [YouTube Official Blog - Improving AI labels for viewers and creators](https://blog.youtube/news-and-events/improving-ai-labels-for-viewers-and-creators/) - 2026-05; [Android Central - YouTube AI and synthetic content disclosure](https://androidcentral.com/apps-software/youtube-ai-synthetic-content-disclosure) - 2024.
7. [Social Media Today - YouTube offers tips on working with Shorts](https://socialmediatoday.com/news/youtube-offers-tips-on-working-with-shorts-videos/825096) - 2025.
8. [YouTube Help - Music eligibility for YouTube Shorts](https://support.google.com/youtube/answer/13486873?hl=en) - live page; [TechCrunch - Shorts can include 60 seconds of music or sounds](https://techcrunch.com/2022/11/15/youtube-shorts-can-now-include-60-seconds-of-music-or-sounds-up-from-15-seconds-before) - 2022-11-15; [Sonilo - How to add music to YouTube Shorts](https://sonilo.com/ai-music/how-to-add-music-to-youtube-shorts) - vendor blog.
9. [ClipSpeed - YouTube Shorts size 2026](https://www.clipspeed.ai/blog/youtube-shorts-size.html) and [Reap - Shorts, Reels and TikTok safe zones](https://reap.video/blog/short-form-video-safe-zones) - vendor blogs.
10. [eWeek - YouTube CEO says cutting AI slop is a 2026 priority](https://www.eweek.com/news/youtube-ai-slop-crackdown-creators/) - 2026-01; [Tubefilter - Neal Mohan's 2026 letter](https://www.tubefilter.com/2026/01/21/neal-mohans-2026-letter-to-creators-a-lot-of-ai-a-tiktok-shop-competitor-and-beautifully-produced-tv-to-compete-with-netflix/amp/) - 2026-01-21.
11. [YouTube Help - Channel monetization policies (reused content)](https://support.google.com/youtube/answer/1311392) - live page; [PPC Land - Understanding YouTube's reused content policy](https://ppc.land/understanding-youtubes-reused-content-policy) - 2025.
12. [Search Engine Land - YouTube enables linking between Shorts and long-form videos](https://searchengineland.com/youtube-enables-linking-shorts-long-form-videos-430655) - c. 2023; [Post Bridge support - linking Shorts](https://support.post-bridge.com/social-media-scheduling/can-i-link-youtube-shorts-to-long-form-videos) - vendor.
