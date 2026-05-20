#include "PvzNativeBridge.h"

#include "bindings/jswrapper/SeApi.h"
#include "bindings/manual/jsb_global.h"
#include "audio/include/AudioEngine.h"
#include "cocos/cocos.h"
#include "platform/FileUtils.h"

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <string>
#include <unordered_map>

#if CC_PLATFORM == CC_PLATFORM_WINDOWS || CC_PLATFORM == CC_PLATFORM_IOS || CC_PLATFORM == CC_PLATFORM_MACOS
#define PVZ_HAS_OPENAL_SFX 1
#else
#define PVZ_HAS_OPENAL_SFX 0
#endif

#if CC_PLATFORM == CC_PLATFORM_IOS || CC_PLATFORM == CC_PLATFORM_MACOS
#include <objc/message.h>
#include <objc/runtime.h>
#endif

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
#include <OpenalSoft/al.h>
#include <windows.h>
#endif

#if CC_PLATFORM == CC_PLATFORM_IOS || CC_PLATFORM == CC_PLATFORM_MACOS
#include <OpenAL/al.h>
#endif

#if CC_PLATFORM == CC_PLATFORM_ANDROID
#include "platform/java/jni/JniHelper.h"
#endif

namespace {

#if CC_PLATFORM == CC_PLATFORM_IOS || CC_PLATFORM == CC_PLATFORM_MACOS
using ObjcId = void*;

ObjcId objcSendId(ObjcId target, SEL selector) {
    return target ? reinterpret_cast<ObjcId (*)(ObjcId, SEL)>(objc_msgSend)(target, selector) : nullptr;
}

ObjcId objcSendId(ObjcId target, SEL selector, unsigned long index) {
    return target ? reinterpret_cast<ObjcId (*)(ObjcId, SEL, unsigned long)>(objc_msgSend)(target, selector, index) : nullptr;
}

unsigned long objcSendUnsignedLong(ObjcId target, SEL selector) {
    return target ? reinterpret_cast<unsigned long (*)(ObjcId, SEL)>(objc_msgSend)(target, selector) : 0;
}

bool objcSendBool(ObjcId target, SEL selector, ObjcId arg) {
    return target ? reinterpret_cast<bool (*)(ObjcId, SEL, ObjcId)>(objc_msgSend)(target, selector, arg) : false;
}

bool objcSendBoolSel(ObjcId target, SEL selector, SEL arg) {
    return target ? reinterpret_cast<bool (*)(ObjcId, SEL, SEL)>(objc_msgSend)(target, selector, arg) : false;
}

void objcSendVoid(ObjcId target, SEL selector) {
    if (target) reinterpret_cast<void (*)(ObjcId, SEL)>(objc_msgSend)(target, selector);
}

void objcSendVoidId(ObjcId target, SEL selector, ObjcId arg) {
    if (target) reinterpret_cast<void (*)(ObjcId, SEL, ObjcId)>(objc_msgSend)(target, selector, arg);
}
#endif

#if CC_PLATFORM == CC_PLATFORM_IOS
void hideKeyboardInputAssistant(ObjcId textInput) {
    if (!textInput || !objcSendBoolSel(textInput, sel_registerName("respondsToSelector:"), sel_registerName("inputAssistantItem"))) {
        return;
    }

    ObjcId inputAssistant = objcSendId(textInput, sel_registerName("inputAssistantItem"));
    ObjcId emptyArray = objcSendId(reinterpret_cast<ObjcId>(objc_getClass("NSArray")), sel_registerName("array"));
    objcSendVoidId(inputAssistant, sel_registerName("setLeadingBarButtonGroups:"), emptyArray);
    objcSendVoidId(inputAssistant, sel_registerName("setTrailingBarButtonGroups:"), emptyArray);
}

bool hideKeyboardAccessoryForView(ObjcId view) {
    if (!view) return false;

    bool changed = false;
    const auto isKindOfClassSelector = sel_registerName("isKindOfClass:");
    const auto textFieldClass = reinterpret_cast<ObjcId>(objc_getClass("UITextField"));
    const auto textViewClass = reinterpret_cast<ObjcId>(objc_getClass("UITextView"));
    const bool isTextInput =
        objcSendBool(view, isKindOfClassSelector, textFieldClass) ||
        objcSendBool(view, isKindOfClassSelector, textViewClass);

    const auto setAccessorySelector = sel_registerName("setInputAccessoryView:");
    if (isTextInput && objcSendBoolSel(view, sel_registerName("respondsToSelector:"), setAccessorySelector)) {
        objcSendVoidId(view, setAccessorySelector, nullptr);
        hideKeyboardInputAssistant(view);
        objcSendVoid(view, sel_registerName("reloadInputViews"));
        changed = true;
    }

    ObjcId subviews = objcSendId(view, sel_registerName("subviews"));
    const unsigned long count = objcSendUnsignedLong(subviews, sel_registerName("count"));
    for (unsigned long i = 0; i < count; i++) {
        changed = hideKeyboardAccessoryForView(objcSendId(subviews, sel_registerName("objectAtIndex:"), i)) || changed;
    }
    return changed;
}

bool hideIosKeyboardAccessory() {
    ObjcId applicationClass = reinterpret_cast<ObjcId>(objc_getClass("UIApplication"));
    ObjcId application = objcSendId(applicationClass, sel_registerName("sharedApplication"));
    ObjcId windows = objcSendId(application, sel_registerName("windows"));
    const unsigned long count = objcSendUnsignedLong(windows, sel_registerName("count"));

    bool changed = false;
    for (unsigned long i = 0; i < count; i++) {
        changed = hideKeyboardAccessoryForView(objcSendId(windows, sel_registerName("objectAtIndex:"), i)) || changed;
    }
    return changed;
}
#endif

#if CC_PLATFORM == CC_PLATFORM_MACOS
bool setMacCursor(const std::string& style) {
    const auto cursorClass = reinterpret_cast<ObjcId>(objc_getClass("NSCursor"));
    if (!cursorClass) return false;

    const char* selectorName = "arrowCursor";
    if (style == "pointer") {
        selectorName = "pointingHandCursor";
    } else if (style == "move") {
        selectorName = "closedHandCursor";
    } else if (style == "text") {
        selectorName = "IBeamCursor";
    }

    ObjcId cursor = objcSendId(cursorClass, sel_registerName(selectorName));
    if (!cursor) return false;
    objcSendVoid(cursor, sel_registerName("set"));
    return true;
}
#endif

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
bool g_isFullScreen = false;
HWND g_window = nullptr;
HCURSOR g_cursor = nullptr;
WNDPROC g_originalWndProc = nullptr;
WINDOWPLACEMENT g_windowPlacement = {sizeof(WINDOWPLACEMENT)};
LONG_PTR g_windowStyle = 0;
LONG_PTR g_windowExStyle = 0;
#endif

#if PVZ_HAS_OPENAL_SFX
int g_nextOpenAlSourceId = 1;

struct WavBuffer {
    ALuint buffer = 0;
};

struct MusicSource {
    ALuint source = 0;
};

std::unordered_map<std::string, WavBuffer> g_wavBuffers;
std::unordered_map<int, MusicSource> g_musicSources;
std::unordered_map<int, MusicSource> g_sfxSources;
#endif

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
LRESULT CALLBACK pvzWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    if (message == WM_SETCURSOR && LOWORD(lParam) == HTCLIENT && g_cursor) {
        SetCursor(g_cursor);
        return TRUE;
    }
    return g_originalWndProc
        ? CallWindowProc(g_originalWndProc, hwnd, message, wParam, lParam)
        : DefWindowProc(hwnd, message, wParam, lParam);
}

