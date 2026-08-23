System.register([], function (exports_1, context_1) {
    "use strict";
    var SECOND_SHOT_DELAY_TICKS;
    var __moduleName = context_1 && context_1.id;
    function register(api) {
        api.registerDefinition({
            id: 'phase0:sunflower',
            kind: 'plant',
        });
        api.enhanceSystem('pvz:peashooter', (context, next, gameplay) => {
            const { position, plant, plantAttack } = gameplay.components;
            const firstShots = [];
            for (const entity of context.world.query(position, plant, plantAttack)) {
                const plantState = context.world.get(entity, plant);
                if (plantState.typeId !== 'pvz:peashooter')
                    continue;
                const state = context.world.get(entity, plantAttack);
                const definition = gameplay.definitions.plants[plantState.typeId];
                if (state.fireAtTick !== undefined && context.tick >= state.fireAtTick &&
                    state.readyAtTick - state.fireAtTick ===
                        definition.shooter.cadenceTicks - definition.shooter.windupTicks + 1) {
                    firstShots.push(entity);
                }
            }
            next();
            for (const entity of firstShots) {
                const state = context.world.get(entity, plantAttack);
                if (!state || state.fireAtTick !== undefined)
                    continue;
                state.fireAtTick = context.tick + SECOND_SHOT_DELAY_TICKS;
                gameplay.emitEvent(context.world, 'plantFiring', { plantId: entity });
            }
        });
    }
    exports_1("register", register);
    return {
        setters: [],
        execute: function () {
            SECOND_SHOT_DELAY_TICKS = 26;
        }
    };
});
