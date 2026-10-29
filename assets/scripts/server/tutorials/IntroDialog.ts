import { LevelStateResource } from '../components'
import { TutorialResource } from '../levelState'
import type { TutorialScript } from './index'

/** Data-driven first-adventure dialogue; the normal chooser/intro resumes after the last line. */
export const introDialog: TutorialScript = {
    blocksIntro: true,
    initialize(world, firstAdventure) {
        if (!firstAdventure) return
        const tutorial = world.resources.get(TutorialResource)
        tutorial.step = 'dave-opening'
        tutorial.dialogIndex = world.resources.get(LevelStateResource).definition.introDialog![0]
    },
    advanceDialog(world) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.dialogIndex === undefined) return
        const sequence = world.resources.get(LevelStateResource).definition.introDialog!
        tutorial.dialogIndex = sequence[sequence.indexOf(tutorial.dialogIndex) + 1]
        if (tutorial.dialogIndex === undefined) tutorial.step = 'complete'
    },
}