HWND getAppWindow() {
    if (g_window && IsWindow(g_window)) return g_window;

    HWND hwnd = GetActiveWindow();
    if (!hwnd) hwnd = GetForegroundWindow();
    if (!hwnd || !IsWindow(hwnd)) return nullptr;

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid != GetCurrentProcessId()) return nullptr;

    g_window = hwnd;
    return hwnd;
}

void installCursorWindowProc(HWND hwnd) {
    if (!hwnd || g_originalWndProc) return;
    const auto previous = SetWindowLongPtr(hwnd, GWLP_WNDPROC, reinterpret_cast<LONG_PTR>(pvzWindowProc));
    if (previous) {
        g_originalWndProc = reinterpret_cast<WNDPROC>(previous);
    }
}

void applyFixedWindowStyle() {
    HWND hwnd = getAppWindow();
    if (!hwnd || g_isFullScreen) return;

    const LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
    const LONG_PTR fixedStyle = style & ~(WS_THICKFRAME | WS_MAXIMIZEBOX);
    if (fixedStyle == style) return;

    SetWindowLongPtr(hwnd, GWL_STYLE, fixedStyle);
    SetWindowPos(
        hwnd,
        nullptr,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
}

bool setWindowsFullScreen(bool fullScreen) {
    HWND hwnd = getAppWindow();
    if (!hwnd) return false;
    if (g_isFullScreen == fullScreen) return true;

    if (fullScreen) {
        g_windowStyle = GetWindowLongPtr(hwnd, GWL_STYLE);
        g_windowExStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
        g_windowPlacement.length = sizeof(WINDOWPLACEMENT);
        if (!GetWindowPlacement(hwnd, &g_windowPlacement)) return false;

        HMONITOR monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        MONITORINFO monitorInfo = {sizeof(MONITORINFO)};
        if (!GetMonitorInfo(monitor, &monitorInfo)) return false;

        SetWindowLongPtr(hwnd, GWL_STYLE, g_windowStyle & ~WS_OVERLAPPEDWINDOW);
        SetWindowLongPtr(
            hwnd,
            GWL_EXSTYLE,
            g_windowExStyle & ~(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE));
        SetWindowPos(
            hwnd,
            HWND_TOP,
            monitorInfo.rcMonitor.left,
            monitorInfo.rcMonitor.top,
            monitorInfo.rcMonitor.right - monitorInfo.rcMonitor.left,
            monitorInfo.rcMonitor.bottom - monitorInfo.rcMonitor.top,
            SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
        ShowWindow(hwnd, SW_SHOW);
        g_isFullScreen = true;
        return true;
    }

    SetWindowLongPtr(hwnd, GWL_STYLE, g_windowStyle);
    SetWindowLongPtr(hwnd, GWL_EXSTYLE, g_windowExStyle);
    SetWindowPlacement(hwnd, &g_windowPlacement);
    SetWindowPos(
        hwnd,
        nullptr,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
    ShowWindow(hwnd, SW_SHOW);
    g_isFullScreen = false;
    applyFixedWindowStyle();
    return true;
}

bool setWindowsCursor(const std::string& style) {
    HWND hwnd = getAppWindow();
    if (!hwnd) return false;

    LPCWSTR cursorName = IDC_ARROW;
    if (style == "pointer") {
        cursorName = IDC_HAND;
    } else if (style == "move") {
        cursorName = IDC_SIZEALL;
    } else if (style == "text") {
        cursorName = IDC_IBEAM;
    }

    HCURSOR cursor = LoadCursorW(nullptr, cursorName);
    if (!cursor) return false;

    installCursorWindowProc(hwnd);
    g_cursor = cursor;
    SetClassLongPtr(hwnd, GCLP_HCURSOR, reinterpret_cast<LONG_PTR>(cursor));
    SetCursor(cursor);
    return true;
}
#endif

#if PVZ_HAS_OPENAL_SFX

uint16_t readU16(const uint8_t* data) {
    return static_cast<uint16_t>(data[0] | (data[1] << 8));
}

uint32_t readU32(const uint8_t* data) {
    return static_cast<uint32_t>(data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24));
}

bool loadWavBuffer(const std::string& url, WavBuffer* outBuffer) {
    auto cached = g_wavBuffers.find(url);
    if (cached != g_wavBuffers.end()) {
        *outBuffer = cached->second;
        return true;
    }

    const auto fullPath = cc::FileUtils::getInstance()->fullPathForFilename(url);
    cc::Data fileData = cc::FileUtils::getInstance()->getDataFromFile(fullPath);
    if (fileData.isNull() || fileData.getSize() < 44) return false;

    const auto* bytes = fileData.getBytes();
    const auto size = fileData.getSize();
    if (std::memcmp(bytes, "RIFF", 4) != 0 || std::memcmp(bytes + 8, "WAVE", 4) != 0) return false;

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

    if (audioFormat != 1 || bitsPerSample != 16 || sampleRate == 0 || pcm == nullptr || pcmBytes == 0) return false;
    ALenum format = 0;
    if (channels == 1) {
        format = AL_FORMAT_MONO16;
    } else if (channels == 2) {
        format = AL_FORMAT_STEREO16;
    } else {
        return false;
    }

    ALuint buffer = 0;
    alGenBuffers(1, &buffer);
    if (alGetError() != AL_NO_ERROR || buffer == 0) return false;

    alBufferData(buffer, format, pcm, static_cast<ALsizei>(pcmBytes), static_cast<ALsizei>(sampleRate));
    if (alGetError() != AL_NO_ERROR) {
        alDeleteBuffers(1, &buffer);
        return false;
    }

    WavBuffer loaded;
    loaded.buffer = buffer;
    g_wavBuffers[url] = loaded;
    *outBuffer = loaded;
    return true;
}

MusicSource* findMusicSource(int audioId) {
    auto it = g_musicSources.find(audioId);
    if (it == g_musicSources.end()) return nullptr;
    return &it->second;
}

void cleanupStoppedOpenAlSources(std::unordered_map<int, MusicSource>& sources) {
    for (auto it = sources.begin(); it != sources.end();) {
        ALint sourceState = AL_STOPPED;
        alGetSourcei(it->second.source, AL_SOURCE_STATE, &sourceState);
        if (sourceState == AL_STOPPED || sourceState == AL_INITIAL) {
            alSourceStop(it->second.source);
            alSourcei(it->second.source, AL_BUFFER, 0);
            alDeleteSources(1, &it->second.source);
            it = sources.erase(it);
        } else {
            ++it;
        }
    }
}

int playOpenAlSource(std::unordered_map<int, MusicSource>& sources, const std::string& url, bool loop, float volume, float pitch) {
    if (!cc::AudioEngine::lazyInit()) return -1;

    cleanupStoppedOpenAlSources(sources);

    WavBuffer wavBuffer;
    if (!loadWavBuffer(url, &wavBuffer)) return -1;

    ALuint source = 0;
    alGenSources(1, &source);
    if (alGetError() != AL_NO_ERROR || source == 0) return -1;

    alSourcei(source, AL_BUFFER, static_cast<ALint>(wavBuffer.buffer));
    alSourcei(source, AL_LOOPING, loop ? AL_TRUE : AL_FALSE);
    alSourcef(source, AL_GAIN, std::clamp(volume, 0.0F, 1.0F));
    alSourcef(source, AL_PITCH, std::clamp(pitch, 0.5F, 2.0F));
    alSourcePlay(source);
    if (alGetError() != AL_NO_ERROR) {
        alDeleteSources(1, &source);
        return -1;
    }

    const int audioId = g_nextOpenAlSourceId++;
    sources[audioId] = MusicSource{source};
    return audioId;
}

void stopOpenAlSource(std::unordered_map<int, MusicSource>& sources, int audioId) {
    auto it = sources.find(audioId);
    if (it == sources.end()) return;

    alSourceStop(it->second.source);
    alSourcei(it->second.source, AL_BUFFER, 0);
    alDeleteSources(1, &it->second.source);
    sources.erase(it);
}

int playMusicWavSource(const std::string& url, bool loop, float volume) {
    return playOpenAlSource(g_musicSources, url, loop, volume, 1.0F);
}

void stopMusicWavSource(int audioId) {
    stopOpenAlSource(g_musicSources, audioId);
}

int playOpenAlSfxPitch(const std::string& url, float volume, float pitch) {
    return playOpenAlSource(g_sfxSources, url, false, volume, pitch);
}
#endif

#if CC_PLATFORM == CC_PLATFORM_ANDROID
bool playAndroidSfxPitch(const std::string& url, float volume, float pitch) {
    const auto fullPath = cc::FileUtils::getInstance()->fullPathForFilename(url);
    return cc::JniHelper::callStaticBooleanMethod(
        "com/cocos/game/PvzSfxPlayer",
        "playSfxPitch",
        url,
        fullPath.empty() ? url : fullPath,
        std::clamp(volume, 0.0F, 1.0F),
        std::clamp(pitch, 0.5F, 2.0F));
}
#endif

bool setFullScreen(se::State& state) {
    const auto& args = state.args();
    if (args.size() != 1 || !args[0].isBoolean()) {
        state.rval().setBoolean(false);
        return true;
    }

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    state.rval().setBoolean(setWindowsFullScreen(args[0].toBoolean()));
#else
    state.rval().setBoolean(false);
#endif
    return true;
}
SE_BIND_FUNC(setFullScreen)

bool isFullScreen(se::State& state) {
#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    state.rval().setBoolean(g_isFullScreen);
#else
    state.rval().setBoolean(false);
#endif
    return true;
}
SE_BIND_FUNC(isFullScreen)

bool hideKeyboardAccessory(se::State& state) {
#if CC_PLATFORM == CC_PLATFORM_IOS
    state.rval().setBoolean(hideIosKeyboardAccessory());
#else
    state.rval().setBoolean(false);
#endif
    return true;
}
SE_BIND_FUNC(hideKeyboardAccessory)

bool setCursor(se::State& state) {
    const auto& args = state.args();
    if (args.size() != 1 || !args[0].isString()) {
        state.rval().setBoolean(false);
        return true;
    }

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    state.rval().setBoolean(setWindowsCursor(args[0].toString()));
#elif CC_PLATFORM == CC_PLATFORM_MACOS
    state.rval().setBoolean(setMacCursor(args[0].toString()));
#else
    state.rval().setBoolean(false);
#endif
    return true;
}
SE_BIND_FUNC(setCursor)

bool playSfxPitch(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 3 || !args[0].isString() || !args[1].isNumber() || !args[2].isNumber()) {
        state.rval().setBoolean(false);
        return true;
    }

#if PVZ_HAS_OPENAL_SFX
    state.rval().setBoolean(playOpenAlSfxPitch(args[0].toString(), args[1].toFloat(), args[2].toFloat()) >= 0);
#elif CC_PLATFORM == CC_PLATFORM_ANDROID
    state.rval().setBoolean(playAndroidSfxPitch(args[0].toString(), args[1].toFloat(), args[2].toFloat()));
#else
    state.rval().setBoolean(false);
#endif
    return true;
}
SE_BIND_FUNC(playSfxPitch)

bool playSfxWav(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 3 || !args[0].isString() || !args[1].isNumber() || !args[2].isNumber()) {
        state.rval().setNumber(-1);
        return true;
    }

#if PVZ_HAS_OPENAL_SFX
    state.rval().setNumber(playOpenAlSfxPitch(args[0].toString(), args[1].toFloat(), args[2].toFloat()));
#else
    state.rval().setNumber(-1);
#endif
    return true;
}
SE_BIND_FUNC(playSfxWav)

