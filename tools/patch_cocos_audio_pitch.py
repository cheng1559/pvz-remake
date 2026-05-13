from __future__ import annotations

import argparse
from pathlib import Path


DEFAULT_ENGINE = Path("C:/ProgramData/cocos/editors/Creator/3.8.8/resources/resources/3d/engine/native")


def patch_file(path: Path, replacements: list[tuple[str, str]]) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in replacements:
        if new in text:
            continue
        if old not in text:
            raise RuntimeError(f"pattern not found in {path}: {old[:80]!r}")
        text = text.replace(old, new, 1)

    if text == original:
        return False

    path.write_text(text, encoding="utf-8", newline="")
    return True


def patch_file_any(path: Path, replacements: list[tuple[str, str]]) -> bool:
    text = path.read_text(encoding="utf-8")
    for old, new in replacements:
        if new in text:
            return False
        if old in text:
            path.write_text(text.replace(old, new, 1), encoding="utf-8", newline="")
            return True
    raise RuntimeError(f"none of the patterns matched in {path}")


def patch_audio_engine_header(engine: Path) -> bool:
    return patch_file(
        engine / "cocos/audio/include/AudioEngine.h",
        [
            (
                "    static void setVolume(int audioID, float volume);\n\n"
                "    /**\n"
                "     * sets volume factor for all audio instance\n",
                "    static void setVolume(int audioID, float volume);\n\n"
                "    /**\n"
                "     * Sets playback pitch for an audio instance. 1.0 is normal speed.\n"
                "     *\n"
                "     * @param audioID An audioID returned by the play2d function.\n"
                "     * @param pitch Pitch multiplier. Values <= 0 are clamped to 1.0.\n"
                "     */\n"
                "    static bool setPitch(int audioID, float pitch);\n\n"
                "    /**\n"
                "     * sets volume factor for all audio instance\n",
            )
        ],
    )


def patch_audio_engine_cpp(engine: Path) -> bool:
    return patch_file(
        engine / "cocos/audio/AudioEngine.cpp",
        [
            (
                "void AudioEngine::setVolume(int audioID, float volume) {\n"
                "    auto it = sAudioIDInfoMap.find(audioID);\n"
                "    if (it != sAudioIDInfoMap.end()) {\n"
                "        if (volume < 0.0F) {\n"
                "            volume = 0.0F;\n"
                "        } else if (volume > 1.0F) {\n"
                "            volume = 1.0F;\n"
                "        }\n\n"
                "        if (it->second.volume != volume) {\n"
                "            sAudioEngineImpl->setVolume(audioID, volume * sVolumeFactor);\n"
                "            it->second.volume = volume;\n"
                "        }\n"
                "    }\n"
                "}\n\n"
                "void AudioEngine::setVolumeFactor(float factor) {\n",
                "void AudioEngine::setVolume(int audioID, float volume) {\n"
                "    auto it = sAudioIDInfoMap.find(audioID);\n"
                "    if (it != sAudioIDInfoMap.end()) {\n"
                "        if (volume < 0.0F) {\n"
                "            volume = 0.0F;\n"
                "        } else if (volume > 1.0F) {\n"
                "            volume = 1.0F;\n"
                "        }\n\n"
                "        if (it->second.volume != volume) {\n"
                "            sAudioEngineImpl->setVolume(audioID, volume * sVolumeFactor);\n"
                "            it->second.volume = volume;\n"
                "        }\n"
                "    }\n"
                "}\n\n"
                "bool AudioEngine::setPitch(int audioID, float pitch) {\n"
                "    auto it = sAudioIDInfoMap.find(audioID);\n"
                "    if (it == sAudioIDInfoMap.end()) {\n"
                "        return false;\n"
                "    }\n"
                "    if (pitch <= 0.0F) {\n"
                "        pitch = 1.0F;\n"
                "    }\n"
                "    return sAudioEngineImpl->setPitch(audioID, pitch);\n"
                "}\n\n"
                "void AudioEngine::setVolumeFactor(float factor) {\n",
            )
        ],
    )


