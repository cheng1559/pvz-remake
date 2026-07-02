#include "PvzOboeSfx.h"

#include "cocos/cocos.h"
#include "platform/FileUtils.h"

#include <aaudio/AAudio.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace pvz {
namespace {

constexpr int32_t kRequestedSampleRate = 44100;
constexpr size_t kMaxVoices = 128;

struct PcmSound {
    std::vector<float> samples;
    int32_t sampleRate = kRequestedSampleRate;
    size_t frames = 0;
};

struct Voice {
    std::shared_ptr<PcmSound> sound;
    double position = 0.0;
    double step = 1.0;
    float volume = 1.0F;
};

std::mutex g_mutex;
std::unordered_map<std::string, std::shared_ptr<PcmSound>> g_sounds;
std::vector<Voice> g_voices;
AAudioStream* g_stream = nullptr;
int32_t g_outputSampleRate = kRequestedSampleRate;

uint16_t readU16(const uint8_t* data) {
    return static_cast<uint16_t>(data[0] | (data[1] << 8));
}

uint32_t readU32(const uint8_t* data) {
    return static_cast<uint32_t>(data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24));
}

std::shared_ptr<PcmSound> loadPcmWav(const std::string& url) {
    const auto fullPath = cc::FileUtils::getInstance()->fullPathForFilename(url);
    cc::Data fileData = cc::FileUtils::getInstance()->getDataFromFile(fullPath.empty() ? url : fullPath);
    if (fileData.isNull() || fileData.getSize() < 44) return nullptr;

    const auto* bytes = fileData.getBytes();
    const auto size = static_cast<size_t>(fileData.getSize());
    if (std::memcmp(bytes, "RIFF", 4) != 0 || std::memcmp(bytes + 8, "WAVE", 4) != 0) return nullptr;

    uint16_t audioFormat = 0;
    uint16_t channels = 0;
    uint32_t sampleRate = 0;
    uint16_t bitsPerSample = 0;
    const uint8_t* pcm = nullptr;
    uint32_t pcmBytes = 0;

    size_t offset = 12;
    while (offset + 8 <= size) {
        const uint8_t* chunk = bytes + offset;
        const uint32_t chunkSize = readU32(chunk + 4);
        const size_t dataOffset = offset + 8;
        if (dataOffset + chunkSize > size) break;

        if (std::memcmp(chunk, "fmt ", 4) == 0 && chunkSize >= 16) {
            audioFormat = readU16(bytes + dataOffset);
            channels = readU16(bytes + dataOffset + 2);
            sampleRate = readU32(bytes + dataOffset + 4);
            bitsPerSample = readU16(bytes + dataOffset + 14);
        } else if (std::memcmp(chunk, "data", 4) == 0) {
            pcm = bytes + dataOffset;
            pcmBytes = chunkSize;
        }

        offset = dataOffset + chunkSize + (chunkSize & 1U);
    }

    if (audioFormat != 1 || bitsPerSample != 16 || sampleRate == 0 || pcm == nullptr || pcmBytes == 0) {
        return nullptr;
    }
    if (channels != 1 && channels != 2) return nullptr;

    const size_t inputFrames = pcmBytes / (sizeof(int16_t) * channels);
    auto sound = std::make_shared<PcmSound>();
    sound->sampleRate = static_cast<int32_t>(sampleRate);
    sound->frames = inputFrames;
    sound->samples.resize(inputFrames * 2);

    const auto* src = reinterpret_cast<const int16_t*>(pcm);
    for (size_t i = 0; i < inputFrames; ++i) {
        const float left = static_cast<float>(src[i * channels]) / 32768.0F;
        const float right = channels == 1 ? left : static_cast<float>(src[i * channels + 1]) / 32768.0F;
        sound->samples[i * 2] = left;
        sound->samples[i * 2 + 1] = right;
    }

    return sound;
}

