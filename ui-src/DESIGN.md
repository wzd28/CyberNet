# CyberNet AI interface: "Signal"

This is the design system for the CyberNet AI website. The same tokens and components are meant to move into the future iOS and Android app.
Sources live in `ui-src/` and are built into `public/ui/cybernet-ui.css`, `public/ui/cybernet-ui.js` and `public/ui/cybernet-ui-legal.css` (the standalone legal pages and 404) with `node scripts/build-ui.mjs` (`npm run build:ui`). Never edit the generated files.

The design replaces the rejected v2 look. v2 used hacker imagery, code rain, virus sprites, a red "threat field" and glow everywhere, and the owner called it "suspicious and weird". The replacement is calm, precise and expensive. Motion shows the product working; it is never decoration for its own sake. References: Apple product pages (quiet type, one big moment per section), Linear and Socket (real product UI in place of metaphors), Lovable and Higgsfield (a prompt-box hero, rails of cards), Google Safety Center (security explained calmly).

## v4 "Aurora" (14 Oct 2026): this section overrides anything below that conflicts

The owner saw v3 and said it is good but "too basic, depressing and dark". v4 keeps v3's structure, safety rules and components, and adds light, colour, depth and motion. The target sits between the two rejected extremes: alive, colourful and 3D like a launch page, but organised, clean and premium, never neon-cheap or "hacker theatre".

What changes:
1. **Light and colour.** The ground moves from near-black to a midnight indigo. A global, slowly moving aurora sits behind every page (fixed layer, GPU transforms only): deep purple, violet, cyan, blue and a touch of magenta. Cards become luminous glass (indigo tint, gradient hairline borders). Cyan stays the brand signal. Deep purple and violet are the second voice: AI, highlights, gradients. Mint marks Recovery, and soft magenta appears as a rare spark. Verdict colours keep their meaning.
2. **3D.** Home opens with a real-time Three.js scene: a glowing globe (dotted or textured continents and an atmosphere rim in cyan and violet) with the CyberNet logo shields (hexagon shield and lock) rotating on their own axis while they orbit it. Threat pulses travel along arcs and are caught by a shield in a cyan flash. Smaller 3D objects (padlock, AI chip, data cube) float nearby. Elsewhere, pre-rendered 3D objects (transparent WebP renders of the same models, made by our own render script) float with CSS motion and scroll parallax. The closing section has a large rotating shield.
3. **Pictures.** Real photographs (free licence: Unsplash or Pexels; never paid), with **no human faces**: a hooded hacker seen from behind, hands on keyboards, a phone with a message, abstract AI networks, servers and locks. Every photo is colour-graded to the palette (a duotone in indigo, cyan and violet) so the set reads as one art-directed series, with rounded corners and gradient borders.
4. **Motion everywhere, with purpose.** The aurora drifts. The hero scene turns, and nudges slightly as you scroll. Sections reveal with blur and rise. Image tiles move with gentle parallax. Number counters run. Gradient borders sweep once. Hover lifts are allowed. Scroll-linked effects use CSS `animation-timeline: view()`, with an IntersectionObserver fallback. Every loop pauses off-screen and when the tab is hidden, can be paused (one global "Pause motion" control plus the hero Pause), and stops under reduced motion.
5. **Home order (fewer, stronger sections):**
   1. Globe hero (copy and scan box first in reading order, the 3D scene beside it on desktop and above it on phones).
   2. How-to tiles.
   3. Live activity.
   4. "Scams don't look like scams" (photo bento with the $442B fact).
   5. Example scan.
   6. Three tools.
   7. Rules first, then AI (with the facts row).
   8. Closing shield and statement.
   9. Support.
   10. Fine print.
   
   The separate globe section and the moving ticker are gone.
6. **Phones first.** The 3D scene renders at DPR 1 and about 30 fps, with fewer objects, and sits above the copy at about 62vw tall. The poster image shows instantly and the live scene fades in over it. Photos use 800w versions. Nothing overflows from 280px up.
7. **Pricing.** The "CyberNet AI is operated under Marks Events FZ LLE" line is a clearly visible banner at the very top of Pricing and About. It is a centred pill set in 14–15px Mona Sans 500, with the entity name in white at weight 650, and starts with the brand shield shown as a CSS mask in a cyan-violet-magenta gradient. It has a 1px cyan-to-violet-to-magenta gradient border over a soft indigo fill with a violet glow. Under 560px the entity takes its own line. Its styles live in 50-pricing.css for both pages. It is not a tiny mono strip.

v4 tokens and light system (`00-tokens.css`, `03-aurora.css`; replaces the "v4 tokens" list above)

