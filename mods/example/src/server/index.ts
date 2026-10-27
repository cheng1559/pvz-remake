interface RegenerationState { ticks: number }
interface Definition { behavior?: { [key: string]: unknown } }
interface Behavior<Kind extends string> {
    createState(): RegenerationState
    validateState(state: RegenerationState, definition: Definition): void
    tick(context: { state: RegenerationState, definition: Definition } & Record<Kind, { health: number, maxHealth: number }>): void
}
interface GameplayApi {
    host: { get(id: string): any, around(target: object, key: string, wrapper: (this: any, next: (...args: any[]) => any, ...args: any[]) => any): () => void }
    assets: { id: string, json(path: string): any }
}

function config(definition: Definition): { intervalTicks: number, amount: number } {
    const { intervalTicks, amount } = definition.behavior ?? {}
    if (!Number.isSafeInteger(intervalTicks) || (intervalTicks as number) <= 0 ||
        !Number.isSafeInteger(amount) || (amount as number) <= 0) throw new Error('Invalid regeneration config')
    return { intervalTicks: intervalTicks as number, amount: amount as number }
}

function regeneration<Kind extends string>(kind: Kind, multiplier = (_context: any) => 1): Behavior<Kind> {
    return {
        createState: () => ({ ticks: 0 }),
        validateState(state, definition) {
            const { intervalTicks } = config(definition)
            if (Object.keys(state).length !== 1 || !Number.isSafeInteger(state.ticks) ||
                state.ticks < 0 || state.ticks >= intervalTicks) throw new Error('Invalid regeneration state')
        },
        tick(context) {
            const factor = multiplier(context)
            const { state, definition } = context
            const entity = context[kind]
            const { intervalTicks, amount } = config(definition)
            if (++state.ticks < intervalTicks) return
            state.ticks = 0
            entity.health = Math.min(entity.maxHealth, entity.health + amount * factor)
        },
    }
}

export function register({ host, assets }: GameplayApi): void {
    const { registry } = host.get('server/GameplayRegistry')
    const { defineComponent } = host.get('ecs')
    const { PlantComponent: Plant, PositionComponent: Position, LevelStateResource: Level,
        EconomyStateResource: Economy, MAX_SUN } = host.get('server/components')
    const settings = assets.json('assets/settings.json')
    for (const key of ['chargeTicks', 'chargeMultiplier', 'particlePeriodTicks']) {
        if (!Number.isSafeInteger(settings[key]) || settings[key] <= 0) throw new Error(`Invalid example setting: ${key}`)
    }

    // Registered JSON components appear in snapshots/extensions and saves automatically.
    const Charge = defineComponent('example:charge')
    registry.components.register(Charge, (value: any) => {
        if (Object.keys(value).length !== 1 || !Number.isSafeInteger(value.remainingTicks)
            || value.remainingTicks <= 0 || value.remainingTicks > settings.chargeTicks) throw new Error('Invalid example charge')
    })
    const multiplier = ({ world, entity }: any) => {
        const charge = world.get(entity, Charge)
        if (!charge) return 1
        if (--charge.remainingTicks === 0) world.remove(entity, Charge)
        return settings.chargeMultiplier
    }
    registry.plantBehaviors.register(assets.id, 'example:rapid_pea', regeneration('plant', multiplier))
    registry.zombieBehaviors.register(assets.id, 'example:regenerating_zombie', regeneration('zombie'))
    registry.plantBehaviors.register(assets.id, 'example:beacon', {
        createState: () => ({ ticks: 0 }),
        validateState(state: RegenerationState, definition: Definition) {
            const { intervalTicks, sun } = definition.behavior ?? {}
            if (!Number.isSafeInteger(intervalTicks) || Number(intervalTicks) <= 0 || !Number.isSafeInteger(sun) || Number(sun) <= 0
                || Object.keys(state).length !== 1 || !Number.isSafeInteger(state.ticks)
                || state.ticks < 0 || state.ticks >= Number(intervalTicks)) throw new Error('Invalid beacon state or config')
        },
        tick(context: any) {
            const factor = multiplier(context)
            if (++context.state.ticks < context.definition.behavior.intervalTicks) return
            context.state.ticks = 0
            const economy = context.world.resources.get(Economy)
            economy.sun = Math.min(MAX_SUN, economy.sun + context.definition.behavior.sun * factor)
        },
    })

    // Declare server syntax too: a standalone server must not depend on client initialization.
    const cli = host.get('shared/debug/DebugCli')
    const spec = { name: 'example:charge', parameters: ['{row}', '{col}'], minimum: 2 }
    host.around(cli.specs, 'list', next => {
        const entries = next()
        return entries.some((entry: any) => entry.name === spec.name) ? entries : [...entries, spec]
    })
    const { executor } = host.get('server/debug/DebugCommands')
    host.around(executor, 'execute', function (next, world, definitions, tick, command, createPlant) {
        if (command.name !== spec.name) return next(world, definitions, tick, command, createPlant)
        const level = world.resources.get(Level)
        if (level.phase !== 'gameplay' || level.result !== 'playing') return cli.debugCondition('Start a playing level first')
        const row = cli.debugInteger(command.args[0]), column = cli.debugInteger(command.args[1])
        if (row === null || column === null || row < 1 || row > level.board.rows || column < 1 || column > level.board.columns) {
            return cli.debugSyntax(`Use row 1-${level.board.rows} and col 1-${level.board.columns}`)
        }
        const entity = [...world.query(Plant, Position)].find((id: number) => {
            const plant = world.get(id, Plant), position = world.get(id, Position)
            return ['example:rapid_pea', 'example:beacon'].includes(plant.typeId)
                && plant.health > 0 && plant.column === column - 1 && position.row === row - 1
        })
        if (entity === undefined) return cli.debugCondition('Place an example plant in that cell first')
        world.add(entity, Charge, { remainingTicks: settings.chargeTicks })
        return cli.debugSuccess(`Charged for ${settings.chargeTicks} ticks`)
    })
}
