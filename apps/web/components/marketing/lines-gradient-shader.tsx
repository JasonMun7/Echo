"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LinesGradientShaderProps {
  className?: string;
  speed?: number;
  bandCount?: number;
  bandSpacing?: number;
  bandThickness?: number;
  waveAmplitude?: number;
  colors?: string[];
  targetFps?: number;
  disableHighlights?: boolean;
}

/** Primary Lavender #A577FF per design system */
const DEFAULT_COLORS = [
  "rgba(165, 119, 255, 1)",
  "rgba(165, 119, 255, 0.95)",
  "rgba(165, 119, 255, 0.85)",
  "rgba(165, 119, 255, 0.75)",
  "rgba(165, 119, 255, 0.6)",
  "rgba(165, 119, 255, 0.5)",
  "rgba(165, 119, 255, 0.35)",
  "rgba(165, 119, 255, 0.25)",
  "rgba(165, 119, 255, 0.15)",
  "rgba(165, 119, 255, 0.08)",
];

const parseColorToRgba = (
  color: string,
  element: HTMLElement
): [number, number, number, number] => {
  const computedStyle = getComputedStyle(element);
  let resolvedColor = color;
  if (color.startsWith("var(")) {
    const varName = color.slice(4, -1).trim();
    resolvedColor = computedStyle.getPropertyValue(varName).trim();
  }
  const rgbaMatch = resolvedColor.match(
    /rgba\s*\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)\s*[,/]\s*([\d.]+)\s*\)/
  );
  if (rgbaMatch) {
    return [
      parseInt(rgbaMatch[1]),
      parseInt(rgbaMatch[2]),
      parseInt(rgbaMatch[3]),
      parseFloat(rgbaMatch[4]),
    ];
  }
  const rgbMatch = resolvedColor.match(
    /rgb\s*\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)\s*\)/
  );
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]), 1];
  }
  const hexMatch = resolvedColor.match(
    /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
  );
  if (hexMatch) {
    return [
      parseInt(hexMatch[1], 16),
      parseInt(hexMatch[2], 16),
      parseInt(hexMatch[3], 16),
      1,
    ];
  }
  return [165, 119, 255, 1];
};

export const LinesGradientShader: React.FC<LinesGradientShaderProps> = ({
  className,
  speed = 1,
  bandCount = 5,
  bandSpacing = 25,
  bandThickness = 60,
  waveAmplitude = 0.15,
  colors = DEFAULT_COLORS,
  targetFps = 30,
  disableHighlights = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(true);
  const prefersReducedMotionRef = useRef<boolean>(false);
  const [resolvedColors, setResolvedColors] = useState<
    [number, number, number, number][]
  >([]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = e.matches;
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setResolvedColors(colors.map((c) => parseColorToRgba(c, container)));
  }, [colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || resolvedColors.length === 0) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let stopped = false;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const frameInterval = 1000 / targetFps;
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${Math.floor(width)}px`;
      canvas.style.height = `${Math.floor(height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    const io = new IntersectionObserver(
      (entries) => {
        isVisibleRef.current = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 }
    );
    io.observe(container);
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        startTimeRef.current = 0;
        lastFrameTimeRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interpolateColor = (
      c1: [number, number, number, number],
      c2: [number, number, number, number],
      t: number
    ): string => {
      const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
      const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
      const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
      const a = c1[3] + (c2[3] - c1[3]) * t;
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    };
    const colorStops = resolvedColors;
    const getColorAtPosition = (t: number): string => {
      const clampedT = Math.max(0, Math.min(1, t));
      const scaledT = clampedT * (colorStops.length - 1);
      const index = Math.floor(scaledT);
      const fraction = scaledT - index;
      const c1 = colorStops[Math.min(index, colorStops.length - 1)];
      const c2 = colorStops[Math.min(index + 1, colorStops.length - 1)];
      return interpolateColor(c1, c2, fraction);
    };
    const steps = 40;
    const halfBandCount = bandCount / 2;
    const widthPlusMargin = 1000;

    const draw = (timestamp: number) => {
      if (stopped) return;
      if (!isVisibleRef.current || document.hidden) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const deltaTime = timestamp - lastFrameTimeRef.current;
      if (deltaTime < frameInterval) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameTimeRef.current = timestamp - (deltaTime % frameInterval);
      if (startTimeRef.current === 0) startTimeRef.current = timestamp;
      const elapsed = prefersReducedMotionRef.current
        ? 0
        : (timestamp - startTimeRef.current) * 0.001 * speed;
      const { width, height } = container.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const baseAmplitude = height * waveAmplitude;

      for (let i = bandCount - 1; i >= 0; i--) {
        const progress = i / (bandCount - 1);
        const colorStart = getColorAtPosition(progress - 0.02);
        const colorEnd = getColorAtPosition(progress + 0.08);
        const gradient = ctx.createLinearGradient(width * 0.3, 0, width, height);
        gradient.addColorStop(0, colorStart);
        gradient.addColorStop(1, colorEnd);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        const phase1 = elapsed * 0.12 + i * 0.15;
        const phase2 = elapsed * 0.08 + i * 0.1;
        const phase3 = elapsed * 0.05 + i * 0.08;
        const bandOffset = (i - halfBandCount) * bandSpacing;
        ctx.moveTo(-100, height + 200);
        const bottomPoints: { x: number; y: number }[] = [];
        const topPoints: { x: number; y: number }[] = [];
        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          const x = -100 + (width + 400) * t;
          const baseY = height * 1.4 - t * height * 1.2 + bandOffset;
          const wave1 = Math.sin(t * 2.5 + phase1) * baseAmplitude;
          const wave2 = Math.sin(t * 1.5 + phase2) * baseAmplitude * 0.4;
          const wave3 = Math.sin(t * 4 + phase3) * baseAmplitude * 0.15;
          const waveOffset = wave1 + wave2 + wave3;
          const thickness = bandThickness + 4 * Math.sin(t * 2 + phase1 * 0.3);
          bottomPoints.push({ x, y: baseY + waveOffset + thickness / 2 });
          topPoints.push({ x, y: baseY + waveOffset - thickness / 2 });
        }
        for (let k = 0; k < bottomPoints.length; k++) {
          ctx.lineTo(bottomPoints[k].x, bottomPoints[k].y);
        }
        ctx.lineTo(width + 200, -100);
        for (let k = topPoints.length - 1; k >= 0; k--) {
          ctx.lineTo(topPoints[k].x, topPoints[k].y);
        }
        ctx.lineTo(-100, height + 200);
        ctx.closePath();
        ctx.fill();
      }
      if (prefersReducedMotionRef.current) return;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      ro.disconnect();
      io.disconnect();
    };
  }, [
    speed,
    bandCount,
    bandSpacing,
    bandThickness,
    waveAmplitude,
    resolvedColors,
    targetFps,
    disableHighlights,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "pointer-events-none relative overflow-hidden mask-b-from-50%",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
      />
    </div>
  );
};
