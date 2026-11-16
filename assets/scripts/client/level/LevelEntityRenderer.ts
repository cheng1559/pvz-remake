import { Color, Component, Node, Vec3 } from 'cc'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import { ParticlePlayer, type ParticleSpawnArgs } from '@/client/particle/ParticlePlayer'
import { uiNode } from '@/client/view/uiNode'
import { levelStandsStill, type MowerSnapshot, type PlantSnapshot, type ServerEvent, type WorldSnapshot, type ZombieSnapshot } from '@/shared/protocol/index'
import { plantRenderOffset, renderOrder, SHADOW_RENDER_OFFSET, ZOMBIE_RENDER_OFFSET } from '@/shared/content/renderOrder'
import { LEVEL_AWARD, type LevelDefinition } from '@/shared/content/gameplay'
import type { LevelIntro } from './LevelIntro'
import { ZombieView } from '@/client/zombies/ZombieView'
import { PlantView } from '@/client/plants/PlantView'
import type { LevelParticleOwnerSnapshot, LevelPresentationSnapshot } from './LevelPresentationSnapshot'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { boardCell } from './LevelGeometry'
import { EntityFlashes } from './EntityFlashes'
import { canShovel, cellPlant } from '@/shared/content/planting'
import { boardToLayer, type Content, type EntityView, type LevelStage, type ViewType } from './LevelStage'

/** What an entity of the board is, by the list of the server's snapshot it is in. */
type EntityKind = 'plant' | 'zombie' | 'projectile' | 'mower' | 'gridItem' | 'item'
type Positioned = { entityId: number, typeId: string, row: number, x: number, y: number }

/** Each kind's list in a snapshot. */
const LISTS: Record<EntityKind, (world: WorldSnapshot) => readonly { entityId: number, typeId: string }[]> = {
    plant: world => world.plants, zombie: world => world.zombies, projectile: world => world.projectiles, mower: world => world.mowers,
    gridItem: world => world.gridItems ?? [], item: world => world.items,
}
const KINDS = Object.keys(LISTS) as EntityKind[]

interface Entity { kind: EntityKind, node: Node, view?: EntityView }

/** What the board keeps across a save: what each view keeps of its own, and the flashes. */
type BoardSnapshot = Pick<LevelPresentationSnapshot, 'entities' | 'flashes'>

/**
 * What is on the board, drawn by the views of its entities (plants, zombies, projectiles, mowers, the things of a cell, items):
 * which exist, where each is drawn among the rest, and which view hears of an event (ClientViews.events). The views
 * draw; the board is their stage.
 */
export class LevelEntityRenderer implements LevelStage {
    /** Nodes of the layer that are no entity's, each with its place in the draw order. */
    private readonly scenery = new Map<Node, { order: number, entityId?: number }>()
    private readonly entities = new Map<number, Entity>()
    /** How far the sun counter sits from its 800-wide layout position, e.g. when pinned to the screen edge. */
    sunBankOffset = (): number => 0
    levelEndTicks = (): number => -1
    shake: LevelStage['shake'] = () => {}
    private readonly creationTasks = new Map<number, Promise<void>>()
    readonly flashes = new EntityFlashes()
    private pointer?: { x: number; y: number }
    private lastSnapshot?: WorldSnapshot
    private highlightedPlant?: number
    /** The board's particles, in one node of the layer per draw order (particleLayer). */
    private readonly particleHolders = new Map<number, Node>()
    /** Drawing its first frame, or putting a save back. */
    private firstFrame = false
    private restoring = false

    constructor(
        readonly content: Content,
        readonly layer: Node,
        private readonly coinLayer: Node,
        private readonly awardLayer: Node,
        readonly intro: LevelIntro,
        readonly graveRise: LevelStage['graveRise'],
    ) {}

    get quiet(): boolean { return this.firstFrame || this.restoring }
    get level(): LevelDefinition { return this.content.levels.levels[this.lastSnapshot!.levelId] }
    get gameplayTick(): number { return this.lastSnapshot?.gameplayTick ?? 0 }

    addScenery(node: Node, order: number, entityId?: number): void { this.scenery.set(node, { order, ...(entityId === undefined ? {} : { entityId }) }) }

