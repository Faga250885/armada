#!/usr/bin/bash
# Rebuilds prebuilt/ from Valve's Android tree. Run by hand on an x86_64 host
# with podman and about 100 GB free; too large for the package builders.
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
PKG="${PWD}"
source ./BASE.env
TREE="${LEPTON_TREE:-${HOME}/lepton-build}"

if [ ! -d "${TREE}/.git" ]; then
    git clone --branch "${LEPTON_TAG}" https://gitlab.steamos.cloud/frame-public/lepton.git "${TREE}"
    git -C "${TREE}" submodule update --init --depth 1 \
        image/android_device_waydroid_waydroid image/android_hardware_waydroid image/android_vendor_waydroid
fi
image="${TREE}/image"
out="${image}/output"

podman image exists lepton-builder ||
    podman build -t lepton-builder "${image}/builder_image" -v "${TREE}:/workdir"
if [ ! -f "${image}/.buildscripts/.bashrc" ]; then
    {
        cat "${image}/.buildscripts/valve_bashrc.preamble"
        echo
        podman run --rm lepton-builder cat /root/.bashrc
    } > "${image}/.buildscripts/.bashrc"
fi
run() {
    podman run --rm --hostname=lepton-build \
        -v "${image}:/workspace" -w /workspace \
        -v "${image}/.buildscripts/.bashrc:/root/.bashrc:ro" \
        lepton-builder /bin/bash -lc "source ~/.bashrc; set -eo pipefail; $1"
}

# Valve's patches go in with git am: once, on the clean tree, before anything
# else touches it. Applying them a second time conflicts.
if [ ! -f "${out}/.valve-patches-applied" ]; then
    run "./.buildscripts/update_repositories.sh --ci"
    run "cd output && ../.buildscripts/copy_vendored_projects.sh >/dev/null &&
         source build/envsetup.sh && apply-waydroid-patches"
    touch "${out}/.valve-patches-applied"
fi

git -C "${image}/android_hardware_waydroid" checkout -q -- .
git -C "${image}/android_hardware_waydroid" apply "${PKG}/patches/android-0001-"*.patch
git -C "${out}/hardware/interfaces" checkout -q -- .
git -C "${out}/hardware/interfaces" apply "${PKG}/patches/android-0002-"*.patch

run "cd output && ../.buildscripts/copy_vendored_projects.sh >/dev/null &&
     source build/envsetup.sh &&
     lunch lineage_lepton_arm64_only-userdebug &&
     make hwcomposer.waydroid libhwc2on1adapter -j\$(nproc)"

product="${out}/out/target/product/lepton_arm64_only"
install -Dm0644 "${product}/vendor/lib64/hw/hwcomposer.waydroid.so" -t "${PKG}/prebuilt/vendor/lib64/hw"
install -Dm0644 "${product}/vendor/lib64/libhwc2on1adapter.so" -t "${PKG}/prebuilt/vendor/lib64"

jdk="${out}/prebuilts/jdk/jdk11/linux-x86/bin"
sdk="${out}/prebuilts/sdk/30/public/android.jar"
classes="$(mktemp -d)"
"${jdk}/javac" -source 8 -target 8 -bootclasspath "${sdk}" -d "${classes}" "${PKG}/clipstub/ClipStub.java"
"${jdk}/java" -cp "${out}/prebuilts/r8/r8.jar" com.android.tools.r8.D8 --min-api 30 --lib "${sdk}" \
    --output "${PKG}/prebuilt/system/framework/armada-clipstub.jar" "${classes}/ClipStub.class"
rm -rf "${classes}"
