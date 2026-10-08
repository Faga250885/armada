import { toaster } from "@decky/api";
import { Field, PanelSection } from "@decky/ui";
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { setVirtualTrackpads } from "../backend";
import { SelectEdit, SliderEdit, ToggleRow } from "../components/widgets";
import { t } from "../i18n";
import type { Config, VirtualTrackpadsConfig } from "../types";

type EditableTrackpads = Omit<VirtualTrackpadsConfig, "supported">;

export function Trackpads({ config, setConfig }: {
  config: Config;
  setConfig: Dispatch<SetStateAction<Config | null>>;
}) {
  const timer = useRef<number | null>(null);
  const request = useRef(Promise.resolve());

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const update = (change: Partial<EditableTrackpads>, immediate = false) => {
    const next = { ...config.virtualTrackpads, ...change };
    setConfig((current) => current ? { ...current, virtualTrackpads: next } : current);
    window.dispatchEvent(new Event("armada-trackpads-preview"));
    if (timer.current !== null) window.clearTimeout(timer.current);
    const save = () => {
      const { supported: _supported, ...payload } = next;
      request.current = request.current
        .catch(() => {})
        .then(async () => {
          const applied = await setVirtualTrackpads(payload);
          const { controllerType, ...trackpads } = applied;
          setConfig((current) => current ? {
            ...current,
            controllerType: controllerType || current.controllerType,
            virtualTrackpads: { ...current.virtualTrackpads, ...trackpads, supported: true },
          } : current);
        })
        .catch((error) => {
          toaster.toast({ title: t("trackpads.saveError"), body: String(error) });
        });
    };
    timer.current = window.setTimeout(save, immediate ? 0 : 300);
  };

  if (!config.virtualTrackpads.supported) {
    return <Field label={t("trackpads.title")} description={t("trackpads.unsupported")} />;
  }
  const pads = config.virtualTrackpads;
  const splitScreen = pads.mode === "halves";
  const modeDescription = t(`trackpads.mode${pads.mode[0].toUpperCase()}${pads.mode.slice(1)}Description` as
    | "trackpads.modeSimpleDescription"
    | "trackpads.modeCornersDescription"
    | "trackpads.modeFloatingDescription"
    | "trackpads.modeHalvesDescription");
  const deckControllerSelected = config.controllerType === "deck-uhid";
  const settingsDisabled = !pads.enabled;
  const controlsDisabled = settingsDisabled || splitScreen;
  const visualDisabled = controlsDisabled;
  const centerDotDisabled = visualDisabled || pads.mode === "floating";
  return (
    <div className="armada-trackpads-tab">
      <PanelSection title={t("trackpads.title")}>
        <ToggleRow
          label={t("trackpads.master")}
          description={t("trackpads.masterDescription")}
          value={pads.enabled}
          disabled={!deckControllerSelected}
          onChange={(enabled) => update(enabled && !pads.leftEnabled && !pads.rightEnabled
            ? { enabled, blockTouchscreen: false, leftEnabled: true, rightEnabled: true }
            : { enabled, ...(enabled ? { blockTouchscreen: false } : {}) }, true)}
        />
        <ToggleRow
          label={t("trackpads.blockTouchscreen")}
          description={t("trackpads.blockTouchscreenDescription")}
          value={pads.blockTouchscreen}
          onChange={(blockTouchscreen) => update(blockTouchscreen
            ? { blockTouchscreen, enabled: false }
            : { blockTouchscreen }, true)}
        />
        <ToggleRow
          label={t("trackpads.gameModeOnly")}
          description={t("trackpads.gameModeOnlyDescription")}
          value={pads.gameModeOnly}
          onChange={(gameModeOnly) => update({ gameModeOnly }, true)}
        />
        <SelectEdit
          label={t("trackpads.mode")}
          value={pads.mode}
          disabled={settingsDisabled}
          options={[
            { data: "simple", label: t("trackpads.modeSimple") },
            { data: "corners", label: t("trackpads.modeCorners") },
            { data: "floating", label: t("trackpads.modeFloating") },
            { data: "halves", label: t("trackpads.modeHalves") },
          ]}
          onChange={(mode) => update(mode === "halves"
            ? { mode, leftEnabled: true, rightEnabled: true }
            : { mode }, true)}
        />
        <div className="armada-trackpads-note">{modeDescription}</div>
        {splitScreen && <div className="armada-trackpads-note">{t("trackpads.halvesInvisible")}</div>}
      </PanelSection>
      <PanelSection title={t("trackpads.zones")}>
        <ToggleRow
          label={t("trackpads.left")}
          description={!deckControllerSelected ? t("trackpads.selectDeckFirst") : undefined}
          value={pads.leftEnabled}
          disabled={!deckControllerSelected || controlsDisabled}
          onChange={(leftEnabled) => update({ leftEnabled }, true)}
        />
        <ToggleRow
          label={t("trackpads.right")}
          description={!deckControllerSelected ? t("trackpads.selectDeckFirst") : undefined}
          value={pads.rightEnabled}
          disabled={!deckControllerSelected || controlsDisabled}
          onChange={(rightEnabled) => update({ rightEnabled }, true)}
        />
        <SliderEdit
          label={t("trackpads.sharedSize")}
          value={pads.leftSize}
          min={15}
          max={60}
          step={1}
          disabled={controlsDisabled || pads.deckLikeSize}
          onChange={(size) => update({ leftSize: size, rightSize: size })}
        />
        <ToggleRow
          label={t("trackpads.deckLikeSize")}
          description={t("trackpads.deckLikeSizeDescription")}
          value={pads.deckLikeSize}
          disabled={controlsDisabled}
          onChange={(deckLikeSize) => update({ deckLikeSize }, true)}
        />
        <SliderEdit
          label={t("trackpads.edgeGap")}
          value={pads.edgeGap}
          min={0}
          max={160}
          step={1}
          disabled={controlsDisabled || pads.mode === "floating"}
          onChange={(edgeGap) => update({ edgeGap })}
        />
      </PanelSection>
      <PanelSection title={t("trackpads.feedback")}>
        <ToggleRow
          label={t("trackpads.limitToBounds")}
          description={t("trackpads.limitToBoundsDescription")}
          value={pads.limitToBounds}
          disabled={controlsDisabled}
          onChange={(limitToBounds) => update({ limitToBounds }, true)}
        />
        <SliderEdit
          label={t("trackpads.hapticStrength")}
          value={pads.hapticStrength}
          min={0}
          max={100}
          step={5}
          disabled={controlsDisabled}
          onChange={(hapticStrength) => update({ hapticStrength })}
        />
      </PanelSection>
      <PanelSection title={t("trackpads.appearance")}>
        <ToggleRow
          label={t("trackpads.autoHide")}
          value={pads.autoHide}
          disabled={visualDisabled}
          onChange={(autoHide) => update({ autoHide }, true)}
        />
        <SliderEdit
          label={t("trackpads.hideDelay")}
          value={pads.hideDelay}
          min={1}
          max={5}
          step={1}
          disabled={visualDisabled || !pads.autoHide}
          onChange={(hideDelay) => update({ hideDelay })}
        />
        <SliderEdit
          label={t("trackpads.borderOpacity")}
          value={pads.borderOpacity}
          min={0}
          max={50}
          step={5}
          disabled={visualDisabled}
          onChange={(borderOpacity) => update({ borderOpacity })}
        />
        <SliderEdit
          label={t("trackpads.borderWidth")}
          value={pads.borderWidth}
          min={1}
          max={10}
          step={1}
          disabled={visualDisabled}
          onChange={(borderWidth) => update({ borderWidth })}
        />
        <SliderEdit
          label={t("trackpads.borderRadius")}
          value={pads.borderRadius}
          min={0}
          max={100}
          step={1}
          disabled={visualDisabled}
          onChange={(borderRadius) => update({ borderRadius })}
        />
        <SelectEdit
          label={t("trackpads.backgroundStyle")}
          value={pads.backgroundStyle}
          disabled={visualDisabled}
          options={[
            { data: "dots", label: t("trackpads.backgroundDots") },
            { data: "solid", label: t("trackpads.backgroundSolid") },
            { data: "none", label: t("trackpads.backgroundNone") },
          ]}
          onChange={(backgroundStyle) => update({ backgroundStyle }, true)}
        />
        <SliderEdit
          label={t("trackpads.backgroundOpacity")}
          value={pads.backgroundOpacity}
          min={0}
          max={50}
          step={5}
          disabled={visualDisabled || pads.backgroundStyle === "none"}
          onChange={(backgroundOpacity) => update({ backgroundOpacity })}
        />
        <SliderEdit
          label={t("trackpads.dotSize")}
          value={pads.dotSize}
          min={1}
          max={6}
          step={1}
          disabled={visualDisabled || pads.backgroundStyle !== "dots"}
          onChange={(dotSize) => update({ dotSize })}
        />
        <SliderEdit
          label={t("trackpads.dotGap")}
          value={pads.dotGap}
          min={2}
          max={24}
          step={1}
          disabled={visualDisabled || pads.backgroundStyle !== "dots"}
          onChange={(dotGap) => update({ dotGap })}
        />
      </PanelSection>
      <PanelSection title={t("trackpads.centerIndicator")}>
        <ToggleRow
          label={t("trackpads.centerDot")}
          description={t("trackpads.centerDotDescription")}
          value={pads.centerDotEnabled}
          disabled={centerDotDisabled}
          onChange={(centerDotEnabled) => update({ centerDotEnabled }, true)}
        />
        <SliderEdit
          label={t("trackpads.centerDotSize")}
          value={pads.centerDotSize}
          min={1}
          max={32}
          step={1}
          disabled={centerDotDisabled || !pads.centerDotEnabled}
          onChange={(centerDotSize) => update({ centerDotSize })}
        />
        <SliderEdit
          label={t("trackpads.centerDotOpacity")}
          value={pads.centerDotOpacity}
          min={0}
          max={50}
          step={5}
          disabled={centerDotDisabled || !pads.centerDotEnabled}
          onChange={(centerDotOpacity) => update({ centerDotOpacity })}
        />
      </PanelSection>
    </div>
  );
}