bool stopSfxWav(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 1 || !args[0].isNumber()) return true;

#if PVZ_HAS_OPENAL_SFX
    stopOpenAlSource(g_sfxSources, args[0].toInt32());
#endif
    return true;
}
SE_BIND_FUNC(stopSfxWav)

bool playMusicWav(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 3 || !args[0].isString() || !args[1].isBoolean() || !args[2].isNumber()) {
        state.rval().setNumber(-1);
        return true;
    }

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    state.rval().setNumber(playMusicWavSource(args[0].toString(), args[1].toBoolean(), args[2].toFloat()));
#else
    state.rval().setNumber(-1);
#endif
    return true;
}
SE_BIND_FUNC(playMusicWav)

bool stopMusicWav(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 1 || !args[0].isNumber()) return true;

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    stopMusicWavSource(args[0].toInt32());
#endif
    return true;
}
SE_BIND_FUNC(stopMusicWav)

bool pauseMusicWav(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 1 || !args[0].isNumber()) return true;

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    if (auto* source = findMusicSource(args[0].toInt32())) alSourcePause(source->source);
#endif
    return true;
}
SE_BIND_FUNC(pauseMusicWav)

bool resumeMusicWav(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 1 || !args[0].isNumber()) return true;

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    if (auto* source = findMusicSource(args[0].toInt32())) alSourcePlay(source->source);
#endif
    return true;
}
SE_BIND_FUNC(resumeMusicWav)

