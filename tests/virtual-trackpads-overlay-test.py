#!/usr/bin/python3
"""Run the real GTK overlay against an authenticated disposable X11 display.

Linux dependencies: Xvfb, xauth, GTK 4, PyGObject with Cairo integration, and
Pycairo. Run directly with python3; the parent process deliberately never
imports GTK, so each worker exercises initialization from a clean process.
"""

import ctypes
import json
import os
from pathlib import Path
import runpy
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
LIBRARY = ROOT / "system_files/usr/lib/armada"
OVERLAY = ROOT / "system_files/usr/libexec/armada/virtual-trackpads-overlay"
TITLE = b"Armada Virtual Trackpads Overlay"


class X11Probe:
    """Inspect actual mapped windows without importing GTK in the test driver."""

    def __init__(self, display):
        self.lib = ctypes.CDLL("libX11.so.6")
        pointer = ctypes.c_void_p
        ulong = ctypes.c_ulong
        self.lib.XOpenDisplay.argtypes = [ctypes.c_char_p]
        self.lib.XOpenDisplay.restype = pointer
        self.lib.XCloseDisplay.argtypes = [pointer]
        self.lib.XDefaultRootWindow.argtypes = [pointer]
        self.lib.XDefaultRootWindow.restype = ulong
        self.lib.XQueryTree.argtypes = [
            pointer, ulong, ctypes.POINTER(ulong), ctypes.POINTER(ulong),
            ctypes.POINTER(ctypes.POINTER(ulong)), ctypes.POINTER(ctypes.c_uint),
        ]
        self.lib.XFetchName.argtypes = [pointer, ulong, ctypes.POINTER(ctypes.c_char_p)]
        self.lib.XFree.argtypes = [pointer]
        self.lib.XInternAtom.argtypes = [pointer, ctypes.c_char_p, ctypes.c_int]
        self.lib.XInternAtom.restype = ulong
        self.lib.XGetWindowProperty.argtypes = [
            pointer, ulong, ulong, ctypes.c_long, ctypes.c_long, ctypes.c_int,
            ulong, ctypes.POINTER(ulong), ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ulong), ctypes.POINTER(ulong),
            ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte)),
        ]
        self.lib.XChangeProperty.argtypes = [
            pointer, ulong, ulong, ulong, ctypes.c_int, ctypes.c_int,
            ctypes.POINTER(ctypes.c_ubyte), ctypes.c_int,
        ]
        self.lib.XDeleteProperty.argtypes = [pointer, ulong, ulong]
        self.lib.XSync.argtypes = [pointer, ctypes.c_int]
        self.display = self.lib.XOpenDisplay(display.encode())
        if not self.display:
            raise RuntimeError(f"Cannot connect to test X server {display}")

    def close(self):
        if self.display:
            self.lib.XCloseDisplay(self.display)
            self.display = None

    def named_window(self):
        root, parent = ctypes.c_ulong(), ctypes.c_ulong()
        children = ctypes.POINTER(ctypes.c_ulong)()
        count = ctypes.c_uint()
        self.lib.XQueryTree(
            self.display, self.lib.XDefaultRootWindow(self.display),
            ctypes.byref(root), ctypes.byref(parent), ctypes.byref(children),
            ctypes.byref(count),
        )
        try:
            for index in range(count.value):
                name = ctypes.c_char_p()
                self.lib.XFetchName(self.display, children[index], ctypes.byref(name))
                try:
                    if name.value == TITLE:
                        return children[index]
                finally:
                    if name:
                        self.lib.XFree(name)
        finally:
            if children:
                self.lib.XFree(children)
        return None

    def cardinal(self, window, property_name):
        atom = self.lib.XInternAtom(self.display, property_name.encode(), False)
        kind, count, remaining = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_ulong()
        bits = ctypes.c_int()
        data = ctypes.POINTER(ctypes.c_ubyte)()
        result = self.lib.XGetWindowProperty(
            self.display, window, atom, 0, 1, False, 6, ctypes.byref(kind),
            ctypes.byref(bits), ctypes.byref(count), ctypes.byref(remaining),
            ctypes.byref(data),
        )
        try:
            if result != 0 or kind.value != 6 or bits.value != 32 or count.value != 1:
                return None
            return ctypes.cast(data, ctypes.POINTER(ctypes.c_ulong))[0]
        finally:
            if data:
                self.lib.XFree(data)

    def set_server_id(self, server_id):
        atom = self.lib.XInternAtom(self.display, b"GAMESCOPE_XWAYLAND_SERVER_ID", False)
        root = self.lib.XDefaultRootWindow(self.display)
        if server_id is None:
            self.lib.XDeleteProperty(self.display, root, atom)
        else:
            value = ctypes.c_ulong(server_id)
            self.lib.XChangeProperty(
                self.display, root, atom, 6, 32, 0,
                ctypes.cast(ctypes.byref(value), ctypes.POINTER(ctypes.c_ubyte)), 1,
            )
        self.lib.XSync(self.display, False)


