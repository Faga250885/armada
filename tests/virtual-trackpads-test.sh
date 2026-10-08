#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHONPATH="$ROOT/system_files/usr/lib/armada" python3 - <<'PYEOF'
import os
import socket
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from armada_virtual_trackpads import DEFAULT_CONFIG, apply_deck_like_size, game_mode_active, point_in_trackpad_bounds, rotate_touch, sanitize_config, should_capture_touch, trackpad_at, trackpad_coordinates

config = sanitize_config({
    "enabled": True,
    "blockTouchscreen": False,
    "leftEnabled": True,
    "rightEnabled": True,
    "mode": "corners",
    "tapToClick": True,
    "limitToBounds": True,
    "leftSize": 35,
    "rightSize": 40,
    "hapticStrength": 500,
    "borderOpacity": -4,
    "backgroundOpacity": 45,
})
assert config["hapticStrength"] == 100
assert config["borderOpacity"] == 0
assert config["backgroundOpacity"] == 45
assert sanitize_config({"borderOpacity": 100, "backgroundOpacity": 100, "centerDotOpacity": 100})["borderOpacity"] == 50
assert sanitize_config({"borderOpacity": 100, "backgroundOpacity": 100, "centerDotOpacity": 100})["backgroundOpacity"] == 50
assert sanitize_config({"borderOpacity": 100, "backgroundOpacity": 100, "centerDotOpacity": 100})["centerDotOpacity"] == 50
assert sanitize_config({"borderWidth": 99})["borderWidth"] == 10
assert sanitize_config({"backgroundStyle": "solid"})["backgroundStyle"] == "solid"
assert sanitize_config({"backgroundStyle": "none"})["backgroundStyle"] == "none"
assert sanitize_config({"backgroundStyle": "bad"})["backgroundStyle"] == "dots"
assert sanitize_config({"hideDelay": 99})["hideDelay"] == 5
assert sanitize_config({"gameModeOnly": True})["gameModeOnly"] is True
only_game = sanitize_config({"enabled": True, "leftEnabled": True, "gameModeOnly": True})
assert not should_capture_touch(only_game, False)
assert should_capture_touch(only_game, True)
assert should_capture_touch({**only_game, "gameModeOnly": False}, False)
assert not should_capture_touch({**only_game, "enabled": False, "blockTouchscreen": True}, False)
assert should_capture_touch({**only_game, "enabled": False, "blockTouchscreen": True}, True)
assert sanitize_config({"borderColor": "#ff0000"}).get("borderColor") is None
assert sanitize_config({"leftEnabled": 1})["leftEnabled"] is False
assert sanitize_config({"enabled": False, "leftEnabled": True})["enabled"] is False
assert sanitize_config({"leftEnabled": True})["enabled"] is True
assert sanitize_config({"blockTouchscreen": True})["blockTouchscreen"] is True
assert sanitize_config({"enabled": True, "blockTouchscreen": True})["enabled"] is False
assert sanitize_config({"tapToClick": False})["tapToClick"] is True
assert set(config) == set(DEFAULT_CONFIG)
assert "fixedBottom" not in DEFAULT_CONFIG
assert DEFAULT_CONFIG["deckLikeSize"] is True
with tempfile.TemporaryDirectory() as directory:
    runtime = Path(directory)
    user_runtime = runtime / str(os.getuid())
    user_runtime.mkdir()
    with patch("armada_virtual_trackpads.pwd.getpwnam", return_value=SimpleNamespace(pw_uid=os.getuid())):
        assert not game_mode_active(runtime_root=runtime)
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as gamescope:
            gamescope.bind(str(user_runtime / "gamescope-test"))
            (user_runtime / "gamescope-primary").symlink_to("gamescope-test")
            assert game_mode_active(runtime_root=runtime)
            (user_runtime / "gamescope-primary").unlink()
            assert not game_mode_active(runtime_root=runtime)
