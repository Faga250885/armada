#!/usr/bin/bash
# Rebuilds prebuilt/ from Valve's Android tree. Run by hand on an x86_64 host
# with podman and about 60 GB free; CI only checks the result's hashes.
set -euxo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
source ./BASE.env

if [ ! -f /run/.containerenv ]; then
    exec podman run --rm --platform linux/amd64 -v "${PWD}:/work:Z" -w /work \
        "${ANDROID_BUILDER_IMAGE}" ./build-android.sh
fi

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

git -C "${image}/android_hardware_waydroid" apply /work/patches/android-0001-*.patch
git -C "${image}/output/hardware/interfaces" apply /work/patches/android-0002-*.patch

run "cd output && ../.buildscripts/copy_vendored_projects.sh >/dev/null &&
     source build/envsetup.sh &&
     lunch lineage_lepton_arm64_only-userdebug &&
     make hwcomposer.waydroid libhwc2on1adapter -j\$(nproc)"

product="${image}/output/out/target/product/lepton_arm64_only"
install -Dm0644 "${product}/vendor/lib64/hw/hwcomposer.waydroid.so" -t prebuilt/vendor/lib64/hw
install -Dm0644 "${product}/vendor/lib64/libhwc2on1adapter.so" -t prebuilt/vendor/lib64
# After a deliberate change, update the hashes in BASE.env.
sha256sum prebuilt/vendor/lib64/hw/hwcomposer.waydroid.so prebuilt/vendor/lib64/libhwc2on1adapter.so
