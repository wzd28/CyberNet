# YouTube long-form video: research notes

Last researched: 2026-11-05. Method note: direct page fetches of support.google.com and blog.youtube were blocked from the research environment, so official pages were read through search-result extracts. Re-check exact numbers in YouTube Studio before relying on them. Vendor-only figures are labelled "(vendor data, unverified)".

## 1. Specs

**Ideal length.** YouTube publishes no ideal length. The closest official framing: recommendations aim at long-term viewer satisfaction, and secondary summaries of interviews with YouTube's recommendations lead Todd Beaupré quote him saying some videos create more value in 5 minutes than others do in 20 (no primary transcript found) [5][6]. The "7-15 minutes" figure is a blog rule of thumb with no data behind it [16]. One study of 60 channels and 577 videos found that breakout videos had about the same median length (14.8 min) as normal uploads, and no reliable length effect (vendor data, unverified) [17]. Practical rule: make it as long as the content earns, judging retention as a percentage of runtime, and compare length against your own channel's retention curves.

**Max length / file size.** The default upload limit is 15 minutes. Verified accounts can upload longer: commonly cited as 12 hours or 256 GB, whichever comes first. This comes from third-party guides; the official page was not reachable, so confirm it in Studio [18].

**Aspect ratio.** 16:9 is the standard and is still recommended for long-form. The player resizes to match the video and the device, and YouTube may pad vertical video on desktop [2]. Upload at the native aspect ratio and never bake in letterbox or pillarbox bars, because they stop the player adapting [3].

**Resolution / format.** Most widely recommended: 1920x1080 or 3840x2160, MP4 with H.264 video and AAC audio, at the source frame rate. This is consensus across third-party guides; the official encoding page was not retrieved [18].

**Thumbnail.** 16:9, minimum 640 px wide. The Studio help currently suggests a 3840x2160 image. File limit is 2 MB on mobile and 50 MB on desktop, so keep it under 2 MB to be safe everywhere [1]. 1280x720 under 2 MB is the older spec still used for Google Ads [1].

**Title.** A 100-character limit is widely cited but was not confirmed in this research. YouTube's own advice: the title and thumbnail must match what the video delivers [4]. Put the promise in the first few words, since titles are truncated on many surfaces.

## 2. Hooks (first 30 s + the title/thumbnail promise)

- YouTube's "Intro" metric is the share of viewers still watching at 30 seconds. Videos keeping 50%+ of viewers past 30 seconds show up as "above typical intros" [4].
- YouTube's two official fixes: make the thumbnail and title match the content, then edit the first 30 seconds and experiment with styles [4].
- "Top moments" are points where almost no one leaves. If yours come late, move that content earlier [4].
- Test & Compare (titles, thumbnails, or both; up to 3 variants) picks the winner by **watch time share, not CTR** [7][8]. A clickbait package that wins clicks but loses viewers loses the test. The title promise has to be paid off.

Hook patterns that fit the above:
- **Show the payoff first (cold open):** "This dashboard cut our support tickets 40% - here is the exact setup." Then deliver it.
- **Stakes + roadmap in 15 s:** "If you deploy on Netlify, three settings are costing you money. I'll show each one, then the one that matters most."
- **Confirm the thumbnail within 5 s:** if the thumbnail shows a before/after, show that same frame in the opening seconds so the click feels rewarded.
- **Skip:** logo stings, "hey guys, welcome back", asking for subscribes before giving any value.

## 3. Retention & pacing rules

