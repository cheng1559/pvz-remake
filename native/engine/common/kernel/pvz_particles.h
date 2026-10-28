#pragma once
#include <cstdint>

// Owned particle systems. Definition encoding is shared with shared/kernel/particles.ts.
// Handles are opaque positive integers; all entry points reject stale handles.
extern "C" {
int32_t pvz_particles_create(const double *definition, int32_t length, uint32_t seed);
int32_t pvz_particles_step(int32_t handle, int32_t ticks, const double *motion, int32_t length);
// Writes per-emitter live counts (-1 if dead), then optional ticks until an empty capped system expires.
int32_t pvz_particles_info(int32_t handle, double *output, int32_t length);
enum PvzParticleOption {
    PVZ_PARTICLE_RED, PVZ_PARTICLE_GREEN, PVZ_PARTICLE_BLUE, PVZ_PARTICLE_SCALE, PVZ_PARTICLE_ADDITIVE, PVZ_PARTICLE_EXTRA,
    PVZ_PARTICLE_OPACITY, PVZ_PARTICLE_STRIDE, PVZ_PARTICLE_CAPACITY, PVZ_PARTICLE_OPTIONS
};
// Writes one emitter's particles as quads, each followed by its extra additive copy when enabled, and clears the rest
// of the capacity. Geometry is one PVZ_IMAGE per sprite cell. Returns the quads written, or -1 for invalid input.
int32_t pvz_particles_write(int32_t handle, int32_t emitter, const double *geometry, int32_t geometryLength,
                            const double *options, int32_t optionsLength, float *positions, int32_t positionCount,
                            float *vertices, int32_t vertexCount);
void pvz_particles_destroy(int32_t handle);
}
