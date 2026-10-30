import { native, sys } from 'cc'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from './debug/GameDebugSettings'

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'explosion'
const EXPLOSION_DELAY_MS = 40
const supported = () => sys.isNative && (sys.os === sys.OS.IOS || sys.os === sys.OS.ANDROID)

/** Runs callback after ms of game time: follows speed changes and waits while the clock is paused. */
function afterGameTime(ms: number, callback: () => void): void {
    let remaining = ms, speed = 0, startedAt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (next: number) => {
        const now = performance.now()
        if (timer !== undefined) {
            clearTimeout(timer)
            timer = undefined
            remaining -= (now - startedAt) * speed
        }
        speed = next
        startedAt = now
        if (speed > 0) timer = setTimeout(() => { stop(); callback() }, Math.max(0, remaining) / speed)
    }
    const stop = gameClock.onSpeedChange(schedule)
    schedule(gameClock.effectiveSpeed)
}

/** The explosion delay follows the game clock; debouncing and the feedback itself stay in real time. */
export class Haptics {
    private static lastPlayedAt = -Infinity
    private static lastStyle?: HapticStyle
    private static explosionUntil = -Infinity
    private static explosionPending = false

    static play(style: HapticStyle = 'light'): void {
        if (!GameDebugSettings.hapticsEnabled || !supported()) return
        if (style === 'explosion') {
            if (this.explosionPending) return
            this.explosionPending = true
            afterGameTime(EXPLOSION_DELAY_MS, () => {
                this.explosionPending = false
                this.playNow(style)
            })
        } else if (!this.explosionPending) this.playNow(style)
    }

    private static playNow(style: HapticStyle): void {
        if (!GameDebugSettings.hapticsEnabled || !supported()) return
        const now = performance.now()
        if (style !== 'explosion' && now < this.explosionUntil) return
        // An explosion can supersede a recent UI tap; simultaneous explosions still merge.
        if (now - this.lastPlayedAt < 40 && (style !== 'explosion' || this.lastStyle === 'explosion')) return
        this.lastPlayedAt = now
        this.lastStyle = style
        if (style === 'explosion') this.explosionUntil = now + 280
        if (sys.os === sys.OS.IOS) native.reflection.callStaticMethod('ViewController', 'playHapticFeedback:', style)
        else native.reflection.callStaticMethod('com/cocos/game/Haptics', 'play', '(Ljava/lang/String;)V', style)
    }
}
