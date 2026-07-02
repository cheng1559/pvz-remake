#pragma once

#include <string>

namespace pvz {

bool PreloadOboeSfx(const std::string& url);
bool PlayOboeSfxPitch(const std::string& url, float volume, float pitch);

}
