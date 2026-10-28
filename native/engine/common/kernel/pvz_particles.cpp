#include "pvz_particles.h"
#include "pvz_kernel.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <unordered_map>
#include <vector>

namespace {
constexpr double PI = 3.14159265358979323846, RAD = PI / 180;
constexpr size_t MAX_PARTICLES = 4096;
// Fields per emitter; particles keep their field state inline instead of allocating per spawn.
constexpr size_t MAX_FIELDS = 8;
// Live particles across all systems. Spawning stops at the cap, so kernel memory stays bounded.
constexpr size_t MAX_LIVE_PARTICLES = 65536;
size_t liveParticles = 0;
// Keep this order in sync with PARTICLE_TRACKS in particles.ts.
enum TrackId {
    Duration, Rate, MinActive, MaxActive, MaxLaunched, OffsetX, OffsetY, Radius, BoxX, BoxY, SkewX, SkewY, Path,
    Life, Speed, Angle, SysRed, SysGreen, SysBlue, SysAlpha, SysBrightness,
    Red, Green, Blue, Alpha, Brightness, SpinAngle, SpinSpeed, Scale, Stretch, Reflect, CollisionSpin, TrackCount
};
double warp(double value, int curve) {
    if (curve == 1) return value * value;
    if (curve == 2) return 1 - (1 - value) * (1 - value);
    if (curve == 3) return value * value * (3 - 2 * value);
    if (curve == 4) return value <= 0.5 ? (2 * value - 2 * value * value) : (2 * value * value - 2 * value + 1);
    if (curve == 5) return 1 - std::abs(2 * value - 1);
    return value;
}
struct Key { double time, low, high, curve; };
struct Track {
    std::vector<Key> nodes;
    double at(double time, double interpolation) const {
        if (nodes.empty()) return 0;
        const auto value = [interpolation](const Key &k) { return k.low + (k.high - k.low) * warp(interpolation, static_cast<int>(k.curve) / 16); };
        if (nodes.size() == 1 || time <= nodes.front().time) return value(nodes.front());
        for (size_t i = 1; i < nodes.size(); ++i) {
            const Key &right = nodes[i], &left = nodes[i - 1];
            if (time > right.time) continue;
            const double span = right.time - left.time;
            double f = span <= 0 ? 1 : (time - left.time) / span;
            f = warp(f, static_cast<int>(left.curve) % 16);
            return value(left) + (value(right) - value(left)) * f;
        }
        return value(nodes.back());
    }
    bool constant(double value) const {
        return !nodes.empty() && std::all_of(nodes.begin(), nodes.end(), [value](const Key &k) { return k.low == value && k.high == value; });
    }
};
struct Field { int type; Track x, y; };
struct Particle {
    int age = 0, duration = 1, frame = 0;
    double x = 0, y = 0, vx = 0, vy = 0, spin = 0, spinVelocity = 0, lastTime = -1;
    std::array<double, 11> interpolation{}; // red through collisionSpin
    std::array<std::array<double, 2>, MAX_FIELDS> fieldRandom{}, fieldLast{};
};
struct Emitter {
    int type = 0, flags = 0, frames = 1, columns = 1, rows = 1, col = 0, row = 0, age = -1, spawned = 0;
    double duration = 1, time = 0, accumulator = 0, centerX = 0, centerY = 0, launchLimit = -1;
    bool dead = false;
    std::array<Track, TrackCount> tracks;
    std::array<double, 9> interpolation{}; // alpha, red, green, blue, brightness, rate, min, max, launched
    std::vector<Field> fields, systemFields;
    std::vector<std::array<double, 2>> systemRandom, systemLast;
    std::vector<Particle> particles;
};
enum Flags { RandomSpin = 1, AlignSpin = 2, ParticleLoop = 4, SystemLoop = 8, RandomStart = 16, DontFollow = 32 };
struct Reader {
    const double *data; int length, offset = 0; bool valid = true;
    double next() {
        if (offset >= length) { valid = false; return 0; }
        const double value = data[offset++];
        if (!std::isfinite(value)) { valid = false; return 0; }
        return value;
    }
    int integer(int maximum) {
        double value = next();
        if (value < 0 || value > maximum || std::floor(value) != value) { valid = false; return 0; }
        return static_cast<int>(value);
    }
    Track track() {
        Track result;
        int count = integer(4096);
        for (int i = 0; i < count && valid; ++i) result.nodes.push_back({next(), next(), next(), next()});
        return result;
    }
    std::vector<Field> fields() {
        std::vector<Field> result;
        int count = integer(MAX_FIELDS);
        for (int i = 0; i < count && valid; ++i) result.push_back({integer(11), track(), track()});
        return result;
    }
};
struct System {
    uint32_t rng;
    std::vector<Emitter> emitters;
    ~System() { for (const auto &e : emitters) liveParticles -= e.particles.size(); }
    double random() {
        rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5;
        return rng / 4294967296.0;
    }
    double sample(Emitter &e, TrackId id, double time) { return e.tracks[id].at(time, random()); }
    void init(Emitter &e) {
        for (double &v : e.interpolation) v = random();
        e.duration = std::max(1.0, std::floor(sample(e, Duration, 0) + 0.5));
        for (size_t i = 0; i < e.systemFields.size(); ++i) {
            e.systemRandom.push_back({random(), random()});
            e.systemLast.push_back({0, 0});
        }
        const Track &limit = e.tracks[MaxLaunched];
        if (!(e.flags & SystemLoop) && !limit.nodes.empty() && limit.nodes[0].low >= 0 && limit.constant(limit.nodes[0].low))
            e.launchLimit = std::floor(limit.nodes[0].low);

    }
    bool update(Emitter &e, Particle &p) {
        if (p.age >= p.duration) {
            if (!(e.flags & ParticleLoop)) return false;
            p.age = 0; p.lastTime = -1;
            for (auto &v : p.fieldLast) v = {0, 0};
        }
        const double time = p.duration <= 1 ? 1 : p.age / double(p.duration - 1);
        for (size_t i = 0; i < e.fields.size(); ++i) {
            const Field &f = e.fields[i];
            const double x = f.x.at(time, p.fieldRandom[i][0]), y = f.y.at(time, p.fieldRandom[i][1]);
            if (f.type == 5 || f.type == 6) {
                p.x += x - p.fieldLast[i][0]; p.y += y - p.fieldLast[i][1]; p.fieldLast[i] = {x, y};
            } else if (f.type == 0) { p.vx *= 1 - x; p.vy *= 1 - y; }
            else if (f.type == 1) { p.vx += x * .01; p.vy += y * .01; }
            else if (f.type == 7 && p.y > y) {
                p.y = y;
                const double reflect = e.tracks[Reflect].at(time, p.interpolation[9]);
                p.spinVelocity = p.vy * e.tracks[CollisionSpin].at(time, p.interpolation[10]) / 1000;
                p.vx *= reflect; p.vy *= -reflect;
            }
        }
        p.x += p.vx; p.y += p.vy;

        const double previous = p.lastTime < 0 ? 0 : e.tracks[SpinAngle].at(p.lastTime, p.interpolation[5]);
        p.spin += (e.tracks[SpinSpeed].at(time, p.interpolation[6]) * .01 +
                   e.tracks[SpinAngle].at(time, p.interpolation[5]) - previous) * RAD + p.spinVelocity;
        ++p.age; p.lastTime = time;
        return true;
    }
    Particle spawn(Emitter &e, double time, int index, int count) {
        Particle p;
        double angle, speed;
        p.duration = static_cast<int>(std::max(1.0, std::floor(sample(e, Life, time) + .5)));
        speed = sample(e, Speed, time) * .01;
        angle = sample(e, Angle, time);
        if (e.type == 1) angle = sample(e, Path, time) * PI * 2 + angle * RAD;
        else if (e.type == 2) angle = PI * 2 * index / count + angle * RAD;
        else if (e.tracks[Angle].constant(0)) angle = random() * PI * 2;
        else angle *= RAD;
        const int cell = (e.frames != 1 || e.columns != 1 || e.rows != 1) ? static_cast<int>(std::floor(random() * e.frames)) : 0;
        p.frame = std::clamp(e.row, 0, e.rows - 1) * e.columns + std::clamp(e.col + cell, 0, e.columns - 1);
        p.spin = e.flags & RandomSpin ? random() * PI * 2 : e.flags & AlignSpin ? angle : 0;
        for (double &v : p.interpolation) v = random();
        for (size_t i = 0; i < e.fields.size(); ++i) p.fieldRandom[i] = {random(), random()};
        double x, y;
        if (e.type == 3 || e.type == 4) { x = sample(e, BoxX, time); y = sample(e, BoxY, time); }
        else { const double radius = sample(e, Radius, time); x = std::sin(angle) * radius; y = std::cos(angle) * radius; }
        const double skewX = sample(e, SkewX, time), skewY = sample(e, SkewY, time);
        p.x = e.centerX + x + y * skewX + sample(e, OffsetX, time);
        p.y = e.centerY + y + x * skewY + sample(e, OffsetY, time);
        if (e.flags & RandomStart) p.age = static_cast<int>(std::floor(random() * p.duration));
        p.vx = std::sin(angle) * speed; p.vy = std::cos(angle) * speed;
        update(e, p);
        return p;
    }
    void step(Emitter &e, double dx, double dy) {
        if (e.dead) return;
        if (e.launchLimit >= 0 && e.spawned >= e.launchLimit && e.particles.empty()) {
            if (++e.age >= e.duration) { e.age = static_cast<int>(e.duration) - 1; e.dead = true; }
            return;
        }
        if (e.flags & DontFollow) for (auto &p : e.particles) { p.x -= dx; p.y += dy; }
        ++e.age;
        bool dying = e.age >= e.duration;
        if (dying && (e.flags & SystemLoop)) {
            e.age = 0; dying = false; e.spawned = 0;
            for (auto &v : e.systemLast) v = {0, 0};
        }
        if (dying) {
            liveParticles -= e.particles.size();
            e.particles.clear(); e.dead = true; return;
        }
        e.time = e.duration <= 1 ? 1 : e.age / (e.duration - 1);
        for (size_t i = 0; i < e.systemFields.size(); ++i) {
            const auto &f = e.systemFields[i];
            const double x = f.x.at(e.time, e.systemRandom[i][0]), y = f.y.at(e.time, e.systemRandom[i][1]);
            e.centerX += x - e.systemLast[i][0]; e.centerY += y - e.systemLast[i][1]; e.systemLast[i] = {x, y};
        }
        // Stable compaction keeps original particle order without allocating another vector every tick.
        size_t live = 0;
        for (size_t i = 0; i < e.particles.size(); ++i) if (update(e, e.particles[i])) {
            if (i != live) e.particles[live] = std::move(e.particles[i]);
            ++live;
        }
        liveParticles -= e.particles.size() - live;
        e.particles.resize(live);
        const double minimum = std::floor(e.tracks[MinActive].at(e.time, e.interpolation[6]));
        e.accumulator += e.tracks[Rate].at(e.time, e.interpolation[5]) * .01;
        double count = std::floor(e.accumulator); e.accumulator -= count;
        if (minimum >= 0) count = std::max(count, minimum - double(live));
        const double maximum = std::floor(e.tracks[MaxActive].at(e.time, e.interpolation[7]));
        if (maximum >= 0) count = std::min(count, maximum - double(live));
        const double launched = std::floor(e.tracks[MaxLaunched].at(e.time, e.interpolation[8]));
        if (launched >= 0) count = std::min(count, launched - e.spawned);
        const double room = double(std::min(MAX_PARTICLES - live, MAX_LIVE_PARTICLES - std::min(liveParticles, MAX_LIVE_PARTICLES)));
        const int spawnCount = static_cast<int>(std::clamp(count, 0.0, room));
        for (int i = 0; i < spawnCount; ++i) { e.particles.push_back(spawn(e, e.time, i, spawnCount)); ++e.spawned; }
        liveParticles += static_cast<size_t>(spawnCount);
    }
};
std::unordered_map<int32_t, std::unique_ptr<System>> systems;
int32_t nextHandle = 1;
System *get(int32_t handle) { const auto it = systems.find(handle); return it == systems.end() ? nullptr : it->second.get(); }
double rounded(double value) { return std::floor(value + .5); }
}

