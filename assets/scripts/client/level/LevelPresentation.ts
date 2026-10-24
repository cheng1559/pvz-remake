import type { Node, SpriteFrame } from 'cc'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import type { LoadedContent } from './LevelView'
import type { LevelSlots } from './LevelSlots'
import type { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import { getBoardPresentation } from './boards/definitions'
import { AdventureIntro } from './adventure/AdventureIntro'

export interface LevelIntroContext {
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
}

export interface LevelPresentation {
    createIntro(context: LevelIntroContext): Promise<LevelIntro>
    advice: Readonly<Record<string, string>>
    adviceDuringIntro?: boolean
    adviceStyle?: 'hint-stay' | 'tutorial-level1-stay'
    guideSeed?: string
    seedGuideSteps: readonly string[]
    lawnGuideSteps: readonly string[]
}

export function getLevelPresentation(level: LevelDefinition, definitions: PresentationDefinitions, levelId: string) {
    const presentation = definitions.levels?.[levelId]
    if (!presentation) throw new Error(`Level presentation is not installed: ${levelId}`)
    const board = getBoardPresentation(definitions, level.board)
    return { ...presentation, board: { ...board, music: presentation.music ?? board.music },
        createIntro: (context: LevelIntroContext) => AdventureIntro.create(context, presentation.intro) }
}