deck_like = apply_deck_like_size(config, {"ARMADA_PANEL_PHYSICAL_HEIGHT_MM": "68.5"})
assert deck_like["leftSize"] == deck_like["rightSize"] == 47
manual_size = apply_deck_like_size({**config, "deckLikeSize": False, "leftSize": 38, "rightSize": 38}, {"ARMADA_PANEL_PHYSICAL_HEIGHT_MM": "68.5"})
assert manual_size["leftSize"] == manual_size["rightSize"] == 38
with tempfile.TemporaryDirectory() as directory:
    connector = Path(directory) / "card0-DSI-1"
    connector.mkdir()
    edid = bytearray(128)
    edid[:8] = b"\x00\xff\xff\xff\xff\xff\xff\x00"
    edid[21], edid[22] = 12, 7
    (connector / "edid").write_bytes(edid)
    detected = apply_deck_like_size(config, {}, Path(directory))
    assert detected["leftSize"] == detected["rightSize"] == 46

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
simple = {**config, "mode": "simple"}
assert trackpad_zone_at(0.05, 0.1, simple) is None
assert trackpad_zone_at(0.05, 0.9, simple)[:2] == ("left", "bottom")
assert trackpad_zone_at(0.05, 0.9, {**simple, "enabled": False}) is None

floating = {**config, "mode": "floating"}
assert trackpad_zone_at(0.45, 0.42, floating) == ("left", "floating", 0.5, 0.5)
assert trackpad_zone_at(0.55, 0.68, floating) == ("right", "floating", 0.5, 0.5)

halves = {**config, "mode": "halves"}
assert trackpad_zone_at(0.25, 0.4, halves) == ("left", "half", 0.5, 0.4)
assert trackpad_zone_at(0.75, 0.6, halves) == ("right", "half", 0.5, 0.6)
assert trackpad_coordinates(0.3, 0.4, "left", "half", halves) == (0.6, 0.4)
right_half = trackpad_coordinates(0.8, 0.6, "right", "half", halves)
assert abs(right_half[0] - 0.6) < 1e-9 and right_half[1] == 0.6
floating_center = trackpad_coordinates(0.25, 0.5, "left", "floating", floating, 0.25, 0.5)
assert floating_center == (0.5, 0.5)
floating_move = trackpad_coordinates(0.27, 0.53, "left", "floating", floating, 0.25, 0.5)
assert floating_move[0] > 0.5 and floating_move[1] > 0.5
assert point_in_trackpad_bounds(0.26, 0.52, "left", "floating", floating, 0.25, 0.5)
assert not point_in_trackpad_bounds(0.49, 0.52, "left", "floating", floating, 0.25, 0.5)
assert point_in_trackpad_bounds(0.05, 0.9, "left", "bottom", simple)
assert not point_in_trackpad_bounds(0.3, 0.9, "left", "bottom", simple)

print("Virtual trackpad geometry and configuration tests passed")
PYEOF

