import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { MANA_COLORS } from './ManaSigils';

/**
 * Ambient mana motes drifting up through the table. Drawn on one canvas,
 * capped at 60 fps, paused when the tab is hidden and skipped entirely for
 * reduced-motion users.
 */

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  color: string;
}

const PALETTE = [...Object.values(MANA_COLORS), '#C8AA6E', '#C8AA6E'];

function spawn(width: number, height: number, anywhere: boolean): Mote {
  return {
    x: Math.random() * width,
    y: anywhere ? Math.random() * height : height + 10,
    r: 0.6 + Math.random() * 1.8,
    vx: (Math.random() - 0.5) * 0.08,
    vy: -(0.05 + Math.random() * 0.16),
    phase: Math.random() * Math.PI * 2,
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)] ?? '#C8AA6E',
  };
}

export function ManaMotes({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reduce) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let motes: Mote[] = [];
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.round(Math.min(70, (width * height) / 26000) * density);
      motes = Array.from({ length: target }, () => spawn(width, height, true));
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(48, now - last);
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i] as Mote;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.phase += dt * 0.0016;
        if (m.y < -12 || m.x < -12 || m.x > width + 12) motes[i] = spawn(width, height, false);
        const alpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(m.phase));
        const glow = m.r * 5;
        const gradient = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, glow);
        gradient.addColorStop(0, m.color);
        gradient.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(m.x, m.y, glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    resize();
    frame = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduce, density]);

  if (reduce) return null;
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" />;
}
