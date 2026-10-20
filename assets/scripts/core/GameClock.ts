/** Shared presentation/local-game time scale. Fixed server tick durations remain unchanged. */
export class GameClock {
    private multiplier = 1
    private pauses = 0
    private readonly listeners = new Set<(speed: number) => void>()

    get speed(): number { return this.multiplier }
    get effectiveSpeed(): number { return this.pauses > 0 ? 0 : this.multiplier }

    setSpeed(speed: number): void {
        if (!Number.isFinite(speed) || speed < 0) throw new Error('Game speed must be a non-negative finite number')
        if (speed === this.multiplier) return
        this.multiplier = speed
        this.notifySpeed()
    }

    delta(dt: number): number { return dt * this.effectiveSpeed }

    pause(): () => void {
        this.pauses++
        this.notifySpeed()
        let released = false
        return () => { if (!released) { released = true; this.pauses--; this.notifySpeed() } }
    }

    private notifySpeed(): void { for (const listener of this.listeners) listener(this.effectiveSpeed) }

    onSpeedChange(listener: (speed: number) => void): () => void {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }
}

export const gameClock = new GameClock()
