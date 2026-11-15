import { type Node, Sprite } from 'cc'
import { boardToLayer, type Content, type EntityView, type LevelStage, type StageEvent } from '@/client/level/LevelStage'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import type { ProjectilePresentationDefinition } from '@/shared/content/presentation'
import { renderOrder } from '@/shared/content/renderOrder'
import { mirrorX, ZOMBIE_WIDTH } from '@/shared/content/teams'
import type { ProjectileSnapshot } from '@/shared/protocol/index'

/** Projectile::DrawShadow: a thrown projectile's shadow is half its size by this far up, and no smaller above. */
const SHADOW_SHRINK_HEIGHT = 200
/**
 * Projectile::DoImpact: where the splat of a projectile is from its middle, forward and down, by default. Flying into
 * what it hits (`shotOffset`), ahead at its front, as the pea's; coming down (`lobOffset`), where it is. A shot already
 * past the middle of the zombie, this far from its corner, splats as far back.
 */
const SHOT_SPLAT: readonly [number, number] = [35, -2]
const LOB_SPLAT: readonly [number, number] = [0, 0]
const IMPACT_PAST = 60
const ZOMBIE_MIDDLE = 40

/**
 * A projectile as a view shows it: in flight, the server's whole snapshot of it; before it flies (a row's mower, waiting
 * to be set off), its type.
 */
export type ShownProjectile = Partial<ProjectileSnapshot> & Pick<ProjectileSnapshot, 'typeId'>

export interface ProjectileViewContext {
    node: Node
    content: Content
    projectile: ShownProjectile
    /** The board: projectiles are on no other. */
    stage: LevelStage
}

/**
 * A projectile: its picture or its looping animation, turned the way it flies, with what goes with it apart from it
 * so that neither turns as it does: its shadow on the ground and the trail it leaves.
 */
export class ProjectileView implements EntityView<ProjectileSnapshot> {
    /** Its shadow, a node of the board's layer: on the ground under it, drawn with the ground. */
    shadowNode?: Node
    private trail?: ParticlePlayer

    constructor(protected readonly context: ProjectileViewContext) {}

    protected get presentation(): ProjectilePresentationDefinition {
        const { content, projectile: { typeId } } = this.context, presentation = content.presentation.projectiles[typeId]
        if (!presentation) throw new Error(`Projectile presentation is not installed: ${typeId}`)
        return presentation
    }

    /** Its animation with its corner at `at` from the projectile's, playing in a loop; none if the projectile went meanwhile. */
    protected async animate(at: { x: number, y: number }): Promise<ReanimPlayer | undefined> {
        const { node, content } = this.context, reanim = this.presentation.reanim
        if (!reanim) throw new Error(`Projectile animation is not installed: ${this.context.projectile.typeId}`)
        const animation = uiNode({ name: 'ProjectileAnimation', parent: node, position: at, anchor: { x: 0, y: 1 } }).node
        animation.setScale(reanim.scale, reanim.scale, 1)
        const player = animation.addComponent(ReanimPlayer)
        await player.load(reanim.id, content.registry, content.loader)
        if (!node.isValid) return undefined
        player.play({ loop: true, rate: reanim.rate })
        return player
    }

