/** Shared presentation/local-game time scale. Fixed server tick durations remain unchanged. */
export class GameClock {
    private multiplier = 1
    private readonly listeners = new Set<(speed: number) => void>()

    get speed(): number { return this.multiplier }

    setSpeed(speed: number): void {
        if (!Number.isFinite(speed) || speed < 0) throw new Error('Game speed must be a non-negative finite number')
        if (speed === this.multiplier) return
        this.multiplier = speed
        for (const listener of this.listeners) listener(speed)
    }

    delta(dt: number): number { return dt * this.multiplier }

    onSpeedChange(listener: (speed: number) => void): () => void {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }
}

export const gameClock = new GameClock()
