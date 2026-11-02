import type { Node } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import type { LevelRulePresentation, PresentationSound } from '@/shared/content/presentation'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { LevelAudioPresenter } from '../LevelAudioPresenter'
import type { LevelRuleView, LevelRuleViewContext } from './LevelRuleView'

/** `rules["pvz:bowling"]`: the red line, shown in play and during Dave's lines `dialogs`, and the sound of a bowled nut. */
interface BowlingPresentation {
    readonly stripe: { readonly sprite: string; readonly offset: readonly [number, number]; readonly dialogs: readonly number[] }
    /** Board::MouseDownWithPlant: SOUND_BOWLING with every nut put down. */
    readonly plantedSounds: readonly PresentationSound[]
}

function parseConfig(config: LevelRulePresentation): BowlingPresentation {
    const stripe = config.stripe as Record<string, unknown> | undefined
    if (typeof stripe !== 'object' || stripe === null || typeof stripe.sprite !== 'string' || !Array.isArray(stripe.offset) ||
        stripe.offset.length !== 2 || stripe.offset.some(value => !Number.isFinite(value)) ||
        !Array.isArray(stripe.dialogs) || stripe.dialogs.some(id => !Number.isInteger(id)) || !Array.isArray(config.plantedSounds)) {
        throw new TypeError('rules.pvz:bowling is invalid')
    }
    return config as unknown as BowlingPresentation
}

/** The server's `lineColumn`: nuts go no further right. */
function lineColumn(snapshot: WorldSnapshot, kind: string): number {
    return (snapshot.extensions[kind] as { lineColumn: number }).lineColumn
}

/** Wall-nut Bowling on the client: the red line over the lawn and its planting limit. */
export class BowlingView implements LevelRuleView {
    private constructor(
        private readonly config: BowlingPresentation,
        private readonly kind: string,
        private readonly stripe: Node,
        private readonly audio: LevelAudioPresenter,
    ) {}

    static async create(context: LevelRuleViewContext): Promise<BowlingView> {
        const { content, ground, initial } = context
        const config = parseConfig(context.config)
        const board = content.definitions.boards[content.levels.levels[initial.levelId].board]
        const sprite = await new SpriteRepository(content.registry, content.loader).load(config.stripe.sprite)
        const [x, y] = config.stripe.offset
        const stripe = context.ui.image(ground.parent!, sprite, {
            x: board.origin.x + (lineColumn(initial, context.kind) + 1) * board.cell.width + x - 400, y: board.origin.y + y - 300,
        }).node
        stripe.setSiblingIndex(ground.getSiblingIndex() + 1)
        const view = new BowlingView(config, context.kind, stripe, context.audio)
        view.sync(initial, [])
        return view
    }

    sync(snapshot: WorldSnapshot, events: readonly ServerEvent[]): void {
        for (const event of events) if (event.type === 'plantPlaced') this.audio.sounds(this.config.plantedSounds)
        const dialog = snapshot.extensions['pvz:dialog'] as { index: number } | undefined
        if (this.stripe.isValid) this.stripe.active = snapshot.phase === 'gameplay' || snapshot.tutorial.step === 'complete' ||
            dialog !== undefined && this.config.stripe.dialogs.includes(dialog.index)
    }

    canPlantAt(snapshot: WorldSnapshot, _row: number, column: number): boolean { return column <= lineColumn(snapshot, this.kind) }
}