    async initialize(): Promise<void> {
        const { stage, projectile } = this.context, presentation = this.presentation, { assets } = stage, { typeId } = projectile
        if (projectile.entityId === undefined) return this.show()
        if (!await this.picture()) return
        // Its shadow is apart from it, on the ground: its own picture, or the board's plant shadow about a point.
        const frame = presentation.shadow ? assets.projectileShadowFrames[typeId] : presentation.plantShadow ? assets.shadow : undefined
        if (presentation.shadow && !frame) throw new Error(`Projectile shadow is not installed: ${typeId}`)
        if (frame) {
            this.shadowNode = uiNode({ name: 'ProjectileShadow', parent: stage.layer,
                ...(presentation.shadow ? { anchor: { x: 0, y: 1 } } : {}), sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
        }
    }

    /** The projectile as it stands before it flies: its picture where it is. */
    async show(): Promise<void> {
        await this.picture()
    }

    /** Its picture, or its animation playing in a loop; false if the projectile went meanwhile. */
    private async picture(): Promise<boolean> {
        const { node, stage, projectile: { typeId } } = this.context, { reanim } = this.presentation
        if (reanim) return !!await this.animate(reanim)
        const frame = stage.assets.projectileFrames[typeId]
        if (!frame) throw new Error(`Projectile sprite is not installed: ${typeId}`)
        uiNode({ node, anchor: { x: 0, y: 1 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
        return true
    }

    /**
     * The projectile where it flies. One of the zombies' side flies left, mirrored across its hitbox. It points the way
     * it flies (ProjectileSnapshot.facing), turned about its middle.
     */
    sync(projectile: ProjectileSnapshot): void {
        const { node, stage } = this.context, hitbox = stage.content.definitions.projectiles[projectile.typeId]?.hitbox
        const mirror = projectile.team === 'zombies' && hitbox ? 2 * hitbox.x + hitbox.width : 0
        let { x, y } = boardToLayer(projectile.x + mirror, projectile.y), angle = 0
        if (projectile.facing !== undefined && hitbox) {
            // Mirrored, it already points left. The angle is counter-clockwise here, and the middle is from the node's
            // corner, y up.
            angle = (mirror ? Math.PI : 0) - projectile.facing
            const middle = ProjectileView.middle(stage, projectile.typeId)!
            const middleX = (mirror ? -1 : 1) * middle.x, middleY = -middle.y
            const cos = Math.cos(angle), sin = Math.sin(angle)
            x += middleX - (cos * middleX - sin * middleY)
            y += middleY - (sin * middleX + cos * middleY)
        }
        if (node.isValid) {
            node.setPosition(x, y)
            node.angle = angle * 180 / Math.PI
            node.setScale(mirror ? -1 : 1, 1, 1)
        }
        if (!hitbox) return
        // Each of the rest at its offset from the projectile, mirrored across the hitbox of one flying left.
        const { shadow, plantShadow, trail, layer } = this.presentation
        const mirrored = projectile.team === 'zombies', top = boardToLayer(0, projectile.y).y
        const left = (offset: number) => boardToLayer(projectile.x + (mirrored ? 2 * hitbox.x + hitbox.width - offset : offset), 0).x
        const offset = shadow?.offset ?? plantShadow
        // The shadow lies as far down as the projectile flies above the ground, and is smaller the higher it was thrown.
        if (this.shadowNode?.isValid && offset) {
            const scale = (shadow?.scale ?? 1) * SHADOW_SHRINK_HEIGHT / (Math.min(projectile.lift ?? 0, SHADOW_SHRINK_HEIGHT) + SHADOW_SHRINK_HEIGHT)
            this.shadowNode.setPosition(left(offset.x), top - offset.y - (projectile.height ?? 0))
            this.shadowNode.setScale(mirrored ? -scale : scale, scale, 1)
        }
        // The trail leaves from the projectile itself, at its draw order; no save keeps it, so it starts here, again
        // after a load.
        if (trail && node.isValid) {
            if (!this.trail?.isValid) this.trail = ParticlePlayer.spawn({ parent: stage.layer, ...trail, unsaved: true })
            this.trail.node.setPosition(left(trail.x), top + trail.y)
            this.trail.node.setScale(mirrored ? -1 : 1, 1, 1)
            this.trail.renderOrder = renderOrder(layer ?? 'projectile', projectile.row)
        }
    }

    destroy(): void {
        if (this.shadowNode?.isValid) this.shadowNode.destroy()
        // Projectile::Die: its trail stays where it ended, launching no more, until its last particle is gone.
        if (this.trail?.isValid) this.trail.stop()
    }

    /** The middle of a projectile from its corner: of its picture, or of its hitbox for an animated one. It turns about it. */
    static middle(stage: LevelStage, typeId: string): { x: number, y: number } | undefined {
        const picture = stage.assets.projectileFrames[typeId]?.originalSize, hitbox = stage.content.definitions.projectiles[typeId]?.hitbox
        return picture ? { x: picture.width / 2, y: picture.height / 2 } : hitbox && { x: hitbox.x + hitbox.width / 2, y: hitbox.y + hitbox.height / 2 }
    }

    /** Plant::Fire: the sound of what is fired. */
    static readonly fired: StageEvent = (stage, event) => {
        SoundSystem.playSounds(stage.content.presentation.projectiles[String(event.data.typeId)]?.fireSounds)
    }

    /**
     * Projectile::DoImpact: its sounds and its splat, and the projectile is gone. It needs no view: one that hit before
     * it was ever drawn splats as well. A piercing projectile flies on through what it hits (`through`): it stays, with
     * the sound of its hit, and only splats where it comes down.
     */
    static readonly impact: StageEvent = (stage, event, world) => {
        const id = event.data.projectileId, through = event.data.through === true
        if (typeof id === 'number' && !through) stage.node(id)?.destroy()
        const typeId = String(event.data.typeId), projectile = stage.content.presentation.projectiles[typeId]
        // Projectile::PlayImpactSound: the armor worn before the hit sounds too, the shield in front of the helm, and
        // some armor muffles the projectile's own sound unless that is loud.
        const targetType = event.data.targetTypeId
        const target = typeof targetType === 'string' ? stage.content.presentation.zombies[targetType] : undefined
        const armor = event.data.shield ? target?.shield : event.data.helm ? target?.helm : undefined
        SoundSystem.playSounds(armor?.impactSounds)
        if (!armor?.muffles || projectile?.loud) SoundSystem.playSounds(projectile?.impactSounds)
        const impact = projectile?.impact, { x, y, targetId, row } = event.data
        if (!impact || through || typeof x !== 'number' || typeof y !== 'number') return
        const zombie = world.zombies.find(candidate => candidate.entityId === targetId)
        // A splat on a zombie follows it; one on a plant, on the ground, or the board's own (`free`) stays on the board.
        const attached = !impact.free && typeof targetId === 'number' && event.data.target !== 'plant'
        const parent = attached ? stage.node(targetId) : stage.layer
        const hitbox = stage.content.definitions.projectiles[typeId]?.hitbox, middle = ProjectileView.middle(stage, typeId)
        if (!parent || !hitbox || !middle) return
        // One that flew into what it hit splats by its shot offset; one that came down on it from above (`above`), or
        // only on the ground, by its lob offset.
        const shot = typeof targetId === 'number' && event.data.above !== true
        const [forward, down] = shot ? impact.shotOffset ?? SHOT_SPLAT : impact.lobOffset ?? LOB_SPLAT
        // A projectile flying left splats at its mirrored front, across its hitbox.
        const mirrored = event.data.team === 'zombies', mirror = 2 * hitbox.x + hitbox.width
        const past = shot && zombie && (mirrored ? x + mirror < zombie.x + ZOMBIE_WIDTH - ZOMBIE_MIDDLE : x > zombie.x + ZOMBIE_MIDDLE)
        const offsetX = mirrorX(middle.x + forward - (past ? IMPACT_PAST : 0), mirror, mirrored), offsetY = middle.y + down
        const [top, bottom] = impact.yRange ?? [-Infinity, Infinity]
        const position = attached && zombie
            ? { x: x + offsetX - zombie.x, y: -Math.max(top, Math.min(bottom, y + offsetY - zombie.y)) }
            : boardToLayer(x + offsetX, y + offsetY)
        // The board's own is drawn over what flies in its row (the original's mRenderOrder + 1), so over the row's zombies.
        const order = impact.free && typeof row === 'number' ? { renderOrder: renderOrder(projectile.layer ?? 'projectile', row) + 1 } : {}
        ParticlePlayer.spawn({ parent, id: impact.id, ...position, ...order, seed: event.eventId >>> 0, recycle: true })
    }
}
