# Patches

`launcher-*.patch` apply at first launch to a per-user copy of the launcher
Steam installs. `android-*.patch` are the source of `prebuilt/`; they apply to
Valve's Android tree for the tag in BASE.env (`build-android.sh`).

- `patches/launcher-0001-gamepad-and-second-display.patch`
  source: armada
- `patches/android-0001-hwcomposer-add-an-external-display.patch`
  source: armada
- `patches/android-0002-hwc2on1adapter-set-displays-the-client-has-not-revalidated.patch`
  source: armada
