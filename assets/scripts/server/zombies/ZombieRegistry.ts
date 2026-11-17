import { BASE_MOD_ID, baseQualified, Registry } from '@/shared/mod'
import type { GameplayDefinitions, ZombieDefinition } from '@/shared/content/gameplay'
import { checkKindFields } from '../registry/kindFields'
import { Zombie, type ZombieConfig, ZombieFactory } from './Zombie'
import { Dancer } from './Dancer'
import { FlagZombie } from './FlagZombie'
import { Newspaper } from './Newspaper'
import { PoleVaulter } from './PoleVaulter'

/** A kind of zombie: Zombie or a class that extends it. */
export type ZombieClass = (new (typeId: string, definition: ZombieDefinition, definitions: GameplayDefinitions) => Zombie)
    & { readonly config: readonly ZombieConfig[], validate(definition: ZombieDefinition, id: string): void }

/** A kind as it is kept: how a zombie of it is made for a type, and the definition fields it takes. Its class is not frozen. */
interface ZombieKind {
    create(typeId: string, definition: ZombieDefinition, definitions: GameplayDefinitions): Zombie
    config: readonly ZombieConfig[]
    validate(definition: ZombieDefinition, id: string): void
}

/**
 * The kinds of zombies, by the gameplay definition's `kind` (`zombie` when it names none), as the client's views are
 * by the presentation's `view` (ZombieViewRegistry): the base's, and a Mod's, which extends one of them.
 */
export class ZombieRegistry {
    private readonly kinds = new Registry<ZombieKind>('zombie kind')

    constructor() {
        const kinds: Record<string, ZombieClass> = { zombie: Zombie, flag: FlagZombie, polevaulter: PoleVaulter, newspaper: Newspaper, dancer: Dancer }
        for (const [kind, Type] of Object.entries(kinds)) this.register(BASE_MOD_ID, kind, Type)
    }

    register(ownerId: string, kind: string, Type: ZombieClass): void {
        if (typeof Type !== 'function' || Type !== Zombie && !(Type.prototype instanceof Zombie)) throw new Error(`Invalid zombie kind: ${kind}`)
        this.kinds.register(baseQualified(kind), {
            create: (typeId, definition, definitions) => new Type(typeId, definition, definitions),
            config: [...Type.config],
            validate: (definition, id) => Type.validate(definition, id),
        }, ownerId)
    }

    has(kind: string): boolean { return this.kinds.has(baseQualified(kind)) }

    /**
     * Every type's kind is installed and takes its type's own fields: a type has those its kind takes (`config`: a pole
     * vaulter's `vault`, a Mod kind's of its namespace), and none another kind takes (checkKindFields).
     */
    validate(definitions: GameplayDefinitions): void {
        const taken = new Set([...this.kinds.entries()].flatMap(([, kind]) => kind.config))
        for (const [id, definition] of Object.entries(definitions.zombies)) {
            const kind = this.kindOf(id, definition)
            checkKindFields(id, definition, definition.kind ?? 'zombie', kind.config, taken)
            kind.validate(definition, id)
        }
    }

    /** How a level's world makes its zombies, each of its type's kind (ZombieFactoryResource). */
    factory(definitions: GameplayDefinitions): ZombieFactory {
        return new ZombieFactory(typeId => {
            const definition = definitions.zombies[typeId]
            if (!definition) throw new Error(`Unknown zombie: ${typeId}`)
            return this.kindOf(typeId, definition).create(typeId, definition, definitions)
        })
    }

    freeze(): void { this.kinds.freeze() }

    checkpoint(): () => void { return this.kinds.checkpoint() }

    private kindOf(typeId: string, definition: ZombieDefinition): ZombieKind {
        const kind = this.kinds.get(baseQualified(definition.kind ?? 'zombie'))
        if (!kind) throw new Error(`Zombie kind is not installed: ${typeId}`)
        return kind
    }
}
