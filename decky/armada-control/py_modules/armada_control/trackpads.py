from .privileged import call


DEFAULT = {
    "supported": False,
    "enabled": False,
    "blockTouchscreen": False,
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
    "backgroundOpacity": 12,
    "borderRadius": 28,
    "dotSize": 1,
    "dotGap": 11,
    "borderColor": "#ffffff",
    "dotColor": "#ffffff",
    "centerDotEnabled": False,
    "centerDotSize": 8,
    "centerDotOpacity": 35,
    "centerDotColor": "#ffffff",
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
            "leftTouchX": 0.5,
            "leftTouchY": 0.5,
            "rightTouchX": 0.5,
            "rightTouchY": 0.5,
        }
