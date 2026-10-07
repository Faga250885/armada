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

export function VirtualTrackpadOverlay({ config }: { config: VirtualTrackpadsConfig }) {
  const [active, setActive] = useState(EMPTY);
  const [visible, setVisible] = useState(EMPTY);
  const [previewing, setPreviewing] = useState(false);
  const hideTimers = useRef<Record<string, number>>({});
  const previewTimer = useRef<number | null>(null);
  const enabled = config.leftEnabled || config.rightEnabled;

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
    const dotAlpha = config.backgroundOpacity / 100;
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
            [zone]: 0,
            [side]: 0,
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
          border: `1px solid rgba(255,255,255,${config.borderOpacity / 100})`,
          borderRadius: "12px",
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,${dotAlpha}) 0 2px, transparent 2.5px)`,
          backgroundSize: "12px 12px",
          boxShadow: "none",
          opacity: shown ? 1 : 0,
          transition: "opacity 280ms ease-in-out",
          willChange: "opacity",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: `radial-gradient(circle at ${touchX}% ${touchY}%, rgba(255,255,255,.9) 0, rgba(255,255,255,.45) 12%, transparent 34%)`,
            WebkitMaskImage: "radial-gradient(circle, #000 0 2px, transparent 2.5px)",
            WebkitMaskSize: "12px 12px",
            maskImage: "radial-gradient(circle, #000 0 2px, transparent 2.5px)",
            maskSize: "12px 12px",
            opacity: sideActive ? 1 : 0,
            transition: "opacity 180ms ease-out",
          }}
        />
      </div>
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
    </div>,
    document.body,
  );
}
