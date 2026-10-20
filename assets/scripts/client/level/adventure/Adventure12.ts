import type { LevelPresentation } from '../LevelPresentation'
import { AdventureIntro } from './AdventureIntro'

export const adventure12Presentation: LevelPresentation = {
    createIntro: context => AdventureIntro.create(context, {
        sod: 'pvz:sod3row', x: 15, y: 149, existingMiddleRow: true, rolls: [-102, 111],
    }),
    guideSeed: 'pvz:sunflower',
    seedGuideSteps: ['pick-sunflower'],
    lawnGuideSteps: [],
    advice: {},
}
