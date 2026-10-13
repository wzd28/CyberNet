/* Home hero "signal field" (canvas[data-cn="shader"]).
   A calm WebGL 1 light field: soft cyan/teal curtains rising from the stage's
   bottom edge over --cn-bg, drifting slowly, with a thin ice horizon, a faint
   iris (AI) tint on the upper curtains, a faint shimmer and a whisper of grain
   (it also dithers the gradient). Colours are read from the CSS tokens.
   - No WebGL context exists until Home is the page being shown and the stage is
     on screen, after window load + idle. Deep links (/recovery, /pricing ...)
     never create one; it is built the first time Home actually appears.
   - The program is built without blocking the main thread: with
     KHR_parallel_shader_compile the link status is polled once a frame; without
     it, compile and link go out on separate frames and the first (blocking)
     status query waits until the GPU process has had time to finish.
   - Skipped for reduced motion, Save-Data, no WebGL or a software renderer:
     the static CSS field on .cn-stage stays (it looks nearly the same).
   - Desktop: DPR <= 1.5, about 30 fps. Phones and tablets (coarse pointer):
     DPR .75 (the field is soft, so it upscales invisibly), about 20 fps.
     At most ~1.6M pixels. If frames come in slow it lowers its resolution,
     then gives up and fades back to the CSS field.
   - Pauses off-screen, while Home is not the active page, while the tab is
     hidden (CN.loop) and while the hero's Pause button is pressed.
     Survives a lost WebGL context. */
