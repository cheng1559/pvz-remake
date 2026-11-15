#pragma once
#include <cstdint>

extern "C" {
enum PvzPngResult { PVZ_PNG_OK = 0, PVZ_PNG_UNSUPPORTED = -1, PVZ_PNG_SCANLINES = -2, PVZ_PNG_FILTER = -3 };
// Decodes a non-interlaced RGBA8 PNG whose colors are premultiplied, before any platform decoder can round its
// low-alpha colors. Produces straight-alpha RGBA, sanded. output needs (width * 4 + 1) * height bytes; the image
// fills its start.
int32_t pvz_png_decode_premultiplied(const uint8_t *png, int32_t length, uint8_t *output, int32_t outputLength);
// Sands straight-alpha RGBA8 in place, as the original does to every image it loads
// (FixPixelsOnAlphaEdgeForBlending): each fully transparent texel takes the average color of the visible texels
// in the rows above and below it, among the three nearest in each, or black where it has none. LINEAR sampling
// across the edge of an image's visible part then mixes in that color in place of whatever the file or its
// decoder left there. Alpha stays as it is.
void pvz_sand_alpha_edges(uint8_t *rgba, int32_t width, int32_t height);
}
