export interface ClientAnimationClip {
    readonly reanimId: string
    readonly rateScale: number
    readonly x: number
    readonly y: number
    readonly attachmentTrackId?: string
}

export interface ShooterAnimationDefinition {
    readonly body: ClientAnimationClip
    readonly idleHead: ClientAnimationClip
    readonly shootHead: ClientAnimationClip
}

export interface ZombieAnimationDefinition {
    readonly walk: ClientAnimationClip
    readonly walk2: ClientAnimationClip
    readonly eat: ClientAnimationClip
    readonly death: ClientAnimationClip
    readonly death2: ClientAnimationClip
    readonly mowered: ClientAnimationClip
}

export interface ClientAnimationDefinitions {
    readonly 'pvz:peashooter': ShooterAnimationDefinition
    readonly 'pvz:repeater': ShooterAnimationDefinition
    readonly 'pvz:normal': ZombieAnimationDefinition
}

export type ClientAnimationTarget = keyof ClientAnimationDefinitions
export type ClientAnimationMode = 'enhance' | 'replace'
export type ClientAnimationPatch<K extends ClientAnimationTarget> = {
    readonly [P in keyof ClientAnimationDefinitions[K]]?: Partial<ClientAnimationDefinitions[K][P]>
}

const DEFAULTS: ClientAnimationDefinitions = {
    'pvz:peashooter': {
        body: clip('pvz:peashooter'),
        idleHead: clip('pvz:peashooter_head_idle', { attachmentTrackId: 'anim_stem' }),
        shootHead: clip('pvz:peashooter_shoot', { attachmentTrackId: 'anim_stem' }),
    },
    'pvz:repeater': {
        body: clip('pvz:repeater'),
        idleHead: clip('pvz:repeater_head_idle', { attachmentTrackId: 'anim_stem' }),
        shootHead: clip('pvz:repeater_shoot', { attachmentTrackId: 'anim_stem', rateScale: 45 / 35 }),
    },
    'pvz:normal': {
        walk: clip('pvz:zombie_walk', { x: 15, y: 8 }),
        walk2: clip('pvz:zombie_walk2', { x: 15, y: 8 }),
        eat: clip('pvz:zombie_eat', { x: 15, y: 8 }),
        death: clip('pvz:zombie_death', { x: 15, y: 8 }),
        death2: clip('pvz:zombie_death2', { x: 15, y: 8 }),
        mowered: clip('pvz:lawnmowered_zombie', { attachmentTrackId: 'locator' }),
    },
}

export class ClientAnimationRegistry {
    private readonly values = new Map<ClientAnimationTarget, ShooterAnimationDefinition | ZombieAnimationDefinition>(
        Object.entries(DEFAULTS).map(([target, value]) => [target as ClientAnimationTarget, cloneDefinition(value)]),
    )
    private readonly replacements = new Map<ClientAnimationTarget, string>()
    private frozen = false

    registerLoaded(owner: string, target: string, mode: ClientAnimationMode, value: unknown): void {
        if (!Object.prototype.hasOwnProperty.call(DEFAULTS, target)) {
            throw new Error(`unknown client animation target: ${target}`)
        }
        const knownTarget = target as ClientAnimationTarget
        if (mode === 'enhance') {
            this.register(owner, knownTarget, mode, value as ClientAnimationPatch<ClientAnimationTarget>)
        } else if (mode === 'replace') {
            this.register(owner, knownTarget, mode, value as ClientAnimationDefinitions[ClientAnimationTarget])
        } else {
            throw new TypeError(`unknown client animation mode: ${mode}`)
        }
    }

    register<K extends ClientAnimationTarget>(
        owner: string,
        target: K,
        mode: 'enhance',
        value: ClientAnimationPatch<K>,
    ): void
    register<K extends ClientAnimationTarget>(
        owner: string,
        target: K,
        mode: 'replace',
        value: ClientAnimationDefinitions[K],
    ): void
    register<K extends ClientAnimationTarget>(
        owner: string,
        target: K,
        mode: ClientAnimationMode,
        value: ClientAnimationDefinitions[K] | ClientAnimationPatch<K>,
    ): void {
        if (this.frozen) throw new Error('client animation registry is frozen')
        if (!owner) throw new TypeError('client animation owner must be a non-empty string')
        const current = this.require(target)
        if (mode === 'replace') {
            const previous = this.replacements.get(target)
            if (previous) throw new Error(`${target} animations are already replaced by ${previous}`)
            this.write(target, value as ClientAnimationDefinitions[K])
            this.replacements.set(target, owner)
            return
        }
        if (mode !== 'enhance') throw new TypeError(`unknown client animation mode: ${mode}`)
        const enhanced = cloneDefinition(current) as unknown as Record<string, ClientAnimationClip>
        for (const [slot, patch] of Object.entries(value)) {
            if (!(slot in enhanced)) throw new Error(`unknown ${target} animation slot: ${slot}`)
            if (!patch || typeof patch !== 'object') throw new TypeError(`${target}.${slot} patch must be an object`)
            enhanced[slot] = { ...enhanced[slot], ...patch }
        }
        this.write(target, enhanced as unknown as ClientAnimationDefinitions[K])
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
        return value as ClientAnimationDefinitions[K]
    }

    private write<K extends ClientAnimationTarget>(target: K, value: ClientAnimationDefinitions[K]): void {
        if (!value || typeof value !== 'object') throw new TypeError(`${target} animations must be an object`)
        const slots = Object.keys(DEFAULTS[target])
        if (Object.keys(value).length !== slots.length || slots.some(slot => !(slot in value))) {
            throw new TypeError(`${target} replacement must define: ${slots.join(', ')}`)
        }
        const copy = cloneDefinition(value)
        for (const [slot, animation] of Object.entries(copy)) validateClip(target, slot, animation)
        this.values.set(target, copy)
    }
}

function clip(reanimId: string, options: Partial<Omit<ClientAnimationClip, 'reanimId'>> = {}): ClientAnimationClip {
    return { reanimId, rateScale: 1, x: 0, y: 0, ...options }
}

function cloneDefinition<T extends ShooterAnimationDefinition | ZombieAnimationDefinition>(value: T): T {
    return Object.fromEntries(Object.entries(value).map(([slot, animation]) => [slot, { ...animation }])) as T
}

function validateClip(target: string, slot: string, value: ClientAnimationClip): void {
    if (!value || typeof value !== 'object') throw new TypeError(`${target}.${slot} must be an object`)
    const fields = new Set(['reanimId', 'rateScale', 'x', 'y', 'attachmentTrackId'])
    const unknown = Object.keys(value).find(key => !fields.has(key))
    if (unknown) throw new TypeError(`unknown ${target}.${slot} field: ${unknown}`)
    if (typeof value.reanimId !== 'string' || value.reanimId.length === 0) {
        throw new TypeError(`${target}.${slot}.reanimId must be a non-empty string`)
    }
    for (const key of ['rateScale', 'x', 'y'] as const) {
        if (!Number.isFinite(value[key])) throw new TypeError(`${target}.${slot}.${key} must be finite`)
    }
    if (value.rateScale <= 0) throw new TypeError(`${target}.${slot}.rateScale must be positive`)
    if (value.attachmentTrackId !== undefined &&
        (typeof value.attachmentTrackId !== 'string' || value.attachmentTrackId.length === 0)) {
        throw new TypeError(`${target}.${slot}.attachmentTrackId must be a non-empty string`)
    }
}
