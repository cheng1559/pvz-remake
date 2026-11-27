#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

// Plays tracker modules the way the original's Music.cpp drives BASS: a tune is one or more instances of a module
// (Music::PlayMusic plays mainmusic.mo3 twice, as the melody and the drums, and mainmusic_hihats.mo3 beside them), each
// started at an order with notes reset, looping by the module's own jumps, with its own volume and channel volumes.
// All instances render in one loop, so they stay in step to the sample. The native audio stream and the web's
// AudioWorklet render through it; the game drives it as the original drives its music.
namespace pvz::music {

struct Position {
    int32_t order = 0;
    int32_t row = 0;
    // How far into the row, 0 to 1.
    double rowFraction = 0;
};

class Player {
public:
    explicit Player(int32_t sampleRate);
    ~Player();
    Player(const Player &) = delete;
    Player &operator=(const Player &) = delete;

    // Adds an instance of the module in `data` (copied), stopped, at volume 1; its index, or -1 with error() set.
    int32_t load(const void *data, size_t size);
    // Plays the instance from `order` and `row`, with any notes it had stopped (the original's BASS_MUSIC_POSRESET).
    void play(int32_t instance, int32_t order, int32_t row);
    void stop(int32_t instance);
    // The instance's volume in the mix, reached over the next block rendered.
    void setVolume(int32_t instance, float volume);
    void setChannelVolume(int32_t instance, int32_t channel, float volume);
    // When `watched` next enters another order, `target` plays from row 0 of orders[new order % count] at `volume`
    // (a negative volume keeps its own), in the same block. A later call replaces it; count 0 cancels it.
    void queueJump(int32_t target, int32_t watched, const int32_t *orders, int32_t count, float volume);
    // How many queued jumps have landed on `target`: one read late is behind, never ahead.
    int32_t jumps(int32_t target) const;
    Position position(int32_t instance) const;
    bool playing(int32_t instance) const;
    int32_t channels(int32_t instance) const;
    // Renders `frames` frames of interleaved stereo, every playing instance mixed; silence when none plays.
    void render(float *out, size_t frames);
    void render(int16_t *out, size_t frames);
    int32_t sampleRate() const { return _sampleRate; }
    const std::string &error() const { return _error; }

private:
    struct Instance;
    Instance *find(int32_t instance) const;
    void seek(Instance &instance, int32_t order, int32_t row);
    void renderBlock(float *out, size_t frames);
    void track(Instance &instance, size_t frames);

    int32_t _sampleRate;
    std::string _error;
    std::vector<std::unique_ptr<Instance>> _instances;
    std::vector<float> _block;
    std::vector<float> _mix;
    mutable std::mutex _mutex;
};

} // namespace pvz::music

// The same player for the WebAssembly build.
extern "C" {
void *pvz_music_create(int32_t sampleRate);
void pvz_music_destroy(void *player);
int32_t pvz_music_load(void *player, const void *data, size_t size);
void pvz_music_play(void *player, int32_t instance, int32_t order, int32_t row);
void pvz_music_stop(void *player, int32_t instance);
void pvz_music_set_volume(void *player, int32_t instance, float volume);
void pvz_music_set_channel_volume(void *player, int32_t instance, int32_t channel, float volume);
void pvz_music_queue_jump(void *player, int32_t target, int32_t watched, const int32_t *orders, int32_t count, float volume);
int32_t pvz_music_jumps(void *player, int32_t target);
// Writes order, row and row fraction into `out`.
void pvz_music_position(void *player, int32_t instance, double *out);
int32_t pvz_music_playing(void *player, int32_t instance);
int32_t pvz_music_channels(void *player, int32_t instance);
void pvz_music_render(void *player, float *out, size_t frames);
}
