import type { ProjectilePresentationDefinition } from '@/shared/content/presentation'
import { Color, Component, Node, Sprite, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import { FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import type { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { SeedPacketRenderer, type SeedPacketRenderArgs } from '@/client/hud/SeedPacketRenderer'
import type { ItemSnapshot, LawnMowerSnapshot, ServerEvent, WorldSnapshot, ZombieSnapshot } from '@/shared/protocol/index'
import { SUN_BANK_TARGET } from '@/shared/content/gameplay'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import { plantDefinition } from '@/client/plants/definitions'
import type { ZombieViewInstance, ZombieViewSprites } from '@/client/zombies/ZombieView'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import { zombieDefinition } from '@/client/zombies/definitions'
import type { PlantView } from '@/client/plants/PlantView'
import type { LevelEntitySnapshot, LevelParticleOwnerSnapshot } from './LevelPresentationSnapshot'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { boardCell, levelAwardSize } from './LevelGeometry'

const WIDTH = 800
const HEIGHT = 600
const GROUND_LAYER_ORDER = -100
type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type SpriteAsset = Awaited<ReturnType<SpriteRepository['load']>>
type FontAsset = Awaited<ReturnType<FontRepository['load']>>

export interface LevelEntityAssets {
    /** Projectile sprites by projectile ID. */
    projectileFrames: Record<string, SpriteAsset>
    projectileShadowFrames: Record<string, SpriteAsset>
    mowerFrame: SpriteAsset
    mowerShadow: SpriteAsset
    zombieSprites: ZombieViewSprites
    wallnutCracked: [SpriteAsset, SpriteAsset]
    loadPacketSprite: SeedPacketRenderArgs['loadSprite']
    packetCostFont: FontAsset
}

export class LevelEntityRenderer {
    private readonly scenery = new Map<Node, number>()
    addScenery(node: Node, order: number): void { this.scenery.set(node, order) }
    private readonly entities = new Map<number, Node>()
    private readonly collectStarts = new Map<number, { x: number, y: number }>()
    /** How far the sun counter sits from its 800-wide layout position, e.g. when pinned to the screen edge. */
    sunBankOffset = (): number => 0
    private readonly projectileShadows = new Map<number, Node>()
    private readonly pending = new Set<number>()
    private readonly creationTasks = new Map<number, Promise<void>>()
    private readonly plantViews = new Map<number, PlantView>()
    private readonly zombies = new Map<number, ZombieViewInstance>()
    private readonly zombieTypes = new Map<number, string>()
    /** Each plant's and zombie's attachment list. */
    private readonly attachments = new Map<number, EntityAttachments>()
    /** Charred remains keep their zombie's layer and ordering identity after removal. */
    private readonly charred = new Map<Node, { order: number, entityId: number }>()
    private readonly mowerPlayersReady = new Set<number>()
    private readonly mowerStates = new Map<number, LawnMowerSnapshot['state']>()
    private pointer?: { x: number; y: number }
    private lastSnapshot?: WorldSnapshot
    private highlightedPlant?: number
    /** Board particles share one node per drawing order, so a new one is appended rather than moved. */
    private readonly particleHolders = new Map<number, Node>()

    constructor(
        private readonly rootLayer: number,
        private readonly content: LoadedContent,
        private readonly animations: ClientAnimationRegistry,
        private readonly assets: LevelEntityAssets,
        private readonly entityLayer: Node,
        private readonly coinLayer: Node,
        private readonly awardLayer: Node,
        private readonly audio: LevelAudioPresenter,
        private readonly intro: LevelIntro,
    ) {}

    node(id: number): Node | undefined {
        return this.entities.get(id)
    }

    nodes(): Iterable<Node> {
        return this.entities.values()
    }

    setPointer(pointer?: { x: number; y: number }): void {
        this.pointer = pointer
        if (this.lastSnapshot) this.syncPlantHighlight(this.lastSnapshot)
    }

    private syncPlantHighlight(snapshot: WorldSnapshot): void {
        if (!this.pointer && this.highlightedPlant === undefined) return
        const level = this.content.levels.levels[snapshot.levelId]
        const cell = this.pointer && !snapshot.paused && snapshot.cursor.mode === 'tool'
            ? boardCell(this.content.definitions.boards[level.board], this.pointer.x, this.pointer.y) : undefined
        const highlighted = cell?.inBounds ? snapshot.plants.find(plant => plant.row === cell.row && plant.column === cell.column &&
            this.content.definitions.plants[plant.typeId].occupiesCell !== false && !this.content.definitions.plants[plant.typeId].graveBuster)?.entityId : undefined
        for (const id of new Set([this.highlightedPlant, highlighted])) {
            if (id === undefined) continue
            const flash = snapshot.plants.find(plant => plant.entityId === id)?.eatenFlashCounter ?? 0
            const gray = Math.min(255, flash * 3)
            const color = id === highlighted ? new Color(255, 255, 255, 196) : new Color(gray, gray, gray)
            for (const player of this.entities.get(id)?.getComponentsInChildren(ReanimPlayer) ?? []) player.setExtraAdditiveDraw(id === highlighted || flash > 0, color)
        }
        this.highlightedPlant = highlighted
    }

    /** The server flies sun to the layout's counter; ease toward the counter's actual position along the way. */
    private collectOffset(item: ItemSnapshot): number {
        const offset = this.sunBankOffset()
        if (item.state !== 'collecting' || !offset) return 0
        let start = this.collectStarts.get(item.entityId)
        if (!start) this.collectStarts.set(item.entityId, start = { x: item.x, y: item.y })
        const total = Math.hypot(start.x - SUN_BANK_TARGET.x, start.y - SUN_BANK_TARGET.y)
        return total ? offset * (1 - Math.hypot(item.x - SUN_BANK_TARGET.x, item.y - SUN_BANK_TARGET.y) / total) : offset
    }

    syncGameOverWinner(zombie: ZombieSnapshot, parent: Node, visible: boolean, ticks: number, y: number, approachTicks = 0): void {
        const node = this.entities.get(zombie.entityId)
        const view = this.zombies.get(zombie.entityId)
        if (!node || !view) return
        if (node.parent !== parent) node.setParent(parent)
        if (view.shadowNode.parent !== parent) view.shadowNode.setParent(parent)
        node.active = view.shadowNode.active = visible
        view.syncGameOverWalk(zombie, ticks, y, approachTicks)
    }

    /** The original keeps updating the winner's attachments; its body follows the scripted walk instead. */
    runsDuringGameOver(winnerId: number, component: Component): boolean {
        return this.attachments.get(winnerId)?.has(component.node) ?? false
    }

    particleOwner(node: Node): Extract<LevelParticleOwnerSnapshot, { kind: 'entity' }> | null {
        for (const [entityId, root] of this.entities) {
            if (node !== root && !node.isChildOf(root)) continue
            let slot: Extract<LevelParticleOwnerSnapshot, { kind: 'entity' }>['slot'] = 'root'
            let parent = root
            for (let ancestor = node.parent; ancestor && ancestor !== root; ancestor = ancestor.parent) {
                if (ancestor.name === 'AwardBackEffects') { slot = 'award-back-effects'; parent = ancestor; break }
                if (ancestor.name === 'Body') { slot = 'body'; parent = ancestor; break }
                if (ancestor.name === 'IdleHead' || ancestor.name === 'ShootHead') { slot = 'head'; parent = ancestor; break }
                if (ancestor.name.includes('Shadow')) { slot = 'shadow'; parent = ancestor; break }
            }
            const position = parent.inverseTransformPoint(new Vec3(), node.worldPosition)
            return { kind: 'entity', entityId, slot, x: position.x, y: position.y, z: position.z }
        }
        return null
    }

    particleParent(owner: Extract<LevelParticleOwnerSnapshot, { kind: 'entity' }>): Node | null {
        const root = this.entities.get(owner.entityId)
        if (!root) return null
        switch (owner.slot) {
            case 'body': return root.getChildByName('Body') ?? root
            case 'head': return root.getChildByName('ShootHead') ?? root.getChildByName('IdleHead') ?? root
            case 'shadow': return root.getChildByName('MowerShadow') ?? root
            case 'award-back-effects': return root.getChildByName('AwardBackEffects') ?? root
            default: return root
        }
    }

    async snapshot(): Promise<LevelEntitySnapshot[]> {
        await Promise.all(this.creationTasks.values())
        const result: LevelEntitySnapshot[] = []
        for (const [entityId, view] of this.plantViews) result.push(view.snapshot(entityId))
        for (const [entityId, view] of this.zombies) result.push(view.snapshot(entityId))
        for (const [entityId, node] of this.entities) {
            if (this.plantViews.has(entityId) || this.zombies.has(entityId)) continue
            const mower = node.getChildByName('MowerAnimation')?.getComponent(ReanimPlayer)
            if (mower) result.push({ kind: 'mower', entityId, animation: mower.snapshot() })
            else {
                const animation = node.getComponent(ReanimPlayer)
                if (animation) result.push({ kind: 'sun', entityId, animation: animation.snapshot() })
            }
        }
        return result.sort((left, right) => left.entityId - right.entityId)
    }

    async restore(snapshots: LevelEntitySnapshot[]): Promise<void> {
        await Promise.all(this.creationTasks.values())
        for (const snapshot of snapshots) {
            if (snapshot.kind === 'plant') {
                await this.plantViews.get(snapshot.entityId)?.restore(snapshot)
            } else if (snapshot.kind === 'zombie') {
                const view = this.zombies.get(snapshot.entityId)
                if (view) await view.restore(snapshot)
            } else {
                const node = this.entities.get(snapshot.entityId)
                const player = snapshot.kind === 'mower'
                    ? node?.getChildByName('MowerAnimation')?.getComponent(ReanimPlayer)
                    : node?.getComponent(ReanimPlayer)
                if (player && snapshot.animation) player.restore(snapshot.animation)
            }
        }
        // Paused scenes do not tick again to reveal the restored views.
        if (this.lastSnapshot) this.sync(this.lastSnapshot, { added: [], removed: [] }, [])
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        this.lastSnapshot = snapshot
        for (const event of events) {
            if (event.type === 'zombieHelmDropped' && typeof event.data.entityId === 'number' && event.data.silent !== true) {
                this.spawnHelm(event.data.entityId, snapshot)
                this.zombies.get(event.data.entityId)?.helmDropped?.()
            }
            if (event.type !== 'zombiePartDropped') continue
            const entityId = event.data.entityId
            const part = event.data.part
            if (typeof entityId !== 'number' || (part !== 'head' && part !== 'arm' && part !== 'flag')) continue
            const zombie = snapshot.zombies.find(candidate => candidate.entityId === entityId)
            const node = this.entities.get(entityId)
            if (zombie && node) {
                node.setPosition(zombie.x - WIDTH / 2, HEIGHT / 2 - zombie.y)
                this.zombies.get(entityId)?.sync(zombie, snapshot)
            }
            const row = zombie?.row ?? (typeof event.data.row === 'number' ? event.data.row : 0)
            this.spawnZombiePart(entityId, part, event.data.mowered === true, row, zombie?.chilled === true)
        }
        for (const id of changes.removed) this.remove(id)
        for (const id of changes.added) {
            if (this.pending.has(id) || this.entities.has(id)) continue
            const task = this.create(id, snapshot)
                .catch(error => console.error('[Level] Failed to create entity', error))
                .finally(() => this.creationTasks.delete(id))
            this.creationTasks.set(id, task)
        }
        for (const entity of [...snapshot.plants, ...snapshot.zombies, ...snapshot.projectiles, ...snapshot.lawnMowers]) {
            this.entities.get(entity.entityId)?.setPosition(entity.x - WIDTH / 2, HEIGHT / 2 - entity.y)
        }
        for (const projectile of snapshot.projectiles) {
            const shadow = this.content.presentation.projectiles[projectile.typeId]?.shadow
            if (!shadow) continue
            const board = this.content.definitions.boards[this.content.levels.levels[snapshot.levelId].board]
            this.projectileShadows.get(projectile.entityId)?.setPosition(projectile.x + shadow.offset.x - WIDTH / 2,
                HEIGHT / 2 - (board.origin.y + projectile.row * board.cell.height + shadow.offset.y))
        }
        for (const id of this.collectStarts.keys()) {
            if (!snapshot.items.some(item => item.entityId === id && item.state === 'collecting')) this.collectStarts.delete(id)
        }
        for (const item of snapshot.items) {
            const node = this.entities.get(item.entityId)
            if (!node) continue
            const award = item.typeId === this.content.levels.levels[snapshot.levelId].award.id
            const size = levelAwardSize(this.content.levels.levels[snapshot.levelId].award)
            node.setPosition(
                award ? item.x + size.width / 2 : item.x + 30 + this.collectOffset(item),
                award ? -(item.y + size.height / 2) : -(item.y + 30),
            )
            if (!award) node.setScale(item.scale, item.scale, 1)
            uiNode({ node, opacity: item.alpha })
        }
        for (const mower of snapshot.lawnMowers) this.syncMower(mower)
        const particle = (effect: string, x: number, y: number, tint?: Color) => ParticlePlayer.spawn({
            parent: this.entityLayer, id: effect, x: x - WIDTH / 2, y: HEIGHT / 2 - y, renderOrder: 10000,  tint,
        })
        for (const plant of snapshot.plants) {
            this.plantViews.get(plant.entityId)?.sync(plant, snapshot, particle, false)
        }
        this.syncPlantHighlight(snapshot)
        for (const zombie of snapshot.zombies) this.zombies.get(zombie.entityId)?.sync(zombie, snapshot)
        for (const plant of snapshot.plants) {
            const node = this.entities.get(plant.entityId)
            if (node) node.active = this.plantViews.has(plant.entityId) && GameDebugSettings.perfPlantsVisible
        }
        for (const zombie of snapshot.zombies) {
            const node = this.entities.get(zombie.entityId)
            if (node) node.active = this.zombies.has(zombie.entityId) && GameDebugSettings.perfZombiesVisible
        }
        this.playEvents(snapshot, events)
        this.syncLayerOrder(snapshot)
        if (!this.intro.complete) this.intro.sync()
    }

    private remove(id: number): void {
        this.pending.delete(id)
        this.plantViews.get(id)?.destroy?.()
        this.plantViews.delete(id)
        this.zombies.get(id)?.destroy()
        this.zombies.delete(id)
        this.zombieTypes.delete(id)
        this.attachments.delete(id)
        this.mowerPlayersReady.delete(id)
        this.mowerStates.delete(id)
        this.entities.get(id)?.destroy()
        this.entities.delete(id)
        this.projectileShadows.get(id)?.destroy()
        this.projectileShadows.delete(id)
    }

    private playEvents(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        for (const event of events) {
            if (event.type === 'plantFiring') {
                const id = event.data.plantId
                if (typeof id === 'number') this.plantViews.get(id)?.fire?.()
            } else if (event.type === 'plantPlaced') {
                const id = event.data.entityId
                if (typeof id === 'number') this.spawnPlantingParticle(snapshot, id)
            } else if (event.type === 'projectileImpact') {
                const id = event.data.projectileId
                if (typeof id === 'number') this.entities.get(id)?.destroy()
                const projectile = this.content.presentation.projectiles[String(event.data.typeId)]
                const targetType = event.data.targetTypeId
                const helm = event.data.helm && typeof targetType === 'string' ? this.content.presentation.zombies[targetType]?.helm : undefined
                this.audio.sounds(helm?.impactSounds ?? projectile?.impactSounds)
                if (projectile?.impact) this.spawnProjectileImpact(snapshot, event, projectile.impact)
            } else if (event.type === 'zombieChewedPlant') {
                this.playChew(snapshot, event)
            } else if (event.type === 'plantExploded') {
                this.playExplosion(event)
            } else if (event.type === 'mineRising') {
                const plant = snapshot.plants.find(candidate => candidate.entityId === event.data.entityId)
                if (plant) this.spawnBoardParticle("pvz:potatominerise", plant.x + 40, plant.y + 40, plant.row * 10 + 0.5)
            } else if (event.type === 'graveBusted') {
                // Plant::UpdateGraveBuster in 1.0.0.1051 spawns PARTICLE_GRAVE_BUSTER_DIE at (mX + 40, mY + 80).
                this.spawnBoardParticle('pvz:gravebusterdie', Number(event.data.x) + 40, Number(event.data.y) + 80, Number(event.data.row) * 10 + 4)
            } else if (event.type === 'zombieRoseFromGrave') {
                const zombie = snapshot.zombies.find(candidate => candidate.entityId === event.data.entityId)
                if (zombie) this.spawnBoardParticle('pvz:zombierise', zombie.x + 60, zombie.y + 110, zombie.row * 10 + 2)
            } else if (event.type === 'zombieCharred') {
                this.spawnCharred(event)
            }
        }
    }

    /** Zombie::AnimateChewSound and AnimateChewEffect: wall-nuts crumble softly. */
    private playChew(snapshot: WorldSnapshot, event: ServerEvent): void {
        const plant = snapshot.plants.find(candidate => candidate.entityId === event.data.plantId)
        const zombie = snapshot.zombies.find(candidate => candidate.entityId === event.data.zombieId)
        const presentation = plant ? this.content.presentation.plants[plant.typeId] : undefined
        const nut = presentation?.chewParticle !== undefined
        this.audio.chew(nut)
        if (nut && zombie) {
            const tint = presentation!.visual.tint
            this.spawnBoardParticle(presentation!.chewParticle!, zombie.x + 37, zombie.y + 40, zombie.row * 10 + 2,
                tint ? new Color(...tint) : undefined)
        }
    }

    /** Plant::DoSpecial: cherry bombs and explode-o-nuts say "Powie", mines say "Spudow". */
    private playExplosion(event: ServerEvent): void {
        const { x, y, row } = event.data
        if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number') return
        const explosion = typeof event.data.typeId === 'string' ? this.content.presentation.plants[event.data.typeId]?.explosion : undefined
        if (!explosion) return
        this.spawnBoardParticle(explosion.effect, x + explosion.x, y, explosion.rowOrder ? row * 10 + 0.5 : 10000)
    }

    /** Zombie::ApplyBurn leaves a charred zombie that crumbles at its own pace. */
    private spawnCharred(event: ServerEvent): void {
        const { x, y, row, rate, entityId } = event.data
        if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number' || typeof rate !== 'number' || typeof entityId !== 'number') return
        const node = uiNode({ name: 'CharredZombie', parent: this.entityLayer, position: { x: x - WIDTH / 2, y: HEIGHT / 2 - y }, anchor: { x: 0, y: 1 } }).node
        this.charred.set(node, { order: row * 10 + 1, entityId })
        const player = node.addComponent(ReanimPlayer)
        void player.load('pvz:zombie_charred', this.content.registry, this.content.loader).then(() => {
            if (!node.isValid) return
            player.play({ loop: false, rate, timeSeconds: 0, onFinish: () => { this.charred.delete(node); if (node.isValid) node.destroy() } })
        }).catch(error => {
            this.charred.delete(node)
            if (node.isValid) node.destroy()
            console.error('[Level] Failed to play charred zombie', error)
        })
    }

    private spawnHelm(entityId: number, snapshot: WorldSnapshot): void {
        const node = this.entities.get(entityId)
        const zombie = snapshot.zombies.find(candidate => candidate.entityId === entityId)
        const typeId = zombie?.typeId ?? this.zombieTypes.get(entityId)
        const helm = typeId ? this.content.presentation.zombies[typeId]?.helm : undefined
        if (!node || !helm) return
        const track = this.zombies.get(entityId)?.getTrackWorldPosition(helm.track)
        const local = track ? uiNode({ node: this.entityLayer }).transform.convertToNodeSpaceAR(track) : null
        ParticlePlayer.spawn({
            parent: this.entityLayer, id: helm.effect,
            x: local?.x ?? node.position.x + helm.offset[0], y: local?.y ?? node.position.y + helm.offset[1],
            renderOrder: (zombie?.row ?? 0) * 10 + 1.01,
        })
    }

    /** Board coordinates; recycled under a shared holder per render order. */
    spawnBoardParticle(effect: string, x: number, y: number, renderOrder: number, tint?: Color): void {
        let parent = this.particleHolders.get(renderOrder)
        if (!parent) {
            parent = uiNode({ name: `BoardParticles-${renderOrder}`, parent: this.entityLayer, layer: this.entityLayer.layer }).node
            this.particleHolders.set(renderOrder, parent)
        }
        ParticlePlayer.spawn({ parent, id: effect, x: x - WIDTH / 2, y: HEIGHT / 2 - y, renderOrder, tint, recycle: true })
    }

    private async create(id: number, snapshot: WorldSnapshot): Promise<void> {
        const entity = allEntities(snapshot).find(value => value.entityId === id)
        if (!entity) return
        this.pending.add(id)
        const item = snapshot.items.find(value => value.entityId === id)
        const plant = snapshot.plants.find(value => value.entityId === id)
        const zombie = snapshot.zombies.find(value => value.entityId === id)
        const isAward = item?.typeId === this.content.levels.levels[snapshot.levelId].award.id
        const node = uiNode({
            name: `Entity-${id}`, parent: isAward ? this.awardLayer : item ? this.coinLayer : this.entityLayer,
            anchor: { x: 0, y: 1 },
            position: item ? undefined : { x: entity.x - WIDTH / 2, y: HEIGHT / 2 - entity.y },
            // Factories stay hidden until their first sync applies the current position and pose.
            active: !plant && !zombie,
        }).node
        this.entities.set(id, node)
        try {
            const projectile = snapshot.projectiles.find(value => value.entityId === id)
            if (projectile) {
                const frame = this.assets.projectileFrames[projectile.typeId]
                if (!frame) throw new Error(`Projectile sprite is not installed: ${projectile.typeId}`)
                uiNode({ node, anchor: { x: 0, y: 1 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
                const shadow = this.content.presentation.projectiles[projectile.typeId]?.shadow
                if (shadow) {
                    const frame = this.assets.projectileShadowFrames[projectile.typeId]
                    if (!frame) throw new Error(`Projectile shadow is not installed: ${projectile.typeId}`)
                    const board = this.content.definitions.boards[this.content.levels.levels[snapshot.levelId].board]
                    const shadowNode = uiNode({ name: `ProjectileShadow-${id}`, parent: this.entityLayer, anchor: { x: 0, y: 1 },
                        position: { x: projectile.x + shadow.offset.x - WIDTH / 2,
                            y: HEIGHT / 2 - (board.origin.y + projectile.row * board.cell.height + shadow.offset.y) },
                        sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
                    shadowNode.setScale(shadow.scale, shadow.scale, 1)
                    this.projectileShadows.set(id, shadowNode)
                }
                const trail = this.content.presentation.projectiles[projectile.typeId]?.trail
                if (trail) ParticlePlayer.spawn({ parent: node, ...trail })
            } else if (snapshot.lawnMowers.some(value => value.entityId === id)) {
                await this.createMower(id, node, snapshot)
            } else if (plant) {
                const attachments = new EntityAttachments()
                const view = await this.content.plantViews.create({ node, attachments, content: this.content, animations: this.animations,
                    assets: { shadow: this.assets.mowerShadow, wallnutCracked: this.assets.wallnutCracked },
                    plant, tick: snapshot.gameplayTick })
                if (node.isValid) {
                    this.plantViews.set(id, view)
                    this.attachments.set(id, attachments)
                } else view.destroy?.()
            } else if (zombie) {
                const attachments = new EntityAttachments()
                const view = await this.content.zombieViews.create({ node, attachments, content: this.content, animations: this.animations,
                    shadowParent: this.entityLayer, assets: { shadow: this.assets.mowerShadow, sprites: this.assets.zombieSprites },
                    zombie, tick: snapshot.gameplayTick })
                if (node.isValid) {
                    this.zombies.set(id, view)
                    this.zombieTypes.set(id, zombie.typeId)
                    this.attachments.set(id, attachments)
                } else view.destroy()
            } else if (isAward) {
                await this.createAward(node, snapshot)
            } else {
                const player = node.addComponent(ReanimPlayer)
                await player.load('pvz:sun', this.content.registry, this.content.loader)
                if (node.isValid) player.play({ loop: true, rate: 0.5 })
            }
        } catch (error) {
            if (node.isValid) node.destroy()
            this.entities.delete(id)
            this.projectileShadows.get(id)?.destroy()
            this.projectileShadows.delete(id)
            throw error
        } finally {
            this.pending.delete(id)
        }
    }

    private async createAward(node: Node, snapshot: WorldSnapshot): Promise<void> {
        const award = this.content.levels.levels[snapshot.levelId].award
        const size = levelAwardSize(award)
        uiNode({ node, size, anchor: { x: 0.5, y: 0.5 } })
        const backEffects = uiNode({ name: 'AwardBackEffects', parent: node }).node
        ParticlePlayer.spawn({ parent: backEffects, id: award.kind === 'note' ? "pvz:awardpickuparrow" : "pvz:seedpacket", x: 0, y: 60, z: -1 })
        if (award.kind !== 'seed') {
            const visual = this.content.presentation.awards?.[award.id]
            if (!visual) throw new Error(`Award presentation is not installed: ${award.id}`)
            const frame = await new SpriteRepository(this.content.registry, this.content.loader).load(visual.sprite)
            if (!node.isValid) return
            const image = uiNode({ name: 'AwardImage', parent: node,
                position: { x: visual.x + frame.originalSize.width / 2 - size.width / 2,
                    y: -(visual.y + frame.originalSize.height / 2 - size.height / 2) } }).node
            uiNode({ parent: image, anchor: { x: 0.5, y: 0.5 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
                .node.setScale(visual.scale, visual.scale, 1)
            return
        }
        const cost = award.packetCost
        const seedType = plantDefinition(this.content.presentation, award.id).visual.seedType
        SeedPacketRenderer.drawSeedPacket({
            definitions: this.content.presentation,
            name: 'FinalSeedPacketNormal', parent: node, layer: this.rootLayer, x: 0, y: 0,
            seedType, cost, costFont: this.assets.packetCostFont,
            loadSprite: this.assets.loadPacketSprite,
        })
        const large = SeedPacketRenderer.drawSeedPacket({
            definitions: this.content.presentation,
            name: 'FinalSeedPacketLarge', parent: node, layer: this.rootLayer, x: 0, y: 0,
            scale: 2, seedType, cost, costFont: this.assets.packetCostFont,
            loadSprite: this.assets.loadPacketSprite,
        })
        large.active = false
    }

    private spawnZombiePart(entityId: number, part: 'head' | 'arm' | 'flag', mowered: boolean, row: number, chilled: boolean): void {
        const node = this.entities.get(entityId)
        if (!node) return
        const typeId = this.zombieTypes.get(entityId) ?? 'pvz:normal'
        const drop = zombieDefinition(this.content.presentation, typeId).drops[part]
        if (!drop) return
        const trackPosition = this.zombies.get(entityId)?.getTrackWorldPosition(drop.track)
        const localPosition = trackPosition ? uiNode({ node: this.entityLayer }).transform.convertToNodeSpaceAR(trackPosition) : null
        ParticlePlayer.spawn({
            parent: this.entityLayer,
            id: mowered ? drop.moweredEffect ?? drop.effect : drop.effect,
            x: localPosition?.x ?? node.position.x + drop.offset[0],
            y: localPosition?.y ?? node.position.y + drop.offset[1],
            renderOrder: row * 10 + 1.01,
            // Zombie::DropHead and DropArm swap in the pole vaulter's own head and a bare hand.
            spriteOverride: drop.image,
            // Zombie::OverrideParticleColor keeps a chilled zombie's parts blue.
            tint: chilled ? new Color(75, 75, 255, 255) : undefined,
            extraAdditive: chilled,
        })
        this.audio.sounds(drop.sounds)
    }

    private spawnPlantingParticle(snapshot: WorldSnapshot, entityId: number): void {
        const plant = snapshot.plants.find(candidate => candidate.entityId === entityId)
        if (!plant) return
        ParticlePlayer.spawn({
            parent: this.entityLayer, id: "pvz:planting",
            x: plant.x + 41 - WIDTH / 2, y: HEIGHT / 2 - plant.y - 74,
            renderOrder: 10000,
        })
    }

    private spawnProjectileImpact(snapshot: WorldSnapshot, event: ServerEvent, impact: NonNullable<ProjectilePresentationDefinition['impact']>): Node | undefined {
        const targetId = event.data.targetId
        const x = event.data.x
        const y = event.data.y
        if (typeof x !== 'number' || typeof y !== 'number') return
        const zombie = snapshot.zombies.find(candidate => candidate.entityId === targetId)
        const parent = typeof targetId === 'number' ? this.entities.get(targetId) : this.entityLayer
        if (!parent) return
        const position = zombie
            ? { x: x + impact.offset[0] - zombie.x, y: -Math.max(impact.yRange[0], Math.min(impact.yRange[1], y + impact.offset[1] - zombie.y)) }
            : { x: x + impact.offset[0] - WIDTH / 2, y: HEIGHT / 2 - y - impact.offset[1] }
        return ParticlePlayer.spawn({ parent, id: impact.id, ...position, seed: event.eventId >>> 0 }).node
    }

    /** Mods can append scenery to the same ordering pass as entities and particles. */
    private collectLayerEntries(snapshot: WorldSnapshot): { node: Node, order: number, entityId?: number }[] {
        const entries: { node: Node, order: number, entityId?: number }[] = []
        for (const [node, order] of this.scenery) {
            if (node.isValid) entries.push({ node, order })
            else this.scenery.delete(node)
        }
        const add = (entityId: number, order: number) => {
            const node = this.entities.get(entityId)
            if (node?.isValid) entries.push({ node, order, entityId })
        }
        for (const entity of snapshot.plants) add(entity.entityId, (this.plantViews.get(entity.entityId)?.renderRow?.(entity) ?? entity.row) * 10 + (this.content.presentation.plants[entity.typeId]?.rowOrder ?? 0))
        for (const entity of snapshot.zombies) {
            add(entity.entityId, entity.row * 10 + 1)
            const shadow = this.zombies.get(entity.entityId)?.shadowNode
            if (shadow?.isValid) entries.push({ node: shadow, order: entity.row * 10 - 0.1 })
        }
        for (const entity of snapshot.projectiles) {
            add(entity.entityId, entity.row * 10 + 2)
            const shadow = this.projectileShadows.get(entity.entityId)
            // Ground shadows precede plants and projectiles in every row.
            if (shadow?.isValid) entries.push({ node: shadow, order: GROUND_LAYER_ORDER + entity.row * 10, entityId: entity.entityId })
        }
        for (const [node, entry] of this.charred) if (node.isValid) entries.push({ node, ...entry })
        for (const entity of snapshot.lawnMowers) add(entity.entityId, entity.row * 10 + 3)
        for (const child of this.entityLayer.children) {
            const particle = child.getComponent(ParticlePlayer)
            if (particle) entries.push({ node: child, order: particle.renderOrder })
        }
        for (const [order, node] of this.particleHolders) entries.push({ node, order })
        return entries
    }

    private syncLayerOrder(snapshot: WorldSnapshot): void {
        const entries = this.collectLayerEntries(snapshot)
        entries.sort((left, right) => left.order - right.order || (left.entityId ?? 0) - (right.entityId ?? 0))
        // Unlisted children (an entity leaving the snapshot) keep their place; comparing by index instead would move every
        // node after one of them. Most nodes are already in place, so the engine is called only for the rest.
        const layer = this.entityLayer, children = layer.children, listed = new Set<Node>()
        for (const { node } of entries) listed.add(node)
        let index = 0
        for (const { node } of entries) {
            if (node.parent !== layer) continue
            while (index < children.length && children[index] !== node && !listed.has(children[index])) index++
            if (children[index] !== node) node.setSiblingIndex(index)
            index++
        }
    }

    private async createMower(id: number, node: Node, snapshot: WorldSnapshot): Promise<void> {
        uiNode({ name: 'MowerShadow', parent: node, position: { x: 36, y: -65, z: -1 }, sprite: { frame: this.assets.mowerShadow, sizeMode: Sprite.SizeMode.RAW, trim: false } })
        uiNode({ name: 'CachedMower', parent: node, position: { x: -14, y: -19 }, anchor: { x: 0, y: 1 }, sprite: { frame: this.assets.mowerFrame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
        const animationNode = uiNode({ name: 'MowerAnimation', parent: node, position: { x: 6, y: -19 }, anchor: { x: 0, y: 1 } }).node
        animationNode.setScale(0.85, 0.85, 1)
        const player = animationNode.addComponent(ReanimPlayer)
        await player.load('pvz:lawnmower', this.content.registry, this.content.loader)
        if (!node.isValid) return
        this.mowerPlayersReady.add(id)
        const mower = snapshot.lawnMowers.find(value => value.entityId === id)
        if (mower) this.syncMower(mower)
        if (!this.intro.complete) this.intro.sync()
    }

    private syncMower(mower: LawnMowerSnapshot): void {
        const node = this.entities.get(mower.entityId)
        if (!node) return
        const active = mower.state === 'active'
        const visible = mower.state !== 'spent'
        const cached = node.getChildByName('CachedMower')
        const animation = node.getChildByName('MowerAnimation')
        const shadow = node.getChildByName('MowerShadow')
        if (cached) cached.active = mower.state === 'ready'
        if (animation) animation.active = active
        if (shadow) shadow.active = visible
        if (!this.mowerPlayersReady.has(mower.entityId) || this.mowerStates.get(mower.entityId) === mower.state) return
        const player = animation?.getComponent(ReanimPlayer)
        if (active) player?.play({ loop: true, rate: 70 / 12 })
        else player?.pause()
        this.mowerStates.set(mower.entityId, mower.state)
    }
}

type Positioned = { entityId: number, x: number, y: number }

function allEntities(snapshot: WorldSnapshot): Positioned[] {
    return [...snapshot.plants, ...snapshot.zombies, ...snapshot.projectiles, ...snapshot.items, ...snapshot.lawnMowers]
}
