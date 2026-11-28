#include "pvz_music.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#include "libopenmpt/libopenmpt.h"
#include "libopenmpt/libopenmpt_ext.h"

namespace pvz::music {

namespace {
// Instances render in blocks this long: a queued jump lands within one of the watched instance's order change, and a
// volume change ramps across one.
constexpr size_t BLOCK_FRAMES = 64;
} // namespace

struct Player::Instance {
    openmpt_module_ext *ext = nullptr;
    openmpt_module *module = nullptr;
    openmpt_module_ext_interface_interactive interactive{};
    bool playing = false;
    float volume = 1;
    float targetVolume = 1;
    Position position;
    size_t framesIntoRow = 0;
    // The channel volumes set, negative where none was: libopenmpt keeps them in the play state a seek replaces, BASS
    // apart from it.
    std::vector<float> channelVolumes;
    // The queued jump: when `jumpWatched` leaves `jumpFromOrder`.
    int32_t jumpWatched = -1;
    int32_t jumpFromOrder = 0;
    std::vector<int32_t> jumpOrders;
    float jumpVolume = -1;
    int32_t jumps = 0;

    ~Instance() {
        if (ext) openmpt_module_ext_destroy(ext);
    }
};

Player::Player(int32_t sampleRate) : _sampleRate(sampleRate), _block(BLOCK_FRAMES * 2), _mix(BLOCK_FRAMES * 2) {}

Player::~Player() = default;

Player::Instance *Player::find(int32_t instance) const {
    return instance >= 0 && instance < static_cast<int32_t>(_instances.size()) ? _instances[instance].get() : nullptr;
}

int32_t Player::load(const void *data, size_t size) {
    // Read outside the lock: a module takes a while, and the instances playing meanwhile render on.
    int error = 0;
    const char *message = nullptr;
    openmpt_module_ext *ext = openmpt_module_ext_create_from_memory(data, size, openmpt_log_func_silent, nullptr, nullptr, nullptr, &error, &message, nullptr);
    const std::string reason = message ? message : "the module could not be read";
    if (message) openmpt_free_string(message);
    auto instance = std::make_unique<Instance>();
    instance->ext = ext;
    if (ext) {
        instance->module = openmpt_module_ext_get_module(ext);
        // Loop by the module's own jumps, as BASS_MUSIC_LOOP; a seek stops the notes that are playing, as
        // BASS_MUSIC_POSRESET, where libopenmpt would otherwise go on with those an earlier order left sounding.
        openmpt_module_set_repeat_count(instance->module, -1);
        openmpt_module_ctl_set_boolean(instance->module, "seek.sync_samples", 0);
    }
    const bool interactive = ext && openmpt_module_ext_get_interface(ext, LIBOPENMPT_EXT_C_INTERFACE_INTERACTIVE, &instance->interactive, sizeof(instance->interactive));
    std::lock_guard<std::mutex> lock(_mutex);
    if (!ext || !interactive) {
        _error = ext ? "libopenmpt has no interactive interface" : reason;
        return -1;
    }
    _instances.push_back(std::move(instance));
    return static_cast<int32_t>(_instances.size() - 1);
}

void Player::seek(Instance &instance, int32_t order, int32_t row) {
    // With seek.sync_samples off the seek stops every note, as BASS_MUSIC_POSRESET does; it also puts back the channel
    // volumes the module starts with.
    openmpt_module_set_position_order_row(instance.module, order, row);
    for (size_t channel = 0; channel < instance.channelVolumes.size(); ++channel) {
        if (instance.channelVolumes[channel] >= 0) instance.interactive.set_channel_volume(instance.ext, static_cast<int32_t>(channel), instance.channelVolumes[channel]);
    }
    instance.playing = true;
    instance.position = {openmpt_module_get_current_order(instance.module), openmpt_module_get_current_row(instance.module), 0};
    instance.framesIntoRow = 0;
}

void Player::play(int32_t index, int32_t order, int32_t row) {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(index);
    if (!instance) return;
    seek(*instance, order, row);
    instance->volume = instance->targetVolume;
}

void Player::stop(int32_t index) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (Instance *instance = find(index)) {
        instance->playing = false;
        instance->jumpOrders.clear();
    }
}

void Player::setVolume(int32_t index, float volume) {
    std::lock_guard<std::mutex> lock(_mutex);
    if (Instance *instance = find(index)) {
        instance->targetVolume = std::clamp(volume, 0.0F, 1.0F);
        if (!instance->playing) instance->volume = instance->targetVolume;
    }
}

void Player::setChannelVolume(int32_t index, int32_t channel, float volume) {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(index);
    if (!instance || channel < 0 || channel >= openmpt_module_get_num_channels(instance->module)) return;
    if (instance->channelVolumes.size() <= static_cast<size_t>(channel)) instance->channelVolumes.resize(channel + 1, -1);
    instance->channelVolumes[channel] = std::clamp(volume, 0.0F, 1.0F);
    instance->interactive.set_channel_volume(instance->ext, channel, instance->channelVolumes[channel]);
}

void Player::queueJump(int32_t target, int32_t watched, const int32_t *orders, int32_t count, float volume) {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(target);
    Instance *watchedInstance = find(watched);
    if (!instance) return;
    instance->jumpOrders.clear();
    if (!watchedInstance || count <= 0) return;
    instance->jumpOrders.assign(orders, orders + count);
    instance->jumpWatched = watched;
    instance->jumpFromOrder = watchedInstance->position.order;
    instance->jumpVolume = volume;
}

int32_t Player::jumps(int32_t target) const {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(target);
    return instance ? instance->jumps : 0;
}

