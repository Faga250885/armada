import os
import re
from pathlib import Path

try:
    import pwd
except ImportError:  # Local Windows development; deployed Armada systems use Linux.
    pwd = None


SHORTCUT_BUTTONS = {
    "A": 304, "B": 305, "X": 308, "Y": 307,
    "L1": 310, "R1": 311, "L2": 312, "R2": 313,
    "Select": 314, "Start": 315, "Steam": 316, "L3": 317, "R3": 318,
}


def display_dimensions(device_values, screen="primary", drm_root=Path("/sys/class/drm")):
    """Read the selected connector's pixel mode; no model/physical-size table."""
    values = device_values if isinstance(device_values, dict) else {}
    connector = values.get("ARMADA_SECONDARY_CONNECTOR" if screen == "secondary" else "ARMADA_PRIMARY_CONNECTOR", "")
    candidates = sorted(drm_root.glob(f"card*-{connector}/modes")) if connector else []
    if not connector and screen == "primary":
        candidates = sorted(drm_root.glob("card*-DSI-*/modes")) + sorted(drm_root.glob("card*-eDP-*/modes"))
    for path in candidates:
        try:
            status = path.with_name("status")
            if status.exists() and status.read_text().strip() == "disconnected":
                continue
            for line in path.read_text().splitlines():
                match = re.fullmatch(r"(\d+)x(\d+)", line.strip())
                if match:
                    width, height = map(int, match.groups())
                    if width > 0 and height > 0:
                        # Armada's internal Game Mode screens are landscape.
                        return max(width, height), min(width, height)
        except OSError:
            continue
    return 1920, 1080


def panel_aspect_ratio(device_values, screen="primary", drm_root=Path("/sys/class/drm")):
    width, height = display_dimensions(device_values, screen, drm_root)
    return width / height


def sanitize_shortcut_buttons(value):
    if (isinstance(value, list) and 1 <= len(value) <= 4
            and all(isinstance(button, str) and button in SHORTCUT_BUTTONS for button in value)
            and len(set(value)) == len(value)):
        return list(value)
    return ["L3", "R3"]


class ShortcutHold:
    """Fire once per chord, immediately or after a continuous hold."""

    def __init__(self, seconds=3.0):
        self.seconds = seconds
        self.started = None
        self.armed = True

    def update(self, left, right, now):
        pressed = {button for button, down in (("left", left), ("right", right)) if down}
        self.update_pressed(pressed, {"left", "right"}, now)

    def update_pressed(self, pressed, required, now):
        if not required or not set(required).issubset(pressed):
            self.started = None
            self.armed = True
        elif self.started is None:
            self.started = now

    def ready(self, now):
        if self.armed and self.started is not None and now - self.started >= self.seconds:
            self.armed = False
            return True
        return False


def game_mode_active(user=None, runtime_root=Path("/run/user"), screen="primary"):
    """Use the selected session's live socket, not a stale environment value."""
    if pwd is None:
        return False
    try:
        account = pwd.getpwnam(user or os.environ.get("ARMADA_SESSION_USER", "armada"))
        name = "gamescope-secondary" if screen == "secondary" else "gamescope-primary"
        return (runtime_root / str(account.pw_uid) / name).is_socket()
    except (KeyError, OSError):
        return False


def should_capture_touch(config, session_active):
    """Release the digitizer in Desktop when Game Mode only is selected."""
    return (not config["gameModeOnly"] or session_active) and (
        config["blockTouchscreen"] or
        config["enabled"] and (config["leftEnabled"] or config["rightEnabled"])
    )

