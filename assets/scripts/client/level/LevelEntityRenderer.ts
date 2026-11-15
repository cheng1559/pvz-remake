import { Color, Component, Node, Vec3 } from 'cc'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import type { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { uiNode } from '@/client/view/uiNode'
import { levelStandsStill, type PlantSnapshot, type ServerEvent, type WorldSnapshot, type ZombieSnapshot } from '@/shared/protocol/index'
import { plantRenderOffset, renderOrder, SHADOW_RENDER_OFFSET, ZOMBIE_RENDER_OFFSET } from '@/shared/content/renderOrder'
import { MOWER_READY_X, mowerY } from '@/shared/content/gameplay'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import type { ZombieViewInstance } from '@/client/zombies/ZombieView'
import { ZombieView } from '@/client/zombies/ZombieView'
import { EntityAttachments } from '@/client/view/EntityAttachments'
import { PlantView } from '@/client/plants/PlantView'
import { GraveBusterView } from '@/client/plants/GraveBusterView'
import { ProjectileView } from '@/client/projectiles/ProjectileView'
import type { GridItemView } from '@/client/gridItems/GridItemView'
import type { LevelEntitySnapshot, LevelParticleOwnerSnapshot } from './LevelPresentationSnapshot'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { boardCell } from './LevelGeometry'
import { LevelItemView } from './LevelItemView'
import { EntityFlashes } from './EntityFlashes'
import { boardToLayer, type LevelEntityAssets, type LevelStage, type StageEvent } from './LevelStage'

export type { LevelEntityAssets } from './LevelStage'

type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>

/**
 * Who hears of an event: the views whose entity it is about, by what it is. What falls off a zombie is heard of before
 * the frame's entities go, so it leaves from the zombie as it was; the rest once the frame is drawn.
 */
const BEFORE: Record<string, StageEvent> = {
    zombieHelmDropped: ZombieView.armorDropped, zombieShieldDropped: ZombieView.armorDropped, zombiePartDropped: ZombieView.partDropped,
}
const AFTER: Record<string, StageEvent> = {
    plantFiring: PlantView.fired, mineRising: PlantView.rose, plantExploded: PlantView.exploded, graveBusted: GraveBusterView.busted,
    projectileImpact: ProjectileView.impact,
    zombieChewedPlant: ZombieView.chewed, zombieRoseFromGrave: ZombieView.rose, zombieCharred: ZombieView.charred, zombiePuffed: ZombieView.puffed,
}

/**
 * What is on the board, drawn by the views of its entities (plants, zombies, projectiles, the things of a cell, items):
 * which exist, where each is drawn among the rest, and which view hears of an event. The views draw; the board is
 * their stage.
 */
export class LevelEntityRenderer implements LevelStage {
    /** Nodes of the layer that are no entity's, each with its place in the draw order. */
    private readonly scenery = new Map<Node, { order: number, entityId?: number }>()
    private readonly entities = new Map<number, Node>()
    /** How far the sun counter sits from its 800-wide layout position, e.g. when pinned to the screen edge. */
    sunBankOffset = (): number => 0
    private readonly pending = new Set<number>()
    private readonly creationTasks = new Map<number, Promise<void>>()
    private readonly plantViews = new Map<number, PlantView>()
    private readonly zombies = new Map<number, ZombieViewInstance>()
    private readonly zombieTypes = new Map<number, string>()
    private readonly projectiles = new Map<number, ProjectileView>()
    private readonly gridItems = new Map<number, GridItemView>()
    private readonly itemViews = new Map<number, LevelItemView>()
    private readonly flashes = new EntityFlashes()
    /** Each plant's and zombie's attachment list. */
    private readonly attachments = new Map<number, EntityAttachments>()
    /** The rows' waiting mowers, by row; one set off goes on as a projectile. */
    private readonly waitingMowers = new Map<number, Node>()
    private pointer?: { x: number; y: number }
    private lastSnapshot?: WorldSnapshot
    private highlightedPlant?: number
    /** Board particles share one node per drawing order, so a new one is appended rather than moved. */
    private readonly particleHolders = new Map<number, Node>()

    constructor(
        private readonly rootLayer: number,
        readonly content: LoadedContent,
        readonly animations: ClientAnimationRegistry,
        readonly assets: LevelEntityAssets,
        readonly layer: Node,
        private readonly coinLayer: Node,
        private readonly awardLayer: Node,
        readonly audio: LevelAudioPresenter,
        readonly intro: LevelIntro,
        readonly riseParticle: string,
    ) {}

    addScenery(node: Node, order: number, entityId?: number): void { this.scenery.set(node, { order, ...(entityId === undefined ? {} : { entityId }) }) }
    plant(id: number): PlantView | undefined { return this.plantViews.get(id) }
    zombie(id: number): ZombieViewInstance | undefined { return this.zombies.get(id) }
    zombieType(id: number): string | undefined { return this.zombieTypes.get(id) }

    showZombie(zombie: ZombieSnapshot, world: WorldSnapshot): void {
        const at = boardToLayer(zombie.x, zombie.y)
        this.entities.get(zombie.entityId)?.setPosition(at.x, at.y)
        this.zombies.get(zombie.entityId)?.sync(zombie, world, this.flashes.zombie(zombie.entityId, world.gameplayTick))
    }

    node(id: number): Node | undefined {
        return this.entities.get(id)
    }

    /** The entities' nodes and the waiting mowers', which the intro rolls in. */
    nodes(): Iterable<Node> {
        return [...this.entities.values(), ...this.waitingMowers.values()]
    }

    setPointer(pointer?: { x: number; y: number }): void {
        this.pointer = pointer
        if (this.lastSnapshot) this.syncPlantHighlight(this.lastSnapshot)
    }

    /** The shovel's target under the pointer is lit (tools.use: neither a grave buster nor a plant on the zombies' side). */
    private syncPlantHighlight(snapshot: WorldSnapshot): void {
        if (!this.pointer && this.highlightedPlant === undefined) return
        const level = this.content.levels.levels[snapshot.levelId]
        const cell = this.pointer && !levelStandsStill(snapshot) && snapshot.cursor.mode === 'tool'
            ? boardCell(this.content.definitions.boards[level.board], this.pointer.x, this.pointer.y) : undefined
        const highlighted = cell?.inBounds ? snapshot.plants.find(plant => plant.row === cell.row && plant.column === cell.column &&
            this.content.definitions.plants[plant.typeId].occupiesCell !== false && !this.content.definitions.plants[plant.typeId].graveBuster &&
            plant.team !== 'zombies' && !plant.mowered)?.entityId : undefined
        if (highlighted !== this.highlightedPlant && this.highlightedPlant !== undefined) this.plantViews.get(this.highlightedPlant)?.highlight(false)
        if (highlighted !== undefined) this.plantViews.get(highlighted)?.highlight(true)
        this.highlightedPlant = highlighted
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
                if (ancestor.name === 'Head') { slot = 'head'; parent = ancestor; break }
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
            case 'head': return root.getChildByName('Head') ?? root
            case 'shadow': return root.getChildByName('MowerShadow') ?? root
            case 'award-back-effects': return root.getChildByName('AwardBackEffects') ?? root
            default: return root
        }
    }

    async snapshot(): Promise<LevelEntitySnapshot[]> {
        await Promise.all(this.creationTasks.values())
        const result: LevelEntitySnapshot[] = []
        for (const [entityId, view] of this.plantViews) {
            const flash = this.flashes.snapshot(entityId)
            result.push({ ...view.snapshot(entityId), ...(flash ? { flash } : {}) })
        }
        for (const [entityId, view] of this.zombies) {
            const flash = this.flashes.snapshot(entityId)
            result.push({ ...view.snapshot(entityId), ...(flash ? { flash } : {}) })
        }
        for (const [entityId, view] of this.itemViews) {
            const item = view.snapshot(entityId)
            if (item) result.push(item)
        }
        return result.sort((left, right) => left.entityId - right.entityId)
    }

    async restore(snapshots: LevelEntitySnapshot[]): Promise<void> {
        await Promise.all(this.creationTasks.values())
        for (const snapshot of snapshots) {
            if (snapshot.kind === 'plant' || snapshot.kind === 'zombie') this.flashes.restore(snapshot.entityId, snapshot.flash)
            if (snapshot.kind === 'plant') {
                await this.plantViews.get(snapshot.entityId)?.restore(snapshot)
            } else if (snapshot.kind === 'zombie') {
                const view = this.zombies.get(snapshot.entityId)
                if (view) await view.restore(snapshot)
            } else this.itemViews.get(snapshot.entityId)?.restore(snapshot)
        }
        // Paused scenes do not tick again to reveal the restored views.
        if (this.lastSnapshot) this.sync(this.lastSnapshot, { added: [], removed: [] }, [])
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        // What the level started or was loaded with comes without what goes with coming.
        const added = this.lastSnapshot !== undefined
        this.lastSnapshot = snapshot
        this.flashes.applyEvents(events, snapshot.gameplayTick)
        for (const event of events) BEFORE[event.type]?.(this, event, snapshot)
        for (const id of changes.removed) this.remove(id)
        for (const id of changes.added) {
            if (this.pending.has(id) || this.entities.has(id)) continue
            const task = this.create(id, snapshot, added)
                .catch(error => console.error('[Level] Failed to create entity', error))
                .finally(() => this.creationTasks.delete(id))
            this.creationTasks.set(id, task)
        }
        const particle = (effect: string, x: number, y: number, tint?: Color, mirrored = false) => ParticlePlayer.spawn({
            parent: this.layer, id: effect, ...boardToLayer(x, y), renderOrder: renderOrder('top'), tint, mirrored,
        })
        for (const plant of snapshot.plants) {
            const flash = this.flashes.plant(plant, snapshot.gameplayTick)
            this.plantViews.get(plant.entityId)?.update(plant, snapshot, particle, flash)
        }
        this.syncPlantHighlight(snapshot)
        for (const zombie of snapshot.zombies) this.showZombie(zombie, snapshot)
        for (const projectile of snapshot.projectiles) this.projectiles.get(projectile.entityId)?.sync(projectile)
        this.syncGridItems()
        for (const item of snapshot.items) this.itemViews.get(item.entityId)?.sync(item)
        this.syncWaitingMowers(snapshot)
        for (const plant of snapshot.plants) {
            const node = this.entities.get(plant.entityId)
            if (node) node.active = this.plantViews.has(plant.entityId) && GameDebugSettings.perfPlantsVisible
        }
        for (const zombie of snapshot.zombies) {
            const node = this.entities.get(zombie.entityId)
            if (node) node.active = this.zombies.has(zombie.entityId) && GameDebugSettings.perfZombiesVisible
        }
        for (const event of events) {
            AFTER[event.type]?.(this, event, snapshot)
            if (event.type === 'plantPlaced') this.plantingEffect(snapshot, event)
        }
        this.syncLayerOrder(snapshot)
        if (!this.intro.complete) this.intro.sync()
    }

    /**
     * The things of the cells as they are now: also between the level's frames, since graves rise by the intro's time.
     * `effects`: `false` takes their state without what goes with getting there (a restored game).
     */
    syncGridItems(effects = true): void {
        const world = this.lastSnapshot
        for (const item of world?.gridItems ?? []) this.gridItems.get(item.entityId)?.sync(item, world!, effects)
    }

    private remove(id: number): void {
        this.pending.delete(id)
        this.plantViews.get(id)?.destroy?.()
        this.plantViews.delete(id)
        this.zombies.get(id)?.destroy()
        this.zombies.delete(id)
        this.zombieTypes.delete(id)
        this.projectiles.get(id)?.destroy()
        this.projectiles.delete(id)
        this.gridItems.get(id)?.destroy?.()
        this.gridItems.delete(id)
        this.itemViews.delete(id)
        this.flashes.remove(id)
        this.attachments.delete(id)
        if (this.highlightedPlant === id) this.highlightedPlant = undefined
        this.entities.get(id)?.destroy()
        this.entities.delete(id)
    }

    /** Board::DoPlantingEffects: the dirt of a plant put down, over everything. */
    private plantingEffect(snapshot: WorldSnapshot, event: ServerEvent): void {
        const plant = snapshot.plants.find(candidate => candidate.entityId === event.data.entityId)
        if (plant) ParticlePlayer.spawn({ parent: this.layer, id: 'pvz:planting', ...boardToLayer(plant.x + 41, plant.y + 74), renderOrder: renderOrder('top') })
    }

    /** Recycled under a shared holder per draw order. */
    particle(effect: string, x: number, y: number, order: number, tint?: Color, mirrored = false): void {
        let parent = this.particleHolders.get(order)
        if (!parent) {
            parent = uiNode({ name: `BoardParticles-${order}`, parent: this.layer, layer: this.layer.layer }).node
            this.particleHolders.set(order, parent)
        }
        ParticlePlayer.spawn({ parent, id: effect, ...boardToLayer(x, y), renderOrder: order, tint, mirrored, recycle: true })
    }

    /** `added`: it came during play. */
    private async create(id: number, snapshot: WorldSnapshot, added: boolean): Promise<void> {
        const plant = snapshot.plants.find(value => value.entityId === id)
        const zombie = snapshot.zombies.find(value => value.entityId === id)
        const projectile = snapshot.projectiles.find(value => value.entityId === id)
        const item = snapshot.items.find(value => value.entityId === id)
        const gridItem = snapshot.gridItems?.find(value => value.entityId === id)
        const positioned = plant ?? zombie ?? projectile
        if (!positioned && !item && !gridItem) return
        this.pending.add(id)
        const level = this.content.levels.levels[snapshot.levelId]
        const node = uiNode({
            name: `Entity-${id}`, parent: item ? item.typeId === level.award.id ? this.awardLayer : this.coinLayer : this.layer,
            anchor: { x: 0, y: 1 },
            // An item and a thing of a cell are placed by their views.
            position: positioned && boardToLayer(positioned.x, positioned.y),
            // Factories stay hidden until their first sync applies the current position and pose.
            active: !plant && !zombie,
        }).node
        this.entities.set(id, node)
        // A view made for an entity that went meanwhile goes with it.
        const keep = <View extends { destroy?(): void }>(views: Map<number, View>, view: View): boolean => {
            if (node.isValid) views.set(id, view)
            else view.destroy?.()
            return node.isValid
        }
        try {
            if (projectile) {
                keep(this.projectiles, await this.content.projectileViews.create({ node, stage: this, typeId: projectile.typeId, projectile }))
            } else if (plant) {
                const attachments = new EntityAttachments()
                const view = await this.content.plantViews.create({ node, attachments, content: this.content, animations: this.animations,
                    assets: { shadow: this.assets.mowerShadow, wallnutCracked: this.assets.wallnutCracked },
                    plant, tick: snapshot.gameplayTick, stage: this })
                if (keep(this.plantViews, view)) this.attachments.set(id, attachments)
            } else if (zombie) {
                const attachments = new EntityAttachments()
                const view = await this.content.zombieViews.create({ node, attachments, content: this.content, animations: this.animations,
                    shadowParent: this.layer, assets: { shadow: this.assets.mowerShadow, sprites: this.assets.zombieSprites },
                    zombie, tick: snapshot.gameplayTick })
                if (keep(this.zombies, view)) {
                    this.zombieTypes.set(id, zombie.typeId)
                    this.attachments.set(id, attachments)
                }
            } else if (gridItem) {
                const view = await this.content.gridItemViews.create({ node, content: this.content, item: gridItem, stage: this, added })
                if (keep(this.gridItems, view)) this.syncGridItems()
            } else {
                const view = await LevelItemView.create(node, item!, { content: this.content, assets: this.assets, layer: this.rootLayer, level,
                    sunBankOffset: () => this.sunBankOffset() })
                if (node.isValid) { this.itemViews.set(id, view); view.sync(item!) }
            }
        } catch (error) {
            if (node.isValid) node.destroy()
            this.entities.delete(id)
            throw error
        } finally {
            this.pending.delete(id)
        }
    }

    /** Everything of the layer that has a place in the draw order, with it. */
    private collectLayerEntries(snapshot: WorldSnapshot): { node: Node, order: number, entityId?: number }[] {
        const entries: { node: Node, order: number, entityId?: number }[] = []
        for (const [node, entry] of this.scenery) {
            if (node.isValid) entries.push({ node, ...entry })
            else this.scenery.delete(node)
        }
        const add = (entityId: number, order: number) => {
            const node = this.entities.get(entityId)
            if (node?.isValid) entries.push({ node, order, entityId })
        }
        // Shadows lie on the ground layer, under every row's plants and zombies.
        const shadow = (node: Node | undefined, entity: { entityId: number, row: number }) => {
            if (node?.isValid) entries.push({ node, order: renderOrder('ground', entity.row, SHADOW_RENDER_OFFSET), entityId: entity.entityId })
        }
        const { presentation } = this.content
        for (const entity of snapshot.plants) add(entity.entityId, this.plantOrder(entity))
        for (const entity of snapshot.zombies) {
            add(entity.entityId, this.zombieOrder(entity.row))
            shadow(this.zombies.get(entity.entityId)?.shadowNode, entity)
        }
        for (const entity of snapshot.projectiles) {
            add(entity.entityId, renderOrder(presentation.projectiles[entity.typeId]?.layer ?? 'projectile', entity.row))
            shadow(this.projectiles.get(entity.entityId)?.shadowNode, entity)
        }
        for (const entity of snapshot.gridItems ?? []) {
            const { layer, offset } = presentation.gridItems[entity.typeId]
            add(entity.entityId, renderOrder(layer, entity.row, offset))
        }
        const mower = presentation.projectiles[this.content.levels.levels[snapshot.levelId].lawnMower]?.layer ?? 'projectile'
        for (const [row, node] of this.waitingMowers) entries.push({ node, order: renderOrder(mower, row) })
        for (const child of this.layer.children) {
            const particle = child.getComponent(ParticlePlayer)
            if (particle) entries.push({ node: child, order: particle.renderOrder })
        }
        for (const [order, node] of this.particleHolders) entries.push({ node, order })
        return entries
    }

    /**
     * Plant::CalcRenderOrder: within a row, a plant further left draws later, so the chomper's head covers the plant to
     * its right; rolling bowling nuts draw on the projectile layer.
     */
    plantOrder(entity: Pick<PlantSnapshot, 'typeId' | 'row' | 'x' | 'behaviorState'>): number {
        // Plant::UpdateBowling changes draw order before incrementing the downward target row: a plant rolling down
        // is drawn with the row above.
        const row = entity.row - (Number(entity.behaviorState?.direction) > 0 ? 1 : 0)
        return renderOrder(this.content.presentation.plants[entity.typeId]?.layer ?? 'plant', row, plantRenderOffset(entity.x))
    }

    zombieOrder(row: number): number {
        return renderOrder('zombie', row, ZOMBIE_RENDER_OFFSET)
    }

    private syncLayerOrder(snapshot: WorldSnapshot): void {
        const entries = this.collectLayerEntries(snapshot)
        // Equal orders keep entities in creation order, then what was added at their order (an entity's own particles).
        entries.sort((left, right) => left.order - right.order || (left.entityId ?? Infinity) - (right.entityId ?? Infinity))
        // Unlisted children (an entity leaving the snapshot) keep their place; comparing by index instead would move every
        // node after one of them. Most nodes are already in place, so the engine is called only for the rest.
        const layer = this.layer, children = layer.children, listed = new Set<Node>()
        for (const { node } of entries) listed.add(node)
        let index = 0
        for (const { node } of entries) {
            if (node.parent !== layer) continue
            while (index < children.length && children[index] !== node && !listed.has(children[index])) index++
            if (children[index] !== node) node.setSiblingIndex(index)
            index++
        }
    }

    /** Each row's waiting mower, where the intro rolls it in: the level's mower before it is set off, drawn by its view. */
    private syncWaitingMowers(snapshot: WorldSnapshot): void {
        for (const [row, node] of this.waitingMowers) {
            if (snapshot.mowerRows.includes(row)) continue
            node.destroy()
            this.waitingMowers.delete(row)
        }
        const level = this.content.levels.levels[snapshot.levelId]
        for (const row of snapshot.mowerRows) {
            if (this.waitingMowers.has(row)) continue
            const node = uiNode({ name: `WaitingMower-${row}`, parent: this.layer, anchor: { x: 0, y: 1 },
                position: boardToLayer(MOWER_READY_X, mowerY(this.content.definitions.boards[level.board], row)) }).node
            this.waitingMowers.set(row, node)
            void this.content.projectileViews.create({ node, stage: this, typeId: level.lawnMower })
                .catch(error => console.error('[Level] Failed to draw a waiting mower', error))
        }
    }
}
