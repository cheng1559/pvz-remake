#pragma once
#include <cstdint>

extern "C" {
enum PvzPngResult { PVZ_PNG_OK = 0, PVZ_PNG_UNSUPPORTED = -1, PVZ_PNG_SCANLINES = -2, PVZ_PNG_FILTER = -3 };
// Decodes a non-interlaced RGBA8 PNG whose colors are premultiplied, before any platform decoder can round its
// low-alpha colors. Produces straight-alpha RGBA with edge colors extended into transparent texels, so LINEAR
// sampling does not mix in black. output needs (width * 4 + 1) * height bytes; the image fills its start.
int32_t pvz_png_decode_premultiplied(const uint8_t *png, int32_t length, uint8_t *output, int32_t outputLength);
}