grep -Fq 'borderRadius: `${config.borderRadius / 2}%`' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq 'context.arc(' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq 'const holdMs = config.hideDelay * 1000' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq 'backgroundStyle === "dots"' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq 'game_mode_active' "$ROOT/system_files/usr/lib/armada/armada_virtual_trackpads.py"
grep -Fq 'config.mode === "halves"' "$ROOT/decky/armada-control/src/components/VirtualTrackpadOverlay.tsx"
grep -Fq '{ id: "Trackpads", title: tabIcons.Trackpads' "$ROOT/decky/armada-control/src/Content.tsx"
! grep -Fq '<Trackpads config={config} setConfig={setConfig} />' "$ROOT/decky/armada-control/src/tabs/Settings.tsx"
grep -Fq 'fcntl.ioctl(fd, EVIOCGRAB, 1)' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'Touchpad:{side.title()}Pad:Motion' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'Touchpad:{side.title()}Pad:Button:Press' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
! grep -Fq 'Touchpad:{side.title()}Pad:Touch:' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq '.write_send_event(NativeEvent::new(cap, value))' "$ROOT/packages/inputplumber/patches/0005-add-dbus-touch-events.patch"
! grep -Fq 'blocking_write_send_event(NativeEvent::new(cap, value))' "$ROOT/packages/inputplumber/patches/0005-add-dbus-touch-events.patch"
! grep -Fq '.blocking_write_send_event(event)' "$ROOT/packages/inputplumber/patches/0005-add-dbus-touch-events.patch"
grep -Fq 'className="armada-trackpads-tab"' "$ROOT/decky/armada-control/src/tabs/Trackpads.tsx"
grep -Fq 'systemctl enable armada-virtual-trackpads.service' "$ROOT/build_files/40-vendor-system-files.sh"
grep -Fq 'ARMADA_TOUCHSCREEN_ORIENTATION=right' "$ROOT/system_files/usr/lib/armada/devices/retroid-pocket-6.conf"
grep -Fq 'ARMADA_PANEL_PHYSICAL_HEIGHT_MM=68.5' "$ROOT/system_files/usr/lib/armada/devices/retroid-pocket-6.conf"
grep -Fq '"ARMADA_TOUCHSCREEN_ORIENTATION"' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'ARMADA_TOUCHSCREEN_ORIENTATION' "$ROOT/system_files/usr/libexec/armada/device-env"
grep -Fq 'ARMADA_VIRTUAL_TRACKPADS_OVERLAY' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads-overlay"
grep -Fq 'XFixesSetWindowShapeRegion' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads-overlay"
! grep -Fq 'b"STEAM_OVERLAY"' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads-overlay"
grep -Fq 'preview_until' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads-overlay"
grep -Fq 'GAMESCOPE_WAYLAND_DISPLAY' "$ROOT/system_files/usr/lib/armada/armada_overlay_session.py"
grep -Fq 'def xwayland_authorities(' "$ROOT/system_files/usr/lib/armada/armada_overlay_session.py"
grep -Fq 'if not can_open_x11(display, authority)' "$ROOT/system_files/usr/lib/armada/armada_overlay_session.py"
grep -Fq 'gi.require_version("Gdk", "4.0")' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads-overlay"
grep -Fq 'display_name = discover_gamescope_environment()' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads-overlay"
grep -Fq 'class MouseClickSink' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'ecodes.BTN_LEFT' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'self.mouse_click.click()' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'python3-evdev' "$ROOT/build_files/10-base-packages.sh"
grep -Fq 'self.ip.press(side, True)' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'self.press_releases[side] = {' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
grep -Fq 'pending["index"]' "$ROOT/system_files/usr/libexec/armada/virtual-trackpads"
! grep -Fq 'fixedBottom' "$ROOT/decky/armada-control/src/tabs/Trackpads.tsx"
grep -Fq 'pads.deckLikeSize' "$ROOT/decky/armada-control/src/tabs/Trackpads.tsx"
grep -Fq 'ARMADA_OVERLAY_PROP' "$ROOT/packages/gamescope/patches/0028-steamcompmgr-armada-virtual-trackpad-overlay.patch"
grep -Fq 'w->isExternalOverlay || w->isArmadaOverlay' "$ROOT/packages/gamescope/patches/0028-steamcompmgr-armada-virtual-trackpad-overlay.patch"
grep -Fq 'pPaintFocus->armadaOverlayWindow && pPaintFocus->armadaOverlayWindow->opacity' "$ROOT/packages/gamescope/patches/0028-steamcompmgr-armada-virtual-trackpad-overlay.patch"
python3 "$ROOT/tests/virtual-trackpads-haptics-test.py"
! grep -Fq '<VirtualTrackpadOverlay' "$ROOT/decky/armada-control/src/Content.tsx"
grep -Fq 'systemctl --global enable armada-virtual-trackpads-overlay.service' "$ROOT/build_files/40-vendor-system-files.sh"