def patch_openal_player(engine: Path, platform: str, cpp_name: str, header_name: str) -> bool:
    root = engine / f"cocos/audio/{platform}"
    changed = False
    changed |= patch_file(
        root / header_name,
        [
            (
                "    float _volume;\n"
                "    bool _loop;\n",
                "    float _volume;\n"
                "    float _pitch;\n"
                "    bool _loop;\n",
            )
        ],
    )
    changed |= patch_file_any(
        root / cpp_name,
        [
            (
                "alSourcef(_alSource, AL_PITCH, 1.0f);",
                "alSourcef(_alSource, AL_PITCH, _pitch);",
            ),
            (
                "alSourcef(_alSource, AL_PITCH, 1.0F);",
                "alSourcef(_alSource, AL_PITCH, _pitch);",
            )
        ],
    )
    changed |= patch_file_any(
        root / cpp_name,
        [
            (
                "_audioCache(nullptr), _finishCallbak(nullptr), _isDestroyed(false), _removeByAudioEngine(false), _ready(false)",
                "_audioCache(nullptr), _finishCallbak(nullptr), _isDestroyed(false), _removeByAudioEngine(false), _ready(false), _pitch(1.0f)",
            ),
            (
                "_finishCallbak(nullptr),\n  _isDestroyed(false),\n  _removeByAudioEngine(false),\n  _ready(false),",
                "_finishCallbak(nullptr),\n  _isDestroyed(false),\n  _removeByAudioEngine(false),\n  _ready(false),\n  _pitch(1.0F),",
            ),
        ],
    )
    return changed


def patch_openal_engine(engine: Path, platform: str, impl_header: str, impl_cpp: str, error_name: str) -> bool:
    root = engine / f"cocos/audio/{platform}"
    changed = False
    changed |= patch_file(
        root / impl_header,
        [
            (
                "    void setVolume(int audioID, float volume);\n"
                "    void setLoop(int audioID, bool loop);\n",
                "    void setVolume(int audioID, float volume);\n"
                "    bool setPitch(int audioID, float pitch);\n"
                "    void setLoop(int audioID, bool loop);\n",
            )
        ],
    )
    changed |= patch_file(
        root / impl_cpp,
        [
            (
                "void AudioEngineImpl::setLoop(int audioID, bool loop) {\n",
                "bool AudioEngineImpl::setPitch(int audioID, float pitch) {\n"
                "    if (!checkAudioIdValid(audioID)) {\n"
                "        return false;\n"
                "    }\n"
                "    auto player = _audioPlayers[audioID];\n"
                "    player->_pitch = pitch;\n\n"
                "    if (player->_ready) {\n"
                "        alSourcef(player->_alSource, AL_PITCH, pitch);\n"
                "        auto error = alGetError();\n"
                "        if (error != AL_NO_ERROR) {\n"
                f"            ALOGE(\"%s: audio id = %d, error = %x\", {error_name}, audioID, error);\n"
                "            return false;\n"
                "        }\n"
                "    }\n"
                "    return true;\n"
                "}\n\n"
                "void AudioEngineImpl::setLoop(int audioID, bool loop) {\n",
            )
        ],
    )
    return changed


def patch_android_noop(engine: Path) -> bool:
    root = engine / "cocos/audio/android"
    changed = False
    changed |= patch_file(
        root / "AudioEngine-inl.h",
        [
            (
                "    void setVolume(int audioID, float volume);\n"
                "    void setLoop(int audioID, bool loop);\n",
                "    void setVolume(int audioID, float volume);\n"
                "    bool setPitch(int audioID, float pitch);\n"
                "    void setLoop(int audioID, bool loop);\n",
            )
        ],
    )
    changed |= patch_file(
        root / "AudioEngine-inl.cpp",
        [
            (
                "void AudioEngineImpl::pause(int audioID) {\n",
                "bool AudioEngineImpl::setPitch(int audioID, float pitch) {\n"
                "    (void)audioID;\n"
                "    (void)pitch;\n"
                "    return false;\n"
                "}\n\n"
                "void AudioEngineImpl::pause(int audioID) {\n",
            )
        ],
    )
    return changed


