import type { World } from '@/ecs/index'
import { PlantComponent } from '../state/components'
import { TutorialResource } from '../state/levelState'
import type { TutorialScript } from './index'
import { daveLines } from './introDialog'

/** CutScene::StartLevelIntro on Wall-nut Bowling: 2400 on a first adventure, else 2411; 2410 once the lawn is dug clean. */
const OPENING = daveLines(2400, 2406), REPEAT = daveLines(2411, 2415), AFTER_DIG = daveLines(2410, 2415)

/** CutScene::AdvanceCrazyDaveDialog and Board's three shovel tutorial states, with the shovel up from the intro. */
export const shovelTutorial: TutorialScript = {
    blocksStart: true,
    blocksIntro: true,
    alwaysActive: true,
    dave: true,
    toolsInIntro: true,
    // Challenge::InitLevel puts three peashooters on a first adventure's lawn to dig up.
    introPlants: [{ seedId: 'pvz:peashooter', row: 1, column: 5 }, { seedId: 'pvz:peashooter', row: 2, column: 7 }, { seedId: 'pvz:peashooter', row: 3, column: 6 }],
    initialize(world, firstAdventure) {
        const tutorial = world.resources.get(TutorialResource)
        tutorial.step = firstAdventure ? 'dave-opening' : 'dave-bowling'
        tutorial.dialogIndex = (firstAdventure ? OPENING : REPEAT)[0]
    },
    advanceDialog(world) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.dialogIndex === undefined) return
        const opening = tutorial.step === 'dave-opening'
        const sequence = opening ? OPENING : tutorial.firstAdventure ? AFTER_DIG : REPEAT
        tutorial.dialogIndex = sequence[sequence.indexOf(tutorial.dialogIndex) + 1]
        if (tutorial.dialogIndex === undefined) tutorial.step = opening ? 'shovel-pickup' : 'complete'
    },
    toolSelected(world) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'shovel-pickup') tutorial.step = 'shovel-dig'
    },
    plantRemoved(world) {
        const tutorial = world.resources.get(TutorialResource)
        if (!tutorial.step.startsWith('shovel-')) return
        if ([...world.query(PlantComponent)].length) tutorial.step = 'shovel-keep-digging'
        else {
            tutorial.step = 'dave-bowling'
            tutorial.dialogIndex = AFTER_DIG[0]
        }
    },
    seedCanceled(world: World) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'shovel-dig') tutorial.step = 'shovel-pickup'
    },
    canSelectTool(world, toolId) {
        return toolId === 'pvz:shovel' && world.resources.get(TutorialResource).step.startsWith('shovel-')
    },
}
