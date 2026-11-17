import { BASE_MOD_ID } from '@/shared/mod'

/**
 * The base's kinds of plants (PlantDefinition.kind, `plant` when omitted, and the presentation's `view` of the same name:
 * server/plants and client/plants have a class of each), with the states each one's animation goes by, in the order it
 * comes to them: what a plant of the kind may name in its animation's `states`, `blink.states` and `offBoard.state`
 * and its presentation's `packet.state` and `shadow.states`, and what its snapshot's `own.state` is. A Mod's kind
 * names its own states.
 */
export const PLANT_KIND_STATES: Readonly<Record<string, readonly string[]>> = {
    plant: [],
    shooter: [],
    scaredyshroom: ['calm', 'lowering', 'scared', 'raising'],
    producer: [],
    sunshroom: ['small', 'growing', 'big'],
    fuse: ['fuse'],
    potatomine: ['arming', 'rising', 'armed'],
    chomper: ['ready', 'biting', 'got-one', 'missed', 'digesting', 'swallowing'],
    gravebuster: ['landing', 'eating'],
    hypnoshroom: [],
    wallnut: [],
    bowlingnut: [],
}

/** A state a plant's animation goes by (PLANT_KIND_STATES). */
export type PlantState = string

/** The states of a kind (a definition's `kind`, `plant` without one); none to check against for a Mod's kind. */
export function plantKindStates(kind: string | undefined): readonly string[] | undefined {
    const id = kind ?? 'plant', base = `${BASE_MOD_ID}:`
    return PLANT_KIND_STATES[id.startsWith(base) ? id.slice(base.length) : id]
}
