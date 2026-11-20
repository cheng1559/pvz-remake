import type { Context } from './types.js'

export function installBeacon({ host, assets }: Context): void {
    const { PlantView } = host.get('client/plants/PlantView')
    const { Color } = host.get('cc')
    const settings = assets.json('assets/settings.json')
    // The beacon is drawn by its animation (its gameplay `animation`), as every plant is: on the board the server
    // keeps it, and `onBoard` adds what this plant does there. Off the board (a packet's picture) only `pose` runs.
    class BeaconView extends PlantView {
        private pulseAtTick = -1
        constructor(context: any) { super(context) }
        onBoard(plant: any, world: any, ...rest: any[]) {
            super.onBoard(plant, world, ...rest)
            const charged = Boolean(world.extensions['example:charge']?.[String(plant.entityId)])
            this.body.setColorOverride(charged ? new Color(255, 220, 110) : Color.WHITE)
            // Derive cosmetics from authoritative gameplay time; pause does not emit more particles.
            if (world.phase !== 'gameplay' || world.paused || world.result !== 'playing' || world.gameplayTick === this.pulseAtTick
                || world.gameplayTick % settings.particlePeriodTicks !== 0) return
            this.pulseAtTick = world.gameplayTick
            this.particle('example:sparks', plant.x + 40, plant.y + 20)
        }
    }
    host.get('client/views').plants.registerView('example:beacon', BeaconView)
}
