# Patches

Patches applied on top of BASE.env. Each entry's `source` is an upstream URL pinned
to a commit, or `armada` if it's original; a URL source with no `notes` is verbatim.
`notes` mean the file was modified.

- `patches/0001-fix-gamepad-share-raw-input.patch`
  source: armada
- `patches/0002-fix-force-feedback-reset-effects-when-replacing-targets.patch`
  source: armada
- `patches/0003-feat-Hardware-Support-Add-AYN-Thor-Lite.patch`
  source: https://github.com/ShadowBlip/InputPlumber/pull/746
  notes: AYN Thor Lite support
- `patches/0004-fix-AyaneoHaptics-sleep-between-polls.patch`
  source: armada
- `patches/0005-feat-Hardware-Support-Qualcomm-SSC-sensors.patch`
  source: https://github.com/ShadowBlip/InputPlumber/pull/590
  notes: Rebased on latest InputPlumber; adds the FastRPCDevice.Id polkit action the upstream policy test requires.
- `patches/0006-fix-ssc-scale-accelerometer-to-UHID-units-keep-SSC-libraries-loaded.patch`
  source: https://github.com/tycosnh/InputPlumber/commit/a60b3192eb76b1758a481cbffecbc3487ca2d232
  notes: Removed lockfile change
- `patches/0007-add-fastrpc-config-to-devices.patch`
  source: armada
  notes: fastrpc matcher pinned to fastrpc-adsp. Boards like the Retroid Pocket 6 also expose fastrpc-cdsp/-cdsp-secure, and an unqualified matcher spawns doomed SSC CompositeDevices on the compute DSP.
- `patches/0008-feat-Manager-opt-in-to-FastRPC-devices.patch`
  source: armada
  notes: FastRPC sources stay off unless INPUTPLUMBER_FASTRPC=1, armada-control's "Enable Gyro" toggle sets it and restarts InputPlumber.
