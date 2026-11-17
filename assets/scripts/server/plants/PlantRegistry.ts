import { BASE_MOD_ID, baseQualified, Registry } from '@/shared/mod'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { Plant, type PlantConfig, PlantFactory } from './Plant'
import { BowlingNut } from './BowlingNut'
import { Chomper } from './Chomper'
import { FusePlant } from './FusePlant'
import { GraveBuster } from './GraveBuster'
import { HypnoShroom } from './HypnoShroom'
import { PotatoMine } from './PotatoMine'
import { Producer } from './Producer'
import { ScaredyShroom } from './ScaredyShroom'
import { Shooter } from './Shooter'
import { SunShroom } from './SunShroom'
import { WallNut } from './WallNut'

/** A kind of plant: Plant or a class that extends it. */
export type PlantClass = (new (typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) => Plant)
    & { readonly config: readonly PlantConfig[], validate(definition: PlantDefinition, id: string): void }

/** A kind as it is kept: how a plant of it is made for a type, the definition fields it takes, what else it checks. Its class is not frozen. */
interface PlantKind {
    create(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions): Plant
    config: readonly PlantConfig[]
    validate(definition: PlantDefinition, id: string): void
}

/**
 * The kinds of plants, by the gameplay definition's `kind` (`plant` when it names none), as the client's views are by
 * the presentation's `view` (PlantViewRegistry), one class to each view class: the base's, and a Mod's, which extends
 * one of them.
 */
export class PlantRegistry {
    private readonly kinds = new Registry<PlantKind>('plant kind')

    constructor() {
        const kinds: Record<string, PlantClass> = {
            plant: Plant, shooter: Shooter, scaredyshroom: ScaredyShroom, producer: Producer, sunshroom: SunShroom, fuse: FusePlant,
            potatomine: PotatoMine, chomper: Chomper, gravebuster: GraveBuster, hypnoshroom: HypnoShroom, wallnut: WallNut, bowlingnut: BowlingNut,
        }
        for (const [kind, Type] of Object.entries(kinds)) this.register(BASE_MOD_ID, kind, Type)
    }

    register(ownerId: string, kind: string, Type: PlantClass): void {
        if (typeof Type !== 'function' || Type !== Plant && !(Type.prototype instanceof Plant)) throw new Error(`Invalid plant kind: ${kind}`)
        this.kinds.register(baseQualified(kind), {
            create: (typeId, definition, definitions) => new Type(typeId, definition, definitions),
            config: [...Type.config],
            validate: (definition, id) => Type.validate(definition, id),
        }, ownerId)
    }

    has(kind: string): boolean { return this.kinds.has(baseQualified(kind)) }

    /**
     * Every type's kind is installed and takes its type's own fields: a type has those its kind takes (`config`: a
     * shooter's `shooter`), and none another kind takes; and what else its kind checks (validate).
     */
    validate(definitions: GameplayDefinitions): void {
        const taken = new Set([...this.kinds.entries()].flatMap(([, kind]) => kind.config))
        for (const [id, definition] of Object.entries(definitions.plants)) {
            const kind = this.kindOf(id, definition)
            for (const field of taken) {
                const has = definition[field] !== undefined, takes = kind.config.includes(field)
                if (has !== takes) throw new Error(takes ? `${id} of kind ${definition.kind} needs ${field}` : `${id}.${field} needs a kind that takes it`)
            }
            kind.validate(definition, id)
        }
    }

    /** How a level's world makes its plants, each of its type's kind (PlantFactoryResource). */
    factory(definitions: GameplayDefinitions): PlantFactory {
        return new PlantFactory(typeId => {
            const definition = definitions.plants[typeId]
            if (!definition) throw new Error(`Unknown plant: ${typeId}`)
            return this.kindOf(typeId, definition).create(typeId, definition, definitions)
        })
    }

    freeze(): void { this.kinds.freeze() }

    checkpoint(): () => void { return this.kinds.checkpoint() }

    private kindOf(typeId: string, definition: PlantDefinition): PlantKind {
        const kind = this.kinds.get(baseQualified(definition.kind ?? 'plant'))
        if (!kind) throw new Error(`Plant kind is not installed: ${typeId}`)
        return kind
    }
}
