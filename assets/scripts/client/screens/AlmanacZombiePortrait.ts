import { _decorator, Component, isValid, Node } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { drawBungeeCord, loadDisplayParts, loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

/** Static Reanim portraits use the same placement as the original cached atlas. */
@_decorator.ccclass('AlmanacZombiePortrait')
export class AlmanacZombiePortrait extends Component {
    ready: Promise<void> = Promise.resolve()
    private zombieId = 0
    private loadCached!: (root: Node) => Promise<void>
    private rendered: Node | null = null
    private hd?: boolean

    initialize(zombieId: number, loadCached: (root: Node) => Promise<void>): void {
        this.zombieId = zombieId
        this.loadCached = loadCached
        this.update()
    }

    protected update(): void {
        const enabled = GameDebugSettings.hdSeedPacketsEnabled
        if (this.hd === enabled) return
        this.hd = enabled
        if (this.rendered) { this.rendered.active = false; this.rendered.destroy() }
        const root = uiNode({ name: enabled ? 'RenderedZombie' : 'CachedZombie', parent: this.node, active: false }).node
        this.rendered = root
        this.ready = (enabled ? this.load(root) : this.loadCached(root)).then(() => {
            if (isValid(root, true) && root === this.rendered) root.active = true
        })
        void this.ready.catch(error => {
            if (isValid(root, true) && root === this.rendered) console.error('[Almanac] Failed to load zombie portrait', this.zombieId, error)
        })
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
        const cordDefinition = content.presentation.almanac.cords[this.zombieId]
        if (cordDefinition) {
            const cord = await new SpriteRepository(content.registry, content.loader).load(cordDefinition.sprite)
            if (!isValid(root, true)) return
            const body = players.get('body')!.getTrackNode(cordDefinition.track)!
            const scale = definition.scale ?? 1
            const origin = content.presentation.almanac.zombieOrigin
            const drawX = (definition.drawOffset?.[0] ?? 0) + origin.offset[0] + origin.scaleOffset[0] * (1 - scale)
            drawBungeeCord(root, cord, cordDefinition.x - drawX, body.position.y, cordDefinition.height)
        }
    }
}
