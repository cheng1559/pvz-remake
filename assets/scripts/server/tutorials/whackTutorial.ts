import { EconomyStateResource } from '../state/components'
import { TutorialResource } from '../state/levelState'
import { introDialog } from './introDialog'
import type { TutorialScript } from './index'

/** Challenge::WhackAZombieUpdate: once there is sun, wait this long, then flash the packets for this long. */
const BEFORE_PICK_SEED_TICKS = 1500
const PICK_SEED_TICKS = 400

const dialog = introDialog(401, 406)

/**
 * Whack-a-Zombie: a first adventure opens with Dave's lines 401-406 (CutScene::StartLevelIntro). Every game, the first
 * sun starts TUTORIAL_WHACK_A_ZOMBIE_BEFORE_PICK_SEED, then the packets flash (PICK_SEED) until picking one or 400
 * ticks pass (SeedPacket::MouseDown completes it).
 */
export const whackTutorial: TutorialScript = {
    ...dialog,
    alwaysActive: true,
    initialize(world, firstAdventure) { dialog.initialize!(world, firstAdventure) },
    update(world, tick) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step === 'complete' && world.resources.get(EconomyStateResource).sun > 0) {
            tutorial.step = 'whack-before-pick-seed'
            tutorial.promptAtTick = tick + BEFORE_PICK_SEED_TICKS
        } else if (tutorial.promptAtTick !== undefined && tick >= tutorial.promptAtTick) {
            if (tutorial.step === 'whack-before-pick-seed') {
                tutorial.step = 'whack-pick-seed'
                tutorial.promptAtTick = tick + PICK_SEED_TICKS
            } else {
                tutorial.step = 'whack-done'
                tutorial.promptAtTick = undefined
            }
        }
    },
    seedSelected(world) {
        const tutorial = world.resources.get(TutorialResource)
        if (tutorial.step !== 'whack-before-pick-seed' && tutorial.step !== 'whack-pick-seed') return
        tutorial.step = 'whack-done'
        tutorial.promptAtTick = undefined
    },
}
