import { useEffect, useRef } from "react";
const C = {
  teal:      [27,  187, 158],
  tealBright:[45,  212, 191],
  tealDim:   [14,  120, 100],
  amber:     [232, 168,  56],
  amberBright:[255,200,  80],
  amberDim:  [160, 100,  20],
  deep:      [8,     8,   9],
  violet:    [120,  80, 200],
};

const rgba  = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => Math.random() * (b - a) + a;


function makeBlobs(W, H) {
  return [
    // primary teal hero — big, bright
    { cx: W*.68, cy: H*.22, rx: W*.52, ry: H*.52, color: C.tealBright, alpha: .18, phase: 0,   spd: .00028 },
    // amber counterpoint
    { cx: W*.22, cy: H*.72, rx: W*.44, ry: H*.44, color: C.amber,      alpha: .16, phase: 1.2, spd: .00020 },
    // deep teal low-left anchor
    { cx: W*.10, cy: H*.38, rx: W*.36, ry: H*.40, color: C.teal,       alpha: .14, phase: 2.4, spd: .00034 },
    // amber top-right accent
    { cx: W*.86, cy: H*.14, rx: W*.32, ry: H*.28, color: C.amberBright, alpha: .12, phase: 0.7, spd: .00018 },
    // violet mid mystery
    { cx: W*.52, cy: H*.56, rx: W*.38, ry: H*.38, color: C.violet,     alpha: .09, phase: 3.1, spd: .00014 },
    // wide teal veil
    { cx: W*.50, cy: H*.50, rx: W*.72, ry: H*.66, color: C.teal,       alpha: .06, phase: 5.0, spd: .00010 },
    // small bright teal spark top-centre
    { cx: W*.50, cy: H*.05, rx: W*.18, ry: H*.22, color: C.tealBright, alpha: .14, phase: 4.3, spd: .00036 },
    // amber bottom-right warmth
    { cx: W*.90, cy: H*.88, rx: W*.26, ry: H*.30, color: C.amber,      alpha: .13, phase: 2.0, spd: .00025 },
  ];
}

function makeWaves() {
  return [
    { amp: 55,  freq: .0028, spd: .00038, yF: .30, color: C.tealBright, alpha: .14, lw: 1.8, phase: 0   },
    { amp: 38,  freq: .0036, spd: .00052, yF: .42, color: C.teal,       alpha: .18, lw: 1.2, phase: 1.5 },
    { amp: 70,  freq: .0022, spd: .00028, yF: .55, color: C.amber,      alpha: .10, lw: 2.4, phase: 2.8 },
    { amp: 45,  freq: .0040, spd: .00060, yF: .65, color: C.teal,       alpha: .13, lw: 1.0, phase: 0.8 },
    { amp: 85,  freq: .0016, spd: .00018, yF: .76, color: C.tealDim,    alpha: .11, lw: 3.0, phase: 4.2 },
    { amp: 55,  freq: .0030, spd: .00044, yF: .87, color: C.amber,      alpha: .12, lw: 1.6, phase: 1.1 },
  ];
}

function makeParticles(count, W, H) {
  return Array.from({ length: count }, () => ({
    x:    rand(0, W),
    y:    rand(0, H),
    r:    rand(0.6, 2.4),
    vx:   rand(-0.10, 0.10),
    vy:   rand(-0.18, -0.04),
    life: rand(0, Math.PI * 2),
    spd:  rand(0.004, 0.015),
    col:  Math.random() > 0.50 ? C.tealBright
          : Math.random() > 0.45 ? C.amber
          : [180, 210, 230],
    a:    rand(0.25, 0.85),
  }));
}

// Grid nodes for the mesh network
function makeNodes(count, W, H) {
  return Array.from({ length: count }, () => ({
    x:  rand(0, W), y: rand(0, H),
    vx: rand(-0.18, 0.18), vy: rand(-0.14, 0.14),
    col: Math.random() > 0.55 ? C.tealBright : C.amber,
  }));
}

