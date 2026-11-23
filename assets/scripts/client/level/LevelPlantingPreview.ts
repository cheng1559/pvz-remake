import { Color, Graphics, type Node } from 'cc'
import type { PlantPreview } from '@/client/hud/PlantPreview'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { ZombiePreview } from '@/client/hud/ZombiePreview'
import { packetSubject, plantDefinition } from '@/client/plants/definitions'
import { gridItemCell } from '@/shared/content/presentation'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { cellPosition, type LevelDefinition } from '@/shared/content/gameplay'
import { seedTeam } from '@/shared/content/teams'
import type { GridItemSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { cellOutOfPlay, type LevelPlantingRule, plantingRefusal, snapshotLawn } from '@/shared/content/planting'
import { boardCell, plantingCell } from './LevelGeometry'
import type { Content } from './LevelStage'

/** The pointer's place in the held preview, which sits this far left of and above it. */
const CURSOR_PREVIEW_POINTER_X = 35
const CURSOR_PREVIEW_POINTER_Y = 60
/** The zombie in hand and over its cell (see zombiePreview). */
const CURSOR_ZOMBIE = { x: CURSOR_PREVIEW_POINTER_X - 50, y: -(CURSOR_PREVIEW_POINTER_Y - 90), scale: 1, from: 'reanim' as const }
const GRID_ZOMBIE = { x: -30, y: 30, scale: 1, from: 'zombie' as const }

/** Its nodes: what is held at the pointer, its translucent copy over the cell, the mobile row and column guide. */
export interface LevelPlantingPreviewNodes {
    readonly cursorPreview: Node
    readonly gridPreview: Node
    readonly mobileGridGuide: Node
    readonly cursorPlant: PlantPreview
    readonly gridPlant: PlantPreview
}

/**
 * CursorObject and CursorPreview: the seed in hand at the pointer (a plant, a zombie or a grave) and where it would go,
 * over the cell it may be put down in; on mobile the cell's row and column light up instead.
 */
export class LevelPlantingPreview {
    private mobileGuideCell = -1
    /** A grave or crater seed's previews, by what it puts down (gridItemPreview). */
    private readonly gridItemPreviews = new Map<GridItemSnapshot['typeId'], { cursor: Node, grid: Node }>()
    private zombiePreviews?: { cursor: ZombiePreview, grid: ZombiePreview }

    constructor(
        private readonly content: Content,
        private readonly level: LevelDefinition,
        private readonly nodes: LevelPlantingPreviewNodes,
        /** The level rule's share of Board::CanPlantAt (its view's, made after the HUD). */
        private readonly rule?: () => LevelPlantingRule | undefined,
    ) {}

    hide(): void {
        this.nodes.cursorPreview.active = false
        this.nodes.gridPreview.active = false
    }

    /** Board::OffsetYForPlanting for the seed being planted; a zombie seed's cell is the pointer's. */
    pointerOffsetY(seedId: string): number {
        const seed = this.content.definitions.seeds[seedId]
        return seed.kind === 'plant' ? plantDefinition(this.content.presentation, seed.id).pointerOffsetY ?? 0 : 0
    }

    sync(snapshot: WorldSnapshot, pointer: { x: number, y: number } | undefined): void {
        const { cursorPreview, gridPreview, mobileGridGuide, cursorPlant, gridPlant } = this.nodes
        const mobile = GameDebugSettings.isMobileMode()
        mobileGridGuide.active = false
        const seed = snapshot.result === 'playing' && snapshot.cursor.mode === 'seed' && pointer !== undefined
        cursorPreview.active = seed
        if (!pointer || snapshot.result !== 'playing' || (!seed && !(mobile && snapshot.cursor.mode === 'tool'))) {
            gridPreview.active = false
            return
        }
        const board = this.content.definitions.boards[this.level.board]
        const seedDefinition = snapshot.cursor.mode === 'seed' ? this.content.definitions.seeds[snapshot.cursor.seedId] : undefined
        const plantSeed = seedDefinition?.kind === 'plant' ? seedDefinition : undefined
        const plantId = plantSeed?.id
        // A held packet of the other side from its seed's own puts down what faces the other way.
        const mirrored = snapshot.cursor.mode === 'seed' && snapshot.cursor.team !== undefined
        const zombieId = seedDefinition?.kind === 'zombie' ? seedDefinition.id : undefined
        // A grave or crater seed puts down that thing of a cell.
        const gridItem = seedDefinition ? packetSubject(this.content.presentation, seedDefinition).gridItem : undefined
        cursorPlant.node.active = gridPlant.node.active = zombieId === undefined && gridItem === undefined
        for (const [typeId, previews] of this.gridItemPreviews) previews.cursor.active = previews.grid.active = typeId === gridItem
        if (gridItem !== undefined) {
            const [cornerX] = gridItemCell(this.content.presentation, gridItem)
            // A packet of the other side turns it round, as its packet does: a grave's and a crater's right edges both
            // come to 82 (86 wide from 4 left of the cell, 90 from 8 left).
            for (const node of Object.values(this.gridItemPreview(gridItem))) {
                node.setScale(mirrored ? -1 : 1, 1, 1)
                node.setPosition(mirrored ? 82 : cornerX, node.position.y)
            }
        }
        if (zombieId !== undefined || this.zombiePreviews) {
            // Put down facing right, the zombie stands its own `facingRightOffsetX` further (see ZombieDefinition).
            const facingRightOffsetX = zombieId === undefined ? undefined : this.content.definitions.zombies[zombieId].facingRightOffsetX
            // Plant::DrawSeedType draws some further off in hand (the dancers), and could draw one smaller: the cached
            // frame's Reanim origin is 40 into it at its size.
            const held = zombieId === undefined ? undefined : this.content.presentation.zombies[zombieId]?.held
            const heldScale = held?.scale ?? 1
            const inHand = held ? { ...CURSOR_ZOMBIE, x: CURSOR_ZOMBIE.x + held.x - 40 * (1 - heldScale), y: CURSOR_ZOMBIE.y - held.y + 40 * (1 - heldScale), scale: heldScale } : CURSOR_ZOMBIE
            const { cursor, grid } = this.zombiePreview
            for (const [preview, placement] of [[cursor, inHand], [grid, GRID_ZOMBIE]] as const) {
                preview.setZombie(zombieId)
                preview.setMirrored(mirrored)
                preview.setPlacement({ ...placement, facingRightOffsetX })
            }
        }
        const presentation = plantId ? plantDefinition(this.content.presentation, plantId) : undefined
        // Board::PlantingPixelToGridX and PlantingPixelToGridY, where LevelInputPresenter puts the seed down; a tool's cell is the pointer's.
        const cell = snapshot.cursor.mode === 'seed'
            ? plantingCell(board, pointer.x, pointer.y + this.pointerOffsetY(snapshot.cursor.seedId)) : boardCell(board, pointer.x, pointer.y)
        const { row, column } = cell ?? { row: -1, column: -1 }
        if (plantId) {
            for (const preview of [cursorPlant, gridPlant]) {
                preview.setPlant(plantId)
                preview.setMirrored(mirrored)
            }
        }
        // Board::CanPlantAt, as the server decides it; a mobile tool lights any cell in play.
        const lawn = snapshotLawn(this.content.definitions, this.level, snapshot, this.rule?.())
        const valid = cell !== undefined && (seedDefinition && snapshot.cursor.mode === 'seed'
            ? !plantingRefusal(lawn, seedDefinition, snapshot.cursor.team ?? seedTeam(seedDefinition), row, column)
            : !cellOutOfPlay(lawn, row, column))
        if (plantId || zombieId !== undefined || gridItem !== undefined) {
            cursorPreview.setPosition(pointer.x - CURSOR_PREVIEW_POINTER_X, -pointer.y + CURSOR_PREVIEW_POINTER_Y)
            gridPreview.active = valid && !mobile
            const cell = cellPosition(board, row, column)
            if (valid && !mobile) gridPreview.setPosition(cell.x, -(cell.y + (presentation?.drawHeightOffset ?? 0)))
        } else gridPreview.active = false
        if (valid && mobile) {
            mobileGridGuide.active = true
            const cell = row * board.columns + column
            if (cell !== this.mobileGuideCell) {
                this.mobileGuideCell = cell
                const graphics = mobileGridGuide.getComponent(Graphics)!
                graphics.clear()
                graphics.fillColor = new Color(255, 255, 255, 72)
                const at = cellPosition(board, row, column), bottom = cellPosition(board, board.rows, 0).y
                graphics.fillRect(board.origin.x, -(at.y + board.cell.height), board.columns * board.cell.width, board.cell.height)
                graphics.fillRect(at.x, -bottom, board.cell.width, board.rows * board.cell.height)
            }
        }
    }

    /**
     * A grave or crater seed's grave or crater in hand and translucent over its cell, as it will stand (a grave once
     * risen): its corner its presentation's `cell` from the cell's (GridItem::DrawGraveStone, DrawCrater), from the cell
     * the pointer is over.
     */
    private gridItemPreview(typeId: GridItemSnapshot['typeId']): { cursor: Node, grid: Node } {
        let previews = this.gridItemPreviews.get(typeId)
        if (!previews) {
            const { cursorPreview, gridPreview } = this.nodes, [cornerX, cornerY] = gridItemCell(this.content.presentation, typeId)
            const cursor = SeedPacketRenderer.drawGridItem(cursorPreview, cursorPreview.layer, typeId, cornerX, cornerY, 1)
            const grid = SeedPacketRenderer.drawGridItem(gridPreview, gridPreview.layer, typeId, cornerX, cornerY, 1)
            uiNode({ node: grid, opacity: 100 })
            this.gridItemPreviews.set(typeId, previews = { cursor, grid })
        }
        return previews
    }

    /**
     * A zombie seed's zombie in hand and translucent over its cell: Plant::DrawSeedType's cached zombie, whose Reanim
     * origin sits at (40, 40) in the frame. On an I, Zombie level CursorObject::Draw puts the frame at (-90, -130) from
     * the pointer (Update's -25 and -35, then -10 and -10 - 15, then -55 and -70), so the origin is (-50, -90) from it.
     * Over the cell the zombie stands where it will be put down (Challenge::IZombiePlaceZombie: 30 left of and above the
     * cell), drawn as the level draws it; CursorPreview::Draw's (-49, -78) is 6 off that, which is taken as a bug.
     */
    private get zombiePreview(): { cursor: ZombiePreview, grid: ZombiePreview } {
        if (!this.zombiePreviews) {
            const cursor = uiNode({ name: 'CursorZombie', parent: this.nodes.cursorPreview }).node.addComponent(ZombiePreview).initialize(CURSOR_ZOMBIE)
            const grid = uiNode({ name: 'GridZombie', parent: this.nodes.gridPreview }).node.addComponent(ZombiePreview).initialize(GRID_ZOMBIE)
            grid.setColor(new Color(255, 255, 255, 100))
            this.zombiePreviews = { cursor, grid }
        }
        return this.zombiePreviews
    }
}
