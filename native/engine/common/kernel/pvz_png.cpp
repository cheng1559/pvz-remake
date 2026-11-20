#include "pvz_png.h"

#include <zlib.h>
#include <climits>
#include <cstdlib>
#include <cstring>

namespace {
uint32_t be32(const uint8_t *bytes) {
    return (uint32_t(bytes[0]) << 24) | (uint32_t(bytes[1]) << 16) | (uint32_t(bytes[2]) << 8) | bytes[3];
}

// Inflates the concatenated IDAT chunks; true when they hold exactly size bytes.
bool inflateImage(const uint8_t *png, int32_t length, uint8_t *output, uint64_t size) {
    z_stream stream{};
    if (inflateInit(&stream) != Z_OK) return false;
    stream.next_out = output;
    stream.avail_out = uInt(size);
    int status = Z_OK;
    for (int32_t offset = 8; offset + 12 <= length && status == Z_OK;) {
        const uint32_t chunk = be32(png + offset), type = be32(png + offset + 4);
        if (chunk > uint32_t(length - offset - 12)) break;
        if (type == 0x49444154) { // IDAT
            stream.next_in = const_cast<Bytef *>(png + offset + 8);
            stream.avail_in = chunk;
            while (stream.avail_in && status == Z_OK) status = inflate(&stream, Z_NO_FLUSH);
        }
        if (type == 0x49454e44) break; // IEND
        offset += int32_t(chunk) + 12;
    }
    const bool complete = status == Z_STREAM_END && stream.total_out == size;
    inflateEnd(&stream);
    return complete;
}
} // namespace

int32_t pvz_png_decode_premultiplied(const uint8_t *png, int32_t length, uint8_t *output, int32_t outputLength) {
    static const uint8_t signature[] = {0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};
    if (!png || !output || length < 33 || std::memcmp(png, signature, 8) || be32(png + 12) != 0x49484452 ||
        png[24] != 8 || png[25] != 6 || png[26] || png[27] || png[28]) {
        return PVZ_PNG_UNSUPPORTED;
    }
    const uint32_t width = be32(png + 16), height = be32(png + 20);
    const uint64_t stride = uint64_t(width) * 4, filteredSize = (stride + 1) * height;
    if (!width || !height || outputLength < 0 || filteredSize > uint64_t(outputLength)) return PVZ_PNG_UNSUPPORTED;
    if (!inflateImage(png, length, output, filteredSize)) return PVZ_PNG_SCANLINES;

    // Unfilters in place: row y moves from y * (stride + 1) + 1 down to y * stride, always behind the bytes still to read.
    for (uint32_t y = 0; y < height; y++) {
        const uint8_t *source = output + y * (stride + 1);
        const uint8_t filter = source[0];
        if (filter > 4) return PVZ_PNG_FILTER;
        uint8_t *row = output + y * stride;
        const uint8_t *above = y ? row - stride : nullptr;
        for (uint64_t x = 0; x < stride; x++) {
            const int left = x >= 4 ? row[x - 4] : 0, up = above ? above[x] : 0, corner = above && x >= 4 ? above[x - 4] : 0;
            int prediction = 0;
            if (filter == 1) prediction = left;
            else if (filter == 2) prediction = up;
            else if (filter == 3) prediction = (left + up) >> 1;
            else if (filter == 4) {
                const int p = left + up - corner, a = std::abs(p - left), b = std::abs(p - up), c = std::abs(p - corner);
                prediction = a <= b && a <= c ? left : b <= c ? up : corner;
            }
            row[x] = uint8_t(source[1 + x] + prediction);
        }
    }

    const uint64_t pixels = uint64_t(width) * height;
    for (uint64_t index = 0; index < pixels * 4; index += 4) {
        const uint32_t alpha = output[index + 3];
        if (alpha == 0 || alpha == 255) continue;
        // round(color * 255 / alpha), as the source tools wrote it.
        for (int channel = 0; channel < 3; channel++) {
            const uint32_t color = (output[index + channel] * 510u + alpha) / (2 * alpha);
            output[index + channel] = uint8_t(color > 255 ? 255 : color);
        }
    }
    if (width > uint32_t(INT32_MAX) || height > uint32_t(INT32_MAX)) return PVZ_PNG_UNSUPPORTED;
    pvz_sand_alpha_edges(output, int32_t(width), int32_t(height));
    return PVZ_PNG_OK;
}

void pvz_sand_alpha_edges(uint8_t *rgba, int32_t width, int32_t height) {
    if (!rgba || width <= 0 || height <= 0) return;
    const int64_t stride = int64_t(width) * 4;
    for (int32_t y = 0; y < height; y++) {
        uint8_t *pixel = rgba + y * stride;
        for (int32_t x = 0; x < width; x++, pixel += 4) {
            if (pixel[3]) continue;
            // Only visible texels give a color, and a sanded one stays transparent: the order of the pass does not matter.
            uint32_t red = 0, green = 0, blue = 0, count = 0;
            for (int32_t dy = -1; dy <= 1; dy += 2) {
                if (y + dy < 0 || y + dy >= height) continue;
                for (int32_t dx = -1; dx <= 1; dx++) {
                    if (x + dx < 0 || x + dx >= width) continue;
                    const uint8_t *visible = pixel + dy * stride + dx * 4;
                    if (!visible[3]) continue;
                    red += visible[0];
                    green += visible[1];
                    blue += visible[2];
                    count++;
                }
            }
            pixel[0] = uint8_t(count ? red / count : 0);
            pixel[1] = uint8_t(count ? green / count : 0);
            pixel[2] = uint8_t(count ? blue / count : 0);
        }
    }
}