    node(id: number): Node | undefined { return this.entities.get(id)?.node }

    view(id: number): EntityView | undefined
    view<V extends EntityView>(id: number, type: ViewType<V>): V | undefined
    view(id: number, type?: ViewType<EntityView>): EntityView | undefined {
        const view = this.entities.get(id)?.view
        return !type || view instanceof type ? view : undefined
    }

    setPointer(pointer?: { x: number; y: number }): void {
        this.pointer = pointer
        if (this.lastSnapshot) this.syncPlantHighlight(this.lastSnapshot)
    }

    /** The shovel's target under the pointer is lit: the cell's plant, if the shovel can dig it up (tools.use). */
    private syncPlantHighlight(snapshot: WorldSnapshot): void {
        if (!this.pointer && this.highlightedPlant === undefined) return
        const level = this.content.levels.levels[snapshot.levelId], { plants, tools } = this.content.definitions
        const shovel = snapshot.cursor.mode === 'tool' && tools[snapshot.cursor.toolId]?.kind === 'shovel'
        const cell = this.pointer && !levelStandsStill(snapshot) && shovel
            ? boardCell(this.content.definitions.boards[level.board], this.pointer.x, this.pointer.y) : undefined
        const plant = cell?.inBounds ? cellPlant(plants, snapshot.plants, cell.row, cell.column) : undefined
        const highlighted = plant && canShovel(plants, plant) ? plant.entityId : undefined
        if (highlighted !== this.highlightedPlant && this.highlightedPlant !== undefined) this.view(this.highlightedPlant, PlantView)?.highlight(false)
        if (highlighted !== undefined) this.view(highlighted, PlantView)?.highlight(true)
        this.highlightedPlant = highlighted
    }

    /** The winner of a lost level walks on into the house, drawn by its view (ZombieView.syncGameOverWalk). */
    syncGameOverWinner(zombie: ZombieSnapshot, parent: Node, ticks: number, y: number, approachTicks = 0): void {
        this.view(zombie.entityId, ZombieView)?.syncGameOverWalk(zombie, parent, ticks, y, approachTicks)
    }

    /** The original keeps updating the winner's attachments; its body follows the scripted walk instead. */
    runsDuringGameOver(winnerId: number, component: Component): boolean {
        return this.view(winnerId, ZombieView)?.attachments.has(component.node) ?? false
    }

    particleOwner(node: Node): Extract<LevelParticleOwnerSnapshot, { kind: 'entity' }> | null {
        for (const [entityId, { node: root, view }] of this.entities) {
            if (node !== root && !node.isChildOf(root)) continue
            const anchors = Object.entries(view?.particleAnchors ?? {})
            let slot = 'root', parent = root
            for (let ancestor = node.parent; ancestor && ancestor !== root; ancestor = ancestor.parent) {
                const anchor = anchors.find(([, anchorNode]) => anchorNode === ancestor)
                if (anchor) { [slot, parent] = anchor; break }
            }
            const position = parent.inverseTransformPoint(new Vec3(), node.worldPosition)
            return { kind: 'entity', entityId, slot, x: position.x, y: position.y, z: position.z }
        }
        return null
    }

    particleParent(owner: Extract<LevelParticleOwnerSnapshot, { kind: 'entity' }>): Node | null {
        const entity = this.entities.get(owner.entityId)
        if (!entity) return null
        return entity.view?.particleAnchors?.[owner.slot] ?? entity.node
    }

    /** What each view keeps of its own across a save, and the flashes of the entities on the board. */
    async snapshot(): Promise<BoardSnapshot> {
        await Promise.all(this.creationTasks.values())
        const entities: BoardSnapshot['entities'] = []
        for (const [entityId, { view }] of this.entities) {
            const saved = view?.snapshot?.(entityId)
            if (saved) entities.push(saved)
        }
        // A flash of an entity that came and went between two frames is no entity's.
        const flashes = this.flashes.snapshot(entityId => this.entities.has(entityId))
        return { entities: entities.sort((left, right) => left.entityId - right.entityId), flashes }
    }

