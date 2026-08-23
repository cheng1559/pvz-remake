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

interface EventQueue {
    events: Array<{ type: string; data: Record<string, unknown> }>
}

interface SystemContext {
    world: {
        get<T>(entity: number, component: Token<T>): T | undefined
        resources: { get<T>(resource: Token<T>): T }
    }
    commands: {
        createEntity(): number
        add<T>(entity: number, component: Token<T>, value: T): void
    }
}

interface GameplayBindings {
    components: {
        position: Token<Position>
        plant: Token<Plant>
        item: Token<{
            typeId: string
            value: number
            state: 'available'
            velocityX: number
            velocityY: number
            accelerationY?: number
            width?: number
            groundY: number
            disappearTicks: number
            fadeTicks: number
            scale: number
            alpha: number
        }>
    }
    resources: {
        events: Token<EventQueue>
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

export function register(api: GameplayApi) {
    api.enhanceSystem('pvz:projectile', (context, next, gameplay) => {
        const events = context.world.resources.get(gameplay.resources.events)
        const firstNewEvent = events.events.length
        next()

        const { position, plant, item } = gameplay.components
        for (const event of events.events.slice(firstNewEvent)) {
            if (event.type !== 'projectileImpact' || typeof event.data.sourcePlantId !== 'number' ||
                typeof event.data.x !== 'number' || typeof event.data.y !== 'number') continue
            const plantId = event.data.sourcePlantId
            if (context.world.get(plantId, plant)?.typeId !== 'pvz:peashooter') continue

            const entity = context.commands.createEntity()
            context.commands.add(entity, position, {
                x: event.data.x,
                y: event.data.y,
                row: -1,
            })
            context.commands.add(entity, item, {
                typeId: 'pvz:sun',
                value: 15,
                state: 'available',
                velocityX: -0.35,
                velocityY: -2.5,
                accelerationY: 0.15,
                width: 60,
                groundY: event.data.y + 40,
                disappearTicks: 0,
                fadeTicks: 0,
                scale: 0.65,
                alpha: 255,
            })
            gameplay.emitEvent(context.world, 'itemSpawned', {
                entityId: entity,
                typeId: 'pvz:sun',
            })
        }
    })
}
