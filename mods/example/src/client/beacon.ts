import type { Context } from './types.js'

export function installBeacon({ host, assets }: Context): void {
    const { AnimatedPlantView } = host.get('client/plants/AnimatedPlantView')
    const { Color } = host.get('cc')
    const settings = assets.json('assets/settings.json')
    class BeaconView extends AnimatedPlantView {
        private pulseAtTick = -1
        constructor(context: any) { super(context) }
        protected async loadAnimations() {
            await this.body.load('example:beacon', this.content.registry, this.content.loader)
        }
        protected startBody() { this.body.play({ loop: true }) }
        protected syncVisuals(plant: any, world: any, particle: (...args: any[]) => void) {
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
