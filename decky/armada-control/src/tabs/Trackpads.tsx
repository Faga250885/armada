import { toaster } from "@decky/api";
import { Field } from "@decky/ui";
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
  return (
    <>
      <div className="armada-subheader">{t("trackpads.title")}</div>
        <SelectEdit
          label={t("trackpads.mode")}
          value={pads.mode}
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
        <Field description={modeDescription} />
        <ToggleRow
          label={t("trackpads.left")}
          description={!deckControllerSelected ? t("trackpads.selectDeckFirst") : undefined}
          value={pads.leftEnabled}
          disabled={!deckControllerSelected || splitScreen}
          onChange={(leftEnabled) => update({ leftEnabled }, true)}
        />
        <SliderEdit
            label={t("trackpads.leftSize")}
            value={pads.leftSize}
            min={15}
            max={60}
            step={1}
            disabled={!pads.leftEnabled || splitScreen}
            onChange={(leftSize) => update({ leftSize })}
          />
        <ToggleRow
          label={t("trackpads.right")}
          description={!deckControllerSelected ? t("trackpads.selectDeckFirst") : undefined}
          value={pads.rightEnabled}
          disabled={!deckControllerSelected || splitScreen}
          onChange={(rightEnabled) => update({ rightEnabled }, true)}
        />
        <SliderEdit
            label={t("trackpads.rightSize")}
            value={pads.rightSize}
            min={15}
            max={60}
            step={1}
            disabled={!pads.rightEnabled || splitScreen}
            onChange={(rightSize) => update({ rightSize })}
          />
      <div className="armada-subheader">{t("trackpads.feedback")}</div>
        <ToggleRow
          label={t("trackpads.tapToClick")}
          description={t("trackpads.tapToClickDescription")}
          value={pads.tapToClick}
          disabled={splitScreen}
          onChange={(tapToClick) => update({ tapToClick }, true)}
        />
        <SliderEdit
          label={t("trackpads.hapticStrength")}
          value={pads.hapticStrength}
          min={0}
          max={100}
          step={5}
          disabled={splitScreen}
          onChange={(hapticStrength) => update({ hapticStrength })}
        />
        <>
          <SliderEdit
            label={t("trackpads.borderOpacity")}
            value={pads.borderOpacity}
            min={5}
            max={100}
            step={5}
            disabled={splitScreen}
            onChange={(borderOpacity) => update({ borderOpacity })}
          />
          <SliderEdit
            label={t("trackpads.backgroundOpacity")}
            value={pads.backgroundOpacity}
            min={0}
            max={100}
            step={5}
            disabled={splitScreen}
            onChange={(backgroundOpacity) => update({ backgroundOpacity })}
          />
        </>
        <Field label={t("trackpads.touchscreenNotice")} />
        <Field label={t("trackpads.deckTargetNotice")} />
    </>
  );
}