Position Player::position(int32_t index) const {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(index);
    return instance ? instance->position : Position{};
}

bool Player::playing(int32_t index) const {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(index);
    return instance && instance->playing;
}

int32_t Player::channels(int32_t index) const {
    std::lock_guard<std::mutex> lock(_mutex);
    Instance *instance = find(index);
    return instance ? openmpt_module_get_num_channels(instance->module) : 0;
}

void Player::track(Instance &instance, size_t frames) {
    const int32_t order = openmpt_module_get_current_order(instance.module);
    const int32_t row = openmpt_module_get_current_row(instance.module);
    if (order != instance.position.order || row != instance.position.row) {
        instance.framesIntoRow = 0;
    } else {
        instance.framesIntoRow += frames;
    }
    // A row is speed ticks of 2.5 / tempo seconds each.
    const double tempo = openmpt_module_get_current_tempo2(instance.module);
    const int32_t speed = openmpt_module_get_current_speed(instance.module);
    const double rowFrames = tempo > 0 ? speed * 2.5 / tempo * _sampleRate : 0;
    instance.position = {order, row, rowFrames > 0 ? std::min(1.0, instance.framesIntoRow / rowFrames) : 0};
}

void Player::renderBlock(float *out, size_t frames) {
    std::fill(out, out + frames * 2, 0.0F);
    for (auto &pointer : _instances) {
        Instance &instance = *pointer;
        if (!instance.playing) continue;
        const size_t rendered = openmpt_module_read_interleaved_float_stereo(instance.module, _sampleRate, frames, _block.data());
        const float from = instance.volume;
        const float to = instance.targetVolume;
        for (size_t frame = 0; frame < rendered; ++frame) {
            const float gain = from + (to - from) * static_cast<float>(frame + 1) / static_cast<float>(frames);
            out[frame * 2] += _block[frame * 2] * gain;
            out[frame * 2 + 1] += _block[frame * 2 + 1] * gain;
        }
        instance.volume = to;
        track(instance, rendered);
    }
    // Jumps queued on an instance whose order has now changed, for the next block.
    for (auto &pointer : _instances) {
        Instance &instance = *pointer;
        if (instance.jumpOrders.empty()) continue;
        Instance *watched = find(instance.jumpWatched);
        if (!watched || !watched->playing) {
            instance.jumpOrders.clear();
            continue;
        }
        if (watched->position.order == instance.jumpFromOrder) continue;
        const int32_t count = static_cast<int32_t>(instance.jumpOrders.size());
        const int32_t order = instance.jumpOrders[((watched->position.order % count) + count) % count];
        instance.jumpOrders.clear();
        seek(instance, order, 0);
        ++instance.jumps;
        if (instance.jumpVolume >= 0) instance.volume = instance.targetVolume = std::min(instance.jumpVolume, 1.0F);
    }
}

void Player::render(float *out, size_t frames) {
    std::lock_guard<std::mutex> lock(_mutex);
    for (size_t done = 0; done < frames;) {
        const size_t count = std::min(BLOCK_FRAMES, frames - done);
        renderBlock(out + done * 2, count);
        done += count;
    }
}

void Player::render(int16_t *out, size_t frames) {
    std::lock_guard<std::mutex> lock(_mutex);
    for (size_t done = 0; done < frames;) {
        const size_t count = std::min(BLOCK_FRAMES, frames - done);
        renderBlock(_mix.data(), count);
        for (size_t sample = 0; sample < count * 2; ++sample) {
            const float value = std::clamp(_mix[sample], -1.0F, 1.0F) * 32767.0F;
            out[done * 2 + sample] = static_cast<int16_t>(std::lrint(value));
        }
        done += count;
    }
}

} // namespace pvz::music

using pvz::music::Player;

extern "C" {

void *pvz_music_create(int32_t sampleRate) { return new Player(sampleRate); }
void pvz_music_destroy(void *player) { delete static_cast<Player *>(player); }
int32_t pvz_music_load(void *player, const void *data, size_t size) { return static_cast<Player *>(player)->load(data, size); }
void pvz_music_play(void *player, int32_t instance, int32_t order, int32_t row) { static_cast<Player *>(player)->play(instance, order, row); }
void pvz_music_stop(void *player, int32_t instance) { static_cast<Player *>(player)->stop(instance); }
void pvz_music_set_volume(void *player, int32_t instance, float volume) { static_cast<Player *>(player)->setVolume(instance, volume); }
void pvz_music_set_channel_volume(void *player, int32_t instance, int32_t channel, float volume) {
    static_cast<Player *>(player)->setChannelVolume(instance, channel, volume);
}
void pvz_music_queue_jump(void *player, int32_t target, int32_t watched, const int32_t *orders, int32_t count, float volume) {
    static_cast<Player *>(player)->queueJump(target, watched, orders, count, volume);
}
int32_t pvz_music_jumps(void *player, int32_t target) { return static_cast<Player *>(player)->jumps(target); }
void pvz_music_position(void *player, int32_t instance, double *out) {
    const auto position = static_cast<Player *>(player)->position(instance);
    out[0] = position.order;
    out[1] = position.row;
    out[2] = position.rowFraction;
}
int32_t pvz_music_playing(void *player, int32_t instance) { return static_cast<Player *>(player)->playing(instance) ? 1 : 0; }
int32_t pvz_music_channels(void *player, int32_t instance) { return static_cast<Player *>(player)->channels(instance); }
void pvz_music_render(void *player, float *out, size_t frames) { static_cast<Player *>(player)->render(out, frames); }

}