- Use the retention curve, not instinct. Dips mark tangents; flat or rising parts mark what to do more of [4].
- Key moments only appear for videos of 60 s or more with at least 100 views. Data takes 1-2 days [4].
- Reset attention roughly every 30-90 s: a new visual, a chapter, a demo, a change of scene (practice, not an official figure).
- Use chapters so viewers on TV and desktop can skip ahead rather than leave.
- In the US, TV screens have overtaken mobile as the main way people watch YouTube (Neal Mohan's letter, Feb 2025; about 1 billion hours a day on TVs) [10][11]. Pace and frame for a big screen viewed from a sofa: legible type, fewer rapid-fire cuts, 16:9.

## 4. Captions & text overlays

- Long-form is usually watched with sound on, especially on TV. Captions still help accessibility, search, and non-native viewers. Upload a corrected caption file rather than relying on auto-captions for product names and jargon (practice).
- Use text overlays for numbers, steps and code. Keep them out of the bottom area, which YouTube's controls and captions cover.
- Text must be readable at TV distance: large, high-contrast, on screen for at least 2-3 s.

## 5. Audio & sound

- Bad audio drives people away faster than bad video. Use a lav or dynamic mic, normalise loudness, and keep music well under the voice (practice).
- **Multi-language audio** moved out of pilot in Sept 2025. Creators who added dubbed tracks got over 25% of watch time from views in non-primary languages [12]. Auto-dubbing reached all creators in 27 languages in Feb 2026, with controls to upload custom dubs or turn it off [13]. One outlet says 40+ languages; 27 is better supported [13].
- Check AI dubs before publishing. Mistranslated product terms look careless.

## 6. What the algorithm rewards

- **Satisfaction over raw watch time.** YouTube's help page lists satisfaction surveys among its main signals, alongside clicks, watch time, likes/dislikes and "not interested", drawn from "over 80 billion" signals [5].
- **Long-term viewer value:** Beaupré describes the goal as whether people return and feel the platform delivered; recommendations are "pulled" for each viewer, not pushed to subscribers [6][9]. Per the same report, subscribers skip about 90% of uploads in their feed [9].
- **Watch time share** is the yardstick for packaging tests [7].
- No per-video satisfaction score is shown to creators. Claims of a "4/5-star threshold" circulate but were not found in YouTube's documentation [5].

## 7. Views vs conversion

- **Reach** comes from broad packaging, browse/suggested traffic and TV viewing. **Conversion** comes from search-intent videos ("how to X with Y"), tutorials and comparisons, where viewers already have the problem. Suggested-traffic viewers watched about 4 min on average versus 2 min from search in one vidIQ example (vendor data, unverified) [16]. Search viewers are fewer and shorter-watching but often higher-intent.
- For B2B and SaaS: make the product the tool inside a genuinely useful tutorial, put a specific CTA (trial, template, docs) in the first lines of the description and a pinned comment, and use end screens to point to a deeper demo. Measure sign-ups with UTM links, not views (practice).
- A viral, off-topic video can bring in subscribers who never buy and weaken later recommendations to your real audience.

## 8. Common mistakes & "AI slop" signals

- **Inauthentic content (YPP).** From 15 July 2025, YouTube renamed "repetitious content" to "inauthentic content" and said it would better detect mass-produced and repetitive videos [14][15]. Typical examples: template videos with minor changes, slideshows or scrolling text without narration, and the same voiceover across many videos. This is a monetisation rule, not a hosting ban. YouTube's Rene Ritchie called it a "minor update", and commentary/reaction formats with real creative input are not the target [14].
- **Disclosure.** Realistic altered or synthetic content (a real person's likeness, altered real events, realistic generated scenes) must be disclosed in Studio. The label appears in the description. Disclosure does not limit reach or monetisation; unrealistic content and minor edits are exempt [19]. One Oct 2026 third-party guide says the setting has moved to "AI use" under Attributes (unverified) [19].
- **2026:** reports say YouTube now auto-applies the "Altered or synthetic content" label to photorealistic AI material even when it isn't disclosed (creators can update it in Studio). Veo/Dream Screen output carries permanent labels, and likeness detection has expanded to adults. All of this is from secondary coverage, and dates conflict (May 2026) [20][21].
- **Looks generic:** a stock-voice narrator over b-roll, AI faces, no on-screen human or real product, "In today's fast-paced world" scripts, thumbnails that don't match the content, and the same template every week.

## 9. Quick checklist

- [ ] Title and thumbnail promise one specific outcome, and the first 15 s show it
- [ ] 50%+ still watching at 30 s (check the Intro metric after 48 h)
- [ ] Best moments moved earlier; chapters added
- [ ] 16:9, native ratio, no baked-in bars, 1080p or 4K MP4
- [ ] Thumbnail 16:9, at least 1280x720, under 2 MB, readable at small size and on a TV
- [ ] Run Test & Compare on 2-3 packages (it judges by watch time, not CTR)
- [ ] Clean voice audio; corrected captions; consider a dubbed track
- [ ] Realistic AI content disclosed in Studio
- [ ] Real person, real screen, real data: nothing interchangeable or templated
- [ ] CTA with UTM link in the first description line and a pinned comment

## 10. Sources

Accessed 2026-11-05 through search results (direct fetch blocked).

1. [Add customised thumbnails - YouTube Studio Help](https://support.google.com/youtubecreatorstudio/answer/72431?hl=en-GB&co=GENIE.Platform%3DDesktop) - accessed 2026-11-05
2. [Video resolution & aspect ratios - YouTube Help](https://support.google.com/youtube/answer/6375112?hl=en&co=GENIE.Platform%3DDesktop) - accessed 2026-11-05
3. [Video and audio formatting specifications - YouTube Help](https://support.google.com/youtube/answer/4603579?hl=en-GB) - accessed 2026-11-05
4. [Measure key moments for audience retention - YouTube Help](https://support.google.com/youtube/answer/9314415?hl=en) - accessed 2026-11-05
5. [How YouTube recommendations work - YouTube Help](https://support.google.com/youtube/answer/16089387?hl=en) - accessed 2026-11-05
6. [Search Engine Journal: Beaupré on long-term value](https://searchenginejournal.com/youtube-bigger-thumbnails-long-form-engagement/588102) - accessed 2026-11-05
7. [A/B test titles & thumbnails - YouTube Help](https://support.google.com/youtube/answer/16391400?hl=en) - accessed 2026-11-05
8. [PPC Land: YouTube expands A/B testing to titles](https://ppc.land/youtube-expands-a-b-testing-to-include-titles-alongside-thumbnails/) - Dec 2025, accessed 2026-11-05
9. [PPC Land: Subscribers skip 90% of uploads, YouTube director says](https://ppc.land/subscribers-skip-90-of-uploads-in-their-feed-youtube-director-says/) - accessed 2026-11-05
10. [Hollywood Reporter: YouTube TV viewing overtakes mobile](https://www.hollywoodreporter.com/business/business-news/youtube-tv-viewing-overtakes-mobile-ceo-neal-mohan-1236132074/) - Feb 2025, accessed 2026-11-05
11. [Tubefilter: Neal Mohan's 2025 letter](https://www.tubefilter.com/2025/02/11/neal-mohan-youtube-letter-2025-youtube-tv-watch-time-creator-studio-businesses/) - 2025-02-11, accessed 2026-11-05
12. [PPC Land: Multi-language audio for millions of creators](https://ppc.land/youtube-makes-multi-language-audio-available-to-millions-of-creators/) - Sept 2025, accessed 2026-11-05
13. [India TV News: Auto-dubbing expands to all users, 27 languages](https://www.indiatvnews.com/technology/news/youtube-auto-dubbing-feature-expands-to-all-users-now-supports-27-languages-2026-02-05-1029070) - 2026-02-05, accessed 2026-11-05
14. [Search Engine Journal: YouTube clarifies monetization update](https://www.searchenginejournal.com/youtube-clarifies-monetization-update-targeting-spam-not-reaction-channels/550755) - July 2025, accessed 2026-11-05
15. [Plagiarism Today: YouTube targets "inauthentic" content](https://www.plagiarismtoday.com/2025/07/08/youtube-targets-inauthentic-content/) - 2025-07-08, accessed 2026-11-05
16. [vidIQ: Best YouTube video length](https://vidiq.com/blog/post/best-youtube-video-length/) - vendor, accessed 2026-11-05
17. [Overseeros: Best YouTube video length study](https://www.overseeros.com/blog/best-youtube-video-length-study) - vendor, accessed 2026-11-05
18. [Riverside: YouTube video size](https://riverside.fm/blog/youtube-video-size) - vendor, accessed 2026-11-05
19. [Disclosing use of altered or synthetic content - YouTube Help](https://support.google.com/youtube/answer/14328491) and [Magic Hour disclosure checklist](https://magichour.ai/blog/youtube-ai-content-disclosure) - accessed 2026-11-05
20. [The Decoder: YouTube will try to automatically flag AI videos](https://the-decoder.com/youtube-will-try-to-automatically-flag-ai-videos-starting-this-month/) - 2026, accessed 2026-11-05
21. [Influencer Marketing Hub: inauthentic content and creator likeness](https://influencermarketinghub.com/youtube-inauthentic-content) - accessed 2026-11-05
