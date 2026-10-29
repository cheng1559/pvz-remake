import { Mask, Node, Sprite, type UITransform } from 'cc'
import type { BoardDefinition } from '@/shared/content/gameplay'
import type { GraveSnapshot, WorldSnapshot } from '@/shared/protocol'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { uiNode } from '@/client/view/uiNode'
import { easeInOut } from '@/client/view/GameScreenMath'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { LoadedContent } from './LevelView'
import type { LevelEntityRenderer } from './LevelEntityRenderer'

// Original graves use 301003 and plants start at 302000; row offsets of 10000 map to 10 here.
const GRAVE_ROW_ORDER = (301003 - 302000) / 1000

interface GraveView {
    grave: GraveSnapshot
    root: Node
    delay: number
    stone: Node
    dirt: Node
    stoneSize: UITransform
    dirtSize: UITransform
    /** Pixels eaten off the stone's top by a grave buster. */
    eaten: number
}

/** GridItem::DrawGraveStone: reveal the stone and dirt separately from the original atlas. */
export class LevelGraves {
    /** Ticks since the graves started rising, from the last sync; undefined before the first. */
    private ticks?: number
    private readonly views = new Map<string, GraveView>()

    private constructor(private height: number, private renderer: LevelEntityRenderer, private board: BoardDefinition,
        private createView: (grave: GraveSnapshot) => GraveView) {}

    static async create(parent: Node, renderer: LevelEntityRenderer, content: LoadedContent,
        board: BoardDefinition, graves: GraveSnapshot[]): Promise<LevelGraves> {
        const sprites = new SpriteRepository(content.registry, content.loader)
        const [stones, mounds] = await Promise.all(['tombstones', 'tombstone_mounds'].map(id => sprites.load(`pvz:${id}`)))
        const width = stones.originalSize.width / 5, height = stones.originalSize.height / 4
        const createView = (grave: GraveSnapshot): GraveView => {
            const root = uiNode({ name: 'Grave', parent, position: {
                x: board.origin.x + grave.column * board.cell.width + grave.offsetX - 4 - 400,
                y: 300 - board.origin.y - grave.row * board.cell.height - height - grave.offsetY + 9,
            } }).node
            renderer.addScenery(root, grave.row * 10 + GRAVE_ROW_ORDER)
            const atlasRow = grave.row === 0 ? 1 : 2 + grave.variant % 2
            const cell = atlasRow * 5 + grave.variant % 5
            const create = (name: string, atlas: typeof stones) => {
                const clip = uiNode({ name, parent: root, anchor: { x: 0, y: 1 }, size: { width, height }, mask: Mask.Type.GRAPHICS_RECT })
                uiNode({ name: 'Image', parent: clip.node, anchor: { x: 0, y: 1 }, sprite: {
                    frame: getAtlasFrame(atlas, cell, width, height, 5), sizeMode: Sprite.SizeMode.RAW, trim: false,
                } })
                return clip
            }
            const stone = create('Stone', stones), dirt = create('Dirt', mounds)
            return { grave, root, delay: grave.riseDelay, stone: stone.node, dirt: dirt.node, stoneSize: stone.transform, dirtSize: dirt.transform, eaten: 0 }
        }
        const result = new LevelGraves(height, renderer, board, createView)
        result.updateGraves(graves)
        return result
    }

    private updateGraves(graves: GraveSnapshot[]): void {
        const keys = new Set(graves.map(grave => `${grave.row}:${grave.column}`))
        for (const [key, view] of this.views) if (!keys.has(key)) {
            view.root.destroy()
            this.views.delete(key)
        }
        for (const grave of graves) {
            const key = `${grave.row}:${grave.column}`
            if (!this.views.has(key)) this.views.set(key, this.createView(grave))
        }
    }

    /** `ticks` counts from when the graves start rising, so it is negative before then. A restore passes `effects: false`. */
    sync(ticks: number, effects = true): void {
        // CutScene::AddGraveStoneParticles, once, when the rise starts.
        if (effects && this.ticks !== undefined && this.ticks < 0 && ticks >= 0) {
            for (const { grave } of this.views.values()) {
                this.renderer.spawnBoardParticle('pvz:gravestonerise',
                    this.board.origin.x + grave.column * this.board.cell.width + 14 + grave.offsetX,
                    this.board.origin.y + grave.row * this.board.cell.height + 78 + grave.offsetY, grave.row * 10 + GRAVE_ROW_ORDER + 0.001)
                void SoundSystem.playFoley(SoundEffect.DirtRise)
            }
        }
        this.ticks = ticks
        this.layout()
    }

    /** A grave buster eats its grave from the top (GridItem::DrawGraveStone), and the grave goes once eaten. */
    syncWorld(snapshot: WorldSnapshot, eatTicks: (typeId: string) => number | undefined): void {
        this.updateGraves(snapshot.graves ?? [])
        for (const view of this.views.values()) {
            const { grave } = view
            const buster = snapshot.plants.find(plant => plant.row === grave.row && plant.column === grave.column && plant.ability?.state === 'eating')
            const total = buster && eatTicks(buster.typeId)
            view.eaten = buster && total ? 10 + 30 * (1 - buster.ability!.ticks / total) : 0
        }
        this.layout()
    }

    private layout(): void {
        const ticks = this.ticks ?? 0
        for (const view of this.views.values()) {
            if (!view.stone.isValid) continue
            const position = easeInOut(0, 100, ticks - view.delay, 1000, 0)
            const stoneHeight = easeInOut(0, 1000, position, this.height, 0)
            const bottomClip = easeInOut(0, 50, position, 0, 14)
            const dirtHeight = easeInOut(500, 1000, position, this.height, 0)
            view.stone.setPosition(0, stoneHeight - view.eaten)
            view.stoneSize.setContentSize(view.stoneSize.width, Math.max(0, stoneHeight - bottomClip - view.eaten))
            // Keep the image in place while its clip loses the eaten top.
            view.stone.children[0].setPosition(0, view.eaten)
            view.dirt.setPosition(0, dirtHeight)
            view.dirtSize.setContentSize(view.dirtSize.width, dirtHeight)
        }
    }
}
