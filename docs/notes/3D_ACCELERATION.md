# 3D acceleration in Steam 1096

The remake can reproduce the appearance of Steam 1.2.0.1096 with 3D acceleration disabled while continuing to draw through Cocos. The proposed player-facing option is **Classic 2D effects**. A CPU renderer would let players run the game on a machine where hardware rendering is unavailable. The current Options checkbox is locked on. [Options dialog](../assets/scripts/client/dialogs/OptionsDialog.ts)

## What the original switches

The addresses below are virtual addresses in `PlantsVsZombies_1.2.0.1096_steam_unwrapped.exe` (SHA-256 `ffbe8a75bc920c8415ccbcafb6588dc0018f8322a78fb4d6b17a27ca80fa5131`). `Is3DAccelerated` reads the active renderer flag at `0x5E0E00`. When the player checks the box, the dialog tests support and the recommended configuration. Closing Options submits both the fullscreen and acceleration choices at `0x456762`. The engine persists the acceleration preference under `Is3D`.

| Scene or draw path | Effect of disabling acceleration in 1096 |
| --- | --- |
| Award pickup | The pickup starburst still plays. The extra effect behind an ordinary collected seed packet is skipped (`0x436231`). A paper note has its own pickup effect. |
| Pool and almanac | The lawn draws the static day or night pool at (34, 278) and returns before drawing the animated mesh and caustics (`0x4712C9`). Aquatic almanac entries keep their pool background and omit the animated water overlay. |
| Fog, rain and credits | Fog selects the three-column `FOG_SOFTWARE` atlas and adjusts placement. Each cell keeps its visibility alpha and uses white tint (`0x41E00E`, `0x41E1BF`). The storm skips the rain streak draw (`0x42A6C6`). The credits skip the disco beams (`0x4391C3`). |
| Particle emitters | The draw routine at `0x526B10` checks `SoftwareOnly` (bit 10) and `HardwareOnly` (bit 11) before emitting geometry. The particle simulation can continue while an emitter is hidden. |
| Sprite sampling and blending | Some unrotated animations and unscaled cached plant images take integer-pixel blit paths (`0x47A0FE`, `0x477FA9`). The matrix blitter applies a half-pixel offset on the hardware path and handles additive drawing separately on the software path (`0x520A5E`). Any pixel corrections belong to the corresponding draw path. |

A scan of all **106 compiled particle definitions** in the Steam installation's `main.pak` found two hardware-only emitters, both in `LanternShine`, and zero software-only emitters. The remake's local input PAK matched the scanned Steam PAK. The Ice-shroom and Doom-shroom flashes remain visible in both modes. The award and weather branches above live in executable code and need their own handling.

## Implementing classic effects

- **Options.** Persist the choice with the existing Options preferences and apply it on closing the dialog. Default to the current accelerated appearance. Keep the existing acceleration-required message accurate for the graphics backend in use. [Settings store](../assets/scripts/server/menu/gameSettingsStore.ts)
- **Particles.** Carry both flags from the compiled definition through the JSON exporter and shared emitter schema. Filter individual emitters at draw time so that toggling the option preserves their age, position and the other emitters in the system. Mods can then use the same flags. [Compiled flags](../tools/pvz/compiled_particles.py) · [JSON exporter](../tools/pvz/particles.py) · [Emitter schema](../assets/scripts/shared/content/particle.ts) · [Particle player](../assets/scripts/client/particle/ParticlePlayer.ts)
- **Awards and water.** Apply the pickup condition to the effect behind the collected seed packet. Keep the independent starburst and paper-note branches. The Lily Pad almanac already draws the static pool background. When the pool chapter adds animated water, use the preference for both the almanac overlay and the lawn. The setting belongs to presentation and requires no combat save-format change. [Award view](../assets/scripts/client/items/AwardView.ts) · [Almanac screen](../assets/scripts/client/screens/AlmanacScreen.ts)

## Running on a CPU renderer

The project's native/WASM kernel computes animation and particle vertices. Cocos materials, textures and a graphics device still draw them, and original-resolution mode uses a render texture. In the inspected Cocos 4 engine, `cocos/gfx/device-manager.ts` declares a legacy `CANVAS` mode but supplies no drawable Canvas 2D backend for it. `EmptyDevice` serves headless operation. [Rendering kernel](../assets/scripts/shared/kernel/index.ts) · [Batch renderer](../assets/scripts/client/render/KernelBatch.ts) · [Original-resolution presentation](../assets/scripts/client/view/OriginalResolution.ts)

The inspected Windows build enables GLES2/GLES3 and ships EGL/GLES libraries. A separate Windows prototype could select ANGLE over SwiftShader at startup and exercise the existing shaders on a CPU. This is a feasibility proposal. Before offering it as a compatibility backend, verify the selected renderer, startup on a machine without working hardware acceleration, font and blend output, and frame times on the stress level. Web and mobile would need their own backend evaluation. [SwiftShader and ANGLE](https://github.com/google/swiftshader)

## Visual acceptance

1. Collect the Lily Pad in 2-10 in both modes. Check the pickup starburst and the effect behind the packet independently. Use the 2-9 letter as the paper-note control.
2. Compare the Lily Pad almanac and the 3-1 pool once animated water is available. Toggle from Options while paused and check the water after resuming and reloading.
3. When fog and Plantern are available, compare software fog placement and opacity against 1096. Check that only the flagged glow emitters disappear. Use Ice-shroom and Doom-shroom as controls for full-screen flashes.

The findings come from binary inspection, PAK inspection and source review. Side-by-side frame captures and hardware/software performance measurements remain open.
