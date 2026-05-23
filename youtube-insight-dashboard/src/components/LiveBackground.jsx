import { useEffect, useRef } from "react";

const C = {
  teal:    [27,  187, 158],
  tealDim: [14,  120, 100],
  amber:   [232, 168,  56],
  amberDim:[160, 100,  20],
  deep:    [8,     8,   9],
};

const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => Math.random() * (b - a) + a;

function makeBlobs(W, H) {
  return [
    { cx: W*.72, cy: H*.28, rx: W*.40, ry: H*.42, color: C.teal,     alpha: .065, phase: 0,   spd: .00030 },
    { cx: W*.18, cy: H*.65, rx: W*.34, ry: H*.38, color: C.tealDim,  alpha: .075, phase: 1.2, spd: .00024 },
    { cx: W*.84, cy: H*.80, rx: W*.30, ry: H*.30, color: C.amber,    alpha: .050, phase: 2.4, spd: .00038 },
    { cx: W*.38, cy: H*.12, rx: W*.28, ry: H*.26, color: C.amberDim, alpha: .055, phase: 0.7, spd: .00020 },
    { cx: W*.55, cy: H*.52, rx: W*.46, ry: H*.46, color: C.teal,     alpha: .030, phase: 3.1, spd: .00016 },
    { cx: W*.90, cy: H*.40, rx: W*.22, ry: H*.32, color: C.amber,    alpha: .040, phase: 5.0, spd: .00028 },
  ];
}

function makeWaves() {
  return [
    { amp: 40,  freq: .0030, spd: .00042, yF: .32, color: C.teal,    alpha: .08, lw: 1.6, phase: 0   },
    { amp: 28,  freq: .0038, spd: .00058, yF: .44, color: C.teal,    alpha: .11, lw: 1.0, phase: 1.5 },
    { amp: 55,  freq: .0024, spd: .00030, yF: .58, color: C.tealDim, alpha: .07, lw: 2.2, phase: 2.8 },
    { amp: 32,  freq: .0042, spd: .00062, yF: .68, color: C.amber,   alpha: .05, lw: 0.9, phase: 0.8 },
    { amp: 70,  freq: .0018, spd: .00020, yF: .79, color: C.teal,    alpha: .06, lw: 2.8, phase: 4.2 },
    { amp: 45,  freq: .0032, spd: .00048, yF: .89, color: C.tealDim, alpha: .08, lw: 1.4, phase: 1.1 },
  ];
}

function makeParticles(count, W, H) {
  return Array.from({ length: count }, () => ({
    x:    rand(0, W),
    y:    rand(0, H),
    r:    rand(0.5, 2.0),
    vx:   rand(-0.07, 0.07),
    vy:   rand(-0.13, -0.03),
    life: rand(0, Math.PI * 2),
    spd:  rand(0.004, 0.013),
    col:  Math.random() > 0.55 ? C.teal : Math.random() > 0.5 ? C.amber : [180, 200, 220],
    a:    rand(0.2, 0.72),
  }));
}

export default function LiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const ctx = canvas.getContext("2d");

    let W = window.innerWidth;
    let H = window.innerHeight;

    const state = {
      mx: W * .65, my: H * .30,
      mxT: W * .65, myT: H * .30,
      mAlpha: 0, mIdle: 0,
      blobs:     makeBlobs(W, H),
      waves:     makeWaves(),
      particles: makeParticles(reduced ? 0 : 60, W, H),
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
      state.particles = makeParticles(reduced ? 0 : 60, W, H);
    }
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(document.documentElement);

    const onMove = e => {
      state.mxT    = e.clientX;
      state.myT    = e.clientY;
      state.mAlpha = Math.min(state.mAlpha + .07, 1);
      state.mIdle  = 0;
    };
    const onTouch = e => {
      const t = e.touches[0];
      if (!t) return;
      state.mxT    = t.clientX;
      state.myT    = t.clientY;
      state.mAlpha = Math.min(state.mAlpha + .07, 1);
      state.mIdle  = 0;
    };
    window.addEventListener("mousemove", onMove,  { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });

    function draw() {
      state.mx    = lerp(state.mx,  state.mxT, .055);
      state.my    = lerp(state.my,  state.myT, .055);
      state.mIdle++;
      if (state.mIdle > 85) state.mAlpha = Math.max(0, state.mAlpha - .009);

      // 1 — base fill
      ctx.fillStyle = rgba(C.deep, 1);
      ctx.fillRect(0, 0, W, H);

      // 2 — aurora blobs
      for (const b of state.blobs) {
        b.phase += b.spd;
        const ox = Math.sin(b.phase * .7 + .3) * W * .07;
        const oy = Math.cos(b.phase * .5 + 1.1) * H * .06;
        const cx = b.cx + ox;
        const cy = b.cy + oy;
        const r  = Math.max(b.rx, b.ry);

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0,    rgba(b.color, b.alpha));
        g.addColorStop(0.45, rgba(b.color, b.alpha * .38));
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

      // 3 — flowing waves
      if (!reduced) {
        for (const wv of state.waves) {
          wv.phase += wv.spd;
          ctx.beginPath();
          ctx.lineWidth   = wv.lw;
          ctx.strokeStyle = rgba(wv.color, wv.alpha);
          const yB = wv.yF * H;
          ctx.moveTo(0, yB + Math.sin(wv.phase) * wv.amp);
          for (let x = 1; x <= W; x += 4) {
            const y = yB
              + Math.sin(x * wv.freq + wv.phase) * wv.amp
              + Math.sin(x * wv.freq * 1.75 + wv.phase * .6) * (wv.amp * .32);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
          const fg = ctx.createLinearGradient(0, yB - wv.amp, 0, yB + wv.amp * 2);
          fg.addColorStop(0, rgba(wv.color, wv.alpha * .22));
          fg.addColorStop(1, rgba(wv.color, 0));
          ctx.fillStyle = fg;
          ctx.fill();
        }
      }

      // 4 — particles
      if (!reduced) {
        for (const p of state.particles) {
          p.life += p.spd; p.x += p.vx; p.y += p.vy;
          if (p.x < -4)    p.x = W + 4;
          if (p.x > W + 4) p.x = -4;
          if (p.y < -4) { p.y = H + 4; p.x = rand(0, W); }
          const breathe = (Math.sin(p.life) + 1) * .5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (.7 + breathe * .5), 0, Math.PI * 2);
          ctx.fillStyle = rgba(p.col, p.a * breathe);
          ctx.fill();
        }
      }

      // 5 — cursor glow
      if (state.mAlpha > .01) {
        const g = ctx.createRadialGradient(state.mx, state.my, 0, state.mx, state.my, 380);
        g.addColorStop(0,    rgba(C.teal,  .10 * state.mAlpha));
        g.addColorStop(.30,  rgba(C.teal,  .045 * state.mAlpha));
        g.addColorStop(.60,  rgba(C.amber, .028 * state.mAlpha));
        g.addColorStop(1,    rgba(C.teal,  0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // 6 — vignette
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * .22, W / 2, H / 2, H * .9);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.52)");
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
        filter: "blur(0.5px)",
      }}
    />
  );
}