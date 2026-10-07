import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getVirtualTrackpadsState } from "../backend";
import type { VirtualTrackpadsConfig, VirtualTrackpadsState } from "../types";

const EMPTY: VirtualTrackpadsState = {
  leftActive: false,
  rightActive: false,
  leftCorner: "bottom",
  rightCorner: "bottom",
};
const HOLD_MS = 3000;

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
      const cornerKey = `${side}Corner` as const;
      const sideEnabled = config[`${side}Enabled` as const];
      const oldTimer = hideTimers.current[side];
      if (oldTimer) window.clearTimeout(oldTimer);
      if (active[key] && sideEnabled) {
        setVisible((current) => ({ ...current, [key]: true, [cornerKey]: active[cornerKey] }));
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
  const pad = (side: "left" | "right", corner: "top" | "bottom") => {
    const sideEnabled = config[`${side}Enabled` as const];
    const selectedCorner = active[`${side}Active` as const]
      ? active[`${side}Corner` as const]
      : visible[`${side}Corner` as const];
    const cornerAvailable = !config.fourPads ? corner === "bottom" : true;
    const shown = sideEnabled && cornerAvailable && (
      previewing || (visible[`${side}Active` as const] && selectedCorner === corner)
    );
    const dotAlpha = config.backgroundOpacity / 100;
    return (
      <div
        key={`${side}-${corner}`}
        aria-hidden="true"
        style={{
          position: "absolute",
          [corner]: 0,
          [side]: 0,
          height: `${config[`${side}Size` as const]}vh`,
          aspectRatio: "1 / 1",
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
      />
    );
  };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483647 }}>
      {pad("left", "top")}
      {pad("left", "bottom")}
      {pad("right", "top")}
      {pad("right", "bottom")}
    </div>,
    document.body,
  );
}
