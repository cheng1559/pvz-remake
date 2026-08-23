interface Token<T> {
    readonly name: string
    readonly __value?: T
}

interface Position {
    x: number
    y: number
    row: number
}

interface Plant {
    typeId: string
}

interface PlantAttack {
    readyAtTick: number
    fireAtTick?: number
}

interface SystemContext {
    tick: number
    world: {
        query(...components: Token<unknown>[]): Iterable<number>
        get<T>(entity: number, component: Token<T>): T | undefined
    }
}

interface GameplayBindings {
    definitions: {
        plants: Record<string, {
            shooter: { cadenceTicks: number; windupTicks: number }
        }>
    }
    components: {
        position: Token<Position>
        plant: Token<Plant>
        plantAttack: Token<PlantAttack>
    }
    emitEvent(world: SystemContext['world'], type: string, data: Record<string, unknown>): void
}

export interface GameplayApi {
    registerDefinition(definition: { id: string; kind: string }): void
    enhanceSystem(
        targetId: string,
        enhancer: (context: SystemContext, next: () => void, bindings: GameplayBindings) => void,
    ): void
}

const SECOND_SHOT_DELAY_TICKS = 26

export function register(api: GameplayApi) {
    api.registerDefinition({
        id: 'phase0:sunflower',
        kind: 'plant',
    })
    api.enhanceSystem('pvz:peashooter', (context, next, gameplay) => {
        const { position, plant, plantAttack } = gameplay.components
        const firstShots: number[] = []
        for (const entity of context.world.query(position, plant, plantAttack)) {
            const plantState = context.world.get(entity, plant)!
            if (plantState.typeId !== 'pvz:peashooter') continue
            const state = context.world.get(entity, plantAttack)!
            const definition = gameplay.definitions.plants[plantState.typeId]
            if (state.fireAtTick !== undefined && context.tick >= state.fireAtTick &&
                state.readyAtTick - state.fireAtTick ===
                    definition.shooter.cadenceTicks - definition.shooter.windupTicks + 1) {
                firstShots.push(entity)
            }
        }

        next()

        for (const entity of firstShots) {
            const state = context.world.get(entity, plantAttack)
            if (!state || state.fireAtTick !== undefined) continue
            state.fireAtTick = context.tick + SECOND_SHOT_DELAY_TICKS
            gameplay.emitEvent(context.world, 'plantFiring', { plantId: entity })
        }
    })
}
