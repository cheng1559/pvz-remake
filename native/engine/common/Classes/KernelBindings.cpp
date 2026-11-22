// Exposes the shared drawing kernel (native/engine/common/kernel) to JavaScript. Typed arrays are passed without copying.
#include "bindings/jswrapper/SeApi.h"
#include "bindings/manual/jsb_conversions.h"
#include "core/data/JSBNativeDataHolder.h"
#include "../kernel/pvz_kernel.h"
#include "../kernel/pvz_particles.h"
#include "../kernel/pvz_png.h"

#include <cstdint>

namespace {
template <typename T>
bool typedArray(const se::Value &value, se::Object::TypedArrayType type, T *&data, int32_t &count) {
    if (!value.isObject()) return false;
    se::Object *object = value.toObject();
    if (!object->isTypedArray() || object->getTypedArrayType() != type) return false;
    uint8_t *bytes = nullptr;
    size_t length = 0;
    if (!object->getTypedArrayData(&bytes, &length)) return false;
    data = reinterpret_cast<T *>(bytes);
    count = static_cast<int32_t>(length / sizeof(T));
    return true;
}

using Type = se::Object::TypedArrayType;

// (keys, first keyframe, count, time, pose) -> keyframe index or -1
bool sampleBinding(se::State &s) {
    const auto &args = s.args();
    const double *keys = nullptr;
    double *pose = nullptr;
    int32_t keyCount = 0, poseCount = 0;
    if (args.size() != 5 || !typedArray(args[0], Type::FLOAT64, keys, keyCount) || !typedArray(args[4], Type::FLOAT64, pose, poseCount) ||
        !args[1].isNumber() || !args[2].isNumber() || !args[3].isNumber() || poseCount < 7) {
        s.rval().setInt32(-1);
        return true;
    }
    const int32_t first = args[1].toInt32(), count = args[2].toInt32();
    if (first < 0 || count < 0 || static_cast<int64_t>(first + count) * PVZ_KEY > keyCount) {
        s.rval().setInt32(-1);
        return true;
    }
    s.rval().setInt32(pvz_sample(keys + static_cast<size_t>(first) * PVZ_KEY, count, args[3].toDouble(), pose));
    return true;
}
SE_BIND_FUNC(sampleBinding)

// (from, ratio, pose): blends pose in place
bool blendBinding(se::State &s) {
    const auto &args = s.args();
    const double *from = nullptr;
    double *pose = nullptr;
    int32_t fromCount = 0, poseCount = 0;
    if (args.size() == 3 && typedArray(args[0], Type::FLOAT64, from, fromCount) && args[1].isNumber() &&
        typedArray(args[2], Type::FLOAT64, pose, poseCount) && fromCount >= 7 && poseCount >= 7) {
        pvz_blend(from, args[1].toDouble(), pose);
    }
    return true;
}
SE_BIND_FUNC(blendBinding)

// A typed array of the kind `matches` says it is, read straight from V8.
template <typename T>
bool rawArray(v8::Local<v8::Value> value, bool matches, T *&data, int32_t &count) {
    if (!matches) return false;
    const v8::Local<v8::TypedArray> array = value.As<v8::TypedArray>();
    data = reinterpret_cast<T *>(static_cast<uint8_t *>(array->Buffer()->Data()) + array->ByteOffset());
    count = static_cast<int32_t>(array->Length());
    return true;
}

// (keys, tracks, state, positions, vertices) -> quads drawn or -1
// Called for every batch of every animation every frame. The engine's wrapper makes an object and a handle for each
// array of a call, which for these five took longer than the drawing itself: this one is called by V8 directly.
void writeReanimBindingRegistry(const v8::FunctionCallbackInfo<v8::Value> &args) {
    const double *keys = nullptr, *state = nullptr;
    const int32_t *tracks = nullptr;
    float *positions = nullptr, *vertices = nullptr;
    int32_t keyCount = 0, trackCount = 0, stateCount = 0, positionCount = 0, vertexCount = 0;
    if (args.Length() != 5 || !rawArray(args[0], args[0]->IsFloat64Array(), keys, keyCount) ||
        !rawArray(args[1], args[1]->IsInt32Array(), tracks, trackCount) || !rawArray(args[2], args[2]->IsFloat64Array(), state, stateCount) ||
        !rawArray(args[3], args[3]->IsFloat32Array(), positions, positionCount) ||
        !rawArray(args[4], args[4]->IsFloat32Array(), vertices, vertexCount)) {
        args.GetReturnValue().Set(-1);
        return;
    }
    args.GetReturnValue().Set(pvz_write_reanim(keys, keyCount, tracks, trackCount, state, stateCount, positions, positionCount, vertices, vertexCount));
}

bool particlesCreateBinding(se::State &s) {
    const auto &a = s.args();
    const double *data = nullptr; int32_t length = 0;
    s.rval().setInt32(a.size() == 2 && typedArray(a[0], Type::FLOAT64, data, length) && a[1].isNumber()
        ? pvz_particles_create(data, length, a[1].toUint32()) : 0);
    return true;
}
SE_BIND_FUNC(particlesCreateBinding)

bool particlesStepBinding(se::State &s) {
    const auto &a = s.args();
    const double *motion = nullptr; int32_t length = 0;
    s.rval().setInt32(a.size() == 3 && a[0].isNumber() && a[1].isNumber() && typedArray(a[2], Type::FLOAT64, motion, length)
        ? pvz_particles_step(a[0].toInt32(), a[1].toInt32(), motion, length) : -1);
    return true;
}
SE_BIND_FUNC(particlesStepBinding)

bool particlesInfoBinding(se::State &s) {
    const auto &a = s.args();
    double *output = nullptr; int32_t length = 0;
    s.rval().setInt32(a.size() == 2 && a[0].isNumber() && typedArray(a[1], Type::FLOAT64, output, length)
        ? pvz_particles_info(a[0].toInt32(), output, length) : -1);
    return true;
}
SE_BIND_FUNC(particlesInfoBinding)

// (handle, emitter, geometry, options, positions, vertices) -> quads written or -1
bool particlesWriteBinding(se::State &s) {
    const auto &a = s.args();
    const double *geometry = nullptr, *options = nullptr;
    float *positions = nullptr, *vertices = nullptr;
    int32_t geometryLength = 0, optionsLength = 0, positionCount = 0, vertexCount = 0;
    s.rval().setInt32(a.size() == 6 && a[0].isNumber() && a[1].isNumber() &&
        typedArray(a[2], Type::FLOAT64, geometry, geometryLength) && typedArray(a[3], Type::FLOAT64, options, optionsLength) &&
        typedArray(a[4], Type::FLOAT32, positions, positionCount) && typedArray(a[5], Type::FLOAT32, vertices, vertexCount)
        ? pvz_particles_write(a[0].toInt32(), a[1].toInt32(), geometry, geometryLength, options, optionsLength,
                              positions, positionCount, vertices, vertexCount) : -1);
    return true;
}
SE_BIND_FUNC(particlesWriteBinding)

bool particlesStopBinding(se::State &s) {
    const auto &a = s.args();
    if (a.size() == 1 && a[0].isNumber()) pvz_particles_stop(a[0].toInt32());
    return true;
}
SE_BIND_FUNC(particlesStopBinding)

bool particlesDestroyBinding(se::State &s) {
    const auto &a = s.args();
    if (a.size() == 1 && a[0].isNumber()) pvz_particles_destroy(a[0].toInt32());
    return true;
}
SE_BIND_FUNC(particlesDestroyBinding)

// (png, output) -> PvzPngResult
bool decodePngBinding(se::State &s) {
    const auto &a = s.args();
    const uint8_t *png = nullptr;
    uint8_t *output = nullptr;
    int32_t length = 0, outputLength = 0;
    s.rval().setInt32(a.size() == 2 && typedArray(a[0], Type::UINT8, png, length) && typedArray(a[1], Type::UINT8, output, outputLength)
        ? pvz_png_decode_premultiplied(png, length, output, outputLength) : PVZ_PNG_UNSUPPORTED);
    return true;
}
SE_BIND_FUNC(decodePngBinding)

// (pixels, width, height): RGBA8 in a Uint8Array, or the decoded data of an image, which JavaScript holds unread
bool sandAlphaEdgesBinding(se::State &s) {
    const auto &a = s.args();
    if (a.size() != 3 || !a[0].isObject() || !a[1].isNumber() || !a[2].isNumber()) return true;
    const int32_t width = a[1].toInt32(), height = a[2].toInt32();
    se::Object *object = a[0].toObject();
    uint8_t *rgba = nullptr;
    int32_t length = 0;
    if (typedArray(a[0], Type::UINT8, rgba, length)) {
        if (width <= 0 || height <= 0 || int64_t(width) * height * 4 > length) return true;
    } else if (object->_getClass() == __jsb_cc_JSBNativeDataHolder_class && object->getPrivateData()) {
        // The engine's loader makes every image it decodes RGBA8, whatever its file holds.
        rgba = static_cast<cc::JSBNativeDataHolder *>(object->getPrivateData())->getData();
    }
    pvz_sand_alpha_edges(rgba, width, height);
    return true;
}
SE_BIND_FUNC(sandAlphaEdgesBinding)
} // namespace

bool registerPvzKernel(se::Object *global) {
    return global->defineFunction("__pvzParticlesCreate", _SE(particlesCreateBinding)) &&
           global->defineFunction("__pvzParticlesStep", _SE(particlesStepBinding)) &&
           global->defineFunction("__pvzParticlesInfo", _SE(particlesInfoBinding)) &&
           global->defineFunction("__pvzParticlesWrite", _SE(particlesWriteBinding)) &&
           global->defineFunction("__pvzParticlesStop", _SE(particlesStopBinding)) &&
           global->defineFunction("__pvzParticlesDestroy", _SE(particlesDestroyBinding)) &&
           global->defineFunction("__pvzKernelSample", _SE(sampleBinding)) &&
           global->defineFunction("__pvzKernelBlend", _SE(blendBinding)) &&
           global->defineFunction("__pvzKernelWriteReanim", _SE(writeReanimBinding)) &&
           global->defineFunction("__pvzKernelDecodePng", _SE(decodePngBinding)) &&
           global->defineFunction("__pvzKernelSandAlphaEdges", _SE(sandAlphaEdgesBinding));
}
