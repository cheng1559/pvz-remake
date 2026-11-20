package com.cocos.game;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

import com.cocos.lib.GlobalObject;

/** Android side of assets/scripts/platform/Haptics.ts; styles follow native/engine/ios/ViewController.mm. */
public class Haptics {
    // The iOS explosion is a 0.28s rumble fading from full intensity to zero.
    private static final int EXPLOSION_STEPS = 14;
    private static final long EXPLOSION_STEP_MS = 20;
    private static Vibrator sVibrator;

    // Called from the game thread through native.reflection.
    @SuppressWarnings("deprecation")
    public static void play(String style) {
        Vibrator vibrator = vibrator();
        if (vibrator == null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            vibrator.vibrate(duration(style));
            return;
        }
        vibrator.vibrate(effect(vibrator, style));
    }

    private static Vibrator vibrator() {
        if (sVibrator == null) {
            Context context = GlobalObject.getContext();
            if (context != null) sVibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
        return sVibrator != null && sVibrator.hasVibrator() ? sVibrator : null;
    }

    private static VibrationEffect effect(Vibrator vibrator, String style) {
        if ("explosion".equals(style)) {
            if (!vibrator.hasAmplitudeControl()) return VibrationEffect.createOneShot(duration(style), VibrationEffect.DEFAULT_AMPLITUDE);
            long[] timings = new long[EXPLOSION_STEPS];
            int[] amplitudes = new int[EXPLOSION_STEPS];
            for (int i = 0; i < EXPLOSION_STEPS; i++) {
                timings[i] = EXPLOSION_STEP_MS;
                amplitudes[i] = Math.max(1, Math.round(255f * (EXPLOSION_STEPS - i) / EXPLOSION_STEPS));
            }
            return VibrationEffect.createWaveform(timings, amplitudes, -1);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int id = "heavy".equals(style) ? VibrationEffect.EFFECT_HEAVY_CLICK
                : "medium".equals(style) ? VibrationEffect.EFFECT_CLICK : VibrationEffect.EFFECT_TICK;
            return VibrationEffect.createPredefined(id);
        }
        int amplitude = !vibrator.hasAmplitudeControl() ? VibrationEffect.DEFAULT_AMPLITUDE
            : "heavy".equals(style) ? 255 : "medium".equals(style) ? 160 : 80;
        return VibrationEffect.createOneShot(duration(style), amplitude);
    }

    private static long duration(String style) {
        switch (style) {
            case "explosion": return 120;
            case "heavy": return 35;
            case "medium": return 20;
            default: return 10;
        }
    }
}
