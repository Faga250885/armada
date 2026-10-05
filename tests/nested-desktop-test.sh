#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NESTED="$ROOT/system_files/usr/bin/armada-nested-desktop"
SESSION_SELECT="$ROOT/system_files/usr/libexec/os-session-select"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

[[ -x "$NESTED" ]]

dbus_run_session="$tmp/dbus-run-session"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    '[[ "$(readlink "$XDG_CONFIG_HOME/plasmashellrc")" == "plasmashellrc.$EXPECT_MODE" ]] || exit 1' \
    'printf '\''%s\n'\'' "${XDG_CURRENT_DESKTOP-unset}" "${DISABLE_GAMESCOPE_WSI-unset}" "${GAMESCOPE_WAYLAND_DISPLAY-unset}" "${LD_PRELOAD-unset}" "${PLASMA_PLATFORM-unset}" "${QT_QPA_PLATFORM-unset}" "${LC_ALL-unset}" "${XDG_SESSION_TYPE-unset}" "${QT_IM_MODULE-unset}" "${GTK_IM_MODULE-unset}" "${ARMADA_NESTED_DESKTOP-unset}" >"$INNER_ENV"' \
    'printf '\''%s\0'\'' "$@" >"$INNER_ARGS"' \
    >"$dbus_run_session"
systemctl="$tmp/systemctl"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    'printf '\''%s\n'\'' "$*" >>"$SYSTEMCTL_LOG"' \
    >"$systemctl"
systemd_run="$tmp/systemd-run"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    '[[ "${SYSTEMD_RUN_FAILS:-0}" == 0 ]] || exit 1' \
    '[[ -z "${WATCHER_LOG:-}" ]] || (PATH="$WATCHER_PATH:$PATH" "${@:5}" >/dev/null 2>&1 &)' \
    'printf '\''%s\n'\'' "${@: -2}" "$4" >"$SYSTEMD_RUN_LOG"' \
    >"$systemd_run"
chmod +x "$dbus_run_session" "$systemctl" "$systemd_run"

run_nested() {
    env \
        DISPLAY=:1 \
        LD_PRELOAD= \
        LC_ALL=C \
        QT_QPA_PLATFORM=xcb \
        QT_IM_MODULE=steam \
        GTK_IM_MODULE=Steam \
        XDG_SESSION_TYPE=x11 \
        GAMESCOPE_WAYLAND_DISPLAY=gamescope-0 \
        XDG_CONFIG_HOME="$tmp/config-$1" \
        EXPECT_MODE="${2:-desktop}" \
        ARMADA_PLASMA_MOBILE_ENVMANAGER=/usr/bin/true \
        ARMADA_GAMESCOPE_PLASMA_LIB="$ROOT/system_files/usr/lib/armada/gamescope-plasma-lib" \
        ARMADA_PLASMA_CONFIG_LIB="$ROOT/system_files/usr/lib/armada/plasma-config-lib" \
        ARMADA_DBUS_RUN_SESSION="$dbus_run_session" \
        ARMADA_KWIN_WAYLAND=/test/kwin_wayland \
        ARMADA_SYSTEMCTL="$systemctl" \
        ARMADA_SYSTEMD_RUN="$systemd_run" \
        SYSTEMCTL_LOG="$tmp/systemctl-log-$1" \
        SYSTEMD_RUN_LOG="$tmp/systemd-run-log-$1" \
        INNER_ARGS="$tmp/inner-args" \
        INNER_ENV="$tmp/inner-env" \
        "$NESTED"
}

run_nested 0
mapfile -d '' -t actual <"$tmp/inner-args"
real_home="/usr/bin/env XDG_CONFIG_HOME='$tmp/config-0'"
expected=(
    /usr/bin/env "XDG_CONFIG_HOME=$tmp/config-0/armada/nested-desktop"
    /test/kwin_wayland
    --x11-display :1
    --fullscreen
    --no-lockscreen
    --xwayland
    --exit-with-session "$real_home /usr/bin/plasmashell"
    "$real_home /usr/libexec/kf6/polkit-kde-authentication-agent-1"
    '/usr/bin/kscreen-doctor output.X11-0.scale.1.5'
)
expected=("${expected[@]:0:8}" --inputmethod /usr/bin/plasma-keyboard "${expected[@]:8}")
[[ "$(<"$tmp/config-0/armada/nested-desktop/kwinrc")" == $'[Wayland]\nVirtualKeyboardMode=2' ]]
[[ "${#actual[@]}" == "${#expected[@]}" ]]
for i in "${!expected[@]}"; do
    [[ "${actual[$i]}" == "${expected[$i]}" ]]
done
[[ "$(<"$tmp/inner-env")" == $'KDE\n1\nunset\nunset\nunset\nunset\nunset\nwayland\nunset\nunset\n1' ]]
[[ "$(<"$tmp/systemctl-log-0")" == '--user stop armada-bottom-screen.service' ]]
mapfile -t watcher <"$tmp/systemd-run-log-0"
[[ "${watcher[0]}" =~ ^[0-9]+$ ]]
[[ "${watcher[1]}" == armada-bottom-screen.service ]]
[[ "${watcher[2]}" == "--unit=armada-nested-desktop-${watcher[0]}" ]]

