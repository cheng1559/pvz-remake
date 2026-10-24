import { native, sys } from 'cc'
import { GameDebugSettings } from './debug/GameDebugSettings'

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'explosion'

/** Real-time feedback stays responsive while the game clock is paused. */
export class Haptics {
    private static lastPlayedAt = -Infinity
    private static lastStyle?: HapticStyle
    private static explosionUntil = -Infinity

    static play(style: HapticStyle = 'light'): void {
        if (!GameDebugSettings.hapticsEnabled || !sys.isNative || sys.os !== sys.OS.IOS) return
        const now = performance.now()
        if (style !== 'explosion' && now < this.explosionUntil) return
        // An explosion can supersede a recent UI tap; simultaneous explosions still merge.
        if (now - this.lastPlayedAt < 40 && (style !== 'explosion' || this.lastStyle === 'explosion')) return
        this.lastPlayedAt = now
        this.lastStyle = style
        if (style === 'explosion') this.explosionUntil = now + 280
        native.reflection.callStaticMethod('ViewController', 'playHapticFeedback:', style)
    }
}
