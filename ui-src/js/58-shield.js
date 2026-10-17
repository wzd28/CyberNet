/* Home "What CyberNet AI does" (#cnCore): the shield story, scrubbed by the scroll (v4.5,
   17 Oct 2026; markup and resting look in 28-shield.css, which explains the story).

   How it plays
   - The resting state in CSS is the END of the story (closed, its edge lit, the bright lock
     with a check, the message shown). This file lays the story over it with the Web Animations API, one animation
     per moving part and property (transform or opacity only), all on the same 0..1 progress.
   - Progress is where the shield's centre is on the screen: 0 when it reaches the bottom edge,
     1 when it leaves the top edge (span.cn-sh-mark, a 1px point at the stage's centre, so the
     story keeps the same pace on every screen size). The story runs from .24 (the centre about
     three quarters down the screen) to .675 (the centre about a third down), so every step
     happens with the whole shield in view, and scrolling back plays it backwards. The beats are
     in B below.
   - Where ViewTimeline exists (Chrome, Edge, Safari 26), the animations run on a ViewTimeline of
     that point: the browser drives them on the compositor while scrolling, with no script per
     frame. Elsewhere (Firefox, older Safari) the same animations are created paused and one scroll
     handler, bound only while the section is near the screen, sets their time from one rAF per
     scrolled frame (positions are read in a ResizeObserver callback, so a frame reads only
     scrollY; nothing runs while the page is still).
   - Reduced motion, Pause motion (CN.onStill, or this module's controller pause()) and browsers
     without Element.animate: the animations are cancelled and the CSS end state shows.
   - Set-up is eager (from the start-up queue), so the story's first frame is in place long
     before the visitor scrolls to the section. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var win = window, doc = document;
  var HAS_VT = typeof win.ViewTimeline === "function";

  var IO = "cubic-bezier(.65,0,.35,1)", OUT = "cubic-bezier(.22,1,.36,1)", IN = "cubic-bezier(.6,0,.9,.4)", LIN = "linear";

  /* stops [[progress, value, easing to the next stop], ...] -> keyframes for one property, with
     explicit 0 and 1 frames so the story is the same whatever the CSS underneath says */
  function frame(prop, p, v, e) { var k = { offset: p, easing: e || LIN }; k[prop] = v; return k; }
  function track(prop, stops) {
    var out = [];
    if (stops[0][0] > 0) out.push(frame(prop, 0, stops[0][1]));
    stops.forEach(function (s) { out.push(frame(prop, s[0], s[1], s[2])); });
    var last = stops[stops.length - 1];
    if (last[0] < 1) out.push(frame(prop, 1, last[1]));
    return out;
  }

  /* The story's beats (progress 0..1). They all fall inside the window where the whole figure is
     on screen: on a 1440x900 desktop the shield is fully in view from .27 to .73 and the label
     row, shield and message together from about .42 to .67; on a 390x844 phone the shield from
     .21 to .79. So the shackle lifts at .24, the doors open by .36, the verdict lands at .45, and
     the lock, the lit edge and the message have all landed by .65, with the label row, the
     shield and the message still in frame (and, on phones, before most of the manifesto lights).
     The card sits behind the doors: it comes in while the doors are still all but shut (hidden
     by them) and is revealed as they open; on the way back the doors close over it and it goes
     only when they are a few px from shut, so it is never seen half transparent. */
  var B = {
    unlock: [.24, .27],    /* the shackle lifts (one leg stays in the body) */
    lockOut: [.26, .30],   /* the lock steps back */
    open: [.275, .36],     /* the doors swing open (inwards, hinged at the shield's outer edges) */
    cardIn: [.276, .287],  /* the card is there, still hidden behind the barely open doors */
    cardOut: [.566, .574], /* it goes while the closing doors leave only a hairline between them */
    scan: [.37, .45],      /* the scan light passes down over the card (linear: it is light) */
    flag: [.409, .417],    /* the link turns coral as the light crosses its line */
    verdict: [.434, .445], /* "Checking" becomes "Scam", as the light reaches that row */
    close: [.515, .585],   /* the doors close over the card */
    lockIn: [.555, .59],   /* the lock returns, still open */
    click: [.588, .606],   /* and drops shut */
    solid: [.604, .61],    /* it turns bright, with a check: a quick swap, like a click */
    edge: [.604, .675],    /* the shield's edge lights up, then settles a little brighter */
    msg: [.58, .625]       /* "Let's protect you from a scam." lights up */
  };
  var DOOR = 80;           /* how far the doors open, in degrees */
  var PERSP = "perspective(1300px) rotateY(";

  /* [selector, property, stops] for every moving part */
  function story() {
    var T = "transform", O = "opacity", Z = "translate3d(0,0,0)", list = [];
    function add(sel, prop, stops) { list.push([sel, prop, stops]); }

    /* the lock: the shackle lifts, the lock steps back for the opening, returns and clicks shut */
    var UP = "translate3d(0,-15%,0)";
    add(".cn-sh-shackle", T, [[B.unlock[0], Z, OUT], [B.unlock[1], UP], [B.click[0], UP, IN], [B.click[1], Z]]);
    add(".cn-sh-lock", O, [[B.lockOut[0], 1, IO], [B.lockOut[1], 0], [B.lockIn[0], 0, OUT], [B.lockIn[1], 1]]);
    add(".cn-sh-lock", T, [[B.lockOut[0], "scale(1)", IO], [B.lockOut[1], "scale(.9)"], [B.lockIn[0], "scale(1.06)", OUT], [B.lockIn[1], "scale(1)"]]);
    /* the outline lock swaps for the bright one in about 5px of scroll (a click, so the keyhole
       and the check are never seen together for more than a frame), then the bright lock settles */
    add(".cn-sh-body", O, [[B.solid[0], 1], [B.solid[1] - .001, 0]]);
    add(".cn-sh-solid", O, [[B.solid[0], 0], [B.solid[1], 1]]);
    add(".cn-sh-solid", T, [[B.solid[0], "scale(.94)", OUT], [B.solid[1] + .02, "scale(1)"]]);
    /* the lit edge: up quickly as the lock shuts, then settles to its resting .35 */
    add(".cn-sh-edge", O, [[B.edge[0], 0, OUT], [B.edge[0] + .012, .9, IO], [B.edge[1], .35]]);

    /* the doors (rotateY > 0 turns the left door's free edge away from the viewer) */
    [[".cn-sh-half--l", DOOR], [".cn-sh-half--r", -DOOR]].forEach(function (d) {
      var open = PERSP + d[1] + "deg)", shut = PERSP + "0deg)";
      add(d[0], T, [[B.open[0], shut, IO], [B.open[1], open], [B.close[0], open, IO], [B.close[1], shut]]);
    });

    /* the text inside: it comes forward as the doors open, and settles back as they close over
       it; it is switched off only when they are all but shut (a few px apart), so it is never seen
       half transparent and never glints through the hairline between the shut doors */
    add(".cn-sh-card", O, [[B.cardIn[0], 0], [B.cardIn[1], 1], [B.cardOut[0], 1], [B.cardOut[1], 0]]);
    add(".cn-sh-card", T, [[B.open[0], "translate3d(0,3%,0) scale(.92)", OUT], [B.open[1] + .005, "translate3d(0,0,0) scale(1)"], [B.close[0], "translate3d(0,0,0) scale(1)", IO], [B.close[1], "translate3d(0,1.5%,0) scale(.95)"]]);
    /* the scan light is the bottom edge of a box 46% of the card tall: -100% puts its edge at
       the card's top, 118% at its bottom */
    add(".cn-sh-scan", T, [[B.scan[0], "translate3d(0,-100%,0)"], [B.scan[1], "translate3d(0,118%,0)"]]);
    add(".cn-sh-scan", O, [[B.scan[0], 0], [B.scan[0] + .01, 1], [B.scan[1] - .012, 1], [B.scan[1], 0]]);
    add(".cn-sh-ok", O, [[B.flag[0], 1], [B.flag[1], 0]]);
    add(".cn-sh-bad", O, [[B.flag[0], 0], [B.flag[1], 1]]);
    /* "Checking" goes, then "Scam" comes (they barely overlap, so the words never mix) */
    var V0 = B.verdict[0], V1 = B.verdict[1];
    add(".cn-sh-wait", O, [[V0, 1], [V0 + .005, 0]]);
    add(".cn-sh-res", O, [[V0 + .003, 0, OUT], [V1, 1]]);
    add(".cn-sh-res", T, [[V0 + .003, "translate3d(0,18%,0)", OUT], [V1, Z]]);

    /* the message: its lit copy fades in over the dim words */
    add(".cn-sh-lit", O, [[B.msg[0], 0, IO], [B.msg[1], 1]]);
    return list;
  }

  /* ---- the scroll fallback (no ViewTimeline): one handler for the section ---- */
  function scrollY() { return win.pageYOffset || doc.documentElement.scrollTop || 0; }

  function Shield(fig) {
    var mark = CN.qs(".cn-sh-mark", fig);
    if (!mark || typeof fig.animate !== "function") return null;
    var anims = [], paused = false;
    var near = false, bound = false, raf = 0, top = 0, vh = 0, lastP = -1, ro = null, measured = false, stale = false;

    function build() {
      if (anims.length) return;
      var tl = null;
      if (HAS_VT) { try { tl = new win.ViewTimeline({ subject: mark, axis: "block" }); } catch (e) { tl = null; } }
      story().forEach(function (a) {
        var el = CN.qs(a[0], fig);
        if (!el) return;
        var anim = null;
        try {
          anim = tl ? el.animate(track(a[1], a[2]), { timeline: tl, fill: "both" })
                    : el.animate(track(a[1], a[2]), { duration: 1000, fill: "both" });
        } catch (e) { anim = null; }
        if (!anim) return;
        if (!tl) anim.pause();
        anims.push(anim);
      });
      if (!tl) { lastP = -1; bind(); }
    }
    function clear() {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } });
      anims = [];
      bind();
    }
    function sync() { if (paused || CN.reduced()) clear(); else build(); }

    /* fallback: progress from the cached position of the mark */
    function read() {
      var r = mark.getBoundingClientRect();
      top = r.top + scrollY();
      vh = win.innerHeight || doc.documentElement.clientHeight || 800;
      measured = true; stale = false;
    }
    function seek() {
      raf = 0;
      if (stale) read();              /* only after a resize (layout is dirty then anyway) */
      if (!anims.length || !measured) return;
      var p = CN.clamp((scrollY() + vh - top) / (vh + 1), 0, 1);
      p = Math.round(p * 2000) / 2000;
      if (p === lastP) return;
      lastP = p;
      for (var i = 0; i < anims.length; i++) anims[i].currentTime = p * 1000;
    }
    function onScroll() { if (!raf && bound) raf = win.requestAnimationFrame(seek); }
    function onResize() { stale = true; onScroll(); }
    function bind() {
      var want = near && anims.length > 0 && !HAS_VT;
      if (want && !ro) {
        if ("ResizeObserver" in win) {
          ro = new ResizeObserver(function () { read(); lastP = -1; onScroll(); });
          ro.observe(fig);
          ro.observe(doc.body);   /* anything above that changes height moves the section */
        } else { read(); }
      }
      if (want !== bound) {
        bound = want;
        var f = want ? "addEventListener" : "removeEventListener";
        win[f]("scroll", onScroll, { passive: true });
        win[f]("resize", onResize, { passive: true });
        if (!want && raf) { win.cancelAnimationFrame(raf); raf = 0; }
      }
      if (want) { if (!ro) stale = true; onScroll(); }
    }
    var offs = [CN.onMotion(sync), CN.onStill ? CN.onStill(sync) : null];
    if (!HAS_VT) offs.push(CN.inView(fig, function (vis) { near = !!vis; bind(); }, { margin: "25% 0px" }));
    sync();
    return {
      pause: function () { paused = true; sync(); },
      resume: function () { paused = false; sync(); },
      destroy: function () {
        paused = true; near = false;
        clear();
        if (ro) { ro.disconnect(); ro = null; }
        offs.forEach(function (off) { if (typeof off === "function") off(); });
      }
    };
  }

  CN.register("shield", Shield, { eager: true });
})();
