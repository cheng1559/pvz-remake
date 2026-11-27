// Exposes the module player (native/engine/common/music) to JavaScript. A player is a handle; once started it plays
// through an AudioEngine stream, whose audio ID the script pauses, resumes and sets the volume of as any other.
#include "application/ApplicationManager.h"
#include "audio/include/AudioEngine.h"
#include "base/Scheduler.h"
#include "bindings/jswrapper/SeApi.h"
#include "../music/pvz_music.h"

#include <algorithm>
#include <cstdint>
#include <memory>
#include <thread>
#include <unordered_map>
#include <vector>

namespace {
using pvz::music::Player;
using Type = se::Object::TypedArrayType;

// Renders the player for the stream. The stream keeps the player alive while its thread may still ask for frames.
class PlayerSource : public cc::AudioStreamSource {
public:
    explicit PlayerSource(std::shared_ptr<Player> player) : _player(std::move(player)) {}
    uint32_t getSampleRate() const override { return static_cast<uint32_t>(_player->sampleRate()); }
    void read(int16_t *out, uint32_t frames) override { _player->render(out, frames); }

private:
    std::shared_ptr<Player> _player;
};

struct Entry {
    std::shared_ptr<Player> player;
    int audioId = cc::AudioEngine::INVALID_AUDIO_ID;
};

std::unordered_map<int32_t, Entry> players;
int32_t nextHandle = 1;
constexpr int32_t STATE_FIELDS = 5;

// The player of the handle in args[0], given `count` args of which the first `numbers` are numbers; else none.
Entry *entryFor(const se::ValueArray &args, size_t count, size_t numbers) {
    if (args.size() != count) return nullptr;
    for (size_t index = 0; index < numbers; ++index) {
        if (!args[index].isNumber()) return nullptr;
    }
    auto it = players.find(args[0].toInt32());
    return it == players.end() ? nullptr : &it->second;
}

Player *playerFor(const se::ValueArray &args, size_t count, size_t numbers) {
    Entry *entry = entryFor(args, count, numbers);
    return entry ? entry->player.get() : nullptr;
}

// An ArrayBuffer's or a typed array's bytes; with `type`, only a typed array of that type.
bool bytes(const se::Value &value, uint8_t *&data, size_t &length, const Type *type = nullptr) {
    if (!value.isObject()) return false;
    se::Object *object = value.toObject();
    if (!type && object->isArrayBuffer()) return object->getArrayBufferData(&data, &length);
    return object->isTypedArray() && (!type || object->getTypedArrayType() == *type) && object->getTypedArrayData(&data, &length);
}

// (sample rate) -> handle
bool createBinding(se::State &s) {
    const auto &args = s.args();
    const int32_t sampleRate = args.size() == 1 && args[0].isNumber() ? args[0].toInt32() : 0;
    const int32_t handle = nextHandle++;
    players[handle].player = std::make_shared<Player>(sampleRate > 0 ? sampleRate : 44100);
    s.rval().setInt32(handle);
    return true;
}
SE_BIND_FUNC(createBinding)

// The callbacks of the loads under way, rooted until called. Only the game's thread touches them: a load's thread
// hands back just its number.
std::unordered_map<int32_t, se::Object *> loadCallbacks;
int32_t nextLoad = 1;

// (handle, ArrayBuffer or typed array, callback(instance, or -1)). A module takes a while to read, so it is read on a
// thread of its own while the game and the music play on; the callback runs on the game's thread.
bool loadBinding(se::State &s) {
    const auto &args = s.args();
    if (args.size() != 3 || !args[2].isObject() || !args[2].toObject()->isFunction()) return false;
    se::Object *callback = args[2].toObject();
    Entry *entry = entryFor(args, 3, 1);
    uint8_t *data = nullptr;
    size_t length = 0;
    if (!entry || !bytes(args[1], data, length)) {
        se::ValueArray result{se::Value(-1)};
        callback->call(result, nullptr);
        return true;
    }
    const int32_t load = nextLoad++;
    callback->root();
    callback->incRef();
    loadCallbacks[load] = callback;
    std::thread([player = entry->player, module = std::vector<uint8_t>(data, data + length), load]() {
        const int32_t instance = player->load(module.data(), module.size());
        auto app = CC_CURRENT_APPLICATION();
        if (!app) return;
        app->getEngine()->getScheduler()->performFunctionInCocosThread([load, instance]() {
            auto it = loadCallbacks.find(load);
            if (it == loadCallbacks.end()) return;
            se::Object *done = it->second;
            loadCallbacks.erase(it);
            se::AutoHandleScope scope;
            se::ValueArray result{se::Value(instance)};
            done->call(result, nullptr);
            done->unroot();
            done->decRef();
        });
    }).detach();
    return true;
}
SE_BIND_FUNC(loadBinding)

// (handle, instance, order, row)
bool playBinding(se::State &s) {
    const auto &args = s.args();
    if (Player *player = playerFor(args, 4, 4)) player->play(args[1].toInt32(), args[2].toInt32(), args[3].toInt32());
    return true;
}
SE_BIND_FUNC(playBinding)

// (handle, instance)
bool stopBinding(se::State &s) {
    const auto &args = s.args();
    if (Player *player = playerFor(args, 2, 2)) player->stop(args[1].toInt32());
    return true;
}
SE_BIND_FUNC(stopBinding)

// (handle, instance, volume)
bool setVolumeBinding(se::State &s) {
    const auto &args = s.args();
    if (Player *player = playerFor(args, 3, 3)) player->setVolume(args[1].toInt32(), args[2].toFloat());
    return true;
}
SE_BIND_FUNC(setVolumeBinding)

// (handle, instance, channel, volume)
bool setChannelVolumeBinding(se::State &s) {
    const auto &args = s.args();
    if (Player *player = playerFor(args, 4, 4)) player->setChannelVolume(args[1].toInt32(), args[2].toInt32(), args[3].toFloat());
    return true;
}
SE_BIND_FUNC(setChannelVolumeBinding)

// (handle, target, watched, Int32Array orders, volume)
bool queueJumpBinding(se::State &s) {
    const auto &args = s.args();
    static const Type INT32 = Type::INT32;
    uint8_t *data = nullptr;
    size_t length = 0;
    Player *player = playerFor(args, 5, 3);
    if (player && args[4].isNumber() && bytes(args[3], data, length, &INT32)) {
        player->queueJump(args[1].toInt32(), args[2].toInt32(), reinterpret_cast<const int32_t *>(data), static_cast<int32_t>(length / sizeof(int32_t)), args[4].toFloat());
    }
    return true;
}
SE_BIND_FUNC(queueJumpBinding)

// (handle, instances, Float64Array out): order, row, row fraction, playing and jumps landed for each instance in turn
bool stateBinding(se::State &s) {
    const auto &args = s.args();
    static const Type FLOAT64 = Type::FLOAT64;
    uint8_t *data = nullptr;
    size_t length = 0;
    Player *player = playerFor(args, 3, 2);
    if (!player || !bytes(args[2], data, length, &FLOAT64)) return true;
    auto *out = reinterpret_cast<double *>(data);
    const int32_t count = std::min<int32_t>(args[1].toInt32(), static_cast<int32_t>(length / sizeof(double) / STATE_FIELDS));
    for (int32_t instance = 0; instance < count; ++instance) {
        const auto position = player->position(instance);
        double *fields = out + static_cast<size_t>(instance) * STATE_FIELDS;
        fields[0] = position.order;
        fields[1] = position.row;
        fields[2] = position.rowFraction;
        fields[3] = player->playing(instance) ? 1 : 0;
        fields[4] = player->jumps(instance);
    }
    return true;
}
SE_BIND_FUNC(stateBinding)

// (handle, instance) -> its module's channel count
bool channelsBinding(se::State &s) {
    const auto &args = s.args();
    Player *player = playerFor(args, 2, 2);
    s.rval().setInt32(player ? player->channels(args[1].toInt32()) : 0);
    return true;
}
SE_BIND_FUNC(channelsBinding)

// (handle, volume) -> the stream's audio ID, or -1; started once
bool startBinding(se::State &s) {
    Entry *entry = entryFor(s.args(), 2, 2);
    if (entry && entry->audioId == cc::AudioEngine::INVALID_AUDIO_ID) {
        entry->audioId = cc::AudioEngine::playStream(std::make_shared<PlayerSource>(entry->player), s.args()[1].toFloat());
    }
    s.rval().setInt32(entry ? entry->audioId : cc::AudioEngine::INVALID_AUDIO_ID);
    return true;
}
SE_BIND_FUNC(startBinding)

// (handle): stops its stream and lets the player go
bool destroyBinding(se::State &s) {
    if (Entry *entry = entryFor(s.args(), 1, 1)) {
        if (entry->audioId != cc::AudioEngine::INVALID_AUDIO_ID) cc::AudioEngine::stop(entry->audioId);
        players.erase(s.args()[0].toInt32());
    }
    return true;
}
SE_BIND_FUNC(destroyBinding)
} // namespace

bool registerPvzMusic(se::Object *global) {
    return global->defineFunction("__pvzMusicCreate", _SE(createBinding)) &&
           global->defineFunction("__pvzMusicLoad", _SE(loadBinding)) &&
           global->defineFunction("__pvzMusicPlay", _SE(playBinding)) &&
           global->defineFunction("__pvzMusicStop", _SE(stopBinding)) &&
           global->defineFunction("__pvzMusicSetVolume", _SE(setVolumeBinding)) &&
           global->defineFunction("__pvzMusicSetChannelVolume", _SE(setChannelVolumeBinding)) &&
           global->defineFunction("__pvzMusicQueueJump", _SE(queueJumpBinding)) &&
           global->defineFunction("__pvzMusicState", _SE(stateBinding)) &&
           global->defineFunction("__pvzMusicChannels", _SE(channelsBinding)) &&
           global->defineFunction("__pvzMusicStart", _SE(startBinding)) &&
           global->defineFunction("__pvzMusicDestroy", _SE(destroyBinding));
}
