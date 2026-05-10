/* ============================================================
   SONY ZV-E10 II — Scroll-driven 3D site
   three.js r128 + GSAP ScrollTrigger + Lenis
   ============================================================ */
(function () {
  "use strict";

  gsap.registerPlugin(ScrollTrigger);

  // ── Capability detection ───────────────────────────────────
  const IS_MOBILE = window.matchMedia("(max-width: 1023px)").matches;
  const HAS_HOVER = window.matchMedia("(hover: hover)").matches;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const REDUCED_DATA = window.matchMedia("(prefers-reduced-data: reduce)").matches;

  // ── Lenis smooth scroll — desktop only ─────────────────────
  // On iOS/Android native momentum scroll is preferred (Apple, Stripe, Vercel pattern)
  if (!IS_MOBILE && !REDUCED_MOTION) {
    const lenis = new Lenis({
      duration: 1.5,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.2,
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // ── three.js setup ──────────────────────────────────────────
  const canvas = document.getElementById("c");
  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(
    38, innerWidth / innerHeight, 0.01, 100
  );
  camera.position.set(0, 0, 2.4);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(innerWidth, innerHeight);
  // Cap DPR aggressively on mobile to avoid 9× pixel rendering on iPhone Pro
  const MAX_DPR = IS_MOBILE ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
  if (renderer.outputColorSpace !== undefined) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  // ── Lights — dramatic top spotlight, dim fill ──────────────
  // Goal: camera reads black but edges/controls catch a studio-style
  // highlight from above. No flat gray-out.
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));

  // Strong overhead "studio" light — the signature top highlight.
  const topSpot = new THREE.SpotLight(0xffffff, 3.0, 15, Math.PI / 4, 0.4, 1.0);
  topSpot.position.set(0.5, 6, 2.0);
  topSpot.target.position.set(0, 0, 0);
  scene.add(topSpot);
  scene.add(topSpot.target);

  // Broad top directional — lifts the top deck so dials/buttons pop.
  const topLight = new THREE.DirectionalLight(0xffffff, 1.5);
  topLight.position.set(0.5, 10, 2);
  scene.add(topLight);

  // Soft front key — keeps lens/sensor visible without flattening body.
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.55);
  keyLight.position.set(3, 3, 6);
  scene.add(keyLight);

  // Cool rim from back-left to separate silhouette from dark bg.
  const rimLight = new THREE.DirectionalLight(0xdde6ff, 0.9);
  rimLight.position.set(-4, 3, -5);
  scene.add(rimLight);

  // ── Env via canvas gradient (no HDRI dep) ──────────────────
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  function gradientEnv() {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#FAFAFA");
    grad.addColorStop(0.5, "#D6D6DC");
    grad.addColorStop(1, "#5A5A62");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const envTex = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    return envTex;
  }
  scene.environment = gradientEnv();

  // ── Model holder group ─────────────────────────────────────
  const modelGroup = new THREE.Group();
  scene.add(modelGroup);

  // Fallback placeholder while GLB loads (or if missing)
  function makePlaceholder() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.75, 0.7),
      new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a, metalness: 0.4, roughness: 0.5,
      })
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.5, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x0a0a0a, metalness: 0.6, roughness: 0.3,
      })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.58;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.025, 16, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0xBBBBBB, metalness: 0.9, roughness: 0.15,
      })
    );
    rim.rotation.y = Math.PI / 2;
    rim.position.z = 0.82;
    g.add(body, lens, rim);
    return g;
  }
  const placeholder = makePlaceholder();
  modelGroup.add(placeholder);

  // ── Load GLB if exists ──────────────────────────────────────
  const loader = new THREE.GLTFLoader();
  loader.load(
    "public/models/sony-zve10.glb",
    (gltf) => {
      const m = gltf.scene;
      // center + scale to ~1.5 unit box
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3()).length();
      const center = box.getCenter(new THREE.Vector3());
      m.position.sub(center);
      const scale = 1.0 / size;
      m.scale.setScalar(scale);
      // Keep the mesh true-black — no gray flattening. Details come
      // from directional light catching reflective surfaces.
      m.traverse((child) => {
        if (child.isMesh && child.material) {
          const mat = child.material;
          if ("metalness" in mat) mat.metalness = 0.55;
          if ("roughness" in mat) mat.roughness = 0.38;
          if ("envMapIntensity" in mat) mat.envMapIntensity = 1.6;
          mat.needsUpdate = true;
        }
      });
      modelGroup.remove(placeholder);
      modelGroup.add(m);
      console.log("[sony] GLB loaded");
    },
    undefined,
    (err) => {
      console.warn("[sony] GLB not yet available, keeping placeholder", err?.message);
    }
  );

  // ── Resize ─────────────────────────────────────────────────
  function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  window.addEventListener("resize", onResize);

  // ── Render loop with mouse parallax — DESKTOP ONLY ────────
  // pointermove fires on touch too, so guard explicitly with hover-capability check
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  if (HAS_HOVER && !REDUCED_MOTION) {
    window.addEventListener("pointermove", (e) => {
      mouse.tx = (e.clientX / innerWidth) * 2 - 1;
      mouse.ty = -((e.clientY / innerHeight) * 2 - 1);
    });
  }

  // scroll-driven state (set by GSAP below) — smooth-lerped in animate()
  const state = {
    rotY: 0,
    rotX: -0.1,
    scale: 1,
    cameraZ: 2.4,
    offX: 0,      // world-space X shift of model (negative = left)
    offY: 0,
    targetScale: 1,
  };
  const target = { ...state };

  function animate() {
    requestAnimationFrame(animate);
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;

    // Lerp state → target so offset/scale transitions read smooth even
    // with scrub snapping.
    const L = 0.08;
    state.offX += (target.offX - state.offX) * L;
    state.offY += (target.offY - state.offY) * L;
    state.rotX += (target.rotX - state.rotX) * L;
    state.targetScale += (target.targetScale - state.targetScale) * L;

    modelGroup.rotation.y = state.rotY + mouse.x * 0.2;
    modelGroup.rotation.x = state.rotX + mouse.y * 0.12;
    modelGroup.scale.setScalar(state.scale * state.targetScale);
    modelGroup.position.set(state.offX, state.offY, 0);
    camera.position.z = state.cameraZ;

    renderer.render(scene, camera);
  }
  animate();

  // ── GSAP ScrollTrigger: continuous hero → end rotation ─────
  // End at 2π so the final CTA frame lands with the camera facing the user.
  gsap.to(state, {
    rotY: Math.PI * 2,
    scale: 0.85,
    cameraZ: 2.2,
    ease: "none",
    scrollTrigger: {
      trigger: "body",
      start: "top top",
      end: "bottom bottom",
      scrub: 1.4,
    },
  });

  // ── Section reveals ────────────────────────────────────────
  gsap.utils.toArray(".upgrade, .block-split, .cta").forEach((el) => {
    gsap.from(el.querySelectorAll(".eyebrow, h2, h3, p, .kv, .buy-btn"), {
      y: 50,
      opacity: 0,
      duration: 1.0,
      stagger: 0.09,
      ease: "expo.out",
      scrollTrigger: {
        trigger: el,
        start: "top 78%",
      },
    });
  });

  // Hero title stagger on load
  gsap.from(".hero-title .line", {
    y: 120, opacity: 0, duration: 1.4, stagger: 0.12, ease: "expo.out",
  });
  gsap.from(".hero-kicker, .hero-sub, .hero-meta", {
    opacity: 0, y: 40, duration: 1.2, delay: 0.5, stagger: 0.08, ease: "expo.out",
  });

  // ── SPLIT-FLIP transitions ─────────────────────────────────
  // Background rotation (gradient angle) + color swap by scroll sections
  const root = document.documentElement;

  // Stage 1: hero white/black horizontal → spec block rotates to vertical
  // On mobile #split-bg uses solid color (CSS), no degree rotation needed
  if (!IS_MOBILE) {
    ScrollTrigger.create({
      trigger: "#specs",
      start: "top 90%",
      end: "top 20%",
      scrub: 0.8,
      onUpdate: (self) => {
        // 180deg (horizontal top/bottom) → 90deg (vertical left/right)
        const deg = 180 - self.progress * 90;
        root.style.setProperty("--split-deg", deg + "deg");
      },
    });
  }

  // Stage 2: per-upgrade — palette swap + camera pose + callout
  // pose.offX: negative = model shifted LEFT (text on right)
  // pose.tilt: additional rotation.x added by state
  const upgrades = gsap.utils.toArray(".upgrade");
  // tilt: additional rotation.x (negative = see TOP, positive = see BOTTOM)
  // scale: model zoom multiplier for this section
  const poses = [
    { palette: { a: "#FFFFFF", b: "#0A0A0A" }, offX: -0.55, tilt: -0.05, scale: 0.85 }, // 01 sensor — face on
    { palette: { a: "#0A0A0A", b: "#FFFFFF" }, offX:  0.55, tilt: -0.55, scale: 0.75 }, // 02 processor — TOP-DOWN (buttons)
    { palette: { a: "#FFFFFF", b: "#0A0A0A" }, offX: -0.55, tilt:  0.15, scale: 0.85 }, // 03 video
    { palette: { a: "#0A0A0A", b: "#FFFFFF" }, offX:  0.55, tilt:  0.40, scale: 0.75 }, // 04 battery — bottom view
  ];

  upgrades.forEach((el, i) => {
    const pose = poses[i] || poses[0];
    ScrollTrigger.create({
      trigger: el,
      start: "top 55%",
      end: "bottom 45%",
      onEnter: () => applyPose(pose, i),
      onEnterBack: () => applyPose(pose, i),
    });
  });

  // Hero: center, face-on
  ScrollTrigger.create({
    trigger: ".hero",
    start: "top top",
    end: "bottom 60%",
    onEnter:     () => setPose({ offX: 0, tilt: -0.05, scale: 0.9 }),
    onEnterBack: () => setPose({ offX: 0, tilt: -0.05, scale: 0.9 }),
  });

  // Specs intro block — center
  ScrollTrigger.create({
    trigger: "#specs",
    start: "top 70%",
    end: "bottom 45%",
    onEnter:     () => setPose({ offX: 0, tilt: -0.1, scale: 0.85 }),
    onEnterBack: () => setPose({ offX: 0, tilt: -0.1, scale: 0.85 }),
  });

  // CTA — final frame: camera face-on to the user, 20-25% larger.
  ScrollTrigger.create({
    trigger: ".cta",
    start: "top 55%",
    end: "bottom 40%",
    onEnter: () => {
      applyPose({ palette: { a: "#FFFFFF", b: "#0A0A0A" }, offX: 0.55, tilt: -0.02, scale: 0.95 }, -1);
    },
    onEnterBack: () => {
      applyPose({ palette: { a: "#FFFFFF", b: "#0A0A0A" }, offX: 0.55, tilt: -0.02, scale: 0.95 }, -1);
    },
  });

  function setPose({ offX, tilt, scale }) {
    target.offX = offX;
    target.rotX = -0.1 + tilt;
    target.targetScale = scale;
  }

  function applyPose(pose, idx) {
    applyPalette(pose.palette, idx);
    setPose(pose);
  }

  function applyPalette(p, idx) {
    gsap.to(root, {
      "--split-bg-a": p.a,
      "--split-bg-b": p.b,
      duration: 0.8,
      ease: "power2.inOut",
      onUpdate: () => {
        // Skip rotation on mobile (split-bg is solid via CSS)
        if (!IS_MOBILE) {
          const deg = (idx % 2 === 0) ? 90 : 270;
          root.style.setProperty("--split-deg", deg + "deg");
        }
      },
    });
    // Toggle body.on-dark when dominant bg is dark
    const dark = p.a === "#0A0A0A";
    document.body.classList.toggle("on-dark", dark);
  }
})();