# The Mobile shell's saved settings survive the desktop taking over.
mkdir -p "$tmp/config-1"
printf 'saved mobile settings\n' >"$tmp/config-1/plasmashellrc.mobile"
ln -s plasmashellrc.mobile "$tmp/config-1/plasmashellrc"
run_nested 1
[[ "$(<"$tmp/config-1/plasmashellrc.mobile")" == 'saved mobile settings' ]]

# The Desktop Mode session choice picks the shell.
mkdir -p "$tmp/config-0/steamos-manager"
printf 'desktop_session = "armada-plasma.desktop"\n' >"$tmp/config-0/steamos-manager/state.toml"
# KWin has saved its output by now, so the default scale is not forced again.
touch "$tmp/config-0/armada/nested-desktop/kwinoutputconfig.json"
run_nested 0
mapfile -d '' -t actual <"$tmp/inner-args"
[[ "${#actual[@]}" == 13 ]]
# Nor is a keyboard setting the user changed.
printf '[Wayland]\nVirtualKeyboardMode=1\n' >"$tmp/config-0/armada/nested-desktop/kwinrc"
printf 'desktop_session = "armada-plasma-mobile.desktop"\n' >"$tmp/config-0/steamos-manager/state.toml"
run_nested 0 mobile
mapfile -d '' -t actual <"$tmp/inner-args"
[[ "${actual[9]}" == "$real_home /usr/bin/plasmashell -p org.kde.plasma.mobileshell" ]]
[[ "$(<"$tmp/inner-env")" == $'KDE\n1\nunset\nunset\nphone:handset\nunset\nunset\nwayland\nunset\nunset\n1' ]]
[[ ! " ${actual[*]} " =~ ' --inputmethod ' ]]
[[ "$(<"$tmp/config-0/armada/nested-desktop/kwinrc")" == $'[Wayland]\nVirtualKeyboardMode=1' ]]

# Without a watcher to bring it back, the Mobile shell is left running.
if SYSTEMD_RUN_FAILS=1 run_nested 2; then
    echo 'nested desktop started without a watcher' >&2
    exit 1
fi
[[ ! -e "$tmp/systemctl-log-2" ]]
grep -Fq 'is-enabled --quiet "$2" || exit 0' "$NESTED"

# Once the session is gone the watcher restarts the bottom shell, unless a relaunch is already running.
mkdir "$tmp/watcher-bin"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    'case "$2" in' \
    '    list-units) printf '\''%s.service loaded active running\n'\'' "$(sed -n 3p "$SYSTEMD_RUN_LOG" | cut -d= -f2)" $OTHER_UNITS ;;' \
    '    start) printf '\''%s\n'\'' "$*" >>"$WATCHER_LOG" ;;' \
    'esac' \
    >"$tmp/watcher-bin/systemctl"
chmod +x "$tmp/watcher-bin/systemctl"
run_watcher() {
    : >"$tmp/watcher-log"
    WATCHER_LOG="$tmp/watcher-log" WATCHER_PATH="$tmp/watcher-bin" OTHER_UNITS="$1" run_nested 0 mobile
    sleep 3
}
run_watcher ''
[[ "$(<"$tmp/watcher-log")" == '--user start armada-bottom-screen.service' ]]
run_watcher armada-nested-desktop-1
[[ ! -s "$tmp/watcher-log" ]]

# Return to Game Mode inside the nested desktop quits its shell; elsewhere it still asks steamos-manager.
printf '%s\n' '#!/usr/bin/env bash' 'printf '\''%s\n'\'' "$0 $*" >"$SELECT_LOG"' >"$tmp/select-stub"
chmod +x "$tmp/select-stub"
ln -s select-stub "$tmp/qdbus"
ln -s select-stub "$tmp/steamosctl"
run_select() {
    env SELECT_LOG="$tmp/select-log" ARMADA_QDBUS="$tmp/qdbus" ARMADA_STEAMOSCTL="$tmp/steamosctl" "$@"
}
run_select ARMADA_NESTED_DESKTOP=1 bash "$SESSION_SELECT" gamescope
[[ "$(<"$tmp/select-log")" == "$tmp/qdbus org.kde.plasmashell /MainApplication org.qtproject.Qt.QCoreApplication.quit" ]]
run_select bash "$SESSION_SELECT" gamescope
[[ "$(<"$tmp/select-log")" == "$tmp/steamosctl switch-to-game-mode" ]]
run_select ARMADA_NESTED_DESKTOP=1 bash "$SESSION_SELECT" desktop
[[ "$(<"$tmp/select-log")" == "$tmp/steamosctl switch-to-desktop-mode" ]]

if env -u DISPLAY SYSTEMCTL_LOG=/dev/null SYSTEMD_RUN_LOG=/dev/null \
    ARMADA_SYSTEMD_RUN="$systemd_run" \
    ARMADA_GAMESCOPE_PLASMA_LIB="$ROOT/system_files/usr/lib/armada/gamescope-plasma-lib" \
    ARMADA_PLASMA_CONFIG_LIB="$ROOT/system_files/usr/lib/armada/plasma-config-lib" \
    ARMADA_SYSTEMCTL="$systemctl" \
    "$NESTED" 2>"$tmp/no-display"; then
    echo 'nested desktop started without DISPLAY' >&2
    exit 1
fi
grep -q 'nested Gamescope did not provide an X11 display' "$tmp/no-display"