aaudio_data_callback_result_t mixAudio(AAudioStream* stream, void*, void* audioData, int32_t numFrames) {
    auto* out = static_cast<float*>(audioData);
    const int32_t channels = std::max(1, AAudioStream_getChannelCount(stream));
    std::fill(out, out + numFrames * channels, 0.0F);

    std::unique_lock<std::mutex> lock(g_mutex, std::try_to_lock);
    if (!lock.owns_lock()) return AAUDIO_CALLBACK_RESULT_CONTINUE;

    for (auto voice = g_voices.begin(); voice != g_voices.end();) {
        const auto& sound = voice->sound;
        if (!sound || sound->frames == 0) {
            voice = g_voices.erase(voice);
            continue;
        }

        int32_t frame = 0;
        while (frame < numFrames && voice->position < static_cast<double>(sound->frames)) {
            const auto sourceFrame = static_cast<size_t>(voice->position);
            const float left = sound->samples[sourceFrame * 2] * voice->volume;
            const float right = sound->samples[sourceFrame * 2 + 1] * voice->volume;
            out[frame * channels] += left;
            if (channels > 1) out[frame * channels + 1] += right;

            voice->position += voice->step;
            ++frame;
        }

        if (voice->position >= static_cast<double>(sound->frames)) {
            voice = g_voices.erase(voice);
        } else {
            ++voice;
        }
    }

    for (int32_t i = 0; i < numFrames * channels; ++i) {
        out[i] = std::clamp(out[i], -1.0F, 1.0F);
    }

    return AAUDIO_CALLBACK_RESULT_CONTINUE;
}

bool ensureStream() {
    if (g_stream) return true;

    AAudioStreamBuilder* builder = nullptr;
    if (AAudio_createStreamBuilder(&builder) != AAUDIO_OK || builder == nullptr) return false;

    AAudioStreamBuilder_setDirection(builder, AAUDIO_DIRECTION_OUTPUT);
    AAudioStreamBuilder_setPerformanceMode(builder, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
    AAudioStreamBuilder_setSharingMode(builder, AAUDIO_SHARING_MODE_EXCLUSIVE);
    AAudioStreamBuilder_setFormat(builder, AAUDIO_FORMAT_PCM_FLOAT);
    AAudioStreamBuilder_setChannelCount(builder, 2);
    AAudioStreamBuilder_setSampleRate(builder, kRequestedSampleRate);
    AAudioStreamBuilder_setDataCallback(builder, mixAudio, nullptr);

    aaudio_result_t result = AAudioStreamBuilder_openStream(builder, &g_stream);
    if (result != AAUDIO_OK) {
        AAudioStreamBuilder_setSharingMode(builder, AAUDIO_SHARING_MODE_SHARED);
        result = AAudioStreamBuilder_openStream(builder, &g_stream);
    }
    AAudioStreamBuilder_delete(builder);
    if (result != AAUDIO_OK || g_stream == nullptr) return false;

    const int32_t burst = AAudioStream_getFramesPerBurst(g_stream);
    if (burst > 0) AAudioStream_setBufferSizeInFrames(g_stream, burst * 2);

    g_outputSampleRate = AAudioStream_getSampleRate(g_stream) > 0 ? AAudioStream_getSampleRate(g_stream) : kRequestedSampleRate;
    if (AAudioStream_requestStart(g_stream) != AAUDIO_OK) {
        AAudioStream_close(g_stream);
        g_stream = nullptr;
        return false;
    }

    return true;
}

std::shared_ptr<PcmSound> getSound(const std::string& url) {
    {
        std::lock_guard<std::mutex> lock(g_mutex);
        auto it = g_sounds.find(url);
        if (it != g_sounds.end()) return it->second;
    }

    auto loaded = loadPcmWav(url);
    if (!loaded) return nullptr;

    std::lock_guard<std::mutex> lock(g_mutex);
    auto [it, inserted] = g_sounds.emplace(url, loaded);
    return inserted ? loaded : it->second;
}

} // namespace

bool PreloadOboeSfx(const std::string& url) {
    return ensureStream() && getSound(url) != nullptr;
}

bool PlayOboeSfxPitch(const std::string& url, float volume, float pitch) {
    auto sound = getSound(url);
    if (!sound || !ensureStream()) return false;

    Voice voice;
    voice.sound = sound;
    voice.volume = std::clamp(volume, 0.0F, 1.0F);
    voice.step = std::clamp(pitch, 0.5F, 2.0F) * static_cast<double>(sound->sampleRate) / g_outputSampleRate;

    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_voices.size() >= kMaxVoices) g_voices.erase(g_voices.begin());
    g_voices.push_back(std::move(voice));
    return true;
}

}
