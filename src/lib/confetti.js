import { prefersReducedMotion } from './platform.js';

const COLORS = ['#FFC15A', '#FF7A1A', '#FF3D6E', '#FFE29A', '#BF5AF2', '#34C759', '#2F8CFF'];

/** A short burst of confetti from a point on screen (0..1 coordinates). */
export function confetti({ count = 130, x = 0.5, y = 0.32, duration = 2300 } = {}) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: `${w}px`, height: `${h}px`, pointerEvents: 'none', zIndex: '300' });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = 5 + Math.random() * 9;
    return {
      x: x * w,
      y: y * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      round: Math.random() < 0.4,
    };
  });
  const start = performance.now();
  const frame = (t) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
    for (const p of parts) {
      p.vy += 0.28;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (elapsed < duration) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