bool setMusicWavVolume(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 2 || !args[0].isNumber() || !args[1].isNumber()) return true;

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    if (auto* source = findMusicSource(args[0].toInt32())) {
        alSourcef(source->source, AL_GAIN, std::clamp(args[1].toFloat(), 0.0F, 1.0F));
    }
#endif
    return true;
}
SE_BIND_FUNC(setMusicWavVolume)

bool setMusicWavCurrentTime(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 2 || !args[0].isNumber() || !args[1].isNumber()) {
        state.rval().setBoolean(false);
        return true;
    }

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    if (auto* source = findMusicSource(args[0].toInt32())) {
        alSourcef(source->source, AL_SEC_OFFSET, std::max(0.0F, args[1].toFloat()));
        state.rval().setBoolean(alGetError() == AL_NO_ERROR);
        return true;
    }
#endif
    state.rval().setBoolean(false);
    return true;
}
SE_BIND_FUNC(setMusicWavCurrentTime)

bool getMusicWavCurrentTime(se::State& state) {
    const auto& args = state.args();
    if (args.size() < 1 || !args[0].isNumber()) {
        state.rval().setNumber(0);
        return true;
    }

#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    if (auto* source = findMusicSource(args[0].toInt32())) {
        ALfloat time = 0.0F;
        alGetSourcef(source->source, AL_SEC_OFFSET, &time);
        state.rval().setNumber(time);
        return true;
    }
