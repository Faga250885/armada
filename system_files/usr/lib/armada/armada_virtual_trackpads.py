DEFAULT_CONFIG = {
    "enabled": False,
    "leftEnabled": False,
    "rightEnabled": False,
    "mode": "simple",
    "tapToClick": True,
    "limitToBounds": False,
    "leftSize": 35,
    "rightSize": 35,
    "hapticStrength": 35,
    "borderOpacity": 20,
    "backgroundOpacity": 12,
}

NUMBER_RANGES = {
    "leftSize": (15, 60),
    "rightSize": (15, 60),
    "hapticStrength": (0, 100),
    "borderOpacity": (5, 100),
    "backgroundOpacity": (0, 100),
}


def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, value))


def sanitize_config(value):
    result = dict(DEFAULT_CONFIG)
    if not isinstance(value, dict):
        return result
    for key in ("enabled", "leftEnabled", "rightEnabled", "tapToClick", "limitToBounds"):
        if isinstance(value.get(key), bool):
            result[key] = value[key]
    for key, (minimum, maximum) in NUMBER_RANGES.items():
        number = value.get(key)
        if isinstance(number, int) and not isinstance(number, bool):
            result[key] = max(minimum, min(maximum, number))
    if value.get("mode") in ("simple", "corners", "floating", "halves"):
        result["mode"] = value["mode"]
    elif value.get("fourPads") is True:
        # Preserve the layout selected by images created before modes existed.
        result["mode"] = "corners"
    if "enabled" not in value and (result["leftEnabled"] or result["rightEnabled"]):
        # Older images used the side toggles as the implicit master switch.
        result["enabled"] = True
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
        left = 0.0 if side == "left" else 1.0 - width
        top = 1.0 - height
        if left <= x <= left + width and top <= y <= 1.0:
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
        left = 0.0 if side == "left" else 1.0 - width
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
            top = 0.0 if corner == "top" else 1.0 - height
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
    left = 0.0 if side == "left" else 1.0 - width
    top = 0.0 if zone == "top" else 1.0 - height
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
    left = 0.0 if side == "left" else 1.0 - width
    top = 0.0 if zone == "top" else 1.0 - height
    return left <= x <= left + width and top <= y <= top + height
