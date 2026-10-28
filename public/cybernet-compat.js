/*
  CyberNet AI: built-in functions that older browsers lack.

  Loads first on every page that runs the site's scripts. The ad traffic from
  TikTok/Pangle opens the site in news-app WebViews as old as Chrome 69
  (Android 9). scripts/build-legacy.mjs rewrites the newer syntax for them;
  this file adds the newer functions the scripts call, each one only where
  the browser does not have it already:

    globalThis                    Chrome 71
    Object.fromEntries            Chrome 73   script.js page routes
    String.prototype.replaceAll   Chrome 85   account status
    replaceChildren               Chrome 86   sign-in dialog, account screens
    Array/String.prototype.at     Chrome 92   detection engine

  Keep it plain ES2017 with no dependencies. Add a function here when a
  script starts using one that is newer than Chrome 69.
*/
(function () {
  "use strict";
  var define = function (target, name, value) {
    if (target && !(name in target)) Object.defineProperty(target, name, { value: value, configurable: true, writable: true });
  };

  if (typeof globalThis === "undefined") window.globalThis = window;

  define(Object, "fromEntries", function (entries) {
    var result = {};
    Array.from(entries, function (entry) { result[entry[0]] = entry[1]; });
    return result;
  });

  define(String.prototype, "replaceAll", function (search, replacement) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError("replaceAll must be called with a global RegExp");
      return this.replace(search, replacement);
    }
    var pattern = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    return this.replace(pattern, replacement);
  });

  var replaceChildren = function () {
    while (this.lastChild) this.removeChild(this.lastChild);
    if (arguments.length) this.append.apply(this, arguments);
  };
  [window.Element, window.Document, window.DocumentFragment].forEach(function (type) {
    if (type) define(type.prototype, "replaceChildren", replaceChildren);
  });

  var at = function (index) {
    var n = Math.trunc(index) || 0;
    if (n < 0) n += this.length;
    return n < 0 || n >= this.length ? undefined : this[n];
  };
  define(Array.prototype, "at", at);
  define(String.prototype, "at", at);
})();
