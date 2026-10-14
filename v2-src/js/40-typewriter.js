/* Page titles type themselves out when Quick Scan, Analysis AI or Recovery is opened
   from a button. The title text never changes: each character is wrapped once at
   start-up and the typing is a CSS reveal, so nothing rewrites the DOM per frame.
   The first page load shows the title at once (it is the largest text on screen). */
(function () {
  "use strict";
  var PAGES = ["cybernet", "cybernetai", "recovery"];
  var titles = {};

  function wrap(node, into, state) {
    Array.prototype.slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        Array.from(n.textContent).forEach(function (ch) {
          var s = document.createElement("span");
          s.className = "v2-tw-ch";
          s.setAttribute("aria-hidden", "true");
          s.style.setProperty("--i", state.i++);
          s.textContent = ch;
          into.appendChild(s);
        });
      } else if (n.nodeType === 1) {
        var clone = n.cloneNode(false);
        into.appendChild(clone);
        wrap(n, clone, state);
      }
    });
  }

  PAGES.forEach(function (id) {
    var h = document.querySelector("#" + id + " .feature-page-header h1");
    if (!h || h.querySelector(".v2-tw-ch")) return;
    var label = h.textContent.replace(/\s+/g, " ").trim();
    var state = { i: 0 };
    var frag = document.createDocumentFragment();
    wrap(h, frag, state);
    h.textContent = "";
    h.appendChild(frag);
    h.setAttribute("aria-label", label);
    h.style.setProperty("--n", state.i);
    titles[id] = { el: h, n: state.i };
  });

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function play(id) {
    var t = titles[id];
    if (!t) return;
    var h = t.el;
    h.classList.remove("v2-typing");
    void h.offsetWidth;
    h.classList.add("v2-typing");
    clearTimeout(h._v2tw);
    h._v2tw = setTimeout(function () { h.classList.remove("v2-typing"); }, 260 + t.n * 26 + 1400);
  }

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-page]");
    if (!b) return;
    var id = b.getAttribute("data-page");
    if (PAGES.indexOf(id) < 0) return;
    // script.js swaps pages after a 300 ms fade; start typing as the page appears.
    setTimeout(function () { play(id); }, 300);
  });
})();
