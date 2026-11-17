import { BASE_MOD_ID, baseQualified, Registry } from '@/shared/mod'
import type { GameplayDefinitions, GameplayLevels, ProjectileDefinition } from '@/shared/content/gameplay'
import { MowingProjectile } from './MowingProjectile'
import { Projectile, type ProjectileConfig, ProjectileFactory } from './Projectile'

/** A kind of projectile: Projectile or a class that extends it. */
export type ProjectileClass = (new (typeId: string, definition: ProjectileDefinition, motion: string) => Projectile)
    & { readonly config: readonly ProjectileConfig[], validate(definition: ProjectileDefinition, id: string): void }

/** A kind as it is kept: how a projectile of it is made, the definition fields it takes, what else it checks, whether it mows. Its class is not frozen. */
interface ProjectileKind {
    create(typeId: string, definition: ProjectileDefinition, motion: string): Projectile
    config: readonly ProjectileConfig[]
    validate(definition: ProjectileDefinition, id: string): void
    /** A MowingProjectile, which a level's mowers may set off as. */
    mows: boolean
}

/**
 * The kinds of projectiles, by the gameplay definition's `kind` (`projectile` when it names none), as the client's views
 * are by the presentation's `view` (ProjectileViewRegistry), one class to each view class: the base's, and a Mod's,
 * which extends one of them.
 */
export class ProjectileRegistry {
    private readonly kinds = new Registry<ProjectileKind>('projectile kind')

    constructor() {
        const kinds: Record<string, ProjectileClass> = { projectile: Projectile, mowing: MowingProjectile }
        for (const [kind, Type] of Object.entries(kinds)) this.register(BASE_MOD_ID, kind, Type)
    }

    register(ownerId: string, kind: string, Type: ProjectileClass): void {
        if (typeof Type !== 'function' || Type !== Projectile && !(Type.prototype instanceof Projectile)) throw new Error(`Invalid projectile kind: ${kind}`)
        this.kinds.register(baseQualified(kind), {
            create: (typeId, definition, motion) => new Type(typeId, definition, motion),
            config: [...Type.config],
            validate: (definition, id) => Type.validate(definition, id),
            mows: Type === MowingProjectile || Type.prototype instanceof MowingProjectile,
        }, ownerId)
    }

    has(kind: string): boolean { return this.kinds.has(baseQualified(kind)) }

    /**
     * Every type's kind is installed and takes its type's own fields: a type has those its kind takes (`config`: a
     * projectile's `damage`), and none another kind takes, nor does a plant that fires it have its own of them; what
     * else its kind checks (validate); and each level's mowers are of a kind that mows.
     */
    validate(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        const taken = new Set([...this.kinds.entries()].flatMap(([, kind]) => kind.config))
        for (const [id, definition] of Object.entries(definitions.projectiles)) {
            const kind = this.kindOf(id, definition)
            for (const field of taken) {
                const has = definition[field] !== undefined, takes = kind.config.includes(field)
                if (has !== takes) throw new Error(takes ? `${id} of kind ${definition.kind ?? 'projectile'} needs ${field}` : `${id}.${field} needs a kind that takes it`)
            }
            kind.validate(definition, id)
        }
        for (const [id, plant] of Object.entries(definitions.plants)) {
            const fired = plant.shooter?.projectile, overrides = plant.shooter?.overrides
            if (fired === undefined || !overrides) continue
            const kind = this.kindOf(fired, definitions.projectiles[fired])
            for (const field of taken) {
                if (overrides[field] !== undefined && !kind.config.includes(field)) {
                    throw new Error(`plants.${id}.shooter.projectile.${field} is not supported: ${fired} is of kind ${definitions.projectiles[fired].kind}`)
                }
            }
        }
        // A row's mower sets off as the level's `lawnMower` (Mower.setOff).
        for (const [id, level] of Object.entries(levels.levels)) {
            if (!this.kindOf(level.lawnMower, definitions.projectiles[level.lawnMower]).mows) throw new Error(`levels.${id}.lawnMower must be a projectile that mows`)
        }
    }

    /** How a level's world makes its projectiles, each of its type's kind (ProjectileFactoryResource). */
    factory(definitions: GameplayDefinitions): ProjectileFactory {
        return new ProjectileFactory((typeId, definition, motion) => {
            const type = definitions.projectiles[typeId]
            if (!type) throw new Error(`Unknown projectile: ${typeId}`)
            return this.kindOf(typeId, type).create(typeId, definition, motion)
        })
    }

    freeze(): void { this.kinds.freeze() }

    checkpoint(): () => void { return this.kinds.checkpoint() }

    private kindOf(typeId: string, definition: ProjectileDefinition): ProjectileKind {
        const kind = this.kinds.get(baseQualified(definition.kind ?? 'projectile'))
        if (!kind) throw new Error(`Projectile kind is not installed: ${typeId}`)
        return kind
    }
}
