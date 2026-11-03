import type { Node } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import type { UI } from '@/client/ui/UI'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LevelPresentationDefinition } from '@/shared/content/presentation'
import type { WorldSnapshot } from '@/shared/protocol'
import type { LoadedContent } from './LevelView'

/** The level's `plantingLine`: the red line over the lawn (Wall-nut Bowling's stripe) and its limit on the planting preview. */
export class PlantingLineView {
    private constructor(
        private readonly column: number,
        private readonly stripe: Node | undefined,
        private readonly dialogs: readonly number[],
    ) {}

    /** `ground`: the sodded lawn, which the stripe lies just over. A level without the line's look still limits planting. */
    static async create(context: {
        readonly content: LoadedContent
        readonly ui: UI
        readonly ground: Node
        readonly level: LevelDefinition
        readonly look: LevelPresentationDefinition['plantingLine']
        readonly initial: WorldSnapshot
    }): Promise<PlantingLineView | undefined> {
        const { content, ui, ground, level, look, initial } = context
        if (!level.plantingLine) return undefined
        let stripe: Node | undefined
        if (look) {
            const board = content.definitions.boards[level.board]
            const sprite = await new SpriteRepository(content.registry, content.loader).load(look.sprite)
            const [x, y] = look.offset
            stripe = ui.image(ground.parent!, sprite, {
                x: board.origin.x + (level.plantingLine.column + 1) * board.cell.width + x - 400, y: board.origin.y + y - 300,
            }).node
            stripe.setSiblingIndex(ground.getSiblingIndex() + 1)
        }
        const view = new PlantingLineView(level.plantingLine.column, stripe, look?.dialogs ?? [])
        view.sync(initial)
        return view
    }

    sync(snapshot: WorldSnapshot): void {
        const dialog = snapshot.extensions['pvz:dialog'] as { index: number } | undefined
        if (this.stripe?.isValid) this.stripe.active = snapshot.phase === 'gameplay' || snapshot.tutorial.step === 'complete' ||
            dialog !== undefined && this.dialogs.includes(dialog.index)
    }

    /** Board::CanPlantAt: nothing past the line, as the server checks. */
    canPlantAt(column: number): boolean { return column <= this.column }
}