// ── Component ─────────────────────────────────────────────────
export default function LiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const ctx     = canvas.getContext("2d");

    let W = window.innerWidth;
    let H = window.innerHeight;

    const NODE_COUNT = reduced ? 0 : 38;
    const PARTICLE_COUNT = reduced ? 0 : 80;

    const state = {
      mx: W * .65, my: H * .30,
      mxT: W * .65, myT: H * .30,
      mAlpha: 0.4,          // start slightly visible
      mIdle: 0,
      globalT: 0,
      blobs:     makeBlobs(W, H),
      waves:     makeWaves(),
      particles: makeParticles(PARTICLE_COUNT, W, H),
      nodes:     makeNodes(NODE_COUNT, W, H),
    };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width        = W * dpr;
      canvas.height       = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.blobs     = makeBlobs(W, H);
      state.particles = makeParticles(PARTICLE_COUNT, W, H);
      state.nodes     = makeNodes(NODE_COUNT, W, H);
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);

    const onMove = e => {
      state.mxT    = e.clientX;
      state.myT    = e.clientY;
      state.mAlpha = Math.min(state.mAlpha + .08, 1);
      state.mIdle  = 0;
    };
    const onTouch = e => {
      const t = e.touches[0]; if (!t) return;
      state.mxT    = t.clientX;
      state.myT    = t.clientY;
      state.mAlpha = Math.min(state.mAlpha + .08, 1);
      state.mIdle  = 0;
    };
    window.addEventListener("mousemove", onMove,  { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });

    // ── Draw ─────────────────────────────────────────────────
    function draw() {
      state.globalT += 0.012;
      state.mx   = lerp(state.mx,  state.mxT, .055);
      state.my   = lerp(state.my,  state.myT, .055);
      state.mIdle++;
      // gentle idle pulse instead of fully fading out
      if (state.mIdle > 90) state.mAlpha = Math.max(0.25, state.mAlpha - .006);

      // 1 ── base fill
      ctx.fillStyle = rgba(C.deep, 1);
      ctx.fillRect(0, 0, W, H);

      // 2 ── AURORA BLOBS — high-alpha, elliptical
      for (const b of state.blobs) {
        b.phase += b.spd;
        const ox = Math.sin(b.phase * .7 + .3)  * W * .08;
        const oy = Math.cos(b.phase * .5 + 1.1) * H * .07;
        const cx = b.cx + ox;
        const cy = b.cy + oy;
        const r  = Math.max(b.rx, b.ry);

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,    rgba(b.color, b.alpha));
        g.addColorStop(0.40, rgba(b.color, b.alpha * .45));
        g.addColorStop(0.75, rgba(b.color, b.alpha * .12));
        g.addColorStop(1,    rgba(b.color, 0));

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(b.rx / r, b.ry / r);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3 ── AMBIENT RADIAL PULSE (slow breathe independent of mouse)
      if (!reduced) {
        const breathe = (Math.sin(state.globalT * 0.7) + 1) * 0.5;
        const pulse   = 0.04 + breathe * 0.06;
        const pr = W * (0.42 + breathe * 0.12);
        const g = ctx.createRadialGradient(W * .62, H * .28, 0, W * .62, H * .28, pr);
        g.addColorStop(0,   rgba(C.tealBright, pulse));
        g.addColorStop(.45, rgba(C.teal, pulse * .3));
        g.addColorStop(1,   rgba(C.teal, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        // amber counterpart lower-left
        const breathe2 = (Math.sin(state.globalT * 0.55 + 2.1) + 1) * 0.5;
        const pulse2   = 0.03 + breathe2 * 0.05;
        const pr2 = W * (0.32 + breathe2 * 0.1);
        const g2 = ctx.createRadialGradient(W * .18, H * .78, 0, W * .18, H * .78, pr2);
        g2.addColorStop(0,   rgba(C.amber, pulse2));
        g2.addColorStop(.45, rgba(C.amberDim, pulse2 * .3));
        g2.addColorStop(1,   rgba(C.amber, 0));
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, W, H);
      }

      // 4 ── MESH NETWORK
      if (!reduced) {
        const CONNECT_DIST = Math.min(W, H) * 0.22;
        // move nodes
        for (const n of state.nodes) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0)   { n.x = 0;  n.vx *= -1; }
          if (n.x > W)   { n.x = W;  n.vx *= -1; }
          if (n.y < 0)   { n.y = 0;  n.vy *= -1; }
          if (n.y > H)   { n.y = H;  n.vy *= -1; }
        }
        // draw edges
        for (let i = 0; i < state.nodes.length; i++) {
          for (let j = i + 1; j < state.nodes.length; j++) {
            const a = state.nodes[i], b = state.nodes[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < CONNECT_DIST) {
              const t = 1 - dist / CONNECT_DIST;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = rgba(C.teal, t * 0.12);
              ctx.lineWidth   = t * 0.8;
              ctx.stroke();
            }
          }
        }
        // draw node dots
        for (const n of state.nodes) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = rgba(n.col, 0.28);
          ctx.fill();
        }
      }

      // 5 ── FLOWING WAVES with richer fills
      if (!reduced) {
        for (const wv of state.waves) {
          wv.phase += wv.spd;
          const yB = wv.yF * H;
          ctx.beginPath();
          ctx.lineWidth   = wv.lw;
          ctx.strokeStyle = rgba(wv.color, wv.alpha);
          ctx.moveTo(0, yB + Math.sin(wv.phase) * wv.amp);
          for (let x = 1; x <= W; x += 3) {
            const y = yB
              + Math.sin(x * wv.freq + wv.phase)            * wv.amp
              + Math.sin(x * wv.freq * 1.8 + wv.phase * .6) * (wv.amp * .35)
              + Math.sin(x * wv.freq * 3.2 + wv.phase * .3) * (wv.amp * .12);
            ctx.lineTo(x, y);
          }
          ctx.stroke();

          // wave fill band
          ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
          const fg = ctx.createLinearGradient(0, yB - wv.amp, 0, yB + wv.amp * 2.5);
          fg.addColorStop(0,   rgba(wv.color, wv.alpha * .28));
          fg.addColorStop(0.5, rgba(wv.color, wv.alpha * .08));
          fg.addColorStop(1,   rgba(wv.color, 0));
          ctx.fillStyle = fg;
          ctx.fill();
        }
      }

      // 6 ── PARTICLES
      if (!reduced) {
        for (const p of state.particles) {
          p.life += p.spd; p.x += p.vx; p.y += p.vy;
          if (p.x < -4)    p.x = W + 4;
          if (p.x > W + 4) p.x = -4;
          if (p.y < -4)  { p.y = H + 4; p.x = rand(0, W); }
          const breathe = (Math.sin(p.life) + 1) * .5;
          // slight trail
          const gp = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5);
          gp.addColorStop(0,   rgba(p.col, p.a * breathe));
          gp.addColorStop(1,   rgba(p.col, 0));
          ctx.fillStyle = gp;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7 ── CURSOR / TOUCH GLOW (always somewhat visible via ambient)
      {
        const alpha = state.mAlpha;
        const g = ctx.createRadialGradient(state.mx, state.my, 0, state.mx, state.my, 500);
        g.addColorStop(0,    rgba(C.tealBright, .16 * alpha));
        g.addColorStop(.22,  rgba(C.teal,       .08 * alpha));
        g.addColorStop(.50,  rgba(C.amber,      .04 * alpha));
        g.addColorStop(1,    rgba(C.teal,       0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // 8 ── HORIZONTAL SCAN LINE (very subtle, moves slowly)
      if (!reduced) {
        const scanY = ((state.globalT * 28) % (H + 80)) - 40;
        const sg = ctx.createLinearGradient(0, scanY - 18, 0, scanY + 18);
        sg.addColorStop(0,   rgba(C.tealBright, 0));
        sg.addColorStop(0.5, rgba(C.tealBright, 0.022));
        sg.addColorStop(1,   rgba(C.tealBright, 0));
        ctx.fillStyle = sg;
        ctx.fillRect(0, scanY - 18, W, 36);
      }

      // 9 ── VIGNETTE
      const vig = ctx.createRadialGradient(W/2, H/2, H*.18, W/2, H/2, H*.92);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.58)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    }

    let raf;
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        display: "block",
        filter: "blur(0.4px)",
      }}
    />
  );
}