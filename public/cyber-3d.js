/* ════════════════════════════════════════════════════════════════════
   CYBERNET — 3D MOTION LAYER  (cyber-3d.js)
   ------------------------------------------------------------------
   This file is 100% additive. It never touches script.js, never
   redeclares an existing id/class-driven behavior, and every feature
   in here fails silently + gracefully if something isn't supported
   (no WebGL, reduced-motion, small screen, slow device, etc).

   Contents:
     1. Hero "Cyber Core" — a real Three.js 3D scene: a wireframe
        shield-core, three tilted orbit rings, and a glowing threat
        particle network, with mouse-parallax + idle rotation.
     2. 3D tilt-card interaction system (pure CSS transforms driven
        by mouse position) applied to purely decorative cards only —
        never to cards containing form fields, so nothing you can
        type/click into ever gets touched.
     3. Reduced-motion + no-WebGL fallbacks.
   ════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", () => {
    initHeroCore3D();
    initTiltCards();
  });

  /* ══════════════════════════════════════════════════════════════
     1. HERO CYBER CORE — Three.js scene
     ══════════════════════════════════════════════════════════════ */
  function initHeroCore3D() {
    const canvas = document.getElementById("heroCore3D");
    const heroVisual = canvas ? canvas.closest(".hero-visual") : null;
    if (!canvas || !heroVisual) return;

    // Respect reduced motion: leave the original flat SVG target visible.
    if (prefersReducedMotion) return;

    // No WebGL / Three.js failed to load from CDN → keep the SVG fallback.
    if (typeof THREE === "undefined") {
      console.warn("CyberNet 3D: THREE.js not available, using flat fallback visual.");
      return;
    }

    let scene, camera, renderer, group, coreMesh, glowMesh, particles, lines;
    const rings = [];
    let rafId = null;
    let running = false;
    let mouseTargetX = 0, mouseTargetY = 0;
    let currentX = 0, currentY = 0;

    function buildScene() {
      const w = heroVisual.clientWidth || 500;
      const h = heroVisual.clientHeight || 500;

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.set(0, 0, 7.2);

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);

      group = new THREE.Group();
      scene.add(group);

      // Wireframe icosahedron "shield core"
      const coreGeo = new THREE.IcosahedronGeometry(1.55, 1);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      });
      coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      // Soft inner glow (additive blending fakes a bloom without post-processing)
      const glowGeo = new THREE.IcosahedronGeometry(1.4, 1);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
      });
      glowMesh = new THREE.Mesh(glowGeo, glowMat);
      group.add(glowMesh);

      // Three tilted orbit rings, each spinning at a different rate
      const ringDefs = [
        { radius: 2.5, tube: 0.012, color: 0x00e5ff, rx: 1.15, ry: 0.35, speed: 0.006, opacity: 0.55 },
        { radius: 3.05, tube: 0.009, color: 0x3b82f6, rx: -0.55, ry: 1.05, speed: -0.0042, opacity: 0.4 },
        { radius: 3.6, tube: 0.007, color: 0x60a5fa, rx: 0.3, ry: -1.4, speed: 0.0031, opacity: 0.3 },
      ];
      ringDefs.forEach((def) => {
        const geo = new THREE.TorusGeometry(def.radius, def.tube, 8, 120);
        const mat = new THREE.MeshBasicMaterial({
          color: def.color,
          transparent: true,
          opacity: def.opacity,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = def.rx;
        ring.rotation.y = def.ry;
        ring.userData.speed = def.speed;
        rings.push(ring);
        group.add(ring);
      });

      // Threat particle network — points distributed on a sphere shell
      const COUNT = 80;
      const positions = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        const phi = Math.acos(-1 + (2 * i) / COUNT);
        const theta = Math.sqrt(COUNT * Math.PI) * phi;
        const r = 4.3 * (0.6 + Math.random() * 0.5);
        positions[i * 3] = r * Math.cos(theta) * Math.sin(phi);
        positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particleMat = new THREE.PointsMaterial({
        color: 0x00e5ff,
        size: 0.05,
        transparent: true,
        opacity: 0.85,
      });
      particles = new THREE.Points(particleGeo, particleMat);
      group.add(particles);

      // Faint connecting lines between nearby nodes (network look)
      const linePositions = [];
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = positions[i * 3] - positions[j * 3];
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
          const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 1.65) {
            linePositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            linePositions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
          }
        }
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePositions), 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.14 });
      lines = new THREE.LineSegments(lineGeo, lineMat);
      group.add(lines);
    }

    function onPointerMove(e) {
      const rect = heroVisual.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const py = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      mouseTargetX = px * 0.4;
      mouseTargetY = -py * 0.28;
    }

    function onResize() {
      if (!renderer || !camera) return;
      const w = heroVisual.clientWidth || 500;
      const h = heroVisual.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    function tick() {
      if (!running) return;
      rafId = requestAnimationFrame(tick);

      coreMesh.rotation.y += 0.0026;
      coreMesh.rotation.x += 0.0012;
      glowMesh.rotation.y -= 0.0016;
      rings.forEach((r) => (r.rotation.z += r.userData.speed));
      particles.rotation.y += 0.00085;
      lines.rotation.y += 0.00085;

      currentX += (mouseTargetX - currentX) * 0.045;
      currentY += (mouseTargetY - currentY) * 0.045;
      group.rotation.y = currentX;
      group.rotation.x = currentY;

      renderer.render(scene, camera);
    }

    function start() {
      if (running) return;
      running = true;
      tick();
    }
    function stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    try {
      buildScene();
      window.addEventListener("resize", onResize);
      heroVisual.addEventListener("mousemove", onPointerMove);
      heroVisual.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches && e.touches[0]) onPointerMove(e.touches[0]);
        },
        { passive: true }
      );

      // Reveal the 3D canvas and fade out the flat SVG fallback behind it.
      heroVisual.classList.add("has-3d-core");
      requestAnimationFrame(() => canvas.classList.add("core-ready"));

      // Only animate while the Home page is actually visible (saves GPU/battery
      // when the user is on another tab of the site).
      const homeSection = document.getElementById("home");
      if (homeSection && homeSection.classList.contains("active-page")) start();

      if (homeSection && "MutationObserver" in window) {
        const observer = new MutationObserver(() => {
          if (homeSection.classList.contains("active-page")) start();
          else stop();
        });
        observer.observe(homeSection, { attributes: true, attributeFilter: ["class"] });
      } else {
        start();
      }
    } catch (err) {
      // Any failure (old GPU, blocked WebGL context, etc) → quietly keep the
      // original flat SVG hero visual exactly as it was.
      console.warn("CyberNet 3D: hero core failed to initialize, using flat fallback.", err);
      heroVisual.classList.remove("has-3d-core");
      canvas.style.display = "none";
      stop();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     2. 3D TILT-CARD SYSTEM
     Applied only to purely decorative / informational cards —
     never to elements containing inputs, textareas, or buttons
     that the scam-detection / AI / auth features rely on.
     ══════════════════════════════════════════════════════════════ */
  function initTiltCards() {
    if (prefersReducedMotion) return;

    const SAFE_TILT_SELECTOR = [
      ".floating-card",
      ".price-card",
      ".about-block",
      ".about-value",
      ".wow-stat",
      ".orb-card-box",
    ].join(",");

    const els = document.querySelectorAll(SAFE_TILT_SELECTOR);
    const MAX_TILT_DEG = 10;

    els.forEach((el) => {
      el.classList.add("tilt-3d");
      let rect = null;

      el.addEventListener("mouseenter", () => {
        rect = el.getBoundingClientRect();
        el.classList.add("tilt-active");
      });

      el.addEventListener("mousemove", (e) => {
        if (!rect) rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const rotY = (px - 0.5) * MAX_TILT_DEG;
        const rotX = (0.5 - py) * MAX_TILT_DEG;
        el.style.transform = `perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(4px)`;
        el.style.setProperty("--tilt-glow-x", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--tilt-glow-y", `${(py * 100).toFixed(1)}%`);
      });

      el.addEventListener("mouseleave", () => {
        el.classList.remove("tilt-active");
        el.style.transform = "";
        rect = null;
      });
    });
  }
})();
