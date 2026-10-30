import type { World } from '@/ecs/index'
import { LevelStateResource, PlantComponent, SeedBankResource } from '../state/components'
import { TutorialResource } from '../state/levelState'
import type { TutorialScript } from './index'

/** CutScene::AdvanceCrazyDaveDialog and Board's three shovel tutorial states. */
export const shovelTutorial: TutorialScript = {
    blocksStart: true,
    blocksIntro: true,
    alwaysActive: true,
    initialize(world, firstAdventure) {
        const tutorial = world.resources.get(TutorialResource)
        tutorial.step = firstAdventure ? 'dave-opening' : 'dave-bowling'
        const config = world.resources.get(LevelStateResource).definition.shovelTutorial!
        tutorial.dialogIndex = (firstAdventure ? config.opening : config.repeat)[0]
    },
    advanceDialog(world) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.dialogIndex === undefined) return
        const config = world.resources.get(LevelStateResource).definition.shovelTutorial!
        const opening = tutorial.step === 'dave-opening'
        const sequence = opening ? config.opening : tutorial.firstAdventure ? config.afterDig : config.repeat
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
            tutorial.dialogIndex = world.resources.get(LevelStateResource).definition.shovelTutorial!.afterDig[0]
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
