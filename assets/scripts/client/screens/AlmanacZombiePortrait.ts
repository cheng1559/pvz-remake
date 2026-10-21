import { _decorator, Component, isValid, Node } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { drawBungeeCord, loadDisplayParts, loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

/** Static Reanim portraits use the same placement as the original cached atlas. */
@_decorator.ccclass('AlmanacZombiePortrait')
export class AlmanacZombiePortrait extends Component {
    private zombieId = 0
    private cached!: Node
    private rendered: Node | null = null
    private ready = false

    initialize(zombieId: number, cached: Node): void {
        this.zombieId = zombieId
        this.cached = cached
        this.update()
    }

    protected update(): void {
        const enabled = GameDebugSettings.hdSeedPacketsEnabled
        if (enabled && !this.rendered) {
            const root = uiNode({ name: 'RenderedZombie', parent: this.node, active: false }).node
            this.rendered = root
            void this.load(root).catch(error => {
                if (isValid(root, true)) console.error('[Almanac] Failed to render zombie portrait', this.zombieId, error)
            })
        }
        this.cached.active = !enabled
        if (this.rendered) this.rendered.active = enabled && this.ready
    }

    private async load(root: Node): Promise<void> {
        const { content, catalog } = await loadEntityDisplayAssets()
        if (!isValid(root, true)) return
        const definition = catalog.zombies[this.zombieId]
        const portrait = definition?.portrait
        if (!portrait) throw new Error(`Zombie portrait is not installed: ${this.zombieId}`)
        // The existing portrait mask starts two pixels inside the 76x76 frame.
        root.setPosition(portrait.offset[0] - 2, 2 - portrait.offset[1])
        root.setScale(portrait.scale, portrait.scale, 1)
        const players = await loadDisplayParts(root, portrait.parts ?? definition.parts, content)
        if (!players) return
        if (definition.motion === 'bungee') {
            const cord = await new SpriteRepository(content.registry, content.loader).load('pvz:bungeecord')
            if (!isValid(root, true)) return
            const body = players.get('body')!.getTrackNode('Zombie_bungi_body')!
            // Compensate for the original body's -18 + 15 X offset: 35 - (-3) = 38.
            drawBungeeCord(root, cord, 38, body.position.y)
        }
        // Loading leaves every player paused on its first frame.
        this.ready = true
        this.update()
    }
}
