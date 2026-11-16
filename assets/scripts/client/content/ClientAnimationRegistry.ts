import type { AnimationDefinition, PresentationDefinitions } from '@/shared/content/presentation'
export type { ClientAnimationClip } from '@/shared/content/presentation'

/** The plants' and zombies' clips, as parsePresentationDefinitions checked them, with what they leave out filled in. */
export class ClientAnimationRegistry {
    private readonly values = new Map<string, AnimationDefinition>()
    private frozen = false

    constructor(readonly definitions: PresentationDefinitions) {
        const { plants, zombies } = definitions
        for (const [target, definition] of Object.entries({ ...plants, ...zombies })) {
            if (definition.clips) this.values.set(target, cloneDefinition(definition.clips))
        }
    }

    /** A plant's or a zombie's clips, by its id. */
    resolve(target: string): AnimationDefinition {
        const value = this.values.get(target)
        if (!value) throw new Error(`unknown client animation target: ${target}`)
        return value
    }

    freeze(): void {
        if (this.frozen) return
        this.frozen = true
        for (const definition of this.values.values()) {
            for (const value of Object.values(definition)) Object.freeze(value)
            Object.freeze(definition)
        }
    }
}

/** A copy of the clips with what they leave out filled in (rateScale 1). */
function cloneDefinition(value: AnimationDefinition): AnimationDefinition {
    return Object.fromEntries(Object.entries(value).map(([slot, animation]) => [slot, { rateScale: 1, ...animation }]))
}
