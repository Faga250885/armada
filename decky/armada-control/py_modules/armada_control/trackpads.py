from .privileged import call


DEFAULT = {
    "supported": False,
    "leftEnabled": False,
    "rightEnabled": False,
    "mode": "simple",
    "tapToClick": True,
    "leftSize": 35,
    "rightSize": 35,
    "hapticStrength": 35,
    "borderOpacity": 20,
    "backgroundOpacity": 12,
}


def get_virtual_trackpads():
    try:
        return {**DEFAULT, **call("get_virtual_trackpads")}
    except (OSError, RuntimeError, KeyError, TypeError, ValueError):
        return dict(DEFAULT)


def set_virtual_trackpads(config):
    return call("set_virtual_trackpads", config=config)


def get_virtual_trackpads_state():
    try:
        return call("get_virtual_trackpads_state")
    except (OSError, RuntimeError, KeyError, TypeError, ValueError):
        return {
            "leftActive": False,
            "rightActive": False,
            "leftZone": "bottom",
            "rightZone": "bottom",
            "leftX": 0.0,
            "leftY": 1.0,
            "rightX": 1.0,
            "rightY": 1.0,
        }