def patch_manual_binding(engine: Path) -> bool:
    return patch_file(
        engine / "cocos/bindings/manual/jsb_audio_manual.cpp",
        [
            (
                "SE_BIND_FUNC(js_audio_AudioEngine_getOriginalPCMBuffer)\n\n"
                "bool register_all_audio_manual(se::Object* obj) // NOLINT\n",
                "SE_BIND_FUNC(js_audio_AudioEngine_getOriginalPCMBuffer)\n\n"
                "static bool js_audio_AudioEngine_setPitch(se::State& s) // NOLINT\n"
                "{\n"
                "    const auto& args = s.args();\n"
                "    size_t argc = args.size();\n"
                "    CC_UNUSED bool ok = true;\n"
                "    if (argc == 2) {\n"
                "        int arg0{0};\n"
                "        float arg1{1.0F};\n"
                "        ok &= sevalue_to_native(args[0], &arg0, nullptr);\n"
                "        ok &= sevalue_to_native(args[1], &arg1, nullptr);\n"
                "        SE_PRECONDITION2(ok, false, \"Error processing arguments\");\n"
                "        s.rval().setBoolean(cc::AudioEngine::setPitch(arg0, arg1));\n"
                "        return true;\n"
                "    }\n"
                "    SE_REPORT_ERROR(\"wrong number of arguments: %d, was expecting %d\", (int)argc, 2);\n"
                "    return false;\n"
                "}\n"
                "SE_BIND_FUNC(js_audio_AudioEngine_setPitch)\n\n"
                "bool register_all_audio_manual(se::Object* obj) // NOLINT\n",
            ),
            (
                "    audioEngineVal.toObject()->defineFunction(\"getOriginalPCMBuffer\", _SE(js_audio_AudioEngine_getOriginalPCMBuffer));\n"
                "    return true;\n",
                "    audioEngineVal.toObject()->defineFunction(\"getOriginalPCMBuffer\", _SE(js_audio_AudioEngine_getOriginalPCMBuffer));\n"
                "    audioEngineVal.toObject()->defineFunction(\"setPitch\", _SE(js_audio_AudioEngine_setPitch));\n"
                "    return true;\n",
            ),
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", type=Path, default=DEFAULT_ENGINE)
    args = parser.parse_args()

    engine = args.engine
    if not (engine / "cocos/audio/AudioEngine.cpp").exists():
        raise SystemExit(f"engine native path not found: {engine}")

    changes = {
        "AudioEngine.h": patch_audio_engine_header(engine),
        "AudioEngine.cpp": patch_audio_engine_cpp(engine),
        "oalsoft AudioPlayer": patch_openal_player(engine, "oalsoft", "AudioPlayer.cpp", "AudioPlayer.h"),
        "oalsoft AudioEngine": patch_openal_engine(engine, "oalsoft", "AudioEngine-soft.h", "AudioEngine-soft.cpp", "__FUNCTION__"),
        "apple AudioPlayer": patch_openal_player(engine, "apple", "AudioPlayer.mm", "AudioPlayer.h"),
        "apple AudioEngine": patch_openal_engine(engine, "apple", "AudioEngine-inl.h", "AudioEngine-inl.mm", "__PRETTY_FUNCTION__"),
        "android AudioEngine": patch_android_noop(engine),
        "jsb audio manual": patch_manual_binding(engine),
    }

    for name, changed in changes.items():
        print(f"{name}: {'patched' if changed else 'already patched'}")


if __name__ == "__main__":
    main()
