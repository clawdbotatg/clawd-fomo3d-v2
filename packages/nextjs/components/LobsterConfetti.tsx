"use client";

import { useCallback, useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  opacity: number;
  life: number;
  maxLife: number;
}

const LOBSTER = "🦞";
const EXTRA_EMOJIS = ["🔑", "💰", "🔥", "👑", "✨"];
const PARTICLE_COUNT = 35;
const GRAVITY = 0.15;

export function useLobsterConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const isRunningRef = useRef(false);

  // Initialize canvas on mount
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);
      canvas.remove();
    };
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const alive: Particle[] = [];
    for (const p of particlesRef.current) {
      p.life++;
      const progress = p.life / p.maxLife;

      // Physics
      p.vy += GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      // Fade out in the last 30%
      p.opacity = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;

      if (p.life < p.maxLife && p.y < canvas.height + 50) {
        // Draw
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.font = `${Math.round(24 * p.scale)}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // 70% lobsters, 30% mixed
        const emoji = Math.random() > 0.3 ? LOBSTER : EXTRA_EMOJIS[Math.floor(Math.random() * EXTRA_EMOJIS.length)];
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
        alive.push(p);
      }
    }

    particlesRef.current = alive;

    if (alive.length > 0) {
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      isRunningRef.current = false;
    }
  }, []);

  const trigger = useCallback(
    (originX?: number, originY?: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const cx = originX ?? canvas.width / 2;
      const cy = originY ?? canvas.height / 2;

      // Create burst of particles
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
        const speed = 4 + Math.random() * 10;
        const particle: Particle = {
          x: cx + (Math.random() - 0.5) * 20,
          y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4 - Math.random() * 3, // upward bias
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2,
          scale: 0.8 + Math.random() * 1.2,
          opacity: 1,
          life: 0,
          maxLife: 60 + Math.floor(Math.random() * 40), // 1-1.7 seconds at 60fps
        };
        particlesRef.current.push(particle);
      }

      if (!isRunningRef.current) {
        isRunningRef.current = true;
        animFrameRef.current = requestAnimationFrame(animate);
      }
    },
    [animate],
  );

  return { trigger };
}