#endif
    state.rval().setNumber(0);
    return true;
}
SE_BIND_FUNC(getMusicWavCurrentTime)

bool registerPvzNativeBindings(se::Object* global) {
    se::Value jsbValue;
    if (!global->getProperty("jsb", &jsbValue) || !jsbValue.isObject()) {
        se::HandleObject jsbObject(se::Object::createPlainObject());
        jsbValue.setObject(jsbObject);
        global->setProperty("jsb", jsbValue);
    }

    se::HandleObject bridge(se::Object::createPlainObject());
    bridge->defineFunction("setFullScreen", _SE(setFullScreen));
    bridge->defineFunction("isFullScreen", _SE(isFullScreen));
    bridge->defineFunction("hideKeyboardAccessory", _SE(hideKeyboardAccessory));
    bridge->defineFunction("setCursor", _SE(setCursor));
    bridge->defineFunction("playSfxPitch", _SE(playSfxPitch));
#if PVZ_HAS_OPENAL_SFX
    bridge->defineFunction("playSfxWav", _SE(playSfxWav));
    bridge->defineFunction("stopSfxWav", _SE(stopSfxWav));
#endif
#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    bridge->defineFunction("playMusicWav", _SE(playMusicWav));
    bridge->defineFunction("stopMusicWav", _SE(stopMusicWav));
    bridge->defineFunction("pauseMusicWav", _SE(pauseMusicWav));
    bridge->defineFunction("resumeMusicWav", _SE(resumeMusicWav));
    bridge->defineFunction("setMusicWavVolume", _SE(setMusicWavVolume));
    bridge->defineFunction("setMusicWavCurrentTime", _SE(setMusicWavCurrentTime));
    bridge->defineFunction("getMusicWavCurrentTime", _SE(getMusicWavCurrentTime));
#endif
    se::Value bridgeValue;
    bridgeValue.setObject(bridge);
    jsbValue.toObject()->setProperty("PvzNative", bridgeValue);
    return true;
}

} // namespace

void ApplyPvzWindowStyle() {
#if CC_PLATFORM == CC_PLATFORM_WINDOWS
    applyFixedWindowStyle();
#endif
}

void RegisterPvzNativeBindings() {
    se::ScriptEngine::getInstance()->addRegisterCallback(registerPvzNativeBindings);
}
