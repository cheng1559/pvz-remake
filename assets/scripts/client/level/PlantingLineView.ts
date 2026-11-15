import { modResources } from '@/client/content/ModResources'
import type { Node } from 'cc'
import type { UI } from '@/client/ui/UI'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LevelPresentationDefinition } from '@/shared/content/presentation'
import type { WorldSnapshot } from '@/shared/protocol'
import type { LoadedContent } from './LevelView'

/** The level's `plantingLine` as the red line over the lawn (Wall-nut Bowling's stripe); planting checks it in shared/content/planting. */
export class PlantingLineView {
    private constructor(
        private readonly stripe: Node,
        private readonly dialogs: readonly number[],
    ) {}

    /** `ground`: the sodded lawn, which the stripe lies just over. A line without a look draws nothing. */
    static async create(context: {
        readonly content: LoadedContent
        readonly ui: UI
        readonly ground: Node
        readonly level: LevelDefinition
        readonly look: LevelPresentationDefinition['plantingLine']
        readonly initial: WorldSnapshot
    }): Promise<PlantingLineView | undefined> {
        const { content, ui, ground, level, look, initial } = context
        if (!level.plantingLine || !look) return undefined
        const board = content.definitions.boards[level.board]
        const sprite = await modResources.sprite(look.sprite)
        const [x, y] = look.offset
        const stripe = ui.image(ground.parent!, sprite, {
            x: board.origin.x + (level.plantingLine.column + 1) * board.cell.width + x - 400, y: board.origin.y + y - 300,
        }).node
        stripe.setSiblingIndex(ground.getSiblingIndex() + 1)
        const view = new PlantingLineView(stripe, look.dialogs)
        view.sync(initial)
        return view
    }

    sync(snapshot: WorldSnapshot): void {
        const dialog = snapshot.extensions['pvz:dialog'] as { index: number } | undefined
        if (this.stripe.isValid) this.stripe.active = snapshot.phase === 'gameplay' || snapshot.tutorial.step === 'complete' ||
            dialog !== undefined && this.dialogs.includes(dialog.index)
    }
}
