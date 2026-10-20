import type { Node, SpriteFrame } from 'cc'
import type { LevelDefinition } from '@/shared/content/gameplay'
import type { LoadedContent } from './LevelView'
import type { LevelSlots } from './LevelSlots'
import type { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import { getBoardPresentation } from './boards/DayBoard'
import { adventure12Presentation } from './adventure/Adventure12'
import { adventure11Presentation } from './adventure/Adventure11'

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
}

export interface LevelPresentation {
    createIntro(context: LevelIntroContext): Promise<LevelIntro>
    advice: Readonly<Record<string, string>>
    guideSeed?: string
    seedGuideSteps: readonly string[]
    lawnGuideSteps: readonly string[]
}

const PRESENTATIONS: Record<string, LevelPresentation> = {
    'pvz:adventure-1-1': adventure11Presentation,
    'pvz:adventure-1-2': adventure12Presentation,
}

export function getLevelPresentation(level: LevelDefinition) {
    // Level-specific scripts are selected by the backend's tutorial ID, not the scene runner.
    const presentation = PRESENTATIONS[level.tutorial]
    if (!presentation) throw new Error(`Level presentation is not installed: ${level.tutorial}`)
    return { ...presentation, board: getBoardPresentation(level.board) }
}
