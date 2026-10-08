/* CyberNet v2 - the original CyberNet logo (hexagon shield + lock) in 3D, with a
   threat field: virus particles drift in, hit the shield's force field and are
   neutralised. Loaded on demand on capable desktops; phones get a still image.
   window.CNV2Hero3D = { mount(container) -> Promise<bool>, react('bad'|'ok'), pulse() } */
(function () {
  "use strict";
  var THREE_SRC = "https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js";
  var THREE_SRI = "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";
  var CYAN = "#22d3ee", ICE = "#a5f3fc", TEAL = "#2dd4bf", RED = "#ff4d6d", INK = "#08152a";
  var state = null;

  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = THREE_SRC; s.async = true; s.crossOrigin = "anonymous"; s.integrity = THREE_SRI;
      s.onload = function () { window.THREE ? resolve(window.THREE) : reject(new Error("three missing")); };
      s.onerror = function () { reject(new Error("three failed to load")); };
      document.head.appendChild(s);
    });
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function spring(o, target, dt, k, c) {
    var n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (var i = 0; i < n; i++) { var acc = -k * (o.x - target) - c * o.v; o.v += acc * h; o.x += o.v * h; }
    return o.x;
  }
  function backOut(t) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function out3(t) { return 1 - Math.pow(1 - t, 3); }
  function srgb(T, hex) { return new T.Color(hex).convertSRGBToLinear(); }
  function addBlend(T, m) {
    m.blending = T.CustomBlending; m.blendEquation = T.AddEquation; m.blendSrc = T.SrcAlphaFactor; m.blendDst = T.OneFactor;
    // Glow adds light without touching alpha so it brightens the page behind the canvas;
    // the still-image export needs alpha written or the glow is lost.
    m.blendSrcAlpha = window.CNV2_SNAPSHOT ? T.OneFactor : T.ZeroFactor; m.blendDstAlpha = T.OneFactor;
    return m;
  }
  function canvasTex(T, size, draw) {
    var c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }
  function glowTex(T) {
    return canvasTex(T, 128, function (x) {
      var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.25, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    });
  }
  function virusTex(T) {
    return canvasTex(T, 128, function (x) {
      x.translate(64, 64);
      var g = x.createRadialGradient(0, 0, 4, 0, 0, 30);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.5, "rgba(255,255,255,.75)"); g.addColorStop(1, "rgba(255,255,255,.25)");
      x.strokeStyle = "rgba(255,255,255,.95)"; x.lineWidth = 5; x.lineCap = "round";
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2;
        x.beginPath(); x.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); x.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); x.stroke();
        x.beginPath(); x.arc(Math.cos(a) * 47, Math.sin(a) * 47, 6, 0, 7); x.fillStyle = "rgba(255,255,255,.95)"; x.fill();
      }
      x.beginPath(); x.arc(0, 0, 28, 0, 7); x.fillStyle = g; x.fill();
    });
  }
  function hexTex(T) {
    return canvasTex(T, 512, function (x, n) {
      x.fillStyle = "#020a0d"; x.fillRect(0, 0, n, n);
      var g = x.createRadialGradient(n * .5, n * .38, 20, n * .5, n * .5, n * .7);
      g.addColorStop(0, "rgba(34,211,238,.20)"); g.addColorStop(1, "rgba(34,211,238,0)");
      x.fillStyle = g; x.fillRect(0, 0, n, n);
      x.strokeStyle = "rgba(34,211,238,.22)"; x.lineWidth = 1.6;
      var r = 18, w = Math.sqrt(3) * r;
      for (var row = -1; row < n / (1.5 * r) + 1; row++) {
        for (var col = -1; col < n / w + 1; col++) {
          var cx = col * w + (row % 2 ? w / 2 : 0), cy = row * 1.5 * r;
          x.beginPath();
          for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3, px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); if (k) x.lineTo(px, py); else x.moveTo(px, py); }
          x.closePath(); x.stroke();
        }
      }
    });
  }

  // The logo, in logo units (viewBox 0 0 24 26), mapped to 3D: 22 logo units = 2.6 world units.
  var S = 2.6 / 22;
  function P(x, y) { return [(x - 12) * S, (13 - y) * S]; }
  var HEX = [[12, 2], [21, 6], [20, 15], [12, 24], [4, 15], [3, 6]].map(function (p) { return P(p[0], p[1]); });
  function hexShape(T, scale, dy) {
    var s = new T.Shape();
    HEX.forEach(function (p, i) { var x = p[0] * scale, y = p[1] * scale + (dy || 0); if (i) s.lineTo(x, y); else s.moveTo(x, y); });
    s.closePath();
    return s;
  }
  function roundRect(T, w, h, r) {
    var s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }

  function build(T, canvas) {
    var R = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    R.setClearColor(0x000000, 0);
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.outputEncoding = T.sRGBEncoding;
    var scene = new T.Scene();
    var cam = new T.PerspectiveCamera(30, 1, .1, 100); cam.position.set(0, .05, 8.4);
    scene.add(new T.AmbientLight(0x1d4a55, .9));
    var key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(3, 4, 6); scene.add(key);
    var rimL = new T.PointLight(0x22d3ee, 2.2, 10); rimL.position.set(-2.5, 1.5, 2.5); scene.add(rimL);

    var group = new T.Group(); scene.add(group);

    // shield face: dark smoked glass with a faint hex lattice, like a field generator
    var faceShape = hexShape(T, .88);
    var faceGeo = new T.ExtrudeGeometry(faceShape, { depth: .05, bevelEnabled: false });
    faceGeo.translate(0, 0, -.1);
    var htex = hexTex(T);
    htex.wrapS = htex.wrapT = T.RepeatWrapping; htex.repeat.set(.42, .42); htex.offset.set(.5, .5);
    var face = new T.Mesh(faceGeo, new T.MeshBasicMaterial({ map: htex, transparent: true, opacity: .9, depthWrite: true }));
    group.add(face);

    // shield frame: the logo's cyan outline as a thick neon rim
    var frameShape = hexShape(T, 1);
    frameShape.holes.push(hexShape(T, .86));
    var frameGeo = new T.ExtrudeGeometry(frameShape, { depth: .16, bevelEnabled: true, bevelThickness: .05, bevelSize: .035, bevelSegments: 4, curveSegments: 4 });
    frameGeo.translate(0, 0, -.08);
    var frameMat = new T.MeshStandardMaterial({ color: srgb(T, "#062a32"), emissive: srgb(T, CYAN), emissiveIntensity: .82, metalness: .5, roughness: .3, toneMapped: false });
    group.add(new T.Mesh(frameGeo, frameMat));

    // edge glow: additive fresnel shell on the frame
    var rimU = { c1: { value: srgb(T, CYAN) }, c2: { value: srgb(T, TEAL) }, power: { value: 1.8 }, k: { value: 1.4 } };
    var rimMesh = new T.Mesh(frameGeo, addBlend(T, new T.ShaderMaterial({
      uniforms: rimU, transparent: true, depthWrite: false,
      vertexShader: "varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 c1; uniform vec3 c2; uniform float power; uniform float k; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(1.-abs(dot(normalize(vN),normalize(vV))), power); vec3 c = mix(c2, c1, clamp(vY*.4+.5,0.,1.)); gl_FragColor = linearToOutputTexel(vec4(c*f*k, f)); }"
    })));
    rimMesh.renderOrder = 3; group.add(rimMesh);

    // the lock, as in the logo: solid cyan body, cyan shackle, dark keyhole
    var lockG = new T.Group(); group.add(lockG);
    var bodyGeo = new T.ExtrudeGeometry(roundRect(T, 7.4 * S, 6.2 * S, 1.2 * S), { depth: .2, bevelEnabled: true, bevelThickness: .05, bevelSize: .03, bevelSegments: 5, curveSegments: 16 });
    bodyGeo.center();
    var bodyMat = new T.MeshStandardMaterial({ color: srgb(T, "#0fb5cc"), emissive: srgb(T, CYAN), emissiveIntensity: .42, metalness: .3, roughness: .32, toneMapped: false });
    var body = new T.Mesh(bodyGeo, bodyMat);
    var bodyY = (13 - 15.6) * S;
    body.position.set(0, bodyY, .2); lockG.add(body);
    var shackle = new T.Group(); lockG.add(shackle);
    var shMat = new T.MeshStandardMaterial({ color: srgb(T, "#2fdcf2"), emissive: srgb(T, CYAN), emissiveIntensity: .55, metalness: .6, roughness: .25, toneMapped: false });
    var r0 = 2.4 * S, legLen = 2.3 * S, arcY = (13 - 10.2) * S;
    var arc = new T.Mesh(new T.TorusGeometry(r0, .07, 16, 48, Math.PI), shMat); arc.position.set(0, arcY, .2); shackle.add(arc);
    [-r0, r0].forEach(function (x) { var leg = new T.Mesh(new T.CylinderGeometry(.07, .07, legLen + .06, 16), shMat); leg.position.set(x, arcY - legLen / 2, .2); shackle.add(leg); });
    var inkMat = new T.MeshBasicMaterial({ color: srgb(T, INK) });
    var hole = new T.Mesh(new T.CircleGeometry(1 * S, 32), inkMat); hole.position.set(0, (13 - 15.2) * S, .2 + .162); lockG.add(hole);
    var slot = new T.Mesh(new T.PlaneGeometry(.075, 1.4 * S), inkMat); slot.position.set(0, (13 - 16.6) * S, .2 + .162); lockG.add(slot);

    // force field (geodesic wireframe, flashes when something hits it)
    var fieldGeo = new T.EdgesGeometry(new T.IcosahedronGeometry(2.25, 2));
    var fieldMat = addBlend(T, new T.LineBasicMaterial({ color: srgb(T, CYAN), transparent: true, opacity: .05 }));
    var field = new T.LineSegments(fieldGeo, fieldMat); scene.add(field);

    // glow halo behind the shield
    var gtex = glowTex(T);
    var halo = new T.Sprite(addBlend(T, new T.SpriteMaterial({ map: gtex, color: srgb(T, CYAN), transparent: true, opacity: .26, depthWrite: false })));
    halo.scale.set(4.4, 4.4, 1); halo.position.z = -1.2; scene.add(halo);

    // one orbit ring with a travelling node
    var ring = new T.Mesh(new T.TorusGeometry(2.05, .006, 8, 320), addBlend(T, new T.MeshBasicMaterial({ color: srgb(T, CYAN), transparent: true, opacity: .45, depthWrite: false })));
    ring.rotation.set(1.2, .32, 0); scene.add(ring);
    var node = new T.Sprite(addBlend(T, new T.SpriteMaterial({ map: gtex, color: srgb(T, ICE), transparent: true, opacity: .9, depthWrite: false })));
    node.scale.set(.16, .16, 1); node.position.set(2.05, 0, 0); ring.add(node);

    // dust
    var N = 160, pos = new Float32Array(N * 3), seed = 3;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < N; i++) { var rr = 2.4 + rnd() * 2.2, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1); pos[i * 3] = rr * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = rr * Math.cos(ph) * .8; pos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th) - 1; }
    var pg = new T.BufferGeometry(); pg.setAttribute("position", new T.BufferAttribute(pos, 3));
    var dust = new T.Points(pg, addBlend(T, new T.PointsMaterial({ size: .06, map: gtex, color: srgb(T, CYAN), transparent: true, opacity: .6, depthWrite: false })));
    scene.add(dust);

    // threat field: viruses fly in, hit the field and are neutralised
    var vtex = virusTex(T), viruses = [];
    for (var v = 0; v < 9; v++) {
      var mat = addBlend(T, new T.SpriteMaterial({ map: vtex, color: srgb(T, RED), transparent: true, opacity: 0, depthWrite: false }));
      var sp = new T.Sprite(mat); sp.scale.set(.34, .34, 1); scene.add(sp);
      var flash = new T.Sprite(addBlend(T, new T.SpriteMaterial({ map: gtex, color: srgb(T, CYAN), transparent: true, opacity: 0, depthWrite: false })));
      flash.scale.set(.9, .9, 1); scene.add(flash);
      viruses.push({ s: sp, f: flash, t: -v * .9, dur: 3.2 + rnd() * 2, from: new T.Vector3(), hit: new T.Vector3(), spin: (rnd() - .5) * 2, dead: 0 });
    }
    function respawn(o) {
      var th = rnd() * Math.PI * 2, y = (rnd() - .5) * 2.2;
      o.from.set(Math.cos(th) * 5.4, y, Math.sin(th) * 2 - 1.2);
      o.hit.copy(o.from).normalize().multiplyScalar(2.25);
      o.t = 0; o.dur = 3 + rnd() * 2.2; o.dead = 0;
    }
    viruses.forEach(respawn);

    var pulse = new T.Mesh(new T.RingGeometry(1.55, 1.59, 160), addBlend(T, new T.MeshBasicMaterial({ color: srgb(T, ICE), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })));
    pulse.position.z = .3; scene.add(pulse);

    return { T: T, R: R, scene: scene, cam: cam, group: group, shackle: shackle, field: field, fieldMat: fieldMat, ring: ring, dust: dust, pulse: pulse, halo: halo,
      rimU: rimU, frameMat: frameMat, viruses: viruses, respawn: respawn, w: 0, h: 0, ry: { x: -.35, v: 0 }, rx: { x: .05, v: 0 }, t: 0, born: 0, snapped: false,
      pulseT: -9, fieldHit: 0, reactT: -9, reactCol: srgb(T, CYAN), base1: srgb(T, CYAN), base2: srgb(T, TEAL), tmp: new T.Vector3() };
  }

  function frame(G, dt, mouse, scrollP) {
    var cv = G.R.domElement, w = Math.round(cv.clientWidth), h = Math.round(cv.clientHeight);
    if (!w || !h) return;
    if (w !== G.w || h !== G.h) { G.R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); G.R.setSize(w, h, false); G.cam.aspect = w / h; G.cam.updateProjectionMatrix(); G.w = w; G.h = h; }
    G.t += dt;
    var k = G.t - G.born, ap = clamp(k / 1.1, 0, 1), appear = backOut(ap);
    spring(G.ry, -.35 + mouse.x * .32 + Math.sin(G.t * .5) * .1 + scrollP * 1.0, dt, 34, 10);
    spring(G.rx, .04 + mouse.y * .18 + Math.sin(G.t * .37) * .04 - scrollP * .2, dt, 34, 10);
    G.group.rotation.set(G.rx.x, G.ry.x - (1 - out3(ap)) * 1.5, 0);
    G.group.scale.setScalar(1.12 * (.62 + .38 * appear));
    G.group.position.set(.1, Math.sin(G.t * .9) * .06 + scrollP * .6, 0);
    var sk = clamp((k - .75) / .32, 0, 1);
    G.shackle.position.y = .22 * (1 - backOut(sk));
    if (sk > 0 && !G.snapped) { G.snapped = true; G.pulseT = G.t; }
    var pk = (G.t - G.pulseT) / 1.1;
    if (pk >= 0 && pk <= 1) { G.pulse.visible = true; G.pulse.scale.setScalar((.8 + out3(pk) * 1.1) * G.group.scale.x); G.pulse.material.opacity = (1 - pk) * .7; G.pulse.position.y = G.group.position.y; }
    else G.pulse.visible = false;
    G.ring.rotation.z += dt * .35;
    G.dust.rotation.y += dt * .03;
    G.field.rotation.y += dt * .05;
    // threat field
    var anyHit = 0;
    for (var i = 0; i < G.viruses.length; i++) {
      var o = G.viruses[i];
      o.t += dt;
      if (o.t < 0) { o.s.material.opacity = 0; continue; }
      if (!o.dead) {
        var u = clamp(o.t / o.dur, 0, 1), e = u * u * (3 - 2 * u);
        o.s.position.lerpVectors(o.from, o.hit, e);
        o.s.material.rotation += o.spin * dt;
        o.s.material.opacity = Math.min(1, o.t / .6) * .95 * ap;
        if (u >= 1) { o.dead = G.t; o.f.position.copy(o.hit); anyHit = 1; }
      } else {
        var d = G.t - o.dead;
        o.s.material.opacity = Math.max(0, .95 - d * 5);
        o.s.material.color.copy(G.base1);
        o.f.material.opacity = Math.max(0, 1 - d * 2.2) * .9;
        o.f.scale.setScalar(.5 + d * 1.6);
        if (d > .7) { o.f.material.opacity = 0; o.s.material.color.set(0xff4d6d).convertSRGBToLinear(); G.respawn(o); o.t = -Math.random() * 1.5; }
      }
    }
    if (anyHit) G.fieldHit = 1;
    G.fieldHit = Math.max(0, G.fieldHit - dt * 1.6);
    G.fieldMat.opacity = (.028 + G.fieldHit * .11) * ap;
    var rk = G.t - G.reactT, amt = rk < 0 ? 0 : rk < .35 ? rk / .35 : rk < 2.6 ? 1 : Math.max(0, 1 - (rk - 2.6) / .9);
    G.rimU.c1.value.copy(G.base1).lerp(G.reactCol, amt); G.rimU.c2.value.copy(G.base2).lerp(G.reactCol, amt * .8);
    G.frameMat.emissiveIntensity = .82 + G.fieldHit * .25 + amt * .35;
    G.halo.material.opacity = (.24 + Math.sin(G.t * 1.1) * .05 + G.fieldHit * .08 + amt * .2) * ap;
    G.R.render(G.scene, G.cam);
  }

  function mount(container) {
    if (state) return Promise.resolve(true);
    return loadThree().then(function (T) {
      var canvas = document.createElement("canvas");
      canvas.className = "v2-hero-canvas";
      canvas.setAttribute("aria-hidden", "true");
      container.appendChild(canvas);
      var G = build(T, canvas);
      var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      window.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        mouse.tx = (e.clientX / window.innerWidth - .5) * 2; mouse.ty = (e.clientY / window.innerHeight - .5) * 2;
      }, { passive: true });
      var last = performance.now(), visible = true, raf = 0;
      function kick() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; kick(); }, { threshold: 0 }).observe(container);
      document.addEventListener("visibilitychange", kick);
      function loop(now) {
        raf = 0;
        if (!visible || document.hidden) return;
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        var kk = 1 - Math.exp(-dt * 10); mouse.x += (mouse.tx - mouse.x) * kk; mouse.y += (mouse.ty - mouse.y) * kk;
        var rect = container.getBoundingClientRect();
        frame(G, dt, mouse, clamp(-rect.top / Math.max(1, window.innerHeight), 0, 1.5));
        raf = requestAnimationFrame(loop);
      }
      // compile shaders in an idle slot before the first visible frame to avoid a long freeze
      try { G.R.compile(G.scene, G.cam); } catch (e) {}
      raf = requestAnimationFrame(loop);
      state = G;
      container.classList.add("v2-3d-ready");
      return true;
    }).catch(function (err) {
      if (window.console) console.warn("CyberNet v2: 3D hero unavailable, keeping the still shield.", err && err.message);
      return false;
    });
  }

  window.CNV2Hero3D = {
    mount: mount,
    react: function (kind) { if (!state) return; state.reactT = state.t; state.reactCol.set(kind === "bad" ? RED : "#34f5c5").convertSRGBToLinear(); state.pulseT = state.t + .35; },
    pulse: function () { if (state) state.pulseT = state.t; },
    _state: function () { return state; }
  };
})();
