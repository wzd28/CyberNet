/* How it decides (.cn-beams[data-cn="beams"]): signal pulses along the diagram and a vertical
   version for narrow containers. The SVG in index.html stays the single source: pulses are cloned
   from its paths and the vertical version reads its node labels, so editing the SVG updates both.
   The whole box is aria-hidden (the four points next to it carry the meaning). Animation is CSS.
   This file builds the extra shapes, tags each path with its lane (.is-in / .is-out, plus .is-ai
   for the AI lane, read from the SVG geometry), adds the gradients the light band strokes them
   with (rules lane into cyan, AI lane into violet, the result lane landing in cyan), and plays ONE
   run each time the diagram scrolls into view: data-cn-run is set once about half of it is visible
   and cleared after it has fully left, so the next visit replays it. Nothing loops (a run is about
   4 s), and reduced motion never starts a run. A data attribute, not a class, because legacy
   observers re-scan the page on every class change. */
(function () {
  "use strict";
  var CN = window.CN;
  if (!CN) return;
  var doc = document, NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    var e = doc.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function htmlEl(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  /* first and last coordinate pair of a path's d attribute (no layout or getTotalLength needed) */
  function ends(d) {
    var n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    if (n.length < 4) return null;
    return { x0: n[0], y0: n[1], x1: n[n.length - 2], y1: n[n.length - 1] };
  }

  function labels(svg, sel) {
    return CN.qsa(sel + " text", svg).map(function (t) { return (t.textContent || "").trim(); }).filter(Boolean);
  }

  /* The AI check: an engine node marked .is-ai in the markup, else the one labelled "AI ...". */
  function aiNode(svg) {
    var engines = CN.qsa(".cn-node-engine", svg);
    for (var i = 0; i < engines.length; i++) if (engines[i].classList.contains("is-ai")) return engines[i];
    for (var j = 0; j < engines.length; j++) {
      var t = CN.qs("text", engines[j]);
      if (t && /\bAI\b/.test(t.textContent || "")) return engines[j];
    }
    return null;
  }

  /* the node's rect in SVG user units, from its translate() and its rect (no layout needed) */
  function nodeBox(g) {
    var r = g && CN.qs("rect", g);
    if (!r) return null;
    var m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(g.getAttribute("transform") || "");
    var tx = m ? +m[1] : 0, ty = m ? +m[2] : 0;
    var x = tx + (+r.getAttribute("x") || 0), y = ty + (+r.getAttribute("y") || 0);
    return { x0: x - 2, y0: y - 2, x1: x + (+r.getAttribute("width") || 0) + 2, y1: y + (+r.getAttribute("height") || 0) + 2 };
  }

  function inBox(b, x, y) { return !!b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; }

  /* Lane gradients (userSpaceOnUse: a straight path has a zero-height box, so objectBoundingBox
     would not paint it). CSS uses them as url(#cnBeamIn) and friends, with a flat fallback. */
  function gradients(svg, span) {
    if (doc.getElementById("cnBeamIn")) return;
    var defs = svgEl("defs", {});
    [["cnBeamIn", span.inn, "#a5b4fc", "#22d3ee"], ["cnBeamInAi", span.inn, "#d8b4fe", "#8b5cf6"],
     ["cnBeamOut", span.out, "#22d3ee", "#06b6d4"], ["cnBeamOutAi", span.out, "#8b5cf6", "#22d3ee"]].forEach(function (g) {
      if (!isFinite(g[1][0]) || !isFinite(g[1][1])) return;
      var lg = svgEl("linearGradient", { id: g[0], gradientUnits: "userSpaceOnUse", x1: g[1][0], y1: 0, x2: g[1][1], y2: 0 });
      lg.appendChild(svgEl("stop", { offset: "0", "stop-color": g[2] }));
      lg.appendChild(svgEl("stop", { offset: "1", "stop-color": g[3] }));
      defs.appendChild(lg);
    });
    svg.insertBefore(defs, svg.firstChild);
  }

  function build(box) {
    var svg = CN.qs("svg", box);
    if (!svg || box.__cnBeamsBuilt) return;
    box.__cnBeamsBuilt = true;

    var vb = (svg.getAttribute("viewBox") || "0 0 960 300").split(/[\s,]+/).map(Number);
    var mid = vb[0] + vb[2] / 2;
    var nodes = CN.qs(".cn-beam-nodes", svg);
    var pulses = svgEl("g", { "class": "cn-beam-pulses" });
    var ports = svgEl("g", { "class": "cn-beam-ports" });
    var seen = {}, kIn = 0, kOut = 0;
    var span = { inn: [Infinity, -Infinity], out: [Infinity, -Infinity] };
    var ai = aiNode(svg), aiBox = nodeBox(ai);
    if (ai) ai.classList.add("is-ai");

    CN.qsa(".cn-beam-paths path", svg).forEach(function (p) {
      var d = p.getAttribute("d");
      var e = d && ends(d);
      if (!e) return;
      var out = e.x0 > mid;
      var k = out ? kOut++ : kIn++;
      /* a path that starts or ends on the AI node belongs to the AI lane */
      var isAi = p.classList.contains("is-ai") || inBox(aiBox, e.x0, e.y0) || inBox(aiBox, e.x1, e.y1);
      if (isAi) p.classList.add("is-ai");
      p.classList.add(out ? "is-out" : "is-in");
      var lane = out ? span.out : span.inn;
      lane[0] = Math.min(lane[0], e.x0, e.x1);
      lane[1] = Math.max(lane[1], e.x0, e.x1);
      ["cn-pulse-tail", "cn-pulse-head"].forEach(function (cls) {
        var c = svgEl("path", { d: d, pathLength: "100", "class": cls + (out ? " is-out" : " is-in") + (isAi ? " is-ai" : "") });
        c.style.setProperty("--k", k);
        pulses.appendChild(c);
      });
      [[e.x0, e.y0, false], [e.x1, e.y1, out]].forEach(function (pt) {
        var key = pt[0] + "," + pt[1];
        if (seen[key]) return;
        seen[key] = true;
        var cls = pt[2] ? "is-out" : inBox(aiBox, pt[0], pt[1]) ? "is-ai" : "";
        ports.appendChild(svgEl("circle", { cx: pt[0], cy: pt[1], r: "3", "class": cls }));
      });
    });
    if (nodes) { svg.insertBefore(pulses, nodes); svg.appendChild(ports); }
    gradients(svg, span);

    /* the Verdict's soft ring and its arrival ping, sized from the node's own rect */
    var outNode = CN.qs(".cn-node-out", svg), r = outNode && CN.qs("rect", outNode);
    if (r) {
      var x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), h = +r.getAttribute("height");
      var rx = +(r.getAttribute("rx") || 0), pad = 7;
      outNode.insertBefore(svgEl("rect", { x: x - pad, y: y - pad, width: w + pad * 2, height: h + pad * 2, rx: rx + pad, "class": "cn-node-ring" }), r);
      outNode.insertBefore(svgEl("rect", { x: x, y: y, width: w, height: h, rx: rx, "class": "cn-node-ping" }), r.nextSibling);
    }

    /* vertical version: inputs -> one box holding both checks -> Verdict */
    var ins = labels(svg, ".cn-node-in"), eng = labels(svg, ".cn-node-engine"), res = labels(svg, ".cn-node-out");
    var aiLabel = ai ? (CN.qs("text", ai).textContent || "").trim() : "";
    if (ins.length && eng.length && res.length) {
      var v = htmlEl("div", "cn-bv");
      v.setAttribute("aria-hidden", "true");
      var rowIn = htmlEl("div", "cn-bv-row cn-bv-in");
      ins.forEach(function (t) { rowIn.appendChild(htmlEl("span", "cn-bv-node", t)); });
      var rowEng = htmlEl("div", "cn-bv-eng");
      eng.forEach(function (t) { rowEng.appendChild(htmlEl("span", "cn-bv-node" + (t === aiLabel ? " is-ai" : ""), t)); });
      var rowOut = htmlEl("div", "cn-bv-row cn-bv-out");
      res.forEach(function (t) { rowOut.appendChild(htmlEl("span", "cn-bv-node", t)); });
      v.appendChild(rowIn);
      v.appendChild(htmlEl("i", "cn-bv-wire"));
      v.appendChild(rowEng);
      v.appendChild(htmlEl("i", "cn-bv-wire"));
      v.appendChild(rowOut);
      box.appendChild(v);
    }
  }

  var RUN = "data-cn-run", ENOUGH = 0.45;

  function init(box) {
    build(box);
    function play(vis, entry) {
      if (!vis) { box.removeAttribute(RUN); return; }  /* fully left: the next visit replays */
      if (box.hasAttribute(RUN) || CN.reduced()) return;
      /* wait until the diagram is properly in view (or fills most of a short viewport) */
      var vh = window.innerHeight || doc.documentElement.clientHeight || 1;
      if (entry && entry.intersectionRatio < ENOUGH && entry.intersectionRect.height < vh * 0.5) return;
      box.setAttribute(RUN, "");
    }
    var stop = CN.inView(box, play, { threshold: [0, 0.25, ENOUGH] });
    return {
      destroy: function () { stop(); box.removeAttribute(RUN); }
    };
  }

  /* build early (cheap) so narrow screens never see the scaled-down SVG first; play lazily */
  CN.onReady(function () { CN.qsa('[data-cn="beams"]').forEach(build); });
  CN.register("beams", init);
})();
