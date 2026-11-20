import { registerLevelRuleView } from './LevelRuleView'
import { WhackAZombieView } from './WhackAZombieView'

/** The base game's rule views; a Mod registers its own with registerLevelRuleView. */
registerLevelRuleView('pvz:whack-a-zombie', context => WhackAZombieView.create(context))

export { createLevelRuleView, levelRulePresentation, registerLevelRuleView } from './LevelRuleView'
export type { LevelRuleView } from './LevelRuleView'
