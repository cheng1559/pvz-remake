#include "pvz_kernel.h"

#include <cmath>
#include <cstddef>

namespace {
constexpr double RADIANS = 3.14159265358979323846 / 180.0;

// Math.round for the non-negative values used here.
inline double roundHalfUp(double value) { return std::floor(value + 0.5); }

double nearAngle(double angle, double target) {
    while (angle > target + 180) angle -= 360;
    while (angle < target - 180) angle += 360;
    return angle;
}

// A local position in the world: through a placement, the x, y and z of its x axis, of its y axis and of its origin.
inline void place(const double *placement, double x, double y, float *position) {
    position[0] = static_cast<float>(placement[0] * x + placement[3] * y + placement[6]);
    position[1] = static_cast<float>(placement[1] * x + placement[4] * y + placement[7]);
    position[2] = static_cast<float>(placement[2] * x + placement[5] * y + placement[8]);
}

// pvz_sample, looking first where a keyframe for every frame at `rate` a second from time 0 would put the one reached.
int32_t sampleAt(const double *keys, int32_t count, double time, double rate, double *pose) {
    if (count <= 0) return -1;
    int32_t index = -1;
    if (rate > 0 && time >= 0) {
        // Most tracks have such keyframes, and the one reached is then found without reading the first and the last,
        // which are elsewhere in memory. Whether it is the one is read from it and the next, so any other track is
        // only looked through as it would be.
        const double at = time * rate;
        const int32_t guess = at < count - 1 ? static_cast<int32_t>(at) : count - 1;
        const double *key = keys + static_cast<size_t>(guess) * PVZ_KEY;
        if (key[0] <= time && (guess + 1 == count || key[PVZ_KEY] > time)) index = guess;
    }
    if (index < 0) {
        if (time < keys[0]) return -1;
        // The last keyframe whose time has been reached. Keyframes are mostly evenly spaced, so it is looked for first
        // where the time falls between the first and the last, and searched for only from there if it is elsewhere.
        int32_t upper = count;
        index = 0;
        const double first = keys[0], last = keys[static_cast<size_t>(count - 1) * PVZ_KEY];
        if (time >= last) {
            index = count - 1;
        } else {
            int32_t guess = static_cast<int32_t>((time - first) / (last - first) * (count - 1));
            if (guess > count - 2) guess = count - 2;
            if (keys[static_cast<size_t>(guess) * PVZ_KEY] > time) upper = guess;
            else if (keys[static_cast<size_t>(guess + 1) * PVZ_KEY] > time) index = guess, upper = guess + 1;
            else index = guess + 1;
            while (index + 1 < upper) {
                const int32_t middle = (index + upper) >> 1;
                if (keys[static_cast<size_t>(middle) * PVZ_KEY] <= time) index = middle;
                else upper = middle;
            }
        }
    }
    const double *left = keys + index * PVZ_KEY;
    if (index + 1 < count && left[8] == 0) {
        const double *right = left + PVZ_KEY;
        const double ratio = (time - left[0]) / (right[0] - left[0]);
        for (int i = 0; i < 7; ++i) pose[i] = left[i + 1] + (right[i + 1] - left[i + 1]) * ratio;
    } else {
        for (int i = 0; i < 7; ++i) pose[i] = left[i + 1];
    }
    return index;
}
} // namespace

void pvz_write_quad(const double *image, double x, double y, double a, double b, double c, double d,
               double red, double green, double blue, double alpha, float *positions, float *vertices, size_t quad, size_t stride,
               const double *placement) {
    const double left = image[0], right = image[1], bottom = image[2], top = image[3];
    for (size_t corner = 0; corner < 4; ++corner) {
        const double u = (corner & 1) ? right : left, v = (corner & 2) ? top : bottom;
        const size_t offset = (quad * 4 + corner) * stride;
        // Placed, a corner is where pvz_place_quads would put the single-precision local one.
        const float localX = static_cast<float>(x + a * u + c * v), localY = static_cast<float>(y + b * u + d * v);
        if (placement) {
            place(placement, localX, localY, positions + offset);
        } else {
            positions[offset] = localX;
            positions[offset + 1] = localY;
            positions[offset + 2] = 0;
        }
        vertices[offset + 3] = static_cast<float>(image[4 + corner * 2]);
        vertices[offset + 4] = static_cast<float>(image[5 + corner * 2]);
        vertices[offset + 5] = static_cast<float>(red);
        vertices[offset + 6] = static_cast<float>(green);
        vertices[offset + 7] = static_cast<float>(blue);
        vertices[offset + 8] = static_cast<float>(alpha);
    }
}

