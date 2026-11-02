import type { Node, SpriteFrame } from 'cc'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import type { LoadedContent } from './LevelView'
import type { LevelSlots } from './LevelSlots'
import type { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import { getBoardPresentation } from './boards/definitions'
import { AdventureIntro } from './adventure/AdventureIntro'
import type { UI } from '@/client/ui/UI'

export interface LevelIntroContext {
    ui: UI
    previewTooltipSurface?: Node
    /**
     * Board::UpdateToolTip and SeedChooserScreen::MouseDown: once the almanac is unlocked, the zombies it lists (by
     * `nameKey`) say "click to view" and open it on a click.
     */
    almanacZombies?: readonly string[]
    openAlmanacZombie?: (nameKey: string) => void
    /** LawnApp::CanShowAlmanac || CanShowStore: the chooser shows its Almanac or Store button. */
    chooserPages?: boolean
    content: LoadedContent
    level: LevelDefinition
    slots: LevelSlots
    board: Node
    entityLayer: Node
    bank: Node
    houseName: Node
    audio: LevelAudioPresenter
    mowerShadow: SpriteFrame
    entityNodes: () => Iterable<Node>
    previewZombies: Readonly<Record<string, number>>
    hasOpeningDialog?: boolean
}

export interface LevelPresentation {
    createIntro(context: LevelIntroContext): Promise<LevelIntro>
    advice: Readonly<Record<string, string>>
    adviceDuringIntro?: boolean
    adviceStyle?: 'hint-stay' | 'tutorial-level1-stay'
    guideSeed?: string
    seedGuideSteps: readonly string[]
    seedGuideArrow?: false
    lawnGuideSteps: readonly string[]
}

export function getLevelPresentation(level: LevelDefinition, definitions: PresentationDefinitions, levelId: string) {
    const presentation = definitions.levels?.[levelId]
    if (!presentation) throw new Error(`Level presentation is not installed: ${levelId}`)
    const board = getBoardPresentation(definitions, level.board)
    return { ...presentation, board: { ...board, music: presentation.music ?? board.music },
        createIntro: (context: LevelIntroContext) => AdventureIntro.create(context, presentation.intro) }
}
