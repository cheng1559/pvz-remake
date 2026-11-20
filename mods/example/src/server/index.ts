interface GameplayApi {
    host: { get(id: string): any, around(target: object, key: string, wrapper: (this: any, next: (...args: any[]) => any, ...args: any[]) => any): () => void }
    assets: { id: string, json(path: string): any }
}

/** A field of this Mod's on a definition: an object of positive whole numbers by `keys`, and nothing else. */
function wholeNumbers(value: any, keys: string[], name: string): void {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== keys.length ||
        keys.some(key => !Number.isSafeInteger(value[key]) || value[key] <= 0)) throw new Error(`Invalid ${name}`)
}

/** A count this Mod keeps on an entity (`{ ticks }`), below `intervalTicks`, as it is restored. */
function count(value: any, intervalTicks: number, name: string): { ticks: number } {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !Number.isSafeInteger(value.ticks) ||
        value.ticks < 0 || value.ticks >= intervalTicks) throw new Error(`Invalid ${name}`)
    return { ticks: value.ticks }
}

export function register({ host, assets }: GameplayApi): void {
    const registry = host.get('gameplay/registry')
    const { LevelStateResource: Level, EconomyStateResource: Economy } = host.get('server/state/resources')
    const { plantsInPlay } = host.get('server/level/lawn')
    const { Plant } = host.get('server/plants/Plant')
    const { Shooter } = host.get('server/plants/Shooter')
    const { Zombie } = host.get('server/zombies/Zombie')
    const settings = assets.json('assets/settings.json')
    for (const key of ['chargeTicks', 'chargeMultiplier', 'particlePeriodTicks']) {
        if (!Number.isSafeInteger(settings[key]) || settings[key] <= 0) throw new Error(`Invalid example setting: ${key}`)
    }

    // A plant's charge, kept on it as `extensions[Charge]`: registered, it is saved and sent in snapshots' extensions.
    const Charge = 'example:charge'
    registry.extensions.register(Charge, (value: any) => {
        if (Object.keys(value).length !== 1 || !Number.isSafeInteger(value.remainingTicks)
            || value.remainingTicks <= 0 || value.remainingTicks > settings.chargeTicks) throw new Error('Invalid example charge')
    })
    /** What a plant's charge multiplies this tick by, counting the charge down. */
    const charged = (plant: any): number => {
        const charge = plant.extensions?.[Charge]
        if (!charge) return 1
        if (--charge.remainingTicks === 0) delete plant.extensions[Charge]
        return settings.chargeMultiplier
    }

    /**
     * A mixin over a plant's kind or a zombie's: it regains `amount` health every `intervalTicks` ticks it acts, by its
     * type's `example:regeneration` field, times `factor`. What it keeps is its own field of the same name: a Mod names
     * its fields by IDs of its namespace, so a kind may take on any number of mixins.
     */
    const Regeneration = 'example:regeneration'
    const regenerating = (Base: any, factor: (entity: any) => number = () => 1) => class extends Base {
        static config = [...Base.config, Regeneration]
        static validate(definition: any, id: string): void {
            super.validate(definition, id)
            wholeNumbers(definition[Regeneration], ['intervalTicks', 'amount'], `${id}.${Regeneration}`)
        }
        [Regeneration] = { ticks: 0 }
        act(...args: any[]): unknown {
            const { intervalTicks, amount } = this.definition[Regeneration], state = this[Regeneration], gain = factor(this)
            if (++state.ticks >= intervalTicks) {
                state.ticks = 0
                this.health = Math.min(this.maxHealth, this.health + amount * gain)
            }
            return super.act(...args)
        }
        restoreOwn(fields: any, name: string): void {
            const { [Regeneration]: state, ...rest } = fields
            this[Regeneration] = count(state, this.definition[Regeneration].intervalTicks, `${name}.${Regeneration}`)
            super.restoreOwn(rest, name)
        }
    }

    /** The beacon (its type's `example:beacon` field): `sun` sun every `intervalTicks` ticks it produces, more while charged. */
    const Beacon = 'example:beacon'
    class BeaconPlant extends Plant {
        static config = [...Plant.config, Beacon]
        static validate(definition: any, id: string): void {
            super.validate(definition, id)
            wholeNumbers(definition[Beacon], ['intervalTicks', 'sun'], `${id}.${Beacon}`)
        }
        [Beacon] = { ticks: 0 }
        produce(context: any, stopped: boolean): void {
            super.produce(context, stopped)
            if (stopped) return
            const { intervalTicks, sun } = this.definition[Beacon], state = this[Beacon], gain = charged(this)
            if (++state.ticks < intervalTicks) return
            state.ticks = 0
            const economy = context.world.resources.get(Economy)
            economy.sun = Math.min(this.definitions.economy.maxSun, economy.sun + sun * gain)
        }
        restoreOwn(fields: any, name: string): void {
            const { [Beacon]: state, ...rest } = fields
            this[Beacon] = count(state, this.definition[Beacon].intervalTicks, `${name}.${Beacon}`)
            super.restoreOwn(rest, name)
        }
    }

    registry.plants.register(assets.id, 'example:rapid_pea', regenerating(Shooter, charged))
    registry.plants.register(assets.id, 'example:beacon', BeaconPlant)
    registry.zombies.register(assets.id, 'example:regenerating_zombie', regenerating(Zombie))

    // Declare server syntax too: a standalone server must not depend on client initialization.
    const cli = host.get('shared/debug/DebugCli')
    const spec = { name: 'example:charge', parameters: ['{row}', '{col}'], minimum: 2 }
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return entries.some((entry: any) => entry.name === spec.name) ? entries : [...entries, spec]
    })
    const { executor } = host.get('server/debug/debugCommands')
    host.around(executor, 'execute', function (next, session, command) {
        if (command.name !== spec.name) return next(session, command)
        const { world } = session
        const level = world.resources.get(Level)
        if (level.phase !== 'gameplay' || level.result !== 'playing') return cli.debugCondition('example:cli_need_level')
        const row = cli.debugInteger(command.args[0]), column = cli.debugInteger(command.args[1])
        if (row === null || column === null || row < 1 || row > level.board.rows || column < 1 || column > level.board.columns) {
            return cli.debugSyntax(`Use row 1-${level.board.rows} and col 1-${level.board.columns}`)
        }
        const plant = [...plantsInPlay(world)].find(plant => ['example:rapid_pea', 'example:beacon'].includes(plant.typeId)
            && plant.health > 0 && plant.column === column - 1 && plant.position.row === row - 1)
        if (plant === undefined) return cli.debugCondition('example:cli_need_plant')
        plant.extensions = { ...plant.extensions, [Charge]: { remainingTicks: settings.chargeTicks } }
        return cli.debugSuccess(`Charged for ${settings.chargeTicks} ticks`)
    })
}
