import { TutorialResource } from '../state/levelState'
import type { TutorialScript } from './index'

/** Dave's lines `first` to `last`: CutScene::StartLevelIntro starts at one and AdvanceCrazyDaveText plays on. */
export function daveLines(first: number, last: number): number[] {
    return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

/** A first adventure's opening dialogue before the seed chooser; the intro resumes after its last line. */
export function introDialog(first: number, last: number): TutorialScript {
    const lines = daveLines(first, last)
    return {
        blocksIntro: true,
        dave: true,
        initialize(world, firstAdventure) {
            if (!firstAdventure) return
            const tutorial = world.resources.get(TutorialResource)
            tutorial.step = 'dave-opening'
            tutorial.dialogIndex = lines[0]
        },
        advanceDialog(world) {
            const tutorial = world.resources.get(TutorialResource)
            if (tutorial.dialogIndex === undefined) return
            tutorial.dialogIndex = lines[lines.indexOf(tutorial.dialogIndex) + 1]
            if (tutorial.dialogIndex === undefined) tutorial.step = 'complete'
        },
    }
}
