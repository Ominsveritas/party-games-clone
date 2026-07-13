"use client";

import { useEffect, useRef } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  /** 1 → 0 */
  life: number;
  /** pixels/frame — upward drift */
  vy: number;
  /** pixels/frame — slight horizontal drift */
  vx: number;
  /** size in px */
  size: number;
  /** one of the star/sparkle glyphs */
  glyph: string;
  /** hsl hue so stars cycle through violet / pink / gold */
  hue: number;
}

const GLYPHS = ["✦", "✧", "⋆", "★", "✶", "✸"];
const MAX_PARTICLES = 30;
/** Minimum px the cursor must move before spawning a new particle */
const MIN_MOVE = 8;
/** How much life drains per frame (60 fps → ~0.033 per frame → ~30 frames = 0.5 s) */
const DECAY = 0.033;

let idCounter = 0;

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resize canvas to fill viewport
    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Spawn a particle at cursor position
    function spawnParticle(x: number, y: number) {
      if (particles.current.length >= MAX_PARTICLES) {
        // Remove the oldest (lowest life) particle to stay within budget
        particles.current.sort((a, b) => a.life - b.life);
        particles.current.shift();
      }
      particles.current.push({
        id: idCounter++,
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        life: 1,
        vy: -(Math.random() * 1.2 + 0.4),
        vx: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 10 + 8,
        glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        // Hues cycle through violet (270) → pink (320) → gold (45)
        hue: [270, 290, 320, 35, 45][Math.floor(Math.random() * 5)],
      });
    }

    function onMouseMove(e: MouseEvent) {
      const { clientX: x, clientY: y } = e;
      const last = lastPos.current;
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        if (dx * dx + dy * dy < MIN_MOVE * MIN_MOVE) return;
      }
      lastPos.current = { x, y };
      spawnParticle(x, y);
    }

    window.addEventListener("mousemove", onMouseMove);

    // Animation loop
    function draw() {
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.life -= DECAY;
        if (p.life <= 0) continue;
        alive.push(p);

        p.x += p.vx;
        p.y += p.vy;

        const alpha = p.life;
        // Scale from full size down to ~60% as it fades
        const scale = 0.6 + p.life * 0.4;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${p.size * scale}px serif`;
        ctx.fillStyle = `hsl(${p.hue}, 90%, 62%)`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillText(p.glyph, p.x, p.y);
        ctx.restore();
      }
      particles.current = alive;

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      particles.current = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}
