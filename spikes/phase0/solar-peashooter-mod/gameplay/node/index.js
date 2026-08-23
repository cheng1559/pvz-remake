export function register(api) {
    api.enhanceSystem('pvz:projectile', (context, next, gameplay) => {
        const events = context.world.resources.get(gameplay.resources.events);
        const firstNewEvent = events.events.length;
        next();
        const { position, plant, item } = gameplay.components;
        for (const event of events.events.slice(firstNewEvent)) {
            if (event.type !== 'projectileImpact' || typeof event.data.sourcePlantId !== 'number' ||
                typeof event.data.x !== 'number' || typeof event.data.y !== 'number')
                continue;
            const plantId = event.data.sourcePlantId;
            if (context.world.get(plantId, plant)?.typeId !== 'pvz:peashooter')
                continue;
            const entity = context.commands.createEntity();
            context.commands.add(entity, position, {
                x: event.data.x,
                y: event.data.y,
                row: -1,
            });
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
            });
            gameplay.emitEvent(context.world, 'itemSpawned', {
                entityId: entity,
                typeId: 'pvz:sun',
            });
        }
    });
}
