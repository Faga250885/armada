#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHONPATH="$ROOT/system_files/usr/lib/armada" python3 - <<'PYEOF'
from armada_virtual_trackpads import DEFAULT_CONFIG, rotate_touch, sanitize_config, trackpad_at

config = sanitize_config({
    "leftEnabled": True,
    "rightEnabled": True,
    "fourPads": True,
    "tapToClick": True,
    "leftSize": 35,
    "rightSize": 40,
    "hapticStrength": 500,
    "borderOpacity": -4,
    "backgroundOpacity": 45,
})
assert config["hapticStrength"] == 100
assert config["borderOpacity"] == 5
assert config["backgroundOpacity"] == 45
assert sanitize_config({"leftEnabled": 1})["leftEnabled"] is False
assert set(config) == set(DEFAULT_CONFIG)

assert rotate_touch(0.25, 0.75, "left") == (0.75, 0.75)
assert rotate_touch(0.25, 0.75, "right") == (0.25, 0.25)
assert rotate_touch(0.25, 0.75, "normal") == (0.25, 0.75)

# 35% high square in a 16:9 viewport occupies 19.6875% of its width.
left = trackpad_at(0.05, 0.9, config)
right = trackpad_at(0.95, 0.9, config)
assert left and left[0] == "left"
assert right and right[0] == "right"
assert trackpad_at(0.5, 0.5, config) is None
assert all(0 <= value <= 1 for value in left[1:] + right[1:])

only_left = {**config, "rightEnabled": False}
assert trackpad_at(0.95, 0.9, only_left) is None

from armada_virtual_trackpads import trackpad_zone_at
top_left = trackpad_zone_at(0.05, 0.1, config)
bottom_left = trackpad_zone_at(0.05, 0.9, config)
top_right = trackpad_zone_at(0.95, 0.1, config)
bottom_right = trackpad_zone_at(0.95, 0.9, config)
assert top_left and top_left[:2] == ("left", "top")
assert bottom_left and bottom_left[:2] == ("left", "bottom")
assert top_right and top_right[:2] == ("right", "top")
assert bottom_right and bottom_right[:2] == ("right", "bottom")
two_pads = {**config, "fourPads": False}
assert trackpad_zone_at(0.05, 0.1, two_pads) is None

print("Virtual trackpad geometry and configuration tests passed")
PYEOF

grep -Fq 'borderRadius: "12px"' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq 'radial-gradient(circle' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq 'HOLD_MS = 3000' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq '{ id: "Trackpads", title: tabIcons.Trackpads' "$ROOT/decky/armada-control/src/Content.tsx"
! grep -Fq '<Trackpads config={config} setConfig={setConfig} />' "$ROOT/decky/armada-control/src/tabs/Settings.tsx"
grep -Fq 'fcntl.ioctl(fd, EVIOCGRAB, 1)' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'systemctl enable armada-virtual-trackpads.service' "$ROOT/build_files/40-vendor-system-files.sh"
