import { modResources } from '@/client/content/ModResources'
import { Mask, type Node, Sprite, type UITransform } from 'cc'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { animateCurve } from '@/shared/content/animation'
import { uiNode } from '@/client/view/uiNode'
import type { GraveSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { graveRiseCounter } from '@/shared/content/graves'
import { cellPosition } from '@/shared/content/gameplay'
import type { GridItemView, GridItemViewContext } from './GridItemView'

/** The atlases' looks a row. */
const COLUMNS = 5
const ROWS = 4

/**
 * A grave (GridItem::DrawGraveStone): its stone and its mound of dirt, each shown from the original atlases as far as
 * it has risen. On the board it rises with the level's intro, or from when it was put down, and a grave buster on it
 * eats it from the top; off the board (a packet's picture) it stands risen.
 */
export class GraveView implements GridItemView {
    /** How far the level's own graves had risen when last shown; undefined before the first time. */
    private ticks?: number
    /** It came with the level, as it started or was loaded, not put down during play: it shows none of its coming. */
    private readonly cameWithLevel: boolean

    private width = 0
    private height = 0
    private stone!: Node
    private dirt!: Node
    private stoneSize!: UITransform
    private dirtSize!: UITransform

    constructor(private readonly context: GridItemViewContext) {
        this.cameWithLevel = context.stage?.quiet ?? true
    }

    async initialize(): Promise<void> {
        const { node, item } = this.context, grave = item as Partial<GraveSnapshot>
        const [stones, mounds] = await Promise.all(['pvz:tombstones', 'pvz:tombstone_mounds'].map(id => modResources.sprite(id)))
        const width = this.width = stones.originalSize.width / COLUMNS, height = this.height = stones.originalSize.height / ROWS
        // The first row of the lawn has its own stones, and one grave of a level the special ones.
        const cell = (grave.row === 0 ? 1 : grave.special ? 0 : 2 + (grave.variant ?? 0) % 2) * COLUMNS + (grave.variant ?? 0) % COLUMNS
        const part = (name: string, atlas: typeof stones) => {
            const clip = uiNode({ name, parent: node, anchor: { x: 0, y: 1 }, size: { width, height }, mask: Mask.Type.GRAPHICS_RECT })
            uiNode({ name: 'Image', parent: clip.node, anchor: { x: 0, y: 1 }, sprite: {
                frame: getAtlasFrame(atlas, cell, width, height, COLUMNS), sizeMode: Sprite.SizeMode.RAW, trim: false,
            } })
            return clip
        }
        const stone = part('Stone', stones), dirt = part('Dirt', mounds)
        this.stone = stone.node
        this.dirt = dirt.node
        this.stoneSize = stone.transform
        this.dirtSize = dirt.transform
        // Risen, as it stands off the board, until the board's frame (sync) says how far.
        this.layout(Infinity, 0)
    }

    /** All it draws is in its node. */
    destroy(): void {}

    sync(grave: GraveSnapshot, world: WorldSnapshot): void {
        const { stage, node, content } = this.context
        if (!stage || !node.isValid) return
        const board = content.definitions.boards[content.levels.levels[world.levelId].board]
        // Its corner is 4 left of and 9 above its cell, by the cell's own offset; one of the plants' side is turned
        // round within its own width, as that side's plants and zombies are.
        const mirrored = grave.team === 'plants', cell = cellPosition(board, grave.row, grave.column)
        node.setPosition(cell.x + grave.offsetX - 4 - 400 + (mirrored ? this.width : 0), 300 - cell.y - grave.offsetY + 9)
        node.setScale(mirrored ? -1 : 1, 1, 1)
        // The level's own graves rise from the intro's grave tick; a level in play has them risen.
        const ticks = world.phase === 'gameplay' || stage.intro.complete ? Infinity : stage.intro.elapsedTicks - (stage.intro.graveStartTick ?? 0)
        // CutScene::AddGraveStoneParticles, once, as the rise starts; and a grave put down in play, unless it is
        // already past its rise tick. A board shown quietly (a save put back) takes the state without them.
        const first = this.ticks === undefined
        if (!stage.quiet && (grave.riseAtTick === undefined ? !first && this.ticks! < 0 && ticks >= 0
            : first && !this.cameWithLevel && world.gameplayTick <= grave.riseAtTick)) this.riseEffects(grave, world)
        this.ticks = ticks
        // mGridItemCounter starts at -delay and Board::UpdateGridItems counts it in the tick the rise starts; a grave
        // added in play starts counting the tick after (graveRiseCounter).
        const counter = graveRiseCounter(grave, world.gameplayTick) ?? ticks + 1 - grave.riseDelay
        const buster = world.plants.find(plant => plant.row === grave.row && plant.column === grave.column && plant.ability?.state === 'eating')
        const total = buster && content.definitions.plants[buster.typeId]?.graveBuster?.eatTicks
        this.layout(counter, buster && total ? this.eaten(buster.ability!.ticks, total) : 0)
    }

    /** GridItem::DrawGraveStone: pixels a grave buster has eaten off the stone's top, `ticks` left of the `total` it eats for. */
    protected eaten(ticks: number, total: number): number {
        return Math.trunc(10 + 30 * (1 - ticks / total))
    }

    /** GridItem::AddGraveStoneParticles. */
    private riseEffects(grave: GraveSnapshot, world: WorldSnapshot): void {
        const { stage, content } = this.context
        const cell = cellPosition(content.definitions.boards[content.levels.levels[world.levelId].board], grave.row, grave.column)
        stage!.particle('pvz:gravestonerise', cell.x + 14 + grave.offsetX, cell.y + 78 + grave.offsetY, stage!.gridItemOrder(grave.typeId, grave.row) + 1)
        void SoundSystem.playFoley(SoundEffect.DirtRise)
    }

    /** `counter`: how far it has risen (mGridItemCounter); `eaten`: pixels a grave buster has eaten off the stone's top. */
    private layout(counter: number, eaten: number): void {
        if (!this.stone?.isValid) return
        // PvzpAnimateCurve rounds each step to whole units.
        const position = animateCurve(0, 100, counter, 1000, 0, 'ease-in-out')
        const stoneHeight = animateCurve(0, 1000, position, this.height, 0, 'ease-in-out')
        const bottomClip = animateCurve(0, 50, position, 0, 14, 'ease-in-out')
        const dirtHeight = animateCurve(500, 1000, position, this.height, 0, 'ease-in-out')
        // Its node is at the top left of the whole stone; what has risen stands on the stone's bottom.
        this.stone.setPosition(0, stoneHeight - eaten - this.height)
        this.stoneSize.setContentSize(this.stoneSize.width, Math.max(0, stoneHeight - bottomClip - eaten))
        // Keep the image in place while its clip loses the eaten top.
        this.stone.children[0].setPosition(0, eaten)
        this.dirt.setPosition(0, dirtHeight - this.height)
        this.dirtSize.setContentSize(this.dirtSize.width, dirtHeight)
    }
}