    /** The flashes and what each view kept come back, and the board is shown again quietly, as it was. */
    async restore({ entities: snapshots, flashes }: BoardSnapshot): Promise<void> {
        this.restoring = true
        try {
            await Promise.all(this.creationTasks.values())
            this.flashes.restore(flashes)
            for (const snapshot of snapshots) {
                const entity = this.entities.get(snapshot.entityId)
                if (entity?.kind === snapshot.kind) await entity.view?.restore?.(snapshot)
            }
            // Paused scenes do not tick again to reveal the restored views.
            if (this.lastSnapshot) this.sync(this.lastSnapshot, { added: [], removed: [] }, [])
        } finally {
            this.restoring = false
        }
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        this.firstFrame = this.lastSnapshot === undefined
        this.lastSnapshot = snapshot
        const handlers = this.content.views.events
        for (const event of events) for (const handler of handlers.of(event.type, 'before')) handler(this, event, snapshot)
        const added = new Set(changes.added)
        if (added.size) for (const kind of KINDS) for (const entity of LISTS[kind](snapshot)) {
            const id = entity.entityId
            if (!added.has(id) || this.entities.has(id)) continue
            const task = this.create(kind, entity)
                .catch(error => console.error('[Level] Failed to create entity', error))
                .finally(() => this.creationTasks.delete(id))
            this.creationTasks.set(id, task)
        }
        for (const kind of KINDS) for (const entity of LISTS[kind](snapshot)) this.entities.get(entity.entityId)?.view?.sync(entity, snapshot)
        this.syncPlantHighlight(snapshot)
        // A plant or a zombie shows once its view has drawn it as it is now.
        for (const [kind, visible] of [['plant', GameDebugSettings.perfPlantsVisible], ['zombie', GameDebugSettings.perfZombiesVisible]] as const) {
            for (const { entityId } of LISTS[kind](snapshot)) {
                const entity = this.entities.get(entityId)
                if (entity) entity.node.active = !!entity.view && visible
            }
        }
        for (const event of events) for (const handler of handlers.of(event.type, 'after')) handler(this, event, snapshot)
        // What the frame no longer has goes once its events are heard: what fell off a zombie gone with it (a puff) flies
        // from where it last was.
        for (const id of changes.removed) this.remove(id)
        this.syncLayerOrder(snapshot)
        if (!this.intro.complete) this.intro.sync()
        this.firstFrame = false
    }

    /** The things of the cells as they are now: also between the level's frames, since graves rise by the intro's time. */
    syncGridItems(): void {
        const world = this.lastSnapshot
        for (const item of world?.gridItems ?? []) this.entities.get(item.entityId)?.view?.sync(item, world!)
    }

    private remove(id: number): void {
        const entity = this.entities.get(id)
        entity?.view?.destroy?.()
        this.flashes.remove(id)
        if (this.highlightedPlant === id) this.highlightedPlant = undefined
        entity?.node.destroy()
        this.entities.delete(id)
    }

    particle(effect: string, x: number, y: number, order: number, tint?: Color, mirrored = false): void {
        this.spawnParticle(order, { id: effect, ...boardToLayer(x, y), tint, mirrored, recycle: true })
    }

    spawnParticle(order: number, args: Omit<ParticleSpawnArgs, 'parent' | 'renderOrder'>): ParticlePlayer {
        return ParticlePlayer.spawn({ ...args, parent: this.particleLayer(order), renderOrder: order })
    }

    reorderParticle(player: ParticlePlayer, order: number): void {
        player.renderOrder = order
        const parent = this.particleLayer(order)
        if (player.node.parent !== parent) player.node.setParent(parent)
    }

    /**
     * The node of the layer the board's particles at a draw order are in, made when first needed, at the layer's
     * origin. It is drawn at that order among the entities, and its particles in the order they came, so a new one is
     * appended rather than moved among the entities. A save's particle of the layer goes back into it by its order.
     */
    particleLayer(order: number): Node {
        let holder = this.particleHolders.get(order)
        if (!holder) {
            holder = uiNode({ name: `BoardParticles-${order}`, parent: this.layer, layer: this.layer.layer }).node
            this.particleHolders.set(order, holder)
        }
        return holder
    }

