import type { Context } from './types.js'

export function installBeacon({ host, assets }: Context): void {
    const { PlantView } = host.get('client/plants/PlantView')
    const { Color } = host.get('cc')
    const settings = assets.json('assets/settings.json')
    // The beacon is drawn by its animation (its gameplay `animation`), as every plant is: on the board the server
    // keeps it, and `sync` adds what the board does to the plant. Off the board (a packet's picture) only `show` runs.
    class BeaconView extends PlantView {
        private pulseAtTick = -1
        constructor(context: any) { super(context) }
        sync(plant: any, world: any, particle: (...args: any[]) => void, ...rest: any[]) {
            super.sync(plant, world, particle, ...rest)
            const charged = Boolean(world.extensions['example:charge']?.[String(plant.entityId)])
            this.body.setColorOverride(charged ? new Color(255, 220, 110) : Color.WHITE)
            // Derive cosmetics from authoritative gameplay time; pause does not emit more particles.
            if (world.phase !== 'gameplay' || world.paused || world.result !== 'playing' || world.gameplayTick === this.pulseAtTick
                || world.gameplayTick % settings.particlePeriodTicks !== 0) return
            this.pulseAtTick = world.gameplayTick
            particle('example:sparks', plant.x + 40, plant.y + 20)
        }
    }
    host.get('client/views').plants.register('example:beacon', async (context: any) => {
        const view = new BeaconView(context)
        await view.initialize()
        return view
    })
}