def render_worker(directory):
    """Verify real draw callbacks, alpha output, hide/fade, and split-screen."""
    assert "DISPLAY" not in os.environ
    assert "XAUTHORITY" not in os.environ
    sys.path.insert(0, str(LIBRARY))
    from armada_overlay_session import discover_gamescope_environment

    display = discover_gamescope_environment()
    assert display == os.environ["ARMADA_TEST_DISPLAY"], display
    assert os.environ.get("XAUTHORITY") == os.environ["ARMADA_TEST_AUTHORITY"]
    namespace = runpy.run_path(str(OVERLAY), run_name="overlay_under_test")
    import cairo
    import gi

    gi.require_version("Gsk", "4.0")
    from gi.repository import Gtk, GLib

    assert Gtk.init_check()
    directory = Path(directory)
    config_path, state_path = directory / "config.json", directory / "state.json"
    runtime = namespace["TrackpadOverlay"].tick.__globals__
    runtime["CONFIG_PATH"], runtime["STATE_PATH"] = config_path, state_path
    app = namespace["TrackpadOverlay"]()
    app.set_application_id(None)
    app.device_env = {}
    config = {
        "enabled": True, "leftEnabled": True, "rightEnabled": True,
        "mode": "simple", "deckLikeSize": False,
        "leftSize": 35, "rightSize": 35, "borderOpacity": 100,
        "backgroundOpacity": 100, "dotSize": 3,
        "centerDotEnabled": False,
    }
    state = {"leftActive": True, "rightActive": True,
             "leftZone": "bottom", "rightZone": "bottom"}
    config_path.write_text(json.dumps(config))
    state_path.write_text(json.dumps(state))
    drawn = []
    original_draw = app.draw

    def record_draw(*args):
        drawn.append(time.monotonic())
        return original_draw(*args)

    app.draw = record_draw
    errors = []
    started = time.monotonic()
    phase = 0
    phase_started = started
    last_frames = 0
    pixels = {}

    def alpha_pixels(label):
        # Render the widget's real GTK render node, rather than calling the
        # Python draw function directly (which would miss callback failures).
        snapshot = Gtk.Snapshot()
        paintable = Gtk.WidgetPaintable.new(app.window)
        paintable.snapshot(snapshot, app.width, app.height)
        node = snapshot.to_node()
        image_path = directory / f"{label}.png"
        surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, app.width, app.height)
        if node is not None:
            # Replay GTK's existing render node into an independent target.
            # Keep capture independent of the live GdkSurface and its frame
            # production; never unrealize a renderer attached to that surface.
            node.draw(cairo.Context(surface))
        surface.flush()
        surface.write_to_png(str(image_path))
        data = surface.get_data()
        alpha_offset = 3 if sys.byteorder == "little" else 0
        visible = sum(
            data[y * surface.get_stride() + x * 4 + alpha_offset] != 0
            for y in range(surface.get_height())
            for x in range(surface.get_width())
        )
        print(json.dumps({"phase": label, "alphaPixels": visible,
                          "draws": len(drawn), "fade": app.fade,
                          "mode": app.config.get("mode"),
                          "enabled": app.config.get("enabled")}), flush=True)
        return visible

    def check():
        nonlocal phase, phase_started, last_frames
        now = time.monotonic()
        try:
            assert now - started < 12, "Overlay did not complete rendering phases"
            if app.window is None or not app.window.get_mapped():
                return GLib.SOURCE_CONTINUE
            if phase == 0 and now - phase_started >= 0.65:
                assert len(drawn) >= 2, "GTK never invoked the Cairo draw callback"
                probe = X11Probe(display)
                try:
                    window = probe.named_window()
                    assert window, "Overlay has no X11 window"
                    assert probe.cardinal(window, "ARMADA_VIRTUAL_TRACKPADS_OVERLAY") == 1
                finally:
                    probe.close()
                pixels["active"] = alpha_pixels("active")
                assert pixels["active"] > 100, pixels
                # No center marker: after release + hold + fade, all alpha
                # must disappear while the mapped overlay remains running.
                state.update(leftActive=False, rightActive=False)
                state_path.write_text(json.dumps(state))
                last_frames = len(drawn)
                phase, phase_started = 1, now
            elif phase == 1 and now - phase_started >= 1.6:
                assert len(drawn) > last_frames, "Fade did not repaint"
                pixels["faded"] = alpha_pixels("faded")
                assert pixels["faded"] == 0, pixels
                config.update(mode="halves", centerDotEnabled=True)
                state.update(leftActive=True, rightActive=True)
                config_path.write_text(json.dumps(config))
                state_path.write_text(json.dumps(state))
                phase, phase_started = 2, now
            elif phase == 2 and now - phase_started >= 0.4:
                pixels["halves"] = alpha_pixels("halves")
                assert pixels["halves"] == 0, pixels
                config.update(mode="simple", centerDotEnabled=False)
                config_path.write_text(json.dumps(config))
                phase, phase_started = 3, now
            elif phase == 3 and now - phase_started >= 0.5:
                pixels["reactivated"] = alpha_pixels("reactivated")
                assert pixels["reactivated"] > 100, pixels
                config["enabled"] = False
                config_path.write_text(json.dumps(config))
                last_frames = len(drawn)
                phase, phase_started = 4, now
            elif phase == 4 and now - phase_started >= 0.4:
                assert len(drawn) > last_frames, "Disabling did not repaint"
                pixels["disabled"] = alpha_pixels("disabled")
                assert pixels["disabled"] == 0, pixels
                print(json.dumps({"draws": len(drawn), "alphaPixels": pixels}), flush=True)
                app.quit()
                return GLib.SOURCE_REMOVE
        except BaseException as error:
            errors.append(error)
            app.quit()
            return GLib.SOURCE_REMOVE
        return GLib.SOURCE_CONTINUE

    GLib.timeout_add(50, check)
    app.run(None)
    if errors:
        raise errors[0]
    assert phase == 4, f"Overlay exited prematurely at phase {phase}"


class OverlayRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for executable in ("Xvfb", "xauth", "bash"):
            if not shutil.which(executable):
                raise RuntimeError(f"Required runtime test dependency is missing: {executable}")
        cls.directory = tempfile.TemporaryDirectory(prefix="armada-overlay-test-")
        cls.addClassCleanup(cls.directory.cleanup)
        cls.authority = Path(cls.directory.name) / "Xauthority"
        number = 200 + os.getpid() % 10000
        while Path(f"/tmp/.X11-unix/X{number}").exists() or Path(f"/tmp/.X{number}-lock").exists():
            number += 1
        cls.display = f":{number}"
        subprocess.run(
            ["xauth", "-f", str(cls.authority), "add", cls.display,
             "MIT-MAGIC-COOKIE-1", secrets.token_hex(16)],
            check=True, capture_output=True, text=True,
        )
        # A pipe can fill with repeated X11 diagnostics and freeze the server,
        # which would make otherwise bounded tests hang inside XOpenDisplay.
        cls.xvfb_log = (Path(cls.directory.name) / "xvfb.log").open("w+b")
        cls.addClassCleanup(cls.xvfb_log.close)
        cls.xvfb = subprocess.Popen(
            ["Xvfb", cls.display, "-noreset", "-screen", "0", "800x450x24", "-nolisten", "tcp",
             "-auth", str(cls.authority)], stdout=cls.xvfb_log, stderr=subprocess.STDOUT,
        )
        cls.addClassCleanup(cls.stop_process, cls.xvfb)
        deadline = time.monotonic() + 5
        while not Path(f"/tmp/.X11-unix/X{number}").exists():
            if cls.xvfb.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError("Disposable X server failed to start")
            time.sleep(0.02)
        steam_environment = dict(os.environ, DISPLAY=cls.display,
                                 XAUTHORITY=str(cls.authority),
                                 GAMESCOPE_WAYLAND_DISPLAY="armada-test-gamescope-0")
        cls.steam = subprocess.Popen(
            ["bash", "-c", "exec -a steam sleep 60"], env=steam_environment,
        )
        cls.addClassCleanup(cls.stop_process, cls.steam)
        # The driver uses Xlib only. Workers below explicitly remove these
        # variables and must obtain them from the running Steam fixture.
        cls.previous_authority = os.environ.get("XAUTHORITY")
        os.environ["XAUTHORITY"] = str(cls.authority)
        cls.addClassCleanup(cls.restore_authority)
        probe = X11Probe(cls.display)
        try:
            probe.set_server_id(0)
        finally:
            probe.close()

    @classmethod
    def restore_authority(cls):
        if cls.previous_authority is None:
            os.environ.pop("XAUTHORITY", None)
        else:
            os.environ["XAUTHORITY"] = cls.previous_authority

    @staticmethod
    def stop_process(process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
        for stream in (process.stdout, process.stderr):
            if stream is not None:
                stream.close()

    def environment(self):
        environment = dict(os.environ)
        for name in ("DISPLAY", "XAUTHORITY", "GAMESCOPE_WAYLAND_DISPLAY", "WAYLAND_DISPLAY"):
            environment.pop(name, None)
        environment.update(
            PYTHONPATH=str(LIBRARY), GDK_BACKEND="x11", GSK_RENDERER="cairo",
            GTK_A11Y="none", NO_AT_BRIDGE="1", GSETTINGS_BACKEND="memory",
            ARMADA_TEST_DISPLAY=self.display,
            ARMADA_TEST_AUTHORITY=str(self.authority),
            ARMADA_DEVICE_ENV="/nonexistent-armada-test-device-env",
        )
        return environment

    def assert_no_render_errors(self, output):
        for failure in ("Traceback", "Gtk couldn't be initialized", "GDK_IS_DISPLAY",
                        "Couldn't find foreign struct converter", "TypeError"):
            self.assertNotIn(failure, output)

    def test_bootstrap_from_service_without_display(self):
        process = subprocess.Popen(
            [sys.executable, str(OVERLAY)], env=self.environment(),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        probe = X11Probe(self.display)
        window = None
        try:
            deadline = time.monotonic() + 8
            while process.poll() is None and time.monotonic() < deadline:
                window = probe.named_window()
                if window and probe.cardinal(window, "ARMADA_VIRTUAL_TRACKPADS_OVERLAY") == 1:
                    break
                time.sleep(0.05)
            alive = process.poll() is None
            marked = bool(window and probe.cardinal(window, "ARMADA_VIRTUAL_TRACKPADS_OVERLAY") == 1)
        finally:
            probe.close()
            if process.poll() is None:
                process.terminate()
            output, errors = process.communicate(timeout=3)
        self.assertTrue(alive and marked, output + errors)
        self.assert_no_render_errors(output + errors)

    def test_real_gtk_drawing_and_transparency(self):
        try:
            result = subprocess.run(
                [sys.executable, str(Path(__file__).resolve()), "--render-worker", self.directory.name],
                env=self.environment(), capture_output=True, text=True, timeout=18,
            )
        finally:
            output_directory = os.environ.get("ARMADA_OVERLAY_TEST_OUTPUT")
            if output_directory:
                destination = Path(output_directory)
                destination.mkdir(parents=True, exist_ok=True)
                for screenshot in Path(self.directory.name).glob("*.png"):
                    shutil.copyfile(screenshot, destination / screenshot.name)
        print(result.stdout, end="", flush=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assert_no_render_errors(result.stdout + result.stderr)
        self.assertIn('"alphaPixels"', result.stdout)

    def test_reject_secondary_and_non_gamescope_displays(self):
        sys.path.insert(0, str(LIBRARY))
        from armada_overlay_session import can_open_x11

        probe = X11Probe(self.display)
        try:
            probe.set_server_id(None)
            self.assertFalse(can_open_x11(self.display, str(self.authority)))
            probe.set_server_id(1)
            self.assertFalse(can_open_x11(self.display, str(self.authority)))
            probe.set_server_id(0)
            self.assertTrue(can_open_x11(self.display, str(self.authority)))
        finally:
            probe.set_server_id(0)
            probe.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--render-worker":
        render_worker(sys.argv[2])
    else:
        unittest.main(verbosity=2)