DEFAULT_CONFIG = {
    "enabled": False,
    "blockTouchscreen": False,
    "gameModeOnly": True,
    "shortcutEnabled": True,
    "shortcutButtons": ["L3", "R3"],
    "shortcutHoldSeconds": 3,
    "screen": "primary",
    "touchRotation": "normal",
    "touchMirror": False,
    "leftEnabled": True,
    "rightEnabled": True,
    "mode": "simple",
    "tapToClick": True,
    "limitToBounds": True,
    "leftSize": 35,
    "rightSize": 35,
    "edgeGap": 8,
    "hapticStrength": 60,
    "borderOpacity": 30,
    "borderWidth": 2,
    "backgroundStyle": "dots",
    "backgroundOpacity": 30,
    "autoHide": True,
    "hideDelay": 1,
    "borderRadius": 24,
    "dotSize": 1,
    "dotGap": 4,
    "centerDotEnabled": False,
    "centerDotSize": 8,
    "centerDotOpacity": 35,
}

NUMBER_RANGES = {
    "leftSize": (15, 80),
    "rightSize": (15, 80),
    "edgeGap": (0, 160),
    "hapticStrength": (0, 100),
    "borderOpacity": (0, 50),
    "borderWidth": (1, 10),
    "backgroundOpacity": (0, 50),
    "hideDelay": (1, 5),
    "borderRadius": (0, 100),
    "dotSize": (1, 6),
    "dotGap": (2, 24),
    "centerDotSize": (1, 32),
    "centerDotOpacity": (0, 50),
}

BOOLEAN_KEYS = (
    "enabled", "blockTouchscreen", "leftEnabled", "rightEnabled",
    "tapToClick", "limitToBounds", "centerDotEnabled",
    "autoHide", "gameModeOnly", "shortcutEnabled", "touchMirror",
)


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def sanitize_config(value):
    result = {key: list(item) if isinstance(item, list) else item for key, item in DEFAULT_CONFIG.items()}
    if not isinstance(value, dict):
        return result
    for key in BOOLEAN_KEYS:
        if isinstance(value.get(key), bool):
            result[key] = value[key]
    for key, (minimum, maximum) in NUMBER_RANGES.items():
        number = value.get(key)
        if isinstance(number, int) and not isinstance(number, bool):
            result[key] = max(minimum, min(maximum, number))
    result["shortcutButtons"] = sanitize_shortcut_buttons(value.get("shortcutButtons"))
    if type(value.get("shortcutHoldSeconds")) is int and value["shortcutHoldSeconds"] in (0, 3):
        result["shortcutHoldSeconds"] = value["shortcutHoldSeconds"]
    if value.get("screen") in ("primary", "secondary"):
        result["screen"] = value["screen"]
    if value.get("touchRotation") in ("normal", "right", "upside_down", "left"):
        result["touchRotation"] = value["touchRotation"]
    if value.get("backgroundStyle") in ("dots", "solid", "none"):
        result["backgroundStyle"] = value["backgroundStyle"]
    if value.get("mode") in ("simple", "corners", "floating", "halves"):
        result["mode"] = value["mode"]
    elif value.get("fourPads") is True:
        # Preserve the layout selected by images created before modes existed.
        result["mode"] = "corners"
    if "enabled" not in value and (value.get("leftEnabled") is True or value.get("rightEnabled") is True):
        # Older images used the side toggles as the implicit master switch.
        result["enabled"] = True
    # A short tap always represents the physical click of a Steam Deck pad.
    result["tapToClick"] = True
    if result["blockTouchscreen"]:
        result["enabled"] = False
    return result


def rotate_touch(x, y, orientation):
    """Rotate a normalized screen point clockwise/right or counterclockwise/left."""
    if orientation == "left":
        return y, 1.0 - x
    if orientation == "right":
        return 1.0 - y, x
    if orientation == "upside_down":
        return 1.0 - x, 1.0 - y
    return x, y


def transform_touch(x, y, device_values, config):
    """Match Gamescope's panel transform, then apply optional user calibration.

    Gamescope's force_orientation uses left=90/right=270; its touchscreen
    transform is the inverse of the scanout rotation. Reuse that convention
    instead of introducing a separate per-device touchscreen orientation.
    """
    panel_orientation = device_values.get("ARMADA_PANEL_ORIENTATION", "normal")
    automatic = {"left": "right", "right": "left"}.get(panel_orientation, panel_orientation)
    x, y = rotate_touch(x, y, automatic)
    x, y = rotate_touch(x, y, config.get("touchRotation", "normal"))
    if config.get("touchMirror", False):
        x = 1.0 - x
    return clamp(x), clamp(y)


