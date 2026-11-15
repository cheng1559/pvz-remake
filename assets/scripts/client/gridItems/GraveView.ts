import { Mask, type Node, Sprite, type UITransform } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { easeInOut } from '@/client/view/GameScreenMath'
import { uiNode } from '@/client/view/uiNode'
import { renderOrder } from '@/shared/content/renderOrder'
import { graveRiseCounter, type GraveSnapshot, type WorldSnapshot } from '@/shared/protocol/index'
import type { GridItemView, GridItemViewContext } from './GridItemView'

/** The atlases' looks a row. */
const COLUMNS = 5
const ROWS = 4

/** FloatRoundToInt: halves round away from zero. */
const roundToInt = (value: number) => value > 0 ? Math.trunc(value + 0.5) : Math.trunc(value - 0.5)

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
        const { node, item, content } = this.context, grave = item as Partial<GraveSnapshot>
        const sprites = new SpriteRepository(content.registry, content.loader)
        const [stones, mounds] = await Promise.all(['tombstones', 'tombstone_mounds'].map(id => sprites.load(`pvz:${id}`)))
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
        this.show()
    }

    /** The grave off the board: risen. */
    show(): void {
        this.layout(Infinity, 0)
    }

    sync(grave: GraveSnapshot, world: WorldSnapshot): void {
        const { stage, node, content } = this.context
        if (!stage || !node.isValid) return
        const board = content.definitions.boards[content.levels.levels[world.levelId].board]
        // Its corner is 4 left of and 9 above its cell, by the cell's own offset; one of the plants' side is turned
        // round within its own width, as that side's plants and zombies are.
        const mirrored = grave.team === 'plants'
        node.setPosition(board.origin.x + grave.column * board.cell.width + grave.offsetX - 4 - 400 + (mirrored ? this.width : 0),
            300 - board.origin.y - grave.row * board.cell.height - grave.offsetY + 9)
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
        const board = content.definitions.boards[content.levels.levels[world.levelId].board], { layer, offset } = content.presentation.gridItems[grave.typeId]
        stage!.particle('pvz:gravestonerise', board.origin.x + grave.column * board.cell.width + 14 + grave.offsetX,
            board.origin.y + grave.row * board.cell.height + 78 + grave.offsetY, renderOrder(layer, grave.row, offset) + 1)
        void SoundSystem.playFoley(SoundEffect.DirtRise)
    }

    /** `counter`: how far it has risen (mGridItemCounter); `eaten`: pixels a grave buster has eaten off the stone's top. */
    private layout(counter: number, eaten: number): void {
        if (!this.stone?.isValid) return
        // PvzpAnimateCurve rounds each step to whole units (FloatRoundToInt).
        const position = roundToInt(easeInOut(0, 100, counter, 1000, 0))
        const stoneHeight = roundToInt(easeInOut(0, 1000, position, this.height, 0))
        const bottomClip = roundToInt(easeInOut(0, 50, position, 0, 14))
        const dirtHeight = roundToInt(easeInOut(500, 1000, position, this.height, 0))
        // Its node is at the top left of the whole stone; what has risen stands on the stone's bottom.
        this.stone.setPosition(0, stoneHeight - eaten - this.height)
        this.stoneSize.setContentSize(this.stoneSize.width, Math.max(0, stoneHeight - bottomClip - eaten))
        // Keep the image in place while its clip loses the eaten top.
        this.stone.children[0].setPosition(0, eaten)
        this.dirt.setPosition(0, dirtHeight - this.height)
        this.dirtSize.setContentSize(this.dirtSize.width, dirtHeight)
    }
}
