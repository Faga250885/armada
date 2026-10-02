# Patches

Patches applied on top of BASE.env. Each entry's `source` is an upstream URL pinned
to a commit, or `armada` if it's original; a URL source with no `notes` is verbatim.
`notes` mean the file was modified.

- `patches/0001-disable-turnip-sparse-sync.patch`
  source: https://github.com/batocera-linux/batocera.linux/blob/bca5c05d90b606ad859ba2e4e82ab0a515ccb956/board/batocera/patches/mesa3d/001-fix-freedreno-vulkan.patch
  notes: temporary diagnostic workaround for A740 GPU translation-fault storms;
  disables the graphics/sparse-queue cross-sync introduced by Mesa commit
  `0cc0e786e096dca8cfd88d7088ab7e1a0147d045`
- `patches/0002-add-a830-chip-id.patch`
  source: https://github.com/ROCKNIX/distribution/blob/e485495a942daba186d4a8543e18a1ad09c9a5d5/projects/ROCKNIX/packages/graphics/mesa/patches/SM8750/0001-add-a830-chip-id.patch
  notes: modified — ported from ROCKNIX, chip-id additions verbatim
- `patches/0003-ir3-disable-bindless-ubo-const-lowering.patch`
  source: https://github.com/ROCKNIX/distribution/blob/0adbe00f1745512609b289ef9435df897c28b780/projects/ROCKNIX/packages/graphics/mesa/patches/SM8550/0001-freedreno-ir3-vulkan-disable-bindless-ubo-const-lowering.patch
  notes: offsets updated for Mesa 26.2.0
- `patches/0004-tu-emulate-mesh-shaders.patch`
  source: https://github.com/WinNative-Emu/Drivers/blob/c5531f85773df19c666d90e0043028f239615bfe/linux/patches/0001-tu-Emulate-VK_EXT_mesh_shader-with-compute.patch
  notes: modified — backported to Mesa 26.2.3: retain gmem_disable_reason and adapt moved shader state and lowering helpers; emit CP_MEM_TO_REG directly using Mesa 26.2.3 APIs.
- `patches/0005-ir3-support-half-wave-subgroups.patch`
  source: https://github.com/WinNative-Emu/Drivers/blob/c5531f85773df19c666d90e0043028f239615bfe/linux/patches/0002-tu-ir3-Support-a-required-subgroup-size-of-half-a-wa.patch
  notes: modified — backported to Mesa 26.2.3: retain its inline maximum-subgroup calculation and adapt helper placement.
- `patches/0006-ir3-sanitize-a8xx-cube-map-directions.patch`
  source: https://github.com/WinNative-Emu/Drivers/blob/c5531f85773df19c666d90e0043028f239615bfe/linux/patches/0003-ir3-Sanitize-cube-map-directions-on-A8XX.patch
  notes: modified — backported to Mesa 26.2.3: adapt GPU property placement.
- `patches/0007-tu-invalidate-a8xx-bindless-descriptors.patch`
  source: https://github.com/WinNative-Emu/Drivers/blob/c5531f85773df19c666d90e0043028f239615bfe/linux/patches/0004-tu-Invalidate-bindless-descriptors-through-the-A8XX-.patch
  notes: modified — backported to Mesa 26.2.3: retain its existing blit-cache flush sequence.
- `patches/0008-freedreno-enable-a740-ubwc-hint.patch`
  source: https://github.com/WinNative-Emu/Drivers/blob/c5531f85773df19c666d90e0043028f239615bfe/patches/apply_a7xx_gen2_ubwc_hint.py
  notes: modified — converted the GPU-property change to a patch for Mesa 26.2.3