extern "C" {
int32_t pvz_particles_create(const double *definition, int32_t length, uint32_t seed) {
    if (length < 1) return 0;
    Reader r{definition, length};
    auto system = std::make_unique<System>();
    system->rng = seed == 0 ? 0x6d2b79f5 : seed;
    int count = r.integer(128);
    for (int i = 0; i < count && r.valid; ++i) {
        Emitter e;
        e.type = r.integer(4); e.flags = r.integer(63); e.frames = r.integer(4096);
        e.columns = r.integer(4096); e.rows = r.integer(4096); e.col = r.integer(4096); e.row = r.integer(4096);
        if (!e.frames || !e.columns || !e.rows || e.columns * e.rows > 4096) return 0;
        for (auto &track : e.tracks) track = r.track();
        e.fields = r.fields(); e.systemFields = r.fields();
        if (r.valid) { system->init(e); system->emitters.push_back(std::move(e)); }
    }
    if (!r.valid || r.offset != length || nextHandle == INT32_MAX) return 0;
    const int32_t handle = nextHandle++;
    systems.emplace(handle, std::move(system));
    return handle;
}
int32_t pvz_particles_step(int32_t handle, int32_t ticks, const double *motion, int32_t length) {
    auto *s = get(handle);
    if (!s || ticks < 0 || length < static_cast<int32_t>(s->emitters.size() * 2)) return -1;
    int stepped = 0;
    for (; stepped < ticks; ++stepped) {
        for (size_t i = 0; i < s->emitters.size(); ++i)
            s->step(s->emitters[i], stepped == 0 ? motion[i * 2] : 0, stepped == 0 ? motion[i * 2 + 1] : 0);
        if (std::all_of(s->emitters.begin(), s->emitters.end(), [](const Emitter &e) { return e.dead; })) { ++stepped; break; }
    }
    return stepped;
}
int32_t pvz_particles_info(int32_t handle, double *output, int32_t length) {
    auto *s = get(handle);
    if (!s || length < static_cast<int32_t>(s->emitters.size())) return -1;
    double idleTicks = INFINITY;
    bool live = false;
    for (size_t i = 0; i < s->emitters.size(); ++i) {
        const auto &e = s->emitters[i];
        output[i] = e.dead ? -1 : double(e.particles.size());
        if (e.dead) continue;
        live = true;
        if (e.particles.empty() && e.launchLimit >= 0 && e.spawned >= e.launchLimit)
            idleTicks = std::min(idleTicks, e.duration - e.age);
        else idleTicks = 0;
    }
    // After a constant launch cap is exhausted, an empty system can only expire.
    // The adapter may defer these ticks, preserving the original lifetime and replay age.
    if (length > static_cast<int32_t>(s->emitters.size()))
        output[s->emitters.size()] = live && std::isfinite(idleTicks) ? std::max(0.0, idleTicks) : 0;
    return static_cast<int32_t>(s->emitters.size());
}
int32_t pvz_particles_write(int32_t handle, int32_t emitter, const double *geometry, int32_t geometryLength,
                            const double *options, int32_t optionsLength, float *positions, int32_t positionCount,
                            float *vertices, int32_t vertexCount) {
    auto *s = get(handle);
    if (!s || emitter < 0 || emitter >= static_cast<int32_t>(s->emitters.size()) || optionsLength < PVZ_PARTICLE_OPTIONS) return -1;
    const auto &e = s->emitters[static_cast<size_t>(emitter)];
    const size_t stride = static_cast<size_t>(options[PVZ_PARTICLE_STRIDE]), capacity = static_cast<size_t>(options[PVZ_PARTICLE_CAPACITY]);
    const bool additive = options[PVZ_PARTICLE_ADDITIVE] != 0, extra = options[PVZ_PARTICLE_EXTRA] != 0;
    if (stride < 9 || capacity * 4 * stride > static_cast<size_t>(positionCount) || capacity * 4 * stride > static_cast<size_t>(vertexCount) ||
        e.particles.size() * (extra ? 2 : 1) > capacity) return -1;
    const double time = e.time, opacity = options[PVZ_PARTICLE_OPACITY];
    const double alpha = e.tracks[SysAlpha].at(time, e.interpolation[0]);
    const double red = e.tracks[SysRed].at(time, e.interpolation[1]), green = e.tracks[SysGreen].at(time, e.interpolation[2]);
    const double blue = e.tracks[SysBlue].at(time, e.interpolation[3]), brightness = e.tracks[SysBrightness].at(time, e.interpolation[4]);
    size_t quad = 0;
    for (const auto &p : e.particles) {
        if (p.frame < 0 || static_cast<int64_t>(p.frame + 1) * PVZ_IMAGE > geometryLength) return -1;
        const double *image = geometry + p.frame * PVZ_IMAGE;
        const double scale = e.tracks[Scale].at(p.lastTime, p.interpolation[7]) * options[PVZ_PARTICLE_SCALE];
        const double stretch = e.tracks[Stretch].at(p.lastTime, p.interpolation[8]);
        const double c = std::cos(p.spin), sn = std::sin(p.spin);
        const double light = brightness * e.tracks[Brightness].at(p.lastTime, p.interpolation[4]);
        const double r = rounded(options[PVZ_PARTICLE_RED] * red * e.tracks[Red].at(p.lastTime, p.interpolation[0]) * light) / 255;
        const double g = rounded(options[PVZ_PARTICLE_GREEN] * green * e.tracks[Green].at(p.lastTime, p.interpolation[1]) * light) / 255;
        const double b = rounded(options[PVZ_PARTICLE_BLUE] * blue * e.tracks[Blue].at(p.lastTime, p.interpolation[2]) * light) / 255;
        const double a = rounded(255 * alpha * e.tracks[Alpha].at(p.lastTime, p.interpolation[3]) * light) * opacity;
        // A negative alpha marks additive images for the shared material; the extra image follows its particle.
        pvz_write_quad(image, p.x, -p.y, c * scale, -sn * scale, sn * scale * stretch, c * scale * stretch, r, g, b,
                       additive ? -a : a, positions, vertices, quad++, stride);
        if (extra) pvz_write_quad(image, p.x, -p.y, c * scale, -sn * scale, sn * scale * stretch, c * scale * stretch, r, g, b,
                                  -a, positions, vertices, quad++, stride);
    }
    pvz_clear_quads(positions, vertices, quad, capacity, stride);
    return static_cast<int32_t>(quad);
}

void pvz_particles_destroy(int32_t handle) { systems.erase(handle); }
}
