// Engine-independent drawing kernel, shared by native builds (through JSB) and the web (as WebAssembly).
// Layouts must match assets/scripts/shared/kernel/index.ts. Inputs are doubles, so sampling matches
// the former JavaScript exactly; only vertex output is single precision.
#pragma once

#include <cstddef>
#include <cstdint>

// Writes one quad: an image slot placed by an affine matrix, with a color whose negative alpha marks it additive.
void pvz_write_quad(const double *image, double x, double y, double a, double b, double c, double d,
                    double red, double green, double blue, double alpha, float *positions, float *vertices, size_t quad, size_t stride);
// Collapses the unused quads in [from, capacity) so they draw nothing.
void pvz_clear_quads(float *positions, float *vertices, size_t from, size_t capacity, size_t stride);

extern "C" {

// Packed keyframe: time, x, y, scaleX, scaleY, skewX, skewY, alpha, step (0 or 1), sprite slot (-1 for none).
constexpr int PVZ_KEY = 10;
// Draw entry: first keyframe, keyframe count, override slot (-1 for none), visible.
constexpr int PVZ_TRACK = 4;
// Image slot: left, right, bottom, top, then four corner UVs.
constexpr int PVZ_IMAGE = 12;
// Blend source per draw entry: present, x, y, scaleX, scaleY, skewX, skewY, alpha.
constexpr int PVZ_BLEND = 8;

enum PvzHeader {
    PVZ_TIME, PVZ_RED, PVZ_GREEN, PVZ_BLUE, PVZ_ALPHA,
    PVZ_EXTRA, PVZ_EXTRA_RED, PVZ_EXTRA_GREEN, PVZ_EXTRA_BLUE, PVZ_EXTRA_ALPHA,
    PVZ_OPACITY, PVZ_STRIDE, PVZ_TRACKS, PVZ_CAPACITY, PVZ_TINTED, PVZ_IMAGES,
    PVZ_BLENDING, PVZ_RATIO,
    // A matrix applied before each pose (identity unless attached to another track).
    PVZ_MATRIX_A, PVZ_MATRIX_B, PVZ_MATRIX_C, PVZ_MATRIX_D, PVZ_MATRIX_X, PVZ_MATRIX_Y,
    PVZ_FIRST, PVZ_END,
    PVZ_HEADER
};

// Samples one track's keyframes; writes x, y, scaleX, scaleY, skewX, skewY, alpha and returns the
// index of the keyframe reached, or -1 before the first keyframe.
int32_t pvz_sample(const double *keys, int32_t count, double time, double *pose);

// Blends from a captured pose towards pose, in place, taking the shorter way around for angles.
void pvz_blend(const double *from, double ratio, double *pose);

// Draws the visible tracks of one animation in [FIRST, END) as quads; the rest of the capacity is
// cleared. State holds the header, then track colors (4 per entry), blend sources and images.
// Returns the quads drawn, or -1 for invalid input.
int32_t pvz_write_reanim(const double *keys, int32_t keyCount, const int32_t *tracks, int32_t trackCount,
                         const double *state, int32_t stateCount, float *positions, int32_t positionCount,
                         float *vertices, int32_t vertexCount);

}
