import { Color, Graphics, type Node } from 'cc'
import type { PlantPreview } from '@/client/hud/PlantPreview'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { ZombiePreview } from '@/client/hud/ZombiePreview'
import { plantDefinition } from '@/client/plants/definitions'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { LevelDefinition } from '@/shared/content/gameplay'
import { seedTeam } from '@/shared/content/teams'
import type { WorldSnapshot } from '@/shared/protocol/index'
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
    private gravePreviews?: { cursor: Node, grid: Node }
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
        const graveSeed = seedDefinition?.kind === 'grave'
        cursorPlant.node.active = gridPlant.node.active = zombieId === undefined && !graveSeed
        if (graveSeed || this.gravePreviews) {
            const { cursor, grid } = this.gravePreview
            cursor.active = grid.active = graveSeed
            // A packet of the plants' side turns the grave round, as its packet does.
            for (const node of [cursor, grid]) {
                node.setScale(mirrored ? -1 : 1, 1, 1)
                node.setPosition(mirrored ? 82 : -4, node.position.y)
            }
        }
        if (zombieId !== undefined || this.zombiePreviews) {
            // Put down facing right, the zombie stands its own `facingRightOffsetX` further (see ZombieDefinition).
            const facingRightOffsetX = zombieId === undefined ? undefined : this.content.definitions.zombies[zombieId].facingRightOffsetX
            const { cursor, grid } = this.zombiePreview
            for (const [preview, placement] of [[cursor, CURSOR_ZOMBIE], [grid, GRID_ZOMBIE]] as const) {
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
        if (plantId || zombieId !== undefined || graveSeed) {
            cursorPreview.setPosition(pointer.x - CURSOR_PREVIEW_POINTER_X, -pointer.y + CURSOR_PREVIEW_POINTER_Y)
            gridPreview.active = valid && !mobile
            if (valid && !mobile) gridPreview.setPosition(board.origin.x + column * board.cell.width,
                -(board.origin.y + row * board.cell.height + (presentation?.drawHeightOffset ?? 0)))
        } else gridPreview.active = false
        if (valid && mobile) {
            mobileGridGuide.active = true
            const cell = row * board.columns + column
            if (cell !== this.mobileGuideCell) {
                this.mobileGuideCell = cell
                const graphics = mobileGridGuide.getComponent(Graphics)!
                graphics.clear()
                graphics.fillColor = new Color(255, 255, 255, 72)
                graphics.fillRect(board.origin.x, -(board.origin.y + (row + 1) * board.cell.height), board.columns * board.cell.width, board.cell.height)
                graphics.fillRect(board.origin.x + column * board.cell.width, -(board.origin.y + board.rows * board.cell.height), board.cell.width, board.rows * board.cell.height)
            }
        }
    }

    /**
     * A grave seed's grave in hand and translucent over its cell, as it will stand once risen: its corner 4 left of and
     * 9 above the cell (GridItem::DrawGraveStone), from the cell the pointer is over.
     */
    private get gravePreview(): { cursor: Node, grid: Node } {
        if (!this.gravePreviews) {
            const { cursorPreview, gridPreview } = this.nodes
            const cursor = SeedPacketRenderer.drawGrave(cursorPreview, cursorPreview.layer, -4, -9, 1)
            const grid = SeedPacketRenderer.drawGrave(gridPreview, gridPreview.layer, -4, -9, 1)
            uiNode({ node: grid, opacity: 100 })
            this.gravePreviews = { cursor, grid }
        }
        return this.gravePreviews
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
