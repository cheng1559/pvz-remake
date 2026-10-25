import { native, sys } from 'cc'
import { GameDebugSettings } from './debug/GameDebugSettings'

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'explosion'
const EXPLOSION_DELAY_MS = 20

/** Real-time feedback stays responsive while the game clock is paused. */
export class Haptics {
    private static lastPlayedAt = -Infinity
    private static lastStyle?: HapticStyle
    private static explosionUntil = -Infinity
    private static explosionPending = false

    static play(style: HapticStyle = 'light'): void {
        if (!GameDebugSettings.hapticsEnabled || !sys.isNative || sys.os !== sys.OS.IOS) return
        if (style === 'explosion') {
            if (this.explosionPending) return
            this.explosionPending = true
            setTimeout(() => {
                this.explosionPending = false
                this.playNow(style)
            }, EXPLOSION_DELAY_MS)
        } else if (!this.explosionPending) this.playNow(style)
    }

    private static playNow(style: HapticStyle): void {
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
