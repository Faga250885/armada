DEFAULT_CONFIG = {
    "leftEnabled": False,
    "rightEnabled": False,
    "fourPads": False,
    "tapToClick": True,
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
    for key in ("leftEnabled", "rightEnabled", "fourPads", "tapToClick"):
        if isinstance(value.get(key), bool):
            result[key] = value[key]
    for key, (minimum, maximum) in NUMBER_RANGES.items():
        number = value.get(key)
        if isinstance(number, int) and not isinstance(number, bool):
            result[key] = max(minimum, min(maximum, number))
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
    for side in ("left", "right"):
        if not config[f"{side}Enabled"]:
            continue
        height = config[f"{side}Size"] / 100.0
        width = height / aspect_ratio
        left = 0.0 if side == "left" else 1.0 - width
        corners = ("top", "bottom") if config["fourPads"] else ("bottom",)
        for corner in corners:
            top = 0.0 if corner == "top" else 1.0 - height
            if left <= x <= left + width and top <= y <= top + height:
                return side, corner, clamp((x - left) / width), clamp((y - top) / height)
    return None
