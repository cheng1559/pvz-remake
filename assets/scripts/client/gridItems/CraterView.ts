import { type Node, Sprite, type SpriteFrame } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { uiNode } from '@/client/view/uiNode'
import { animateCurve } from '@/shared/content/animation'
import { CRATER_FADE_TICKS, CRATER_WORN_TICKS } from '@/shared/content/craters'
import { cellPosition } from '@/shared/content/gameplay'
import { gridItemCell } from '@/shared/content/presentation'
import type { CraterSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { GridItemView, GridItemViewContext } from './GridItemView'

/** IMAGE_CRATER and IMAGE_CRATER_FADING: a day crater's picture and a night one's, side by side. */
const COLUMNS = 2

/**
 * A crater (GridItem::DrawCrater): IMAGE_CRATER, or IMAGE_CRATER_FADING once it has less than CRATER_WORN_TICKS left,
 * the day's picture or the night's, fading out over its last CRATER_FADE_TICKS; its corner its presentation's `cell`
 * from its cell's. One of the zombies' side is turned round within its width. Off the board (a packet's picture) it is
 * a fresh day crater.
 */
export class CraterView implements GridItemView {
    private picture?: { node: Node, sprite: Sprite }
    private frames?: { fresh: SpriteFrame, worn: SpriteFrame }
    private shown = ''
    private width = 0

    constructor(private readonly context: GridItemViewContext) {}

    async initialize(): Promise<void> {
        const [fresh, worn] = await Promise.all(['pvz:crater', 'pvz:crater_fading'].map(id => modResources.sprite(id)))
        if (!this.context.node.isValid) return
        this.frames = { fresh, worn }
        this.width = fresh.originalSize.width / COLUMNS
        const node = uiNode({ name: 'Crater', parent: this.context.node, anchor: { x: 0, y: 1 }, sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false } })
        this.picture = { node: node.node, sprite: node.sprite! }
        this.show(false, false)
    }

    sync(crater: CraterSnapshot, world: WorldSnapshot): void {
        const { node, content } = this.context
        const board = content.definitions.boards[content.levels.levels[world.levelId].board]
        const cell = cellPosition(board, crater.row, crater.column), [cornerX, cornerY] = gridItemCell(content.presentation, crater.typeId)
        const mirrored = crater.team === 'zombies'
        node.setPosition(cell.x + cornerX - 400 + (mirrored ? this.width : 0), 300 - cell.y - cornerY)
        node.setScale(mirrored ? -1 : 1, 1, 1)
        this.show(crater.ticks < CRATER_WORN_TICKS, !!board.night)
        uiNode({ node, opacity: crater.ticks < CRATER_FADE_TICKS ? animateCurve(CRATER_FADE_TICKS, 0, crater.ticks, 255, 0) : 255 })
    }

    private show(worn: boolean, night: boolean): void {
        const key = `${worn}|${night}`
        if (!this.picture?.node.isValid || !this.frames || key === this.shown) return
        this.shown = key
        const atlas = worn ? this.frames.worn : this.frames.fresh, height = atlas.originalSize.height
        this.picture.sprite.spriteFrame = getAtlasFrame(atlas, night ? 1 : 0, this.width, height, COLUMNS)
    }

    /** All it draws is in its node. */
    destroy(): void {}
}
