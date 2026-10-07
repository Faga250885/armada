import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getVirtualTrackpadsState } from "../backend";
import type { VirtualTrackpadsConfig, VirtualTrackpadsState } from "../types";

const EMPTY: VirtualTrackpadsState = { leftActive: false, rightActive: false };
const HOLD_MS = 3000;

export function VirtualTrackpadOverlay({ config }: { config: VirtualTrackpadsConfig }) {
  const [active, setActive] = useState(EMPTY);
  const [visible, setVisible] = useState(EMPTY);
  const hideTimers = useRef<Record<string, number>>({});
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
    for (const side of ["left", "right"] as const) {
      const key = `${side}Active` as const;
      const sideEnabled = config[`${side}Enabled` as const];
      const oldTimer = hideTimers.current[side];
      if (oldTimer) window.clearTimeout(oldTimer);
      if (active[key] && sideEnabled) {
        setVisible((current) => ({ ...current, [key]: true }));
      } else if (visible[key]) {
        hideTimers.current[side] = window.setTimeout(() => {
          setVisible((current) => ({ ...current, [key]: false }));
        }, HOLD_MS);
      }
    }
    return () => {
      for (const timer of Object.values(hideTimers.current)) window.clearTimeout(timer);
    };
  }, [active.leftActive, active.rightActive, config.leftEnabled, config.rightEnabled]);

  if (!enabled || typeof document === "undefined") return null;
  const pad = (side: "left" | "right") => {
    const sideEnabled = config[`${side}Enabled` as const];
    const shown = visible[`${side}Active` as const] && sideEnabled;
    const pressed = active[`${side}Active` as const] && sideEnabled;
    const dotAlpha = (config.backgroundOpacity / 100) * (pressed ? 1 : 0.45);
    return (
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 0,
          [side]: 0,
          height: `${config[`${side}Size` as const]}vh`,
          aspectRatio: "1 / 1",
          boxSizing: "border-box",
          border: `1px solid rgba(255,255,255,${config.borderOpacity / 100})`,
          borderRadius: "12px",
          backgroundImage: `radial-gradient(circle, rgba(255,255,255,${dotAlpha}) 0 2px, transparent 2.5px)`,
          backgroundSize: "12px 12px",
          boxShadow: pressed ? `inset 0 0 22px rgba(255,255,255,${dotAlpha * 0.8})` : "none",
          opacity: shown ? 1 : 0,
          transform: pressed ? "scale(0.985)" : "scale(1)",
          transformOrigin: `${side} bottom`,
          transition: "opacity 280ms ease-in-out, transform 100ms ease-out, box-shadow 140ms ease-out, background-image 140ms ease-out",
          willChange: "opacity, transform",
        }}
      />
    );
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647 }}>
      {pad("left")}
      {pad("right")}
    </div>,
    document.body,
  );
}
