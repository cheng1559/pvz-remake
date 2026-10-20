import type { LevelPresentation } from '../LevelPresentation'
import { Adventure11Intro } from './Adventure11Intro'

export const adventure11Presentation: LevelPresentation = {
    createIntro: context => Adventure11Intro.create(context),
    seedGuideSteps: ['pick-first-seed', 'pick-second-seed'],
    lawnGuideSteps: ['plant-first-seed', 'plant-second-seed'],
    advice: {
        'pick-first-seed': 'ADVICE_CLICK_SEED_PACKET',
        'plant-first-seed': 'ADVICE_CLICK_ON_GRASS',
        'first-plant-done': 'ADVICE_PLANTED_PEASHOOTER',
        'collect-first-sun': 'ADVICE_CLICK_ON_SUN',
        'collect-more-sun': 'ADVICE_CLICKED_ON_SUN',
        'enough-sun': 'ADVICE_ENOUGH_SUN',
        'pick-second-seed': 'ADVICE_CLICK_PEASHOOTER',
        'plant-second-seed': '',
        complete: 'ADVICE_ZOMBIE_ONSLAUGHT',
    },
}
