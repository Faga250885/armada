import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getVirtualTrackpadsState } from "../backend";
import type { VirtualTrackpadsConfig, VirtualTrackpadsState } from "../types";

const EMPTY: VirtualTrackpadsState = {
  leftActive: false,
  rightActive: false,
  leftZone: "bottom",
  rightZone: "bottom",
  leftX: 0,
  leftY: 1,
  rightX: 1,
  rightY: 1,
  leftTouchX: 0.5,
  leftTouchY: 0.5,
  rightTouchX: 0.5,
  rightTouchY: 0.5,
};
const HOLD_MS = 1000;

function colorChannels(color: string) {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : 0xffffff;
  return [value >> 16, (value >> 8) & 255, value & 255];
}

function colorWithOpacity(color: string, opacity: number) {
  const [red, green, blue] = colorChannels(color);
  return `rgba(${red},${green},${blue},${opacity / 100})`;
}

function ReactiveDots({ active, touchX, touchY, opacity, color, dotSize, dotGap }: {
  active: boolean;
  touchX: number;
  touchY: number;
  opacity: number;
  color: string;
  dotSize: number;
  dotGap: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strengthRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let frame = 0;
    let previous = performance.now();
    const draw = (now: number) => {
      const elapsed = Math.min(40, now - previous);
      previous = now;
      const target = active ? 1 : 0;
      strengthRef.current += (target - strengthRef.current) * (1 - Math.exp(-elapsed / 85));
      const bounds = parent.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = colorWithOpacity(color, opacity);
      const spacing = dotSize + dotGap;
      const radius = dotSize / 2;
      const influenceRadius = Math.min(width, height) * 0.28;
      const centerX = touchX * width;
      const centerY = touchY * height;
      for (let baseX = spacing / 2; baseX < width; baseX += spacing) {
        for (let baseY = spacing / 2; baseY < height; baseY += spacing) {
          const deltaX = baseX - centerX;
          const deltaY = baseY - centerY;
          const distance = Math.hypot(deltaX, deltaY);
          const influence = Math.max(0, 1 - distance / influenceRadius);
          const push = influence * influence * 9 * strengthRef.current;
          const directionX = distance > 0.01 ? deltaX / distance : 0;
          const directionY = distance > 0.01 ? deltaY / distance : 0;
          context.beginPath();
          context.arc(baseX + directionX * push, baseY + directionY * push, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
      if (Math.abs(target - strengthRef.current) > 0.002) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    observer.observe(parent);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, touchX, touchY, opacity, color, dotSize, dotGap]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

export function VirtualTrackpadOverlay({ config }: { config: VirtualTrackpadsConfig }) {
  const [active, setActive] = useState(EMPTY);
  const [visible, setVisible] = useState(EMPTY);
  const [previewing, setPreviewing] = useState(false);
  const hideTimers = useRef<Record<string, number>>({});
  const previewTimer = useRef<number | null>(null);
  const enabled = config.enabled && (config.leftEnabled || config.rightEnabled);

  useEffect(() => {
    if (!enabled) {
      setActive(EMPTY);
      return;
    }
    let cancelled = false;
    const poll = () => getVirtualTrackpadsState()
      .then((next) => { if (!cancelled) setActive(next); })
      .catch(() => { if (!cancelled) setActive(EMPTY); });
    void poll();
    const timer = window.setInterval(poll, 100);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    const preview = () => {
      setPreviewing(true);
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
      previewTimer.current = window.setTimeout(() => setPreviewing(false), HOLD_MS);
    };
    window.addEventListener("armada-trackpads-preview", preview);
    return () => {
      window.removeEventListener("armada-trackpads-preview", preview);
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    };
  }, []);

  useEffect(() => {
    for (const side of ["left", "right"] as const) {
      const key = `${side}Active` as const;
      const zoneKey = `${side}Zone` as const;
      const xKey = `${side}X` as const;
      const yKey = `${side}Y` as const;
      const sideEnabled = config[`${side}Enabled` as const];
      const oldTimer = hideTimers.current[side];
      if (oldTimer) window.clearTimeout(oldTimer);
      if (active[key] && sideEnabled) {
        setVisible((current) => ({
          ...current,
          [key]: true,
          [zoneKey]: active[zoneKey],
          [xKey]: active[xKey],
          [yKey]: active[yKey],
        }));
      } else if (visible[key]) {
        hideTimers.current[side] = window.setTimeout(() => {
          setVisible((current) => ({ ...current, [key]: false }));
        }, HOLD_MS);
      }
    }
    return () => {
      for (const timer of Object.values(hideTimers.current)) window.clearTimeout(timer);
    };
  }, [
    active.leftActive,
    active.rightActive,
    active.leftZone,
    active.rightZone,
    active.leftX,
    active.leftY,
    active.rightX,
    active.rightY,
    active.leftTouchX,
    active.leftTouchY,
    active.rightTouchX,
    active.rightTouchY,
    config.leftEnabled,
    config.rightEnabled,
  ]);

  // Full-screen halves are deliberately invisible: they only translate touch
  // input and never draw borders, dots, previews, or center indicators.
  if (!enabled || config.mode === "halves" || typeof document === "undefined") return null;
  const pad = (side: "left" | "right", zone: "top" | "bottom" | "floating" | "half") => {
    const sideEnabled = config[`${side}Enabled` as const];
    const sideActive = active[`${side}Active` as const];
    const selectedZone = sideActive ? active[`${side}Zone` as const] : visible[`${side}Zone` as const];
    const selectedX = sideActive ? active[`${side}X` as const] : visible[`${side}X` as const];
    const selectedY = sideActive ? active[`${side}Y` as const] : visible[`${side}Y` as const];
    const available = config.mode === "corners"
      ? zone === "top" || zone === "bottom"
      : config.mode === "floating"
        ? zone === "floating"
        : zone === "bottom";
    const shown = sideEnabled && available && (
      previewing || (visible[`${side}Active` as const] && selectedZone === zone)
    );
    const touchX = active[`${side}TouchX` as const] * 100;
    const touchY = active[`${side}TouchY` as const] * 100;
    const size = config[`${side}Size` as const];
    const position = zone === "floating"
        ? {
            left: `${(previewing ? (side === "left" ? 0.25 : 0.75) : selectedX) * 100}%`,
            top: `${(previewing ? 0.5 : selectedY) * 100}%`,
            height: `${size}vh`,
            aspectRatio: "1 / 1",
            transform: "translate(-50%, -50%)",
          }
        : {
            [zone]: `${config.edgeGap}px`,
            [side]: `${config.edgeGap}px`,
            height: `${size}vh`,
            aspectRatio: "1 / 1",
          };
    return (
      <div
        key={`${side}-${zone}`}
        aria-hidden="true"
        style={{
          position: "absolute",
          ...position,
          boxSizing: "border-box",
          overflow: "hidden",
          border: `1px solid ${colorWithOpacity(config.borderColor, config.borderOpacity)}`,
          borderRadius: `${config.borderRadius / 2}%`,
          background: "transparent",
          boxShadow: "none",
          opacity: shown ? 1 : 0,
          transition: "opacity 280ms ease-in-out",
          willChange: "opacity",
        }}
      >
        <ReactiveDots
          active={sideActive && selectedZone === zone}
          touchX={touchX / 100}
          touchY={touchY / 100}
          opacity={config.backgroundOpacity}
          color={config.dotColor}
          dotSize={config.dotSize}
          dotGap={config.dotGap}
        />
      </div>
    );
  };
  const centerDot = (side: "left" | "right", zone: "top" | "bottom") => {
    const sideEnabled = config[`${side}Enabled` as const];
    const available = config.mode === "corners"
      || (config.mode === "simple" && zone === "bottom");
    if (!config.centerDotEnabled || !sideEnabled || !available) return null;
    const size = config[`${side}Size` as const];
    return (
      <div
        key={`center-${side}-${zone}`}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: side === "left"
            ? `calc(${config.edgeGap}px + ${size / 2}vh)`
            : `calc(100% - ${config.edgeGap}px - ${size / 2}vh)`,
          top: zone === "top"
            ? `calc(${config.edgeGap}px + ${size / 2}vh)`
            : `calc(100% - ${config.edgeGap}px - ${size / 2}vh)`,
          width: `${config.centerDotSize}px`,
          height: `${config.centerDotSize}px`,
          borderRadius: "50%",
          background: config.centerDotColor,
          opacity: config.centerDotOpacity / 100,
          transform: "translate(-50%, -50%)",
        }}
      />
    );
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647 }}>
      {pad("left", "top")}
      {pad("left", "bottom")}
      {pad("left", "floating")}
      {pad("right", "top")}
      {pad("right", "bottom")}
      {pad("right", "floating")}
      {centerDot("left", "top")}
      {centerDot("left", "bottom")}
      {centerDot("right", "top")}
      {centerDot("right", "bottom")}
    </div>,
    document.body,
  );
}
