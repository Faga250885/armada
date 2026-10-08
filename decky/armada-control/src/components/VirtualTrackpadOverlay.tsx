import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getVirtualTrackpadsState } from "../backend";
import type { VirtualTrackpadsConfig, VirtualTrackpadsState } from "../types";

const EMPTY: VirtualTrackpadsState = {
  leftActive: false,
  rightActive: false,
  leftZone: "bottom",
  rightZone: "bottom",
  leftX: 0.25,
  leftY: 0.5,
  rightX: 0.75,
  rightY: 0.5,
  leftTouchX: 0.5,
  leftTouchY: 0.5,
  rightTouchX: 0.5,
  rightTouchY: 0.5,
};
function StaticDots({ opacity, dotSize, dotGap }: {
  opacity: number;
  dotSize: number;
  dotGap: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    let frame = 0;
    const draw = () => {
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
      context.fillStyle = `rgba(255,255,255,${Math.min(50, opacity) / 100})`;
      const spacing = dotSize + dotGap;
      const radius = dotSize / 2;
      for (let baseX = spacing / 2; baseX < width; baseX += spacing) {
        for (let baseY = spacing / 2; baseY < height; baseY += spacing) {
          context.beginPath();
          context.arc(baseX, baseY, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
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
  }, [opacity, dotSize, dotGap]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

export function VirtualTrackpadOverlay({ config }: { config: VirtualTrackpadsConfig }) {
  const [active, setActive] = useState(EMPTY);
  const [visible, setVisible] = useState(EMPTY);
  const [previewing, setPreviewing] = useState(false);
  const hideTimers = useRef<Record<string, number>>({});
  const previewTimer = useRef<number | null>(null);
  const enabled = config.enabled && (config.leftEnabled || config.rightEnabled);
  const holdMs = config.hideDelay * 1000;

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
      previewTimer.current = window.setTimeout(() => setPreviewing(false), holdMs);
    };
    window.addEventListener("armada-trackpads-preview", preview);
    return () => {
      window.removeEventListener("armada-trackpads-preview", preview);
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    };
  }, [holdMs]);

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
        }, holdMs);
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
    holdMs,
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
      previewing || !config.autoHide || (visible[`${side}Active` as const] && selectedZone === zone)
    );
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
          outline: `${config.borderWidth}px solid rgba(255,255,255,${Math.min(50, config.borderOpacity) / 100})`,
          background: config.backgroundStyle === "solid"
            ? `rgba(255,255,255,${Math.min(50, config.backgroundOpacity) / 100})`
            : "transparent",
          borderRadius: `${config.borderRadius / 2}%`,
          boxShadow: "none",
          opacity: shown ? 1 : 0,
          transition: "opacity 280ms ease-in-out",
          willChange: "opacity",
        }}
      >
        {config.backgroundStyle === "dots" && <StaticDots
          opacity={config.backgroundOpacity}
          dotSize={config.dotSize}
          dotGap={config.dotGap}
        />}
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
          background: "white",
          opacity: Math.min(50, config.centerDotOpacity) / 100,
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
