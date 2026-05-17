package com.cocos.game;

import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.SoundPool;

import com.cocos.lib.GlobalObject;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

public final class PvzSfxPlayer {
    private static final int MAX_STREAMS = 16;
    private static final SoundPool sSoundPool = new SoundPool.Builder()
            .setMaxStreams(MAX_STREAMS)
            .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
            .build();

    private static final Map<String, Integer> sSoundIds = new HashMap<>();
    private static final Map<Integer, PendingPlay> sPendingPlays = new HashMap<>();

    static {
        sSoundPool.setOnLoadCompleteListener((soundPool, sampleId, status) -> {
            PendingPlay pending;
            synchronized (PvzSfxPlayer.class) {
                pending = sPendingPlays.remove(sampleId);
            }
            if (status == 0 && pending != null) {
                soundPool.play(sampleId, pending.volume, pending.volume, 1, 0, pending.rate);
            }
        });
    }

    private PvzSfxPlayer() {
    }

    public static synchronized boolean playSfxPitch(String url, String fullPath, float volume, float rate) {
        String key = fullPath != null && !fullPath.isEmpty() ? fullPath : url;
        if (key == null || key.isEmpty()) return false;

        Integer loadedSoundId = sSoundIds.get(key);
        if (loadedSoundId != null) {
            sSoundPool.play(loadedSoundId, volume, volume, 1, 0, clampRate(rate));
            return true;
        }

        int soundId = loadSound(url, fullPath);
        if (soundId == 0) return false;

        sSoundIds.put(key, soundId);
        sPendingPlays.put(soundId, new PendingPlay(volume, clampRate(rate)));
        return true;
    }

    private static int loadSound(String url, String fullPath) {
        int soundId = loadFilePath(fullPath);
        if (soundId != 0) return soundId;

        soundId = loadFilePath(url);
        if (soundId != 0) return soundId;

        return loadAssetPath(url);
    }

    private static int loadFilePath(String path) {
        if (path == null || path.isEmpty()) return 0;

        String normalized = path.startsWith("file://") ? path.substring("file://".length()) : path;
        File file = new File(normalized);
        if (!file.exists()) return 0;

        return sSoundPool.load(file.getAbsolutePath(), 1);
    }

    private static int loadAssetPath(String path) {
        if (path == null || path.isEmpty() || GlobalObject.getContext() == null) return 0;

        String normalized = path.startsWith("/") ? path.substring(1) : path;
        String[] candidates = {
                normalized,
                stripPrefix(normalized, "assets/"),
                stripPrefix(normalized, "src/"),
                stripPrefix(normalized, "res/")
        };

        for (String candidate : candidates) {
            if (candidate == null || candidate.isEmpty()) continue;
            try {
                AssetFileDescriptor descriptor = GlobalObject.getContext().getAssets().openFd(candidate);
                int soundId = sSoundPool.load(descriptor, 1);
                descriptor.close();
                if (soundId != 0) return soundId;
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    private static String stripPrefix(String value, String prefix) {
        return value.startsWith(prefix) ? value.substring(prefix.length()) : value;
    }

    private static float clampRate(float rate) {
        if (!Float.isFinite(rate)) return 1.0f;
        return Math.max(0.5f, Math.min(2.0f, rate));
    }

    private static final class PendingPlay {
        final float volume;
        final float rate;

        PendingPlay(float volume, float rate) {
            this.volume = volume;
            this.rate = rate;
        }
    }
}
