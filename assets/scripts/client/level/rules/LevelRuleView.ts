import type { Node } from 'cc'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LevelRulePresentation, PresentationDefinitions } from '@/shared/content/presentation'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol'
import type { UI } from '@/client/ui/UI'
import type { LevelAudioPresenter } from '../LevelAudioPresenter'
import type { LoadedContent } from '../LevelView'

/** What a level rule's view is built with. */
export interface LevelRuleViewContext {
    readonly kind: string
    /** The rule's presentation (`rules[kind]`); empty when it has none. */
    readonly config: LevelRulePresentation
    readonly content: LoadedContent
    readonly ui: UI
    readonly initial: WorldSnapshot
    readonly audio: LevelAudioPresenter
    /** The plant and tool cursor layer, the sodded lawn under the entities, and the seed bank with its height. */
    readonly cursorLayer: Node
    readonly ground: Node
    readonly bank: Node
    readonly bankHeight: number
}

/**
 * The client side of a level rule (the server's LevelRuleDefinition): what the mode draws and how it takes input.
 * The generic level view only calls these.
 */
export interface LevelRuleView {
    setPointer?(pointer?: { x: number; y: number }): void
    sync?(snapshot: WorldSnapshot, events: readonly ServerEvent[], introComplete: boolean): void
    /** Challenge::MouseDown: a click that hit no item while nothing is held; true sends it as a `boardClick`. */
    click?(snapshot: WorldSnapshot, point: { x: number; y: number }, touch: boolean): boolean
    /** Board::CanPlantAt as the rule narrows it, for the planting preview. */
    canPlantAt?(snapshot: WorldSnapshot, row: number, column: number): boolean
}

export type LevelRuleViewFactory = (context: LevelRuleViewContext) => Promise<LevelRuleView>

const factories = new Map<string, LevelRuleViewFactory>()

/** Rules without a view play with the generic level view only. */
export function registerLevelRuleView(kind: string, factory: LevelRuleViewFactory): void {
    if (factories.has(kind)) throw new Error(`level rule view ${kind} is already registered`)
    factories.set(kind, factory)
}

export function createLevelRuleView(context: LevelRuleViewContext): Promise<LevelRuleView> | undefined {
    return factories.get(context.kind)?.(context)
}

/** The presentation of the level's rule, for the generic parts (`graveRise`, `itemPadding`). */
export function levelRulePresentation(definitions: PresentationDefinitions, level: LevelDefinition): LevelRulePresentation | undefined {
    return level.rules ? definitions.rules?.[level.rules.kind] : undefined
}
