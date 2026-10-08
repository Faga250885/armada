import os
from pathlib import Path

try:
    import pwd
except ImportError:  # Local Windows development; deployed Armada systems use Linux.
    pwd = None


DECK_TRACKPAD_SIZE_MM = 32.5


def game_mode_active(user=None, runtime_root=Path("/run/user")):
    """The session's primary Gamescope socket exists only in Steam Game Mode."""
    if pwd is None:
        return False
    try:
        account = pwd.getpwnam(user or os.environ.get("ARMADA_SESSION_USER", "armada"))
        return (runtime_root / str(account.pw_uid) / "gamescope-primary").is_socket()
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
    "gameModeOnly": False,
    "leftEnabled": False,
    "rightEnabled": False,
    "mode": "simple",
    "tapToClick": True,
    "limitToBounds": False,
    "deckLikeSize": True,
    "leftSize": 35,
    "rightSize": 35,
    "edgeGap": 0,
    "hapticStrength": 35,
    "borderOpacity": 20,
    "borderWidth": 1,
    "backgroundStyle": "dots",
    "backgroundOpacity": 12,
    "autoHide": True,
    "hideDelay": 1,
    "borderRadius": 28,
    "dotSize": 1,
    "dotGap": 11,
    "centerDotEnabled": False,
    "centerDotSize": 8,
    "centerDotOpacity": 35,
}

NUMBER_RANGES = {
    "leftSize": (15, 60),
    "rightSize": (15, 60),
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
    "tapToClick", "limitToBounds", "deckLikeSize", "centerDotEnabled",
    "autoHide", "gameModeOnly",
)


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def physical_panel_height_mm(device_values=None, drm_root=Path("/sys/class/drm")):
    """Return the visible landscape panel height, preferring device metadata."""
    if isinstance(device_values, dict):
        try:
            explicit = float(device_values.get("ARMADA_PANEL_PHYSICAL_HEIGHT_MM", 0))
        except (TypeError, ValueError):
            explicit = 0.0
        if explicit > 0:
            return explicit

    candidates = []
    try:
        paths = sorted(drm_root.glob("card*-*/edid"))
    except OSError:
        paths = []
    for path in paths:
        try:
            data = path.read_bytes()
        except OSError:
            continue
        if (
            len(data) < 23
            or data[:8] != b"\x00\xff\xff\xff\xff\xff\xff\x00"
            or not data[21]
            or not data[22]
        ):
            continue
        # EDID stores the two physical axes in centimetres.  Game Mode is
        # landscape on Armada handhelds, so its visible height is the shorter
        # physical axis even when the native panel scanout is portrait.
        height = min(data[21], data[22]) * 10.0
        name = path.parent.name.lower()
        priority = 0 if ("dsi" in name or "edp" in name) else 1
        candidates.append((priority, height))
    return min(candidates)[1] if candidates else None


def apply_deck_like_size(config, device_values=None, drm_root=Path("/sys/class/drm")):
    """Resolve a 32.5 mm square pad to a percentage of the physical screen."""
    result = dict(config)
    if not result.get("deckLikeSize"):
        return result
    height_mm = physical_panel_height_mm(device_values, drm_root)
    if not height_mm:
        return result
    minimum, maximum = NUMBER_RANGES["leftSize"]
    size = round(max(minimum, min(maximum, DECK_TRACKPAD_SIZE_MM / height_mm * 100.0)))
    result["leftSize"] = size
    result["rightSize"] = size
    return result


def sanitize_config(value):
    result = dict(DEFAULT_CONFIG)
    if not isinstance(value, dict):
        return result
    for key in BOOLEAN_KEYS:
        if isinstance(value.get(key), bool):
            result[key] = value[key]
    for key, (minimum, maximum) in NUMBER_RANGES.items():
        number = value.get(key)
        if isinstance(number, int) and not isinstance(number, bool):
            result[key] = max(minimum, min(maximum, number))
    if value.get("backgroundStyle") in ("dots", "solid", "none"):
        result["backgroundStyle"] = value["backgroundStyle"]
    if value.get("mode") in ("simple", "corners", "floating", "halves"):
        result["mode"] = value["mode"]
    elif value.get("fourPads") is True:
        # Preserve the layout selected by images created before modes existed.
        result["mode"] = "corners"
    if "enabled" not in value and (result["leftEnabled"] or result["rightEnabled"]):
        # Older images used the side toggles as the implicit master switch.
        result["enabled"] = True
    # A short tap always represents the physical click of a Steam Deck pad.
    result["tapToClick"] = True
    if result["blockTouchscreen"]:
        result["enabled"] = False
    return result


def rotate_touch(x, y, orientation):
    """Map panel-native normalized coordinates into the visible display."""
    if orientation == "left":
        return y, 1.0 - x
    if orientation == "right":
        return 1.0 - y, x
    if orientation == "upside_down":
        return 1.0 - x, 1.0 - y
    return x, y


def trackpad_at(x, y, config, aspect_ratio=16 / 9):
    """Return (side, local_x, local_y) for an enabled bottom-corner pad."""
    for side in ("left", "right"):
        if not config[f"{side}Enabled"]:
            continue
        height = config[f"{side}Size"] / 100.0
        width = height / aspect_ratio
        gap_y = config["edgeGap"] / 1080.0
        gap_x = gap_y / aspect_ratio
        left = gap_x if side == "left" else 1.0 - gap_x - width
        top = 1.0 - gap_y - height
        if left <= x <= left + width and top <= y <= top + height:
            return side, clamp((x - left) / width), clamp((y - top) / height)
    return None


def trackpad_zone_at(x, y, config, aspect_ratio=16 / 9):
    """Return (side, corner, local_x, local_y) for an enabled pad zone."""
    if not config["enabled"]:
        return None
    for side in ("left", "right"):
        if not config[f"{side}Enabled"]:
            continue
        height = config[f"{side}Size"] / 100.0
        width = height / aspect_ratio
        gap_y = config["edgeGap"] / 1080.0
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


def trackpad_coordinates(x, y, side, zone, config, anchor_x=0.5, anchor_y=0.5, aspect_ratio=16 / 9):
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
    gap_y = config["edgeGap"] / 1080.0
    gap_x = gap_y / aspect_ratio
    left = gap_x if side == "left" else 1.0 - gap_x - width
    top = gap_y if zone == "top" else 1.0 - gap_y - height
    return clamp((x - left) / width), clamp((y - top) / height)


def point_in_trackpad_bounds(x, y, side, zone, config, anchor_x=0.5, anchor_y=0.5, aspect_ratio=16 / 9):
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
    gap_y = config["edgeGap"] / 1080.0
    gap_x = gap_y / aspect_ratio
    left = gap_x if side == "left" else 1.0 - gap_x - width
    top = gap_y if zone == "top" else 1.0 - gap_y - height
    return left <= x <= left + width and top <= y <= top + height
