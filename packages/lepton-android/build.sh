#!/usr/bin/bash
# Builds two display libraries from Valve's Android tree, patched to give
# Android a second display. Runs in the Ubuntu image Valve's own builder starts
# from, on x86_64: the tree's host tools exist for nothing else. Needs about
# 85 GB of scratch, nearly all of it the source checkout.
set -euxo pipefail

source ./BASE.env

export DEBIAN_FRONTEND=noninteractive USER=root
apt-get -qq update
apt-get install -y --no-install-recommends ca-certificates git

git clone --depth 1 --branch "${LEPTON_TAG}" "${LEPTON_REPO}" /tmp/lepton
[ "$(git -C /tmp/lepton rev-parse HEAD)" = "${LEPTON_COMMIT}" ]
git -C /tmp/lepton submodule update --init --depth 1 \
    image/android_device_waydroid_waydroid image/android_hardware_waydroid image/android_vendor_waydroid

# Valve's builder image is this base plus this script.
/tmp/lepton/.ci_scripts/install-build-rootfs-dependencies.sh

image=/tmp/lepton/image
run() {
    bash -lc "source ~/.bashrc; set -eo pipefail; cd ${image}; $1"
}

run "./.buildscripts/update_repositories.sh --ci"
run "cd output && ../.buildscripts/copy_vendored_projects.sh >/dev/null &&
     source build/envsetup.sh && apply-waydroid-patches"

git -C "${image}/android_hardware_waydroid" apply /work/patches/0001-*.patch
git -C "${image}/output/hardware/interfaces" apply /work/patches/0002-*.patch

run "cd output && ../.buildscripts/copy_vendored_projects.sh >/dev/null &&
     source build/envsetup.sh &&
     lunch lineage_lepton_arm64_only-userdebug &&
     make hwcomposer.waydroid libhwc2on1adapter -j\$(nproc)"

df -h /tmp

product="${image}/output/out/target/product/lepton_arm64_only"
rm -rf out
install -Dm0644 "${product}/vendor/lib64/hw/hwcomposer.waydroid.so" -t out/vendor/lib64/hw
install -Dm0644 "${product}/vendor/lib64/libhwc2on1adapter.so" -t out/vendor/lib64
cp -a android/. out/
