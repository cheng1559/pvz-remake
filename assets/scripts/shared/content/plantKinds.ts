import { BASE_MOD_ID } from '@/shared/mod'

/** The scaredy-shroom's fright (Plant::UpdateScaredyShroom's mState): calm, ducking, hidden, coming back up. */
/**
 * Plant::UpdateAbilities and UpdateReanim: the ticks a plant takes to wake, stretching down and up on its base as it
 * does: the last 70 of the 100 a coffee bean sets on mWakeUpCounter, whose first 30 are the bean's own.
 */
export const PLANT_WAKE_TICKS = 70

export type ScaredyShroomPhase = 'calm' | 'lowering' | 'scared' | 'raising'

export const SCAREDY_SHROOM_PHASES: readonly ScaredyShroomPhase[] = ['calm', 'lowering', 'scared', 'raising']

/** The sun-shroom's growth (Plant::UpdateSunShroom). */
export type SunShroomPhase = 'small' | 'growing' | 'big'

export const SUN_SHROOM_PHASES: readonly SunShroomPhase[] = ['small', 'growing', 'big']

/** The potato mine's arming (Plant::UpdatePotato). */
export type PotatoMinePhase = 'arming' | 'rising' | 'armed'

export const POTATO_MINE_PHASES: readonly PotatoMinePhase[] = ['arming', 'rising', 'armed']

/** The chomper's bite (Plant::UpdateChomper's mState). */
export type ChomperPhase = 'ready' | 'biting' | 'got-one' | 'missed' | 'digesting' | 'swallowing'

export const CHOMPER_PHASES: readonly ChomperPhase[] = ['ready', 'biting', 'got-one', 'missed', 'digesting', 'swallowing']

/** The grave buster's meal (Plant::UpdateGraveBuster). */
export type GraveBusterPhase = 'landing' | 'eating'

export const GRAVE_BUSTER_PHASES: readonly GraveBusterPhase[] = ['landing', 'eating']

/**
 * The base's kinds of plants (PlantDefinition.kind, `plant` when omitted, and the presentation's `view` of the same name:
 * server/plants and client/plants have a class of each), with the phases each one's animation goes by, in the order it
 * comes to them: what a plant of the kind may name in its animation's `phases`, `blink.phases` and `offBoard.phase`
 * and its presentation's `packet.phase` and `shadow.phases`, and what its snapshot's `own.phase` is. A Mod's kind
 * names its own phases.
 */
export const PLANT_KIND_PHASES: Readonly<Record<string, readonly string[]>> = {
    plant: [],
    shooter: [],
    scaredyshroom: SCAREDY_SHROOM_PHASES,
    producer: [],
    sunshroom: SUN_SHROOM_PHASES,
    fuse: ['fuse'],
    potatomine: POTATO_MINE_PHASES,
    chomper: CHOMPER_PHASES,
    gravebuster: GRAVE_BUSTER_PHASES,
    hypnoshroom: [],
    wallnut: [],
    bowlingnut: [],
}

/**
 * What any plant is in, whatever its kind (Plant.state): in play (`idle`), or crushed by a mower and squashed until it
 * is gone (`mowered`), when nothing on the lawn takes it for a plant (the original's Plant::NotOnGround).
 */
export type PlantState = 'idle' | 'mowered'

export const PLANT_STATES: readonly PlantState[] = ['idle', 'mowered']

/** A phase a plant's animation goes by (PLANT_KIND_PHASES). */
export type PlantPhase = string

/** The phases of a kind (a definition's `kind`, `plant` without one); none to check against for a Mod's kind. */
export function plantKindPhases(kind: string | undefined): readonly string[] | undefined {
    const id = kind ?? 'plant', base = `${BASE_MOD_ID}:`
    return PLANT_KIND_PHASES[id.startsWith(base) ? id.slice(base.length) : id]
}