    /** An entity's node, and its view from the registry of its kind, shown at once as it is now. */
    private async create(kind: EntityKind, entity: { entityId: number, typeId: string }): Promise<void> {
        const id = entity.entityId, award = kind === 'item' && entity.typeId === LEVEL_AWARD
        const positioned = kind === 'plant' || kind === 'zombie' || kind === 'projectile' || kind === 'mower' ? entity as Positioned : undefined
        const node = uiNode({
            name: `Entity-${id}`, parent: award ? this.awardLayer : kind === 'item' ? this.coinLayer : this.layer,
            anchor: { x: 0, y: 1 },
            position: positioned && boardToLayer(positioned.x, positioned.y),
            // A plant or a zombie stays hidden until a frame shows it as it is (the visibility in sync).
            active: kind !== 'plant' && kind !== 'zombie',
        }).node
        this.entities.set(id, { kind, node })
        try {
            const { views } = this.content, context = { node, content: this.content, stage: this }
            const view: EntityView = await (kind === 'plant' ? views.plants.create({ ...context, plant: entity as PlantSnapshot })
                : kind === 'zombie' ? views.zombies.create({ ...context, zombie: entity as ZombieSnapshot })
                : kind === 'projectile' ? views.projectiles.create({ ...context, projectile: entity as WorldSnapshot['projectiles'][number] })
                // A mower is drawn as the mowing projectile it runs as (MowerView, by its type's presentation).
                : kind === 'mower' ? views.projectiles.create({ ...context, projectile: entity as MowerSnapshot })
                : kind === 'gridItem' ? views.gridItems.create({ ...context, item: entity as NonNullable<WorldSnapshot['gridItems']>[number] })
                : views.items.create({ ...context, item: entity as WorldSnapshot['items'][number] }))
            // A view made for an entity that went meanwhile goes with it.
            if (!node.isValid || this.entities.get(id)?.node !== node) { view.destroy?.(); return }
            this.entities.get(id)!.view = view
            const now = this.lastSnapshot && LISTS[kind](this.lastSnapshot).find(value => value.entityId === id)
            if (now) view.sync(now, this.lastSnapshot!)
        } catch (error) {
            if (node.isValid) node.destroy()
            if (this.entities.get(id)?.node === node) this.entities.delete(id)
            throw error
        }
    }

    /** Where an entity is drawn among the rest; none for an item, which is not on the board's layer. */
    private orderOf(kind: EntityKind, entity: Positioned): number | undefined {
        switch (kind) {
            case 'plant': return this.plantOrder(entity as unknown as PlantSnapshot)
            case 'zombie': return this.zombieOrder(entity.row)
            case 'projectile': case 'mower': return this.projectileOrder(entity.typeId, entity.row)
            case 'gridItem': return this.gridItemOrder(entity.typeId, entity.row)
            default: return undefined
        }
    }

    /** Everything of the layer that has a place in the draw order, with it. */
    private collectLayerEntries(snapshot: WorldSnapshot): { node: Node, order: number, entityId?: number }[] {
        const entries: { node: Node, order: number, entityId?: number }[] = []
        for (const [node, entry] of this.scenery) {
            if (node.isValid) entries.push({ node, ...entry })
            else this.scenery.delete(node)
        }
        for (const kind of KINDS) for (const value of LISTS[kind](snapshot)) {
            const entity = this.entities.get(value.entityId), order = this.orderOf(kind, value as Positioned)
            if (!entity?.node.isValid || order === undefined) continue
            entries.push({ node: entity.node, order, entityId: value.entityId })
            // Shadows lie on the ground layer, under every row's plants and zombies.
            const shadow = entity.view?.shadowNode
            if (shadow?.isValid) entries.push({ node: shadow, order: renderOrder('ground', (value as Positioned).row, SHADOW_RENDER_OFFSET), entityId: value.entityId })
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

    projectileOrder(typeId: string, row: number): number {
        return renderOrder(this.content.presentation.projectiles[typeId]?.layer ?? 'projectile', row)
    }

    gridItemOrder(typeId: string, row: number): number {
        const { layer, offset } = this.content.presentation.gridItems[typeId]
        return renderOrder(layer, row, offset)
    }

    syncLayerOrder(snapshot: WorldSnapshot): void {
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
}
