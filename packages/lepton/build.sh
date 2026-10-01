#!/usr/bin/bash
# Runs inside the builder container. See ../build-local.sh for the contract.
set -euxo pipefail

source ./BASE.env

rm -rf out
mkdir -p out/android

dnf -y install curl tar zstd

cd /tmp
for pkg in "${MESA_PKG}:${MESA_SHA256}" "${LAYERS_PKG}:${LAYERS_SHA256}"; do
    curl --fail --location --retry 3 --remote-name "${VALVE_REPO}/${pkg%%:*}"
    printf '%s  %s\n' "${pkg##*:}" "${pkg%%:*}" | sha256sum --check --strict
    tar --zstd -xf "${pkg%%:*}" usr/share/guestos/android
done
cp -a usr/share/guestos/android/. /work/out/android/

# The foveation layer has no host manifest, so Lepton would enable it under an
# empty name and every Vulkan instance creation in the container would fail.
rm -rf /work/out/android/vendor/vulkan_layers/libVkLayer_VALVE_fdm_injection.so \
       /work/out/android/vendor/etc/openxr

cp -a /work/android/. /work/prebuilt/. /work/out/android/
cat /work/patches/launcher-*.patch > /work/out/launcher.patch