def trackpad_at(x, y, config, aspect_ratio=16 / 9, pixel_height=1080):
    """Return (side, local_x, local_y) for an enabled bottom-corner pad."""
    for side in ("left", "right"):
        if not config[f"{side}Enabled"]:
            continue
        height = config[f"{side}Size"] / 100.0
        width = height / aspect_ratio
        gap_y = config["edgeGap"] / float(pixel_height)
        gap_x = gap_y / aspect_ratio
        left = gap_x if side == "left" else 1.0 - gap_x - width
        top = 1.0 - gap_y - height
        if left <= x <= left + width and top <= y <= top + height:
            return side, clamp((x - left) / width), clamp((y - top) / height)
    return None


def trackpad_zone_at(x, y, config, aspect_ratio=16 / 9, pixel_height=1080):
    """Return (side, corner, local_x, local_y) for an enabled pad zone."""
    if not config["enabled"]:
        return None
    for side in ("left", "right"):
        if not config[f"{side}Enabled"]:
            continue
        height = config[f"{side}Size"] / 100.0
        width = height / aspect_ratio
        gap_y = config["edgeGap"] / float(pixel_height)
        gap_x = gap_y / aspect_ratio
        left = gap_x if side == "left" else 1.0 - gap_x - width
        mode = config["mode"]
        if mode in ("floating", "halves"):
            if (side == "left" and x <= 0.5) or (side == "right" and x > 0.5):
                if mode == "halves":
                    local_x = x * 2.0 if side == "left" else (x - 0.5) * 2.0
                    return side, "half", clamp(local_x), clamp(y)
                return side, "floating", 0.5, 0.5
            continue
        corners = ("top", "bottom") if mode == "corners" else ("bottom",)
        for corner in corners:
            top = gap_y if corner == "top" else 1.0 - gap_y - height
            if left <= x <= left + width and top <= y <= top + height:
                return side, corner, clamp((x - left) / width), clamp((y - top) / height)
    return None


def trackpad_coordinates(x, y, side, zone, config, anchor_x=0.5, anchor_y=0.5, aspect_ratio=16 / 9, pixel_height=1080):
    """Map a screen point to the selected virtual Steam Deck touchpad."""
    if zone == "half":
        local_x = x * 2.0 if side == "left" else (x - 0.5) * 2.0
        return clamp(local_x), clamp(y)
    height = config[f"{side}Size"] / 100.0
    width = height / aspect_ratio
    if zone == "floating":
        return (
            clamp(0.5 + (x - anchor_x) / width),
            clamp(0.5 + (y - anchor_y) / height),
        )
    gap_y = config["edgeGap"] / float(pixel_height)
    gap_x = gap_y / aspect_ratio
    left = gap_x if side == "left" else 1.0 - gap_x - width
    top = gap_y if zone == "top" else 1.0 - gap_y - height
    return clamp((x - left) / width), clamp((y - top) / height)


def point_in_trackpad_bounds(x, y, side, zone, config, anchor_x=0.5, anchor_y=0.5, aspect_ratio=16 / 9, pixel_height=1080):
    """Return whether a screen point remains inside its assigned pad area."""
    if zone == "half":
        return x <= 0.5 if side == "left" else x > 0.5
    height = config[f"{side}Size"] / 100.0
    width = height / aspect_ratio
    if zone == "floating":
        return (
            anchor_x - width / 2 <= x <= anchor_x + width / 2
            and anchor_y - height / 2 <= y <= anchor_y + height / 2
        )
    gap_y = config["edgeGap"] / float(pixel_height)
    gap_x = gap_y / aspect_ratio
    left = gap_x if side == "left" else 1.0 - gap_x - width
    top = gap_y if zone == "top" else 1.0 - gap_y - height
    return left <= x <= left + width and top <= y <= top + height