(function () {
  "use strict";
  var win = window, doc = document, root = doc.documentElement, CN = win.CN;
  if (!CN) return;

  var VS = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}";
  var FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec3 uBg,uDeep,uTeal,uCyan,uIce,uIris;",
    "float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);",
    "  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
    "const mat2 R=mat2(1.6,1.2,-1.2,1.6);",
    "float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=R*p;a*=.5;}return v;}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/uRes;",
    "  float asp=uRes.x/uRes.y,t=uTime,cx=uv.x-.5;",
    /* curtains lean and sway a little more the higher they reach */
    "  float x=cx*max(asp,.9)+(fbm(vec2(uv.y*1.3+t*.02,t*.015+3.1))-.5)*.6*uv.y;",
    /* per-column height of the light: two slow noise layers across x */
    "  float c1=fbm(vec2(x*1.7+t*.018,t*.035));",
    "  float c2=fbm(vec2(x*4.1-t*.011+7.3,t*.05+2.));",
    "  float h=.09+.34*c1*c1+.14*c2*c2;",
    "  float rise=exp(-pow(uv.y/h,1.35));",
    /* domain-warped texture flowing upward inside the light */
    "  float flow=fbm(vec2(x*2.6+c1,uv.y*1.8-t*.06));",
    "  float env=exp(-cx*cx*4.);",
    "  float glow=exp(-cx*cx*8.65-uv.y*6.25);",
    "  float I=rise*env*(.62+.62*flow)+glow*.35;",
    "  float core=exp(-uv.y*30.-cx*cx*7.7);",
    "  vec3 col=uBg;",
    "  col=mix(col,uDeep,smoothstep(0.,.3,I));",
    "  col=mix(col,uTeal,smoothstep(.3,.95,I)*.7);",
    "  col=mix(col,uCyan,smoothstep(.8,1.4,I)*.45);",
    /* iris (AI) at the upper reaches of the light, like the violet crown of
       a real aurora: a hue shift at the same brightness, none at the base,
       so the bright bottom of the field stays cyan */
    "  float lum=dot(col,vec3(.3,.59,.11));",
    "  vec3 irisCol=uIris*(lum/dot(uIris,vec3(.3,.59,.11)));",
    "  col=mix(col,irisCol,smoothstep(.1,.46,uv.y)*smoothstep(.02,.25,I)*.75);",
    "  col=mix(col,uIce,core*.3);",
    /* a faint shimmer line drifting up through the light every ~14 s */
    "  float y0=fract(t/14.)*1.2-.1;",
    "  col+=uIce*exp(-pow((uv.y-y0)/.012,2.))*.02*I;",
    /* grain: +-1/255, changes every frame (also kills banding) */
    "  col+=(hash(gl_FragCoord.xy+fract(t*7.)*91.)-.5)*(2./255.);",
    "  gl_FragColor=vec4(col,1.);",
    "}"
  ].join("\n");

  var TOKENS = { uBg: "--cn-bg", uDeep: "--cn-deep", uTeal: "--cn-teal", uCyan: "--cn-cyan", uIce: "--cn-ice", uIris: "--cn-iris" };
  var FALLBACK = { uBg: "#030406", uDeep: "#083344", uTeal: "#0e7490", uCyan: "#22d3ee", uIce: "#e6fbff", uIris: "#8b8cff" };
  var MAX_PX = 1600000;      /* drawing-buffer pixel cap */
  var DPR_FINE = 1.5;        /* desktop and laptop */
  var DPR_COARSE = .75;      /* phones and tablets: a soft field upscales invisibly */
  var FRAME_MS = 32;         /* ~30 fps on desktop: the field moves slowly */
  var FRAME_MS_COARSE = 48;  /* ~20 fps on phones and tablets */
  var LINK_WAIT_MS = 320;    /* no parallel-compile extension: time the GPU process gets before the first status query */
  var LINK_GIVEUP_MS = 12000;
  var SETTLE_MS = 1400;      /* after Home is opened from another page */
  var T0 = 45;               /* start time (s): a balanced first frame that matches the CSS field */

  function parseColor(str) {
    str = String(str || "").trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(str);
    if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    return null;
  }

  function hasWebGL() {
    try { return !!(win.WebGLRenderingContext && doc.createElement("canvas").getContext); } catch (e) { return false; }
  }

  var idle = win.requestIdleCallback ? function (f) { win.requestIdleCallback(f, { timeout: 1200 }); } : function (f) { setTimeout(f, 120); };

  CN.register("shader", function (canvas) {
    if (CN.reduced() || CN.saveData() || !hasWebGL()) return null;

    var stage = canvas.parentNode || canvas;
    var home = doc.getElementById("home");
    var gl = null, prog = null, buf = null, loc = {}, par = null, gen = 0;
    var cw = 0, ch = 0, quality = 1;
    var loaded = false, queued = false, deepTimer = 0, pageSeen = false, switchedAt = -1e9;
    var visible = false, ready = false, dead = false, lost = false, dirty = true, held = false;
    var simT = T0 * 1000, acc = 0, lastDraw = 0;
    var slow = { n: 0, sum: 0, warm: 0 };
    var stopView = null, ro = null;
    var coarse = !!(win.matchMedia && win.matchMedia("(pointer: coarse)").matches);
    var frameMs = coarse ? FRAME_MS_COARSE : FRAME_MS;
    var slowMs = Math.max(50, frameMs * 1.55);
    var mqReduce = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var loop = CN.loop(frame);

    /* the hero's Pause button (20-scanbox.js) holds the field on its last
       frame; listened for from the start, so a press before load counts */
    held = !!(stage.classList && stage.classList.contains("is-paused"));
    stage.addEventListener("cn-hero-motion", function (e) {
      held = !!(e.detail && e.detail.paused);
      if (held) pause(); else play();
    });

    /* ---- when may the field exist? ---- */
    /* Home is the page being shown: active, not fading out, not hidden by the
       deep-link guard (index.html head), and laid out. */
    function homeShown() {
      return !!home && home.classList.contains("active-page") && !home.classList.contains("leaving") &&
        !root.classList.contains("cn-deep") && canvas.clientWidth > 0;
    }
    function maybe() {
      if (gl || dead || queued || !loaded || !visible || CN.reduced() || CN.saveData()) return;
      if (!homeShown()) {
        /* the guard's 4 s fallback can reveal Home without any page switch */
        if (root.classList.contains("cn-deep") && !deepTimer) deepTimer = setTimeout(function () { deepTimer = 0; maybe(); }, 4300);
        return;
      }
      /* right after a page switch the GPU process is busy painting the new
         page; context creation would wait on it, so let the swap settle */
      queued = true;
      setTimeout(function () {
        idle(function () {
          queued = false;
          if (!gl && !dead && visible && homeShown() && !CN.reduced()) begin();
        });
      }, Math.max(0, SETTLE_MS - (CN.now() - switchedAt)));
    }

    /* ---- build the program without blocking ---- */
    function compileShader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    /* done(ok) once linked; no status is read until the work is finished */
    function build(done) {
      var my = ++gen, vs = null, fs = null, t0 = 0;
      function stale() { return my !== gen || dead || lost || !gl || gl.isContextLost(); }
      function check() {
        if (stale()) return;
        var waited = CN.now() - t0;
        if (par) {
          if (waited < LINK_GIVEUP_MS && !gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR)) { requestAnimationFrame(check); return; }
        } else if (waited < LINK_WAIT_MS) {
          setTimeout(check, LINK_WAIT_MS - waited);
          return;
        }
        var ok = !!gl.getProgramParameter(prog, gl.LINK_STATUS);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        done(ok);
      }
      function link() {
        if (stale()) return;
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        t0 = CN.now();
        if (par) requestAnimationFrame(check); else check();
      }
      vs = compileShader(gl.VERTEX_SHADER, VS);
      fs = compileShader(gl.FRAGMENT_SHADER, FS);
      /* without the extension the compile may run on this thread: link next frame */
      if (par) link(); else requestAnimationFrame(link);
    }

    /* buffers and uniforms, once the program is linked (cheap) */
    function prepare() {
      gl.useProgram(prog);
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var a = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      loc.res = gl.getUniformLocation(prog, "uRes");
      loc.time = gl.getUniformLocation(prog, "uTime");
      var cs = win.getComputedStyle(root);
      Object.keys(TOKENS).forEach(function (u) {
        var rgb = parseColor(cs.getPropertyValue(TOKENS[u])) || parseColor(FALLBACK[u]);
        gl.uniform3f(gl.getUniformLocation(prog, u), rgb[0], rgb[1], rgb[2]);
      });
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      cw = ch = 0;
      dirty = true;
    }

    /* Size the drawing buffer from the canvas box. Returns false while hidden. */
    function size() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      var dpr = (coarse ? DPR_COARSE : Math.min(win.devicePixelRatio || 1, DPR_FINE)) * quality;
      if (w * h * dpr * dpr > MAX_PX) dpr = Math.sqrt(MAX_PX / (w * h));
      var bw = Math.max(1, Math.round(w * dpr)), bh = Math.max(1, Math.round(h * dpr));
      if (bw !== cw || bh !== ch) {
        cw = canvas.width = bw;
        ch = canvas.height = bh;
        gl.viewport(0, 0, bw, bh);
        gl.uniform2f(loc.res, bw, bh);
      }
      dirty = false;
      return true;
    }

    function draw() {
      if (!gl || !ready || lost || dead) return;
      if (dirty && !size()) return;
      gl.uniform1f(loc.time, (simT / 1000) % 3600);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* Slow-frame guard: average the gap between drawn frames. */
    function watch(gap) {
      if (gap > 400) return; /* a stall (tab switch, page swap), not the shader */
      if (slow.warm < 30) { slow.warm += 1; return; } /* let start-up work settle first */
      slow.n += 1; slow.sum += gap;
      if (slow.n < 45) return;
      var avg = slow.sum / slow.n;
      slow.n = slow.sum = 0;
      if (avg < slowMs) return;
      if (quality > .55) { quality = Math.max(.5, quality * .72); dirty = true; return; }
      giveUp();
    }

    function frame(t, dt) {
      acc += dt;
      if (acc < frameMs - 2) return;
      simT += acc;
      acc = 0;
      if (lastDraw) watch(t - lastDraw);
      lastDraw = t;
      draw();
    }

    function play() {
      if (!ready || dead || lost || held || !visible || (mqReduce && mqReduce.matches)) return;
      lastDraw = 0; acc = frameMs;
      loop.start();
    }
    function pause() { loop.stop(); lastDraw = 0; }

    function giveUp() {
      dead = true;
      gen += 1;
      pause();
      canvas.classList.remove("is-live");
    }

    function onLost(e) { e.preventDefault(); lost = true; ready = false; gen += 1; pause(); }
    function onRestored() {
      lost = false;
      if (!dead && gl) build(built);
    }

    function onReduce() {
      if (mqReduce.matches) { pause(); canvas.classList.remove("is-live"); }
      else if (ready && !dead) { draw(); canvas.classList.add("is-live"); play(); }
      else maybe();
    }

    function begin() {
      var opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false,
        preserveDrawingBuffer: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true };
      try { gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts); } catch (e) { gl = null; }
      if (!gl) { dead = true; return; }
      canvas.addEventListener("webglcontextlost", onLost, false);
      canvas.addEventListener("webglcontextrestored", onRestored, false);
      try { par = gl.getExtension("KHR_parallel_shader_compile"); } catch (e) { par = null; }

      build(built);
    }

    /* the program is linked (first build, or again after a lost context) */
    function built(ok) {
      if (!ok) {
        giveUp();
        var ext = gl && gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
        return;
      }
      prepare();
      ready = true;
      if (!ro) {
        if ("ResizeObserver" in win) {
          ro = new ResizeObserver(function () { dirty = true; if (!loop.running()) draw(); });
          ro.observe(canvas);
        } else {
          ro = { disconnect: function () {} };
          win.addEventListener("resize", function () { dirty = true; }, { passive: true });
        }
      }
      /* first frame, then the fade-in (next frame so the transition runs) */
      draw();
      requestAnimationFrame(function () {
        if (!dead && !lost && !(mqReduce && mqReduce.matches)) canvas.classList.add("is-live");
      });
      play();
    }

    if (mqReduce) {
      if (mqReduce.addEventListener) mqReduce.addEventListener("change", onReduce);
      else if (mqReduce.addListener) mqReduce.addListener(onReduce);
    }
    /* on screen (and Home shown, since a hidden page never intersects) */
    stopView = CN.inView(stage, function (vis) {
      visible = vis;
      if (!vis) { pause(); return; }
      if (ready) play(); else maybe();
    });
    CN.onPage(function (id) {
      if (pageSeen) switchedAt = CN.now();
      pageSeen = true;
      if (id === "home") maybe();
    });
    CN.afterLoad(function () { loaded = true; maybe(); });

    return {
      pause: pause,
      resume: play,
      destroy: function () {
        giveUp();
        clearTimeout(deepTimer);
        if (stopView) stopView();
        if (ro) ro.disconnect();
        if (mqReduce) {
          if (mqReduce.removeEventListener) mqReduce.removeEventListener("change", onReduce);
          else if (mqReduce.removeListener) mqReduce.removeListener(onReduce);
        }
        var ext = gl && gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
        gl = null;
      }
    };
  });
})();
