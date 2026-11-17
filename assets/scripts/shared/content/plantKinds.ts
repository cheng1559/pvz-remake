import { BASE_MOD_ID } from '@/shared/mod'

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

/** A phase a plant's animation goes by (PLANT_KIND_PHASES). */
export type PlantPhase = string

/** The phases of a kind (a definition's `kind`, `plant` without one); none to check against for a Mod's kind. */
export function plantKindPhases(kind: string | undefined): readonly string[] | undefined {
    const id = kind ?? 'plant', base = `${BASE_MOD_ID}:`
    return PLANT_KIND_PHASES[id.startsWith(base) ? id.slice(base.length) : id]
}
