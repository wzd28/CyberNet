/* CyberNet AI error reporter. Tiny, no dependencies.
   Sends a short, scrubbed summary of uncaught browser errors to /api/client-error
   (same origin) so they reach the owner instead of disappearing.
   Sent: message, stack (at most 2 KB), file:line:col, the page path without its
   query or hash, the UI bundle version, the browser family and a timestamp.
   Never sent: anything typed into the page, page content, cookies, storage,
   emails, tokens or query strings.
   At most 5 reports per page load, each distinct error once. Extension errors,
   cross-origin "Script error." and the harmless ResizeObserver loop warning are
   ignored. Manual reports: window.CN_reportError(error, "what was happening"). */
(function () {
  "use strict";
  if (window.CN_reportError) return;

  var ENDPOINT = "/api/client-error";
  var MAX_REPORTS = 5;
  var MAX_BYTES = 7800;
  var sent = 0;
  var seen = {};
  var busy = false;
  var origin = location.origin;
  var EXTENSION = /\b(?:chrome|moz|safari|safari-web|ms-browser)-extension:\/\/|webkit-masked-url:/i;

  // Origin + path only; a trailing :line:col is kept. Same-origin URLs lose the origin.
  function cleanUrl(url) {
    var m = /^(.*?)((?::\d+){1,2})$/.exec(url);
    var base = (m ? m[1] : url).split(/[?#]/)[0];
    if (base.indexOf(origin + "/") === 0) base = base.slice(origin.length);
    return base + (m ? m[2] : "");
  }

  function scrub(text, max) {
    text = String(text == null ? "" : text).slice(0, max * 2 + 64);
    text = text
      .replace(/\b(?:https?|wss?):\/\/[^\s"'<>()[\]{}`,]+/gi, cleanUrl)
      .replace(/\b(?:data|blob):[^\s"'<>()]+/gi, "<data-url>")
      .replace(/(^|[\s(@"'=])(\/[^\s?#"'<>()]*)[?#][^\s"'<>()]*?((?::\d+){1,2})?(?=$|[\s"'<>()])/g, "$1$2$3")
      .replace(/[A-Z0-9._%+-]{1,64}(?:@|%40)[A-Z0-9-]{1,63}(?:\.[A-Z0-9-]{1,63}){0,8}\.[A-Z]{2,24}/gi, "<email>")
      .replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*)?/g, "<token>")
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 <token>")
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, function (m) { return /\d/.test(m) && /[A-Za-z]/.test(m) ? "<token>" : m; })
      .replace(/(^|[^\w:./#-])(\+?\d(?:[\s().-]{0,2}\d){7,})(?!\w)/g, "$1<number>");
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  function uiVersion() {
    var el = document.querySelector('script[src*="/ui/cybernet-ui.js"], link[href*="/ui/cybernet-ui"]');
    var src = el ? el.getAttribute("src") || el.getAttribute("href") || "" : "";
    var m = /[?&]v=([\w.-]{1,32})/.exec(src);
    return m ? m[1] : "";
  }

  function browserFamily() {
    var ua = navigator.userAgent || "", m, b = "Other";
    if ((m = /Edg(?:e|A|iOS)?\/(\d+)/.exec(ua))) b = "Edge " + m[1];
    else if ((m = /OPR\/(\d+)/.exec(ua))) b = "Opera " + m[1];
    else if ((m = /SamsungBrowser\/(\d+)/.exec(ua))) b = "Samsung Internet " + m[1];
    else if ((m = /(?:CriOS|Chrome)\/(\d+)/.exec(ua))) b = "Chrome " + m[1];
    else if ((m = /(?:FxiOS|Firefox)\/(\d+)/.exec(ua))) b = "Firefox " + m[1];
    else if ((m = /Version\/(\d+).*Safari/.exec(ua))) b = "Safari " + m[1];
    var os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android"
      : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
    return b + " on " + os;
  }

  function post(body) {
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
    } catch (e) { /* fall back to fetch */ }
    try {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" } })["catch"](function () {});
    } catch (e) { /* nothing else to try */ }
  }

  function byteLength(text) {
    try { return new Blob([text]).size; } catch (e) { return text.length * 3; }
  }

  function report(kind, err, message, file, line, col, where) {
    if (busy || sent >= MAX_REPORTS) return;
    busy = true;
    try {
      var name = "Error", stack = "";
      if (err && typeof err === "object") {
        if (typeof err.name === "string") name = err.name;
        if (!message && typeof err.message === "string") message = err.message;
        if (typeof err.stack === "string") stack = err.stack;
      } else if (typeof err === "string" && !message) {
        message = err;
      }
      if (!message) message = kind === "rejection" ? "Unhandled promise rejection (not an Error)" : "Unknown error";
      message = String(message).replace(/^Uncaught\s+/, "");

      // Noise: extensions, muted cross-origin errors, other sites' scripts, ResizeObserver.
      if (/ResizeObserver loop/i.test(message)) return;
      if (/^Script error\.?$/i.test(message) && !file) return;
      if (EXTENSION.test(file || "") || EXTENSION.test(stack.split("\n").slice(0, 3).join("\n"))) return;
      if (file && /^[a-z][\w+.-]*:\/\//i.test(file) && file.indexOf(origin + "/") !== 0 && stack.indexOf(origin + "/") === -1) return;

      var key = [kind, message, file || "", line || 0, col || 0].join("|");
      if (seen[key]) return;
      seen[key] = 1;

      var payload = {
        kind: kind,
        name: /^[A-Za-z_$][\w$.]{0,59}$/.test(name) ? name : "Error",
        message: scrub(message, 500),
        stack: scrub(stack, 2048),
        file: file ? scrub(cleanUrl(String(file)), 300) : "",
        line: line > 0 ? Math.floor(line) : undefined,
        col: col > 0 ? Math.floor(col) : undefined,
        page: scrub(location.pathname, 200),
        version: uiVersion(),
        ua: browserFamily(),
        ts: new Date().toISOString(),
        where: where ? scrub(typeof where === "string" ? where : where.where || "", 80) : undefined
      };
      var body = JSON.stringify(payload);
      if (byteLength(body) > MAX_BYTES) { payload.stack = payload.stack.slice(0, 600); body = JSON.stringify(payload); }
      if (byteLength(body) > MAX_BYTES) { payload.stack = ""; body = JSON.stringify(payload); }
      sent += 1;
      post(body);
    } catch (e) {
      /* the reporter must never cause an error of its own */
    } finally {
      busy = false;
    }
  }

  window.addEventListener("error", function (event) {
    // Failed image/script loads fire on the element, not as page errors.
    if (!event || (event.target && event.target !== window)) return;
    report("error", event.error, event.message, event.filename, event.lineno, event.colno);
  });

  window.addEventListener("unhandledrejection", function (event) {
    report("rejection", event ? event.reason : null);
  });

  window.CN_reportError = function (err, context) {
    report("manual", err, null, null, null, null, context);
  };
})();