Ground and surfaces (dark, the default; every page, and Home's stages):
- `--cn-bg` #160d42 (luminous violet-indigo, never black), `--cn-bg-2` #1c1150.
- Solid surfaces #211561 / #291a75 / #33218a (`--cn-surface`, `-2`, `-3`). Luminous glass for cards: `--cn-glass` rgba(42,27,118,.56) with `--cn-sheen` (a white light from the top) and `--cn-hi` (the lit 1px top edge). No backdrop blur inside <main>: the tint is the glass.
- Lines: lilac rgba(196,181,253,.16) and .28; field edges `--cn-line-ctl` rgba(225,218,255,.46) (3.1:1 or more on every surface).
- Text: `--cn-text` #f7f5ff, `--cn-text-2` #cfc8f5, `--cn-text-3` #b6aee6 (5.9:1 on surface-3, 4.7:1 even where the aurora's crown and a blob overlap).
- Accents: cyan `--cn-cyan` #22d3ee / `--cn-cyan-2` #67e8f9 (text); violet `--cn-violet` #8b5cf6 / `--cn-violet-2` #c4b5fd (text); `--cn-purple` #5b2be0, `--cn-purple-700` #3a12a8, `--cn-purple-deep` #2b0f6e; magenta `--cn-magenta` #e879f9 (fills, glows, gradient ends; never text on the ground) and `--cn-magenta-2` #f0abfc (magenta text); `--cn-blue` #60a5fa; ink `--cn-ink` #0b0720. AI accent `--cn-iris` #b8a6ff / `--cn-iris-2` #c9bbff. Mint (Recovery) and the verdicts: safe #34d399, warn #fbbf24, danger (coral) #ff8a9c.
- Fixed brand pill: `--cn-brand` #22d3ee with `--cn-on-brand` #0b0720 (10.9:1). The primary button uses these, so it is the same bright cyan pill on dark and light grounds.
- `--cn-ring` is the focus colour (cyan on dark, #0b6a84 on light).
- Gradients: `--cn-grad-brand` cyan → violet → magenta (oklch interpolation where supported, sRGB stops otherwise); `--cn-grad-text` for gradient words (`.cn-grad`; every stop clears 4.5:1); `--cn-grad-hair` (a gradient hairline); `--cn-grad-stage` (the #2b0f6e violet stage mesh lit by electric violet, cyan and magenta); `--cn-edge-1..4` (the conic hairline colours of glass panels).
- Palette primitives `--cn-p-*` never change with the section tone (use them only where a colour must be identical on dark and light).

Light bands (Home's rhythm): `html.cn :is(.cn-light, [data-cn-tone="light"], #home > .cn-live, #home > .cn-demo, #home > .why-choose, #home > .wow-section)` flips every token to the light set: ground #f6f4ff, white cards, surface-2 #f5f2ff, surface-3 #ece7ff, ink text #1b1340 / #4b4a6b / #5f5c85 (15.9 / 7.8 / 5.8:1), lines rgba(43,15,110,.11/.19), field edges 3.6:1+. Cyan is never text on light: `--cn-cyan-2` becomes #0b6a84 (5.1:1 on surface-3) and `--cn-cyan` (marks) #0e7490; violet text #5b21b6, AI #6d28d9, mint #0d6b64, magenta #a21caf, verdicts #04704f / #92400e / #be123c (all 5.1:1 or more on surface-3). Derived tokens (`--cn-id*`, `--cn-focus`, `--cn-grad-sweep`) and the legacy variables (`--bg`, `--green`, `--text` …) are re-declared on each light scope, so components and untouched legacy rules inside follow the tone with no extra CSS. To make another block light: add `class="cn-light"` or `data-cn-tone="light"` (it also gets a painted lavender band with a violet top glow, 03-aurora.css), or add its selector to the list (keep 01-base.css, 90-a11y.css and the LIGHT list in 07-aurora.js in step). `.cn-stage-band` / `[data-cn-tone="stage"]` paints a violet stage band the same way.

The aurora (`03-aurora.css`): a global light behind every SPA page, GPU-cheap by construction.
- The canvas (body's background) holds the ground and a crown of violet, cyan and magenta light at the top of the document, so each page is brightest at its top.
- Two fixed layers (html::after, body::before) hold soft radial blobs (deep purple, electric violet, cyan; magenta, blue) drifting on 61 s and 43 s loops. Transform only (compositor): no repaint, no main-thread work, no filter blur. A fixed light beam (body::after) crosses the screen once every 53 s on screens 761px and wider. A static film grain (html::before, SVG noise data URI, 12%) sits over the light and under the content.
- Phones keep one drift layer and the grain.
- While a light band fills the middle of the screen the aurora dims (`html.cn-aurora-low`, an opacity fade).
- Stops under reduced motion and Pause motion; removed under forced colours and in print.

Pause motion (`07-aurora.js`, footer `button.cn-motion-toggle[data-cn-motion]`): one switch for every loop. It toggles `html.cn-still`, which is remembered in localStorage ("cn-still"). While paused: the aurora rests in place, every CSS animation shows its end state exactly as under prefers-reduced-motion (hover and press transitions still work), `CN.reduced()` answers true, `CN.pause()` runs on every module controller (and again on any module that starts later when it scrolls near), and the hero's own Pause button is pressed for the visitor (released again on resume if the control pressed it). API: `CN.still()`, `CN.setStill(bool)`, `CN.onStill(cb) -> off()`, and a document "cn:still" event (detail.still). The label carries the state ("Pause motion" / "Play motion"); the glyph follows `.is-paused`.

Components (v4 look):
- Primary button: the cyan pill lit from above (inset highlight). Only the primary CTA (`.big`, `.cn-cta`) gets the soft cyan halo (`--cn-glow-cta`); on light bands the pill gets a teal edge instead.
- Secondary button: a glass outline on dark (`--cn-fill-1`), white on light.
- Eyebrow (`.cn-eyebrow`, `.pill`): a lit pill with a cyan-to-violet wash, a cyan hairline, mono caps in cyan text; `.cn-eyebrow.is-ai` in violet.
- Chip (`.cn-chip`): tint plus hairline, brighter on hover; 44px hit area.
- Card (`.cn-card`, alias `.cn-glass`; legacy `.glass` in <main>): luminous glass. `.cn-card` and the support box draw a conic gradient hairline (a masked ::before over the border only); when they scroll in (`.is-in`) the light runs once round the edge (`--cn-edge-a`, 2.8 s). `.is-lit` raises the hairline for a featured card.
- Verdict badge: tint, hairline, a glowing dot and the word. Live dot: a cyan dot with a soft glow; its ring pulses twice per visit.
- Gradient word: `.cn-grad`.

Scroll motion (`05-reveal.js`, `01-base.css`):
- `[data-cn-reveal]` rises in once, out of an 8px blur on screens 761px and wider (fade and rise on phones), as it crosses 92% of the viewport. Variants: `="fade"`, `="scale"` (photos settle from 1.04), `="clip"` (wipes up from the bottom edge), `="off"`. `[data-cn-stagger]` children follow 70 ms apart; `--cn-d` delays a single block.
- Legacy `.reveal` is a page-load cascade (script.js shows every reveal of the page at once), so it cannot be a scroll reveal. On Home, 05-reveal.js tags the section heads, the support box and the limits note with `data-cn-reveal`; blocks with their own scroll-linked motion are left to their partials. Owners can key one-off entrance effects to `.is-in`.
- `[data-cn-parallax]`: drifts against the scroll (`--cn-px`, default 32px each way) on a view timeline; still where unsupported, under reduced motion and while paused.
- Count-up (`[data-cn-count]`): exponential ease-out over 1.7 s (`data-cn-count-dur`), `.is-counting` while it runs.

Modes: prefers-contrast: more lifts grey text and lines and makes glass solid; prefers-reduced-transparency makes glass solid (`--cn-glass` = `--cn-surface`); forced colours removes the aurora and the gradient hairlines and gives shapes a system edge.

Performance rules still apply:
- One live WebGL context at a time.
- 3D starts after first paint and never blocks the H1 or the scan box.
- A poster image is shown first.
- Pre-rendered sprites are used for decoration instead of extra WebGL.
- Photos are lazy-loaded WebP with `srcset`.
- LCP stays under 2.5 s on Home.

## Non-negotiables

1. **Functionality is untouched.** Quick Scan, Analysis AI, Recovery, auth, pricing, business and every other flow keep their markup, IDs, `data-*` attributes, form names, JS-used classes and handlers. `public/script.js` and the other legacy scripts are not edited, apart from the sanctioned edits listed below. Read `maps/HAZARDS.md` in the tooling folder for the traps: inline styles set by JS, `className` overwrites, innerHTML rebuilds, the `.page` / `.active-page` switch, `.reveal` animations, global `textarea`/`input` rules, the `[hidden]{display:none!important}` rule, the z-index stack.
   - Sanctioned legacy edits (the only ones; add to this list before making another): `script.js` lines 10–11 (the particle canvas stays off under `html.cn`), line 820 (`SUPPORT_EMAIL`), line 1921 (the search result button reads "Open lesson"); `SUPPORT_EMAIL` in `cybernet-legal-upgrade.js` and the support address in `cybernet-business-team.js`. Server and email templates (`netlify/functions/*`, `supabase/email-template-*`) still carry the old address until a separate backend change.
2. **Nothing follows the user.** No sticky or fixed CTAs, floating docks, chat bubbles, magnetic or cursor-following buttons, or tilt effects. The header sits in normal flow and scrolls away; on phones the menu sheet is the only overlay. Buttons react to hover and press (colour, a 1px lift, a 0.98 press scale) but never move toward the pointer. Legacy `.tilt-card` gets `transform:none!important`.
3. **Honest by design.** A number or chart says "Live" only if it reads real data. Today that means `/api/public-stats`, which returns `totalScans`, `threatsFound` and `recoveryCases`. The live dot marks live data only; it is not an ornament for links. Everything illustrative is labelled "Example". There are no fake counters, no fake logos and no urgency banners. A count-up never rests on its start value: the number written in the HTML is the resting state.
4. **Help before hype.** The H1, the scan box and the route to Recovery paint immediately. There is no preloader, and no reveal animation is applied to the hero text. Motion code runs after first paint and never delays a scan. On every page except Home, the tool's input sits above the fold of a 1280×720 laptop.
5. **Accessible motion and contrast.** Under `prefers-reduced-motion: reduce`, every animation shows its end state: typing is complete, counters show their final value, the shader shows a static gradient, the reel does not auto-advance. Anything that moves for more than 5 s has a visible Pause button, or stops by itself within 5 s. All text meets 4.5:1, small labels and counters included (WCAG has no small-label exemption). Field edges and checkbox rings meet 3:1. Focus is always visible, also in Windows forced-colours mode. Tap targets are at least 44×44 px (a smaller visual may extend its hit area with `::after`). Hover-only effects sit behind `@media (hover:hover) and (pointer:fine)`. Selected options in segmented controls expose their state (`aria-pressed`, set by `65-press.js`).
6. **Any screen.** The layout works from 280 px (folded phones) to 2560 px, in landscape phones and in in-app browsers (WhatsApp, Instagram). Use `clamp()` type, container queries inside components, `svh`/`dvh`, `env(safe-area-inset-*)` (the viewport has `viewport-fit=cover`) and logical properties (`margin-inline`, `inset-inline-start`, `text-align:start`) so an Arabic RTL version is an attribute flip. No horizontal scroll at any width. Labels are never smaller than `--cn-step-label` (12px), on phones too.

## Scoping and naming

- Every rule is scoped under `html.cn` (the class on `<html>`). Legacy styles stay loaded, and this layer wins by specificity and source order (it is the last stylesheet). Use `!important` only to beat a legacy `!important` or an inline style that is purely visual, or for the forced-colours focus outline, and never on `display` or `width` where HAZARDS.md says JS controls them.
- New markup classes start with `cn-`. Component hooks are `data-cn="name"`. State classes are `is-active`, `is-done`, `is-playing`, `is-paused`, `is-in` (revealed), `is-on` (on screen) and `is-live`.
- CSS custom properties are prefixed `--cn-`, so they never collide with legacy variables such as `--bg`.
- Keyframes are prefixed `cn-`.
- The JS bundle is plain ES2019 with no modules. Each file is a self-contained IIFE using `"use strict"`. Shared helpers live on `window.CN` (see JS architecture).

## Tokens (`ui-src/css/00-tokens.css` is the single source)

Colour (dark is the default; a light theme is reserved for the app via `html.cn[data-theme="light"]` and is not designed yet):

| Token | Value | Use |
|---|---|---|
| `--cn-bg` | `#030406` | Page ground (near-black with a cool bias) |
| `--cn-bg-2` | `#07090C` | Alternate band |
| `--cn-surface` | `#0B0F13` | Cards and panels |
| `--cn-surface-2` | `#11161B` | Raised items inside cards, inputs |
| `--cn-surface-3` | `#171D23` | Hover state of raised items |
| `--cn-line` | `rgba(255,255,255,.08)` | Hairlines and card borders |
| `--cn-line-2` | `rgba(255,255,255,.14)` | Stronger borders (secondary buttons, the scan box) |
| `--cn-line-ctl` | `rgba(255,255,255,.34)` | Form-field edges: at least 3:1 against the card (3.3:1 over the field fill), the only edge a field has |
| `--cn-text` | `#F3F6F7` | Primary text |
| `--cn-text-2` | `#9AA5AD` | Secondary text and the grey half of two-tone headlines (8.2:1) |
| `--cn-text-3` | `#7A8690` | Small labels, meta and counters; AA on every surface (5.5:1 on bg, 4.56:1 on surface-3) |
| `--cn-cyan` | `#22D3EE` | Brand signal: primary button, focus, live dot, active tab, Quick Scan identity |
| `--cn-cyan-2` | `#67E8F9` | Cyan text on dark tints, gradient highlight |
| `--cn-ice` | `#E6FBFF` | Brightest highlight in gradients and shaders |
| `--cn-teal` | `#0E7490` | Secondary chart series, deep end of gradients |
| `--cn-deep` | `#083344` | Darkest cyan, tinted backgrounds |
| `--cn-cyan-tint` / `--cn-cyan-line` | `rgba(34,211,238,.10)` / `.35` | Chip and pill backgrounds, link underlines |
| `--cn-iris` / `--cn-iris-2` | `#8B8CFF` / `#B9BAFF` | Second accent (AI): Analysis AI identity, the "AI context" half of the engine, the far end of the brand gradient |
| `--cn-iris-tint` / `--cn-iris-line` / `--cn-iris-deep` | `rgba(139,140,255,.12)` / `.38` / `#2B2A6B` | Iris chip backgrounds, borders, deep washes |
| `--cn-mint` / `--cn-mint-2` | `#5EEAD4` / `#99F6E4` | Recovery identity: progress, ticks, Recovery marks |
| `--cn-mint-tint` / `--cn-mint-line` / `--cn-mint-deep` | `rgba(94,234,212,.12)` / `.38` / `#115E59` | Mint chip backgrounds, borders, the deep end of mint bars |
| `--cn-id`, `--cn-id-2`, `--cn-id-tint`, `--cn-id-line` | cyan by default | The current tool's identity. Each tool page sets them (Quick Scan cyan, Analysis AI iris, Recovery mint); identity marks read them |
| `--cn-grad-brand` | cyan → `#7FB8FF` → iris | The one brand gradient |
| `--cn-grad-sweep` | text → cyan → ice → `#7FB8FF` → iris → text | The hero sweep word (the brand gradient passing through once) |
| `--cn-safe` / `--cn-safe-tint` | `#34D399` / `rgba(52,211,153,.12)` | Verdict: Not a scam / Low risk |
| `--cn-warn` / `--cn-warn-tint` | `#FBBF24` / `rgba(251,191,36,.12)` | Verdict: Can't confirm |
| `--cn-danger` / `--cn-danger-tint` | `#FB7185` / `rgba(251,113,133,.12)` | Verdict: Scam |

How colour is used:
- Black stays the dominant colour. Verdict colours appear only inside results and examples, always with a word (and an icon where there is room). Red, amber and green are never decoration (no verdict-coloured dots on lists of scam types).
- **Cyan** means "scan / signal": the primary button, focus, the live dot, the active tab and Quick Scan's marks. It covers at most about 10% of a screen.
- **Iris** means "AI" (the owner asked for more colour). It marks Analysis AI (its eyebrow, typing caret, usage bar, the AI bubble's inline-start rule), the "AI context" node and its beams in the engine diagram, and the far end of the brand gradient. Never on buttons, focus rings or verdicts.
- **Mint** means "Recovery". It marks Recovery's progress (usage bar, checklist ticks, the timeline fill, plan progress) and the Recovery tile or tab elsewhere. Never a verdict and never on buttons.
- **The brand gradient** (`--cn-grad-brand`, cyan → iris) appears in exactly three kinds of place: the hero sweep word, the Pro plan's beam border, and a few hairline highlights. Never as a fill behind text, never on body copy, never on more than one element per screen.
- Primary buttons stay cyan on every page, whatever the page identity. Together the accents cover at most about 12% of a screen.
- Each tool page opens on a faint, static identity glow (`01-base.css`): a wide radial wash of its accent behind the title (cyan 7%, iris 12%, mint 8%, Learn cyan 6%), fading to nothing before the page's top edge. No blur, no animation.

Type:
- Display and text use **Mona Sans** (variable: `wght` 300–800, `wdth` 75–125, loaded from Google Fonts). Display weight 600, width 100 (headings may use `font-stretch:110%` for the hero only). Tracking is -0.035em at hero size, -0.025em for H2, -0.01em for body.
- **JetBrains Mono** is kept for the wordmark, for numbers in data (always `font-variant-numeric: tabular-nums`), and for a few uppercase tags: eyebrow pills (at most 3 on Home), the "Example" tag (`.cn-ex`), and the operator line. Everything else that is a label uses **Mona Sans small caps style** (`.cn-label`: 12px, 600, uppercase, +0.04em) or sentence case. Uppercase mono everywhere reads as a terminal, the v2 look the owner rejected.
- Stacks (all in `00-tokens.css`): `--cn-font: "Mona Sans", "Mona Sans Fallback", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`; `--cn-font-hero` uses `"Mona Sans Hero Fallback"` instead (for the 600, 110%-wide hero H1); `--cn-font-mono: "JetBrains Mono", "JetBrains Mono Fallback", ui-monospace, …`. The `… Fallback` faces are metric-matched `@font-face` rules on local Arial / Roboto / Courier New (`size-adjust`, `ascent-override`, `descent-override`), so the late web-font swap no longer re-wraps text (cold-load CLS 0.07–0.09 → under 0.006). If a font, weight or width changes, re-measure and update their overrides. Reserve `--cn-font-ar` for Arabic later (`"IBM Plex Sans Arabic"`).
- Scale (fluid between 360 and 1440 px viewports):
  - `--cn-step-hero: clamp(2.5rem, 1.6rem + 4.4vw, 5.5rem)` (40 → 88px), line-height 1.0
  - `--cn-step-h1: clamp(2.125rem, 1.5rem + 2.8vw, 4rem)` (page titles on tool and info pages)
  - `--cn-step-h2: clamp(1.75rem, 1.3rem + 2vw, 3.25rem)` (28 → 52px), line-height 1.05
  - `--cn-step-h3: clamp(1.25rem, 1.1rem + .6vw, 1.625rem)`
  - `--cn-step-lead: clamp(1.0625rem, 1rem + .35vw, 1.3125rem)` (17 → 21px), line-height 1.45
  - `--cn-step-body: 1rem` (16px), line-height 1.55; `--cn-step-small: .875rem`; `--cn-step-label: .75rem` (12px, the floor for any text)
- Headlines are **two-tone**: the lead phrase in `--cn-text`, and the continuation (the `<span>` inside h1/h2) in `--cn-text-2`. One word per page may carry the brand sweep (`.cn-sweep`).
- Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs. Paragraphs are at most 62ch wide.

Space and shape:
- 4px base spacing: `--cn-1` 4px, `--cn-2` 8px, `--cn-3` 12px, `--cn-4` 16px, `--cn-5` 20px, `--cn-6` 24px, `--cn-8` 32px, `--cn-10` 40px, `--cn-12` 48px, `--cn-16` 64px, `--cn-20` 80px, `--cn-24` 96px.
- `--cn-gutter: clamp(1rem, .55rem + 2vw, 2.5rem)` (16 → 40px), plus safe-area insets.
- `--cn-section: clamp(4.5rem, 2.8rem + 7vw, 9rem)` (72 → 144px) vertical padding between home sections.
- Inner pages (everything but Home) start `clamp(40px, 1rem + 3vw, 72px)` under the header and end `clamp(48px, 1.5rem + 3vw, 80px)` above the footer hairline (the footer adds no margin of its own). About and Pricing open with the operator line, so they start `clamp(16px, .5rem + 1vw, 24px)` under the header.
- `--cn-max: 1200px` content width; `--cn-max-wide: 1360px` for the hero stage.
- Radii: `--cn-r-panel` 28px (hero stage, big panels, the support box), `--cn-r-card` 20px, `--cn-r-ctl` 14px (inputs, segmented controls), `--cn-r-pill` 999px.
- Depth: hairlines instead of shadows. One soft shadow token, `--cn-shadow: 0 30px 60px -30px rgba(0,0,0,.7)`, is used only on floating layers (menu sheet, modals, the scan box). Frosted glass (`backdrop-filter`) is used only on the header when the menu sheet is open, on modals and on the cookie bar, never on cards inside `<main>` (cost and readability).

Motion tokens:
- `--cn-ease-out: cubic-bezier(.22,1,.36,1)`; `--cn-ease-in-out: cubic-bezier(.65,0,.35,1)`; `--cn-ease-emph: cubic-bezier(.2,0,0,1)`.
- `--cn-dur-1` 150ms, `--cn-dur-2` 300ms, `--cn-dur-3` 500ms, `--cn-dur-4` 900ms.
- Reveal (`[data-cn-reveal]`, `[data-cn-stagger]`): opacity 0 → 1 with an 18px rise over 700ms `--cn-ease-out`, once, as the element crosses 8% above the bottom of the viewport; siblings stagger 70ms. Hidden "before" states exist only under `html.cn.cn-js`, so content can never get stuck invisible if JS fails.
- Ambient loops use slow co-prime durations (61s, 43s, 29s) so they never visibly repeat. Animate only `transform`, `opacity` and `filter`. Only one continuous loop is visible per viewport, every loop stops off screen, and a loop that runs longer than 5 s has a Pause control.

## Words we use

- Tools: **Quick Scan**, **Analysis AI**, **Recovery** (with "Recovery case" and "Recovery plan"; no "Recovery Mode" in new copy). Usage is counted in "AI analyses".
- Verdicts use the product's own words, the ones results show: **Scam**, **Can't confirm**, **Low risk**, **Not a scam**. Examples never invent another vocabulary ("Likely scam", "High risk").
- Security terms: **two-factor (2FA)**, not "2-step login".
- Illustrative domains use the reserved `.example` or `.invalid` TLDs (never a registrable name); illustrative phone numbers use 555-01xx.
- No em-dashes in new copy. Sentence case for headings, buttons and labels.

## Components (shared look)

- **Primary button** (`.primary-btn` and `.cn-btn`): a cyan pill (`--cn-cyan` background, `#001018` text, 600 weight), height 44px (48px for `.big`), padding 0 22px. Hover: brighter (`--cn-cyan-2`) and a 1px lift. Active: scale(.98). Disabled: 45% opacity, no lift.
- **Focus**: one ring everywhere, a 2px `--cn-cyan` outline 3px off the edge (it follows the radius and survives forced colours). `--cn-focus` (a double box-shadow ring) is only for places where an outline would be clipped. In forced-colours mode `90-a11y.css` forces a `Highlight` outline on every `:focus-visible`, so a component that draws its ring with box-shadow is still visible there.
- **Secondary button** (`.secondary-btn`): transparent with a `--cn-line-2` border, `--cn-text` text, and a subtle surface on hover.
- **Ghost or text button** (`.cn-ghost-btn`, `.inline-link-btn`): text only with an underline on hover. A ghost button with `aria-pressed` is a Pause/Play toggle and draws its own glyph.
- **Pill or chip** (`.pill`, `.cn-chip`, `.cn-eyebrow`): `--cn-cyan-tint` background, `--cn-cyan-2` text, mono 12px uppercase for eyebrows; chips use sentence case in Mona Sans.
- **Label** (`.cn-label`): Mona Sans 12px, 600, uppercase, +0.04em, `--cn-text-2`. **Example tag** (`.cn-ex`): an outlined mono pill, 12px, never cyan.
- **Card** (`.glass` inside `<main>`, `.cn-card`): `--cn-surface` background, 1px `--cn-line` border, `--cn-r-card` radius, padding `clamp(20px, 3cqi, 32px)`. No blur and no glow.
- **Input and textarea**: `--cn-surface-2`, 1px `--cn-line-ctl` border (brighter on hover), `--cn-r-ctl` radius, 16px text (prevents iOS zoom), cyan outline on focus. This neutralises the legacy mono font and cyan glow but keeps the heights JS relies on. Checkbox and radio fallback skin: a 1.5px ring at 44% text (about 4:1), cyan when checked.
- **Segmented control or tabs** (`.detect-tabs`, `.pricing-toggle`, `.recovery-timeline-tab` groups): a `--cn-surface-2` track with the active item as a raised `--cn-surface-3` pill and `--cn-text` text. The cyan underline or dot appears only on the active item. `65-press.js` mirrors the legacy `.active` / `.is-active` class into `aria-pressed` and names the group.
- **Verdict badge** (`.cn-verdict` and the legacy risk outputs): a tint background with a strong text colour and a word. Default danger; `.is-safe` and `.is-warn` variants.
- **Live dot** (`.cn-live-dot`): an 8px cyan dot. Its 2.4s ring pulse (`cn-pulse`) runs twice each time the dot comes into view (`05-reveal.js` toggles `.is-on`), then it is still. Static under reduced motion and off screen. Used only next to live data.
- **Count-up** (`[data-cn-count]`, `50-counters.js`): shows the HTML value at rest. It switches to the start value only when the number is about to enter the viewport, counts once it is clearly inside, and puts the real value back if the visitor scrolls away first.
- **Eyebrow and head** (`.cn-head`): eyebrow, then H2 (two-tone), then a lead paragraph in `--cn-text-2`. Centred on home sections and left-aligned inside tools.
- **Support box** (`.page > .support-box`, `02-components.css`): the help card that ends Home and every tool and info page. One look everywhere: an 860px `--cn-surface` panel, `--cn-r-panel` radius, `clamp(24px, 1rem + 2vw, 40px)` padding, an eyebrow pill, an H3-size title, copy in `--cn-text-2`, then the two actions (full row under 760px). Pages may change only the space above it (`--cn-support-mt`) and, where a layout needs it, its width (`--cn-support-max`); they do not restyle it.
- **Operator line** (`.cn-operator`): "CyberNet AI is operated under Marks Events FZ LLE", the first line of About and Pricing. A centred mono line in 12px uppercase with +0.06em tracking, `--cn-text-2` colour and the entity name in `--cn-text`, a hairline under it and 24px below. Under 560px the entity name takes its own line (a two-line masthead). It is not a banner and not cyan.

## Home page (markup already in `public/index.html`)

1. **Hero** (`.hero#heroSection > .cn-stage`): an inset framed stage (`--cn-max-wide`, `--cn-r-panel`, 1px `--cn-line` border, margins = gutter). Stage: `min-height: min(86svh, 880px)`, except portrait tablets (600–1023px), which use `min(64svh, 760px)` so the tiles and the Live heading reach the first screen; landscape phones put the H1 on one line and drop the lead. Inside it:
   - `canvas[data-cn="shader"]`: a WebGL "signal field", a slow flowing cyan/teal aurora rising from the bottom edge, with a faint iris (AI) crown on the upper reaches of the light (a hue shift; the bright base stays cyan) and a very faint grain, colours from tokens. The WebGL context is created only once Home is the shown page and the stage is on screen (after load + idle, and 1.4 s after a page switch), so deep links such as /recovery never pay for it. The program compiles without blocking (KHR_parallel_shader_compile polled per frame; otherwise compile and link go out on separate frames before the first status query). The fallback (no WebGL, reduced motion, Save-Data, or before JS) is a static CSS radial-gradient composition on `.cn-stage` that looks nearly the same. It renders at DPR ≤ 1.5 and about 30 fps on desktop, and at DPR 0.75 and about 20 fps on phones and tablets (coarse pointer). It pauses off-screen and when the tab is hidden.
   - `.cn-stage-grid`: an ultra-faint 28px dot grid (`rgba(255,255,255,.035)`) masked with a radial fade. It is static.
   - Centred content: the eyebrow (`#heroLearnFeaturesBtn`: a quiet sentence-case button, Mona Sans 14px/500, faint white fill, `--cn-line-2` edge, with a cyan chevron and no live dot, because the live dot means live data and this only opens the walkthrough), the H1 (hero step, two-tone, `--cn-font-hero`; `.cn-sweep` "seconds" runs one brand-gradient sweep, 2.8s, once, 600ms after load), the lead paragraph, then the **scan box**.
   - Scan box (`#cnScanBox`): max-width 720px, `--cn-surface` at 82% over the stage, `--cn-r-panel` radius, and a machined double bezel drawn with box-shadow only (1px `--cn-line-2` edge, a 6px recessed lip, an outer `--cn-line` hairline, a lit top edge, then `--cn-shadow`). "Start scanning" is a button-in-button: a still 30px dark disc with an arrow at the inline end (no hover slide). On phones it fills the row, with the label centred and the disc pinned to the end. A jump to the box (the closing CTA, the skip link on Home) keeps the H1 and the whole box in view (`scroll-margin-block-start`). On focus-within, a soft conic gradient ring (cyan → ice → teal, 1px, plus a 18px blur glow at 35%) fades in. The textarea is transparent, 17px, 2 rows (it grows to 5). The placeholder types and deletes the examples in `data-cn-placeholders` (35ms per character to type, 1.6s hold, 18ms to delete), and stops while focused or non-empty. The row underneath has the small Try chips (Text / Link / QR code; 30px to the eye with a 44px hit area) on the left and the existing buttons on the right (they wrap below on phones). Behaviour (ported from v2): Enter submits, "Start Scanning" with text hands off to Quick Scan and fills it, and the Try chips run a real Quick Scan on `.invalid` examples (`/ui/example-qr.png`).
   - `.cn-hero-recovery`: one line under the box, "Already clicked, paid or shared a code? Get a recovery plan". The action is a `data-page="recovery"` button in mint (`--cn-mint`), with a 44px hit area.
   - Below the stage, `.hero-video-buttons` holds three how-to tiles in their tool colours (Quick Scan cyan, Analysis AI iris, Recovery mint) with a small chevron; they open the existing guide dialog. Columns come from a rem-based container query on `.hero`: 3 in a row from 34rem, 2+1 from 20rem, otherwise 1 per row, so larger text drops columns instead of clipping.
   - `.hero-visual` is `hidden` (legacy globe and shield).
2. **Live** (`.cn-live`): the head, then a 12-column grid. The stats panel (span 6) holds the three real counters (`#liveScansCount` and the others, big tabular numbers) and `.cn-funnel`, three horizontal bars where Scans = 100%, Flagged = threats/scans and Recoveries = recoveries/scans, bars grow from the inline start (Recoveries in mint). The ring card (span 3) shows threats/scans with one decimal, labelled for exactly that ratio. "At a glance" is the third column (span 3). JS polls `/api/public-stats` every 60s while the section is on screen and the tab is visible (at most 10 polls per page view), updates numbers with a short count, writes "Updated hh:mm" into `[data-cn-live-time]`, and adds `.is-live` to the section; the eyebrow dot is grey and still until then. If the API fails, the bars stay empty and the note explains it; no number is ever invented.
3. **Example scan** (`#cnDemo`): a two-column layout (copy and steps on the left at 5/12, console on the right at 7/12), stacked on phones. The console is a product miniature, never a terminal: the top bar reads "Quick Scan", the status and "Example · not a real scan". In sequence, the message types in (if motion is allowed), the phrases between `|` in `data-cn-msg` highlight one by one with an amber underline sweep, the meter fills while its number counts, the verdict badge (product wording) pops in (scale .96 → 1), the three reasons stagger in, and the progress bar fills. Each step on the left lights up in sync, with its bar filling. The full cycle is about 7s, it holds for 3s and then loops while visible; Pause toggles it. Under reduced motion, show the finished state. Per-frame writes go to the one leaf that changes, never to the console container.
4. **Three tools, one flow** (`#cnFlow`): an accessible tabbed reel. Tabs on the left (desktop) or a horizontal scroll-snap row (phones); each tab has a progress line that fills over `data-interval`, in its tool's identity colour. The panels share one grid cell and cross-fade (opacity plus translateY 10px, 450ms); inactive panels are `inert` and `aria-hidden`. Clicking a tab selects it and stops auto-advance. Pause/Play button. Each panel holds a product miniature (an Example verdict card, a chat whose AI bubble streams in word by word, a checklist with a progress ring) and a real `data-page` button. Without JS, all panels show stacked.
5. **How it decides** (`.why-choose`): the head, then `.cn-beams`, an SVG diagram (inputs → Scam rules / AI context → Verdict). The hairline paths carry comet pulses (SVG `stroke-dasharray` dash animation on a 3.6s timeline, staggered) that play ONE run each time the diagram is about half in view: 40-beams.js sets `data-cn-run` and clears it once the diagram has left, so a later visit replays it. Nothing loops (about 4 s). The AI context node, its paths, ports and pulses are iris (`.is-ai`, from the markup or derived from the SVG geometry); the Rules lane and the Verdict stay cyan, and the Verdict node keeps a soft cyan ring. Node labels are words, not data: Mona Sans 500 in sentence case (14px, 17px when the diagram scales down). On narrow screens (container under 560px) the diagram is replaced by a vertical CSS version or scaled with `viewBox` (text stays at least 12px). The four `.why-choose-item`s sit below as a 4→2→1 column grid of quiet hairline rows (a top `--cn-line` hairline, no fill and no box around the icon; the AI point keeps an iris icon).
6. **Everywhere** (`#cnWorld`): the globe on the left and the copy on the right. `#cnGlobe` is a dotted canvas globe (cyan dots on black, a soft limb glow, slow rotation of about 1 rev/60s, 6–8 animated arcs between real city coordinates that draw and fade, labelled as an illustration). It pauses off-screen, has a Pause control, and is a static frame under reduced motion. A Pause button (`.cn-globe-pause`, aria-pressed, the same 36px circle as the hero's) sits in the globe box's bottom-end corner. It freezes the current frame and is hidden under reduced motion and Save-Data. `$442B` (an estimate, with its source cited) counts up once when in view.
7. **Workspace** (`.wow-section`): a quiet band, not a panel. The head, then the three facts as one line of text ('3 Quick Scan types | 15 Threat categories | 5 Evidence types'; the legacy counters animate the numbers; no rings), then a slow CSS marquee of scam-type pills (40s, mask-faded edges) with neutral dots (no verdict colours). The marquee runs only while it is on screen and not paused (55-scrub.js sets `--cn-ticker-play`), pauses on hover for fine pointers, has a Pause toggle, and wraps statically under reduced motion or without JS. Screen readers get one list (the legacy repeats are aria-hidden).
8. **Statement** (`.home-quote`): a very large two-line statement (h2 size). Words brighten from `--cn-text-3` to `--cn-text` as the block scrolls through the viewport (`animation-timeline: view()` where supported, IntersectionObserver steps otherwise). It is not pinned.
9. **Closing actions** (`.cn-close`, under the statement: the primary scan button and the Recovery route), the **support box** (a quiet card, max 860px), then the **limits note** as centred fine print at the very end (no card, 13px, `--cn-text-2`, about 68ch).

## Tool pages (restyle only)

- Tool identity: each tool page sets `--cn-id` / `--cn-id-2` / `--cn-id-tint` (Quick Scan cyan, Analysis AI iris, Recovery mint); the typewriter caret, eyebrow, usage bar and progress marks read them. A 2px iris inline-start rule marks the AI's voice (Analysis AI bubbles, Recovery's update question).
- Each page starts with a header: an eyebrow, the H1 at `--cn-step-h1`, and the lead in `--cn-text-2`, on the page's static identity glow. The Quick Scan, Analysis AI and Recovery titles type out quickly when the page is opened (a typewriter at 28ms per character with a caret in the page's identity colour that fades after 1.2s; the owner asked for this). Use the real title text and keep it accessible: the full text stays in the DOM, and only a visual clip or overlay animates.
- Quick Scan (cyan): the usage meter is a slim bar card. The detect tabs are a segmented control. Panels are cards; inputs are large; result cards use the verdict system; the evidence lists are clean hairline rows.
- Analysis AI (iris): a chat-like workspace with user bubbles on the right (`--cn-surface-3`) and AI bubbles on the left (`--cn-surface-2` with a 2px iris inline-start rule, never cyan), a calm composer and mono metadata. Before the first message the chat pane hugs the welcome bubble.
- Recovery (mint): the one centred tool page, because it opens on an intake form rather than a workspace: one 860px column, with the 'Tick anything' answers as an even 2-column grid. The intake card, then a dashboard of cards with a timeline (vertical line that fills), checklists using native checkboxes with `appearance:none` and a custom tick, progress bars and the Pro upsell as a quiet bordered card. Mind every Recovery hazard.
- Learn: a search bar, filter chips, then lesson cards in a responsive grid (3 → 2 → 1; modules of 4, 7 or 8 lessons use 4 columns when the roadmap is 1080px or wider; the grid never packs densely, so reading order is kept). Each has a mono tag, a title and a summary; expanded lessons must not be clipped (the legacy max-height bug is in HAZARDS.md).
- Pricing: the operator line at the very top, then the head and the Monthly/Yearly segmented toggle. Plan cards sit on a tray: Free, Pro (highlighted with a conic "beam" border in the brand gradient that makes ONE 4.5s lap when Pricing opens, then rests on the top edge; static under reduced motion) and Business, followed by the FAQ and notes.
- About: the operator line at the top, an editorial header, stat row, value cards and the story.

## Chrome and overlays

- **Header** (`.navbar`): in normal flow (not fixed or sticky). Left: the original logo mark and the "Cyber**Net** AI" wordmark (JetBrains Mono 700, "Net" in cyan). Centre: the nav links (14px, `--cn-text-2`, active `--cn-text` with a 4px cyan dot under it; the legacy `#navIndicator` is hidden or restyled). Right: social icons (hidden under 1200px), sign-in and account. On phones (under 1024px) the links collapse into the **Menu** pill (white background, black text, the owner's choice), which opens a full-height sheet (`100dvh`, frosted `--cn-bg` at 92%, large 28px links, safe-area padding). Legacy toggles `.navbar.open` (12-nav.js mirrors it into `html.cn-menu-open`, which locks the page scroll behind the sheet without a root `:has()`), and `cybernet-final-ui-fix.js` rewrites `#mobileMenu` text to Menu/Close and injects `!important` styles, so check HAZARDS.md before styling it.
- **Skip link** (`.cn-skip`, first in `<body>`; styled in `90-a11y.css` so the legal bundle has it too): parked above the page and shown as a white pill only while focused. It jumps to `<main id="cnMain">`; on Home, 20-scanbox.js lands it in the scan box instead.
- **Footer**: a quiet band with a hairline top, the wordmark, the copyright line and the existing links, plus safe-area bottom padding. It adds no top margin; the page's bottom padding sets the gap.
- **Modals** (auth, how-to video, feedback, business, account): a `--cn-surface` sheet, `--cn-r-panel` radius, hairline border, `--cn-shadow`, and a backdrop of `rgba(3,4,6,.72)` with blur(8px). On phones they become bottom sheets (radius only on top, `max-height: 92dvh`, internal scroll). Keep the legacy z-index stack: page < header < consent < modals (auth 1600).
- **Cookie bar**: a compact card at the bottom with safe-area padding. It is the one fixed element allowed, because it is legally required and dismissible.

## JS architecture (`ui-src/js/`)

- `00-core.js` defines `window.CN = { now(), reduced(), saveData(), finePointer(), hidden(), qs, qsa, clamp, lerp, easeOut, inView(el, cb, opts) /* cb(visible, entry); returns stop() */, once(el, fn, opts) /* alias onVisible */, loop(fn) /* {start, stop, running}; suspended while the tab is hidden */, onMotion(cb) /* cb(reduced) on a prefers-reduced-motion change; returns off() */, onVisibility(cb) /* cb(visible); returns off() */, register(name, init, opts) /* opts.eager, opts.margin */, mount(ctx), pause(scope), resume(scope), onReady(fn), later(fn), afterLoad(fn), onPage(cb) }`, and adds `cn-js` to `<html>` (enabling the hidden reveal states). `05-reveal.js` adds `CN.reveal(el)`. Keep this list in step with `00-core.js` whenever a helper is added.
- Start-up is a queue: `onReady`, `later` and `register` run after DOMContentLoaded in ~12 ms slices, each in its own task (never one long task), first in first out; a job that throws is logged and the rest still run. `CN.register(name, init)` starts `init(el)` for every `[data-cn="name"]` when it comes within 200px of the viewport, or from the queue with `{eager: true}` (anything that changes layout). `init` may return `{pause, resume, destroy}`; `CN.pause(scope)` / `CN.resume(scope)` drive those controllers (e.g. the hero Pause). Several modules still keep their own reduced-motion and visibility listeners and their own `onReady` set-up; moving them to `CN.onMotion`, `CN.onVisibility` and `register(..., {eager: true})` is a planned clean-up. Modules whose markup must exist before the visitor reaches them (the reel tabs, the beams diagram, the scrub statement's split words) build that markup at `onReady` and register their motion lazily; the globe registers its canvas hook at `onReady`. Nothing that changes layout is initialised lazily.
- Each file is one module: `05-reveal.js` (reveals, page-switch flag, live-dot visibility), `08-focus.js` (focus containment, Tab wrap, focus return and an Escape fallback for the menu sheet and every dialog; observe-only), `10-shader.js`, `12-nav.js` (menu sheet), `20-scanbox.js` (placeholder typer, Enter key, hand-off, Try chips), `25-live.js`, `30-demo.js`, `35-reel.js`, `40-beams.js`, `45-globe.js`, `50-counters.js`, `55-scrub.js`, `60-typewriter.js` (tool titles), `65-press.js` (press feedback and the pressed state of segmented controls), `70-learn.js`.
- Build: `node scripts/build-ui.mjs` (`npm run build:ui`; esbuild-minified), `--check` (`npm run check:ui`; builds in memory and exits 1 when public/ui is stale, so run it before a deploy), `--dev` (unminified, one marker per source file). Bundles: `cybernet-ui.css` (every CSS partial in name order, for the SPA), `cybernet-ui.js` (every module in name order, each inside its own try/catch so one failing module never stops the rest) and `cybernet-ui-legal.css` (the standalone legal pages and 404: `00-tokens`, `01-base`, `70-legal` and `90-a11y` in full, plus every cookie-bar rule picked from the other partials in source order). A partial that a standalone page needs goes into `LEGAL_PARTIALS` in the build script. Without esbuild, a string-safe fallback minifier is used for CSS and the JS ships unminified (with a warning).
- Bridge rule: modules may click existing buttons and fill existing inputs exactly as a user would (as the v2 hand-off did), and may observe legacy state with MutationObserver (and mirror it into ARIA attributes). They never patch, wrap or replace legacy functions.
- No network calls except `GET /api/public-stats` (live band) and same-origin static assets. Nothing loads from new third-party hosts: the CSP allows only self, cdn.jsdelivr.net and Google Fonts.

## Performance budget and rules

- Lighthouse mobile at least 85, LCP under 2.5s on the simulated slow phone, CLS under 0.05 on a cold load (fonts not cached).
- Transfer size: at most about 45 KB brotli CSS and 20 KB brotli JS for the SPA layer, and 12 KB brotli CSS for the doc pages (legal, 404). One canvas per viewport. No video autoplay.
- `80-perf.css` paints the first block of each page immediately, so `.reveal` must never hide above-the-fold content at load.
- Rules learned from measuring this build (each one caused a real regression):
  - **No broad `:has()` on hot paths.** No `:has()` whose subject is `html`, `body`, `main`, `.page` or a whole section: every DOM change re-checks it against hundreds of elements. Use a class set by JS or select by id instead. A `:has()` on a small component is fine.
  - **Per-frame writes go to one leaf.** Animation code writes `transform`, `opacity` or a custom property on the element that consumes it, never an inherited custom property on a container with many descendants, and never per-frame text or node changes (legacy body-wide MutationObservers react to them). Text updates are throttled to at most one every ~48ms.
  - **Infinite loops stop.** Every infinite CSS animation either pauses off screen (`animation-play-state` or a class toggled by `CN.inView`) or runs a finite number of iterations. Parked at the footer, the main thread should be under 5% busy at 4× CPU throttling.
  - **No lazy init that changes layout.** Lazily started modules may only change paint (opacity, transform, colours, canvas pixels); anything that adds or resizes boxes is built at `onReady`.
  - **Yield during init.** Do not read layout (`getBoundingClientRect`, `offsetWidth`, `scrollWidth`) at init to decide visibility; use the first IntersectionObserver report. Keep each startup task short so the first input is never blocked.
  - **Metric-matched font fallbacks.** Every web font in the stack has a `… Fallback` face tuned with `size-adjust` and the ascent/descent overrides, so the swap does not move text.
  - **content-visibility only where it is safe.** The four heavy below-the-fold Home sections (example scan, reel, engine, globe) use `content-visibility:auto` with `contain-intrinsic-size: auto <measured content height>` (per section, stacked and side-by-side values in `80-perf.css`; re-measure when a section's content changes). Only add it to a block whose content never overflows it (its own padding holds glows and focus rings) and that is never above the fold.

## Updating later

- To change a colour, font or radius, edit `00-tokens.css`. If you change a font, re-tune its fallback face.
- To change copy, edit `public/index.html`; motion reads its text from the markup (`data-cn-msg`, `data-cn-placeholders`). Follow "Words we use".
- To add a home section, add markup with `cn-` classes, a CSS partial and, if it moves, a JS module that registers itself.
- App shell: use the same tokens; `(display-mode: standalone)` styles add top safe-area padding.
