import type { ClientAnimationClip, ClientAnimationDefinitions, ClientAnimationTarget, NutBlinkSlot, PresentationDefinitions } from '@/shared/content/presentation'
export type { ClientAnimationClip, ShooterAnimationDefinition, ZombieAnimationDefinition, NormalZombieAnimationDefinition, SunflowerAnimationDefinition, FlagZombieAnimationDefinition, PoleVaulterAnimationDefinition, CherryBombAnimationDefinition, WallNutAnimationDefinition, PotatoMineAnimationDefinition, ChomperAnimationDefinition, ClientAnimationDefinitions, ClientAnimationTarget } from '@/shared/content/presentation'

export const randomAnimationRate = ([min, max]: readonly [number, number]): number => min + Math.random() * (max - min)

type AnyAnimationDefinition = Record<string, ClientAnimationClip>

export class ClientAnimationRegistry {
    private readonly values = new Map<ClientAnimationTarget, AnyAnimationDefinition>()
    private frozen = false

    constructor(readonly definitions: PresentationDefinitions) {
        const { plants, zombies } = definitions
        const defaults = Object.fromEntries(Object.entries({ ...plants, ...zombies })
            .filter(([, definition]) => definition.animations).map(([id, definition]) => [id, definition.animations])) as unknown as ClientAnimationDefinitions
        for (const [target, value] of Object.entries(defaults)) {
            const copy = cloneDefinition(value)
            for (const [slot, clip] of Object.entries(copy)) validateClip(target, slot, clip)
            this.values.set(target, copy)
        }
    }

    get rates() { return this.definitions.animation.rates }
    get zombieIdle2Chance() { return this.definitions.animation.zombieIdle2Chance }
    get nutBlinkWeights() { return this.definitions.animation.nutBlinkWeights }

    nextPlantBlinkTicks(nut = false): number {
        const [min, max] = nut ? this.definitions.animation.nutBlinkTicks : this.definitions.animation.plantBlinkTicks
        return min + Math.floor(Math.random() * (max - min + 1))
    }

    pickNutBlinkSlot(): NutBlinkSlot {
        const weights = this.definitions.animation.nutBlinkWeights
        const slots = Object.keys(weights) as NutBlinkSlot[]
        let hit = Math.random() * Object.values(weights).reduce((total, weight) => total + weight, 0)
        for (const slot of slots) {
            hit -= weights[slot]
            if (hit < 0) return slot
        }
        return slots[slots.length - 1]
    }

    resolve<K extends ClientAnimationTarget>(target: K): ClientAnimationDefinitions[K] {
        return this.require(target)
    }

    freeze(): void {
        if (this.frozen) return
        this.frozen = true
        for (const definition of this.values.values()) {
            for (const value of Object.values(definition)) Object.freeze(value)
            Object.freeze(definition)
        }
    }

    private require<K extends ClientAnimationTarget>(target: K): ClientAnimationDefinitions[K] {
        const value = this.values.get(target)
        if (!value) throw new Error(`unknown client animation target: ${target}`)
        return value as unknown as ClientAnimationDefinitions[K]
    }
}

function cloneDefinition<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).map(([slot, animation]) => [slot, { ...animation }])) as T
}

function validateClip(target: string, slot: string, value: ClientAnimationClip): void {
    if (!value || typeof value !== 'object') throw new TypeError(`${target}.${slot} must be an object`)
    const fields = new Set(['reanimId', 'rateScale', 'x', 'y', 'attachmentTrackId', 'fps'])
    const unknown = Object.keys(value).find(key => !fields.has(key))
    if (unknown) throw new TypeError(`unknown ${target}.${slot} field: ${unknown}`)
    if (typeof value.reanimId !== 'string' || value.reanimId.length === 0) {
        throw new TypeError(`${target}.${slot}.reanimId must be a non-empty string`)
    }
    for (const key of ['rateScale', 'x', 'y'] as const) {
        if (!Number.isFinite(value[key])) throw new TypeError(`${target}.${slot}.${key} must be finite`)
    }
    if (value.rateScale <= 0) throw new TypeError(`${target}.${slot}.rateScale must be positive`)
    if (value.fps !== undefined && (!Number.isFinite(value.fps) || value.fps <= 0)) throw new TypeError(`${target}.${slot}.fps must be positive`)
    if (value.attachmentTrackId !== undefined &&
        (typeof value.attachmentTrackId !== 'string' || value.attachmentTrackId.length === 0)) {
        throw new TypeError(`${target}.${slot}.attachmentTrackId must be a non-empty string`)
    }
}