extern "C" {

void pvz_place_quads(float *vertices, int32_t vertexCount, int32_t quads, int32_t stride, const double *matrix) {
    if (quads <= 0 || stride < 3 || static_cast<int64_t>(quads) * 4 * stride > vertexCount) return;
    float *vertex = vertices;
    for (int32_t rest = quads * 4; rest > 0; --rest, vertex += stride) place(matrix, vertex[0], vertex[1], vertex);
}

int32_t pvz_sample(const double *keys, int32_t count, double time, double *pose) {
    return sampleAt(keys, count, time, 0, pose);
}

void pvz_blend(const double *from, double ratio, double *pose) {
    for (int i = 0; i < 7; ++i) {
        const double start = i == 4 || i == 5 ? nearAngle(from[i], pose[i]) : from[i];
        pose[i] = start + (pose[i] - start) * ratio;
    }
}

int32_t pvz_write_reanim(const double *keys, int32_t keyCount, const int32_t *tracks, int32_t trackCount,
                         const double *state, int32_t stateCount, float *positions, int32_t positionCount,
                         float *vertices, int32_t vertexCount) {
    if (stateCount < PVZ_HEADER) return -1;
    const size_t stride = static_cast<size_t>(state[PVZ_STRIDE]), drawCount = static_cast<size_t>(state[PVZ_TRACKS]);
    const size_t capacity = static_cast<size_t>(state[PVZ_CAPACITY]), imageCount = static_cast<size_t>(state[PVZ_IMAGES]);
    const size_t first = static_cast<size_t>(state[PVZ_FIRST]), end = static_cast<size_t>(state[PVZ_END]);
    const size_t colors = PVZ_HEADER, blends = colors + drawCount * 4, images = blends + drawCount * PVZ_BLEND;
    if (stride < 9 || end > drawCount || first > end || drawCount * PVZ_TRACK > static_cast<size_t>(trackCount) ||
        images + imageCount * PVZ_IMAGE > static_cast<size_t>(stateCount) ||
        capacity * 4 * stride > static_cast<size_t>(positionCount) || capacity * 4 * stride > static_cast<size_t>(vertexCount)) return -1;

    const double time = state[PVZ_TIME], opacity = state[PVZ_OPACITY];
    const double colorRed = state[PVZ_RED], colorGreen = state[PVZ_GREEN], colorBlue = state[PVZ_BLUE], colorAlpha = state[PVZ_ALPHA];
    const bool extra = state[PVZ_EXTRA] != 0, tinted = state[PVZ_TINTED] != 0, blending = state[PVZ_BLENDING] != 0;
    const double ma = state[PVZ_MATRIX_A], mb = state[PVZ_MATRIX_B], mc = state[PVZ_MATRIX_C], md = state[PVZ_MATRIX_D];
    const double mx = state[PVZ_MATRIX_X], my = state[PVZ_MATRIX_Y];
    const double rate = state[PVZ_RATE];
    const double *placement = state[PVZ_PLACED] != 0 ? state + PVZ_PLACE : nullptr;
    size_t quad = 0;
    for (size_t entry = first; entry < end && quad < capacity; ++entry) {
        const int32_t *track = tracks + entry * PVZ_TRACK;
        const int32_t start = track[0], count = track[1], override = track[2];
        if (!track[3] || count <= 0 || start < 0 || static_cast<size_t>(start + count) * PVZ_KEY > static_cast<size_t>(keyCount)) continue;
        const double *frames = keys + static_cast<size_t>(start) * PVZ_KEY;
        double pose[7];
        const int32_t index = sampleAt(frames, count, time, rate, pose);
        if (index < 0) continue;
        const double *blend = state + blends + entry * PVZ_BLEND;
        if (blending && blend[0] != 0) pvz_blend(blend + 1, state[PVZ_RATIO], pose);
        const int32_t slot = override >= 0 ? override : static_cast<int32_t>(frames[index * PVZ_KEY + 9]);
        if (slot < 0 || static_cast<size_t>(slot) >= imageCount) continue;
        const double *image = state + images + static_cast<size_t>(slot) * PVZ_IMAGE;

        // The pose matrix, preceded by the attachment matrix.
        // Most poses turn both axes alike and many not at all: the same angle is not worked out twice, nor a zero one at all.
        const double kx = pose[4] * RADIANS, ky = pose[5] * RADIANS;
        const double cosX = kx == 0 ? 1 : std::cos(kx), sinX = kx == 0 ? kx : std::sin(kx);
        const double cosY = ky == kx ? cosX : std::cos(ky), sinY = ky == kx ? sinX : std::sin(ky);
        const double pa = cosX * pose[2], pb = -sinX * pose[2];
        const double pc = sinY * pose[3], pd = cosY * pose[3];
        const double px = pose[0], py = -pose[1];
        const double a = ma * pa + mc * pb, b = mb * pa + md * pb, c = ma * pc + mc * pd, d = mb * pc + md * pd;
        const double x = ma * px + mc * py + mx, y = mb * px + md * py + my;

        double red = 255, green = 255, blue = 255, alpha;
        if (tinted) {
            const double *trackColor = state + colors + entry * 4;
            red = roundHalfUp(colorRed * trackColor[0] / 255);
            green = roundHalfUp(colorGreen * trackColor[1] / 255);
            blue = roundHalfUp(colorBlue * trackColor[2] / 255);
            alpha = roundHalfUp(pose[6] * colorAlpha * trackColor[3] / 255);
        } else {
            alpha = roundHalfUp(pose[6] * colorAlpha);
        }
        pvz_write_quad(image, x, y, a, b, c, d, red / 255, green / 255, blue / 255, alpha * opacity, positions, vertices, quad++, stride, placement);
        if (extra && quad < capacity) {
            // The extra additive image takes the image alpha, which already includes the track's, as
            // ColorComponentMultiply in Reanimation::DrawTrack; a negative alpha marks it additive.
            const double extraAlpha = -std::floor(state[PVZ_EXTRA_ALPHA] * alpha / 255);
            pvz_write_quad(image, x, y, a, b, c, d, state[PVZ_EXTRA_RED] / 255, state[PVZ_EXTRA_GREEN] / 255,
                      state[PVZ_EXTRA_BLUE] / 255, extraAlpha * opacity, positions, vertices, quad++, stride, placement);
        }
    }
    return static_cast<int32_t>(quad);
}
}
