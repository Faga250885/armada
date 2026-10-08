"""Find Steam's primary Gamescope X11 session without initializing GTK."""

import ctypes
import os
import time
from pathlib import Path


def xwayland_authorities(proc_root=Path("/proc")):
    result = {}
    for process in proc_root.glob("[0-9]*"):
        try:
            if process.stat().st_uid != os.getuid():
                continue
            arguments = [item.decode(errors="ignore") for item in
                         (process / "cmdline").read_bytes().split(b"\0") if item]
        except OSError:
            continue
        if not arguments or "xwayland" not in Path(arguments[0]).name.lower():
            continue
        display = next((item for item in arguments[1:] if item.startswith(":")), None)
        try:
            authority = arguments[arguments.index("-auth") + 1]
        except (ValueError, IndexError):
            continue
        if display:
            result.setdefault(display, authority)
    return result


def steam_environments(proc_root=Path("/proc")):
    """Never use an arbitrary game's isolated Xwayland display for a global HUD."""
    result = []
    for process in proc_root.glob("[0-9]*"):
        try:
            if process.stat().st_uid != os.getuid():
                continue
            executable = (process / "cmdline").read_bytes().split(b"\0", 1)[0]
            if Path(os.fsdecode(executable)).name not in ("steam", "launch-steam"):
                continue
            environment = {}
            for value in (process / "environ").read_bytes().split(b"\0"):
                key, separator, data = value.partition(b"=")
                if separator:
                    environment[os.fsdecode(key)] = os.fsdecode(data)
        except OSError:
            continue
        if environment.get("DISPLAY") and environment.get("GAMESCOPE_WAYLAND_DISPLAY"):
            result.append(environment)
    return result


def can_open_x11(display, authority):
    """Require Gamescope's primary Xwayland, not merely a connectable display."""
    os.environ["DISPLAY"] = display
    if authority:
        os.environ["XAUTHORITY"] = authority
    else:
        os.environ.pop("XAUTHORITY", None)
    x11 = ctypes.CDLL("libX11.so.6")
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
    connection = x11.XOpenDisplay(display.encode())
    if not connection:
        return False
    data = ctypes.POINTER(ctypes.c_ubyte)()
    try:
        x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
        x11.XDefaultRootWindow.restype = ctypes.c_ulong
        x11.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
        x11.XInternAtom.restype = ctypes.c_ulong
        x11.XGetWindowProperty.argtypes = [
            ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_long,
            ctypes.c_long, ctypes.c_int, ctypes.c_ulong,
            ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
            ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte)),
        ]
        x11.XFree.argtypes = [ctypes.c_void_p]
        atom = x11.XInternAtom(connection, b"GAMESCOPE_XWAYLAND_SERVER_ID", True)
        if not atom:
            return False
        kind, count, remaining = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_ulong()
        bits = ctypes.c_int()
        status = x11.XGetWindowProperty(
            connection, x11.XDefaultRootWindow(connection), atom, 0, 1, False, 6,
            ctypes.byref(kind), ctypes.byref(bits), ctypes.byref(count),
            ctypes.byref(remaining), ctypes.byref(data),
        )
        return bool(status == 0 and kind.value == 6 and bits.value == 32
                    and count.value == 1 and data
                    and ctypes.cast(data, ctypes.POINTER(ctypes.c_ulong))[0] == 0)
    finally:
        if data:
            x11.XFree(data)
        x11.XCloseDisplay(connection)


def discover_gamescope_environment(timeout=30.0, proc_root=Path("/proc")):
    """Set validated credentials BEFORE importing gi.repository.Gtk.

    PyGObject's Gtk override caches init_check() during import. Opening a GDK
    display later does not repair that cached failure in Gtk.Window.__init__.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        candidates = steam_environments(proc_root)
        candidates.sort(key=lambda item: bool(item.get("XAUTHORITY")), reverse=True)
        authorities = xwayland_authorities(proc_root)
        attempted = set()
        for environment in candidates:
            display = environment["DISPLAY"]
            for authority in (environment.get("XAUTHORITY"), authorities.get(display), None):
                if (display, authority) in attempted:
                    continue
                attempted.add((display, authority))
                if not can_open_x11(display, authority):
                    continue
                os.environ["GDK_BACKEND"] = "x11"
                os.environ["GAMESCOPE_WAYLAND_DISPLAY"] = environment["GAMESCOPE_WAYLAND_DISPLAY"]
                return display
        time.sleep(0.25)
    raise RuntimeError("Steam's primary Gamescope Xwayland display is not available")
