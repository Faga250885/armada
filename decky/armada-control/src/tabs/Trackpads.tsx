import { toaster } from "@decky/api";
import { Field } from "@decky/ui";
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { setVirtualTrackpads } from "../backend";
import { SliderEdit, ToggleRow } from "../components/widgets";
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
  const deckControllerSelected = config.controllerType === "deck-uhid";
  return (
    <>
      <div className="armada-subheader">{t("trackpads.title")}</div>
        <ToggleRow
          label={t("trackpads.fourPads")}
          description={t("trackpads.fourPadsDescription")}
          value={pads.fourPads}
          onChange={(fourPads) => update({ fourPads }, true)}
        />
        <ToggleRow
          label={t("trackpads.left")}
          description={!deckControllerSelected ? t("trackpads.selectDeckFirst") : undefined}
          value={pads.leftEnabled}
          disabled={!deckControllerSelected}
          onChange={(leftEnabled) => update({ leftEnabled }, true)}
        />
        <SliderEdit
          label={t("trackpads.leftSize")}
          value={pads.leftSize}
          min={15}
          max={60}
          step={1}
          disabled={!pads.leftEnabled}
          onChange={(leftSize) => update({ leftSize })}
        />
        <ToggleRow
          label={t("trackpads.right")}
          description={!deckControllerSelected ? t("trackpads.selectDeckFirst") : undefined}
          value={pads.rightEnabled}
          disabled={!deckControllerSelected}
          onChange={(rightEnabled) => update({ rightEnabled }, true)}
        />
        <SliderEdit
          label={t("trackpads.rightSize")}
          value={pads.rightSize}
          min={15}
          max={60}
          step={1}
          disabled={!pads.rightEnabled}
          onChange={(rightSize) => update({ rightSize })}
        />
      <div className="armada-subheader">{t("trackpads.feedback")}</div>
        <ToggleRow
          label={t("trackpads.tapToClick")}
          description={t("trackpads.tapToClickDescription")}
          value={pads.tapToClick}
          onChange={(tapToClick) => update({ tapToClick }, true)}
        />
        <SliderEdit
          label={t("trackpads.hapticStrength")}
          value={pads.hapticStrength}
          min={0}
          max={100}
          step={5}
          onChange={(hapticStrength) => update({ hapticStrength })}
        />
        <SliderEdit
          label={t("trackpads.borderOpacity")}
          value={pads.borderOpacity}
          min={5}
          max={100}
          step={5}
          onChange={(borderOpacity) => update({ borderOpacity })}
        />
        <SliderEdit
          label={t("trackpads.backgroundOpacity")}
          value={pads.backgroundOpacity}
          min={0}
          max={100}
          step={5}
          onChange={(backgroundOpacity) => update({ backgroundOpacity })}
        />
        <Field label={t("trackpads.touchscreenNotice")} />
        <Field label={t("trackpads.deckTargetNotice")} />
    </>
  );
}
