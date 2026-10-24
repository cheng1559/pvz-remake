interface RegenerationState { ticks: number }
interface Definition { behavior?: { [key: string]: unknown } }
interface Behavior<Kind extends string> {
    createState(): RegenerationState
    validateState(state: RegenerationState, definition: Definition): void
    tick(context: { state: RegenerationState, definition: Definition } & Record<Kind, { health: number, maxHealth: number }>): void
}
interface GameplayApi {
    host: { get(id: string): any }
    assets: { id: string, json(path: string): unknown }
}

function config(definition: Definition): { intervalTicks: number, amount: number } {
    const { intervalTicks, amount } = definition.behavior ?? {}
    if (!Number.isSafeInteger(intervalTicks) || (intervalTicks as number) <= 0 ||
        !Number.isSafeInteger(amount) || (amount as number) <= 0) throw new Error('Invalid regeneration config')
    return { intervalTicks: intervalTicks as number, amount: amount as number }
}

function regeneration<Kind extends string>(kind: Kind): Behavior<Kind> {
    return {
        createState: () => ({ ticks: 0 }),
        validateState(state, definition) {
            const { intervalTicks } = config(definition)
            if (Object.keys(state).length !== 1 || !Number.isSafeInteger(state.ticks) ||
                state.ticks < 0 || state.ticks >= intervalTicks) throw new Error('Invalid regeneration state')
        },
        tick(context) {
            const { state, definition } = context
            const entity = context[kind]
            const { intervalTicks, amount } = config(definition)
            if (++state.ticks < intervalTicks) return
            state.ticks = 0
            entity.health = Math.min(entity.maxHealth, entity.health + amount)
        },
    }
}

export function register(api: GameplayApi): void {
    api.host.get('content/definitions').register(api.assets.id, api.assets.json('assets/gameplay.json'))
    const registry = api.host.get('server/GameplayRegistry').registry
    registry.plantBehaviors.register(api.assets.id, 'example:rapid_pea', regeneration('plant'))
    registry.zombieBehaviors.register(api.assets.id, 'example:regenerating_zombie', regeneration('zombie'))
}
