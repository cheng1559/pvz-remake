import { Color, Node, Sprite, tween, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import { FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import type { ClientAnimationRegistry, ClientAnimationTarget } from '@/client/content/ClientAnimationRegistry'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { TodParticleSystem } from '@/core/Particle'
import { SeedPacketRenderer, SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH } from '@/client/hud/SeedPacketRenderer'
import type { LawnMowerSnapshot, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { Adventure11AudioPresenter } from './Adventure11AudioPresenter'
import { Adventure11IntroPresenter } from './Adventure11IntroPresenter'
import { Adventure11ZombieView } from './Adventure11ZombieView'
import type { Adventure11EntitySnapshotV2, Adventure11ParticleOwnerSnapshotV2 } from './Adventure11PresentationSnapshotV2'

const WIDTH = 800
const HEIGHT = 600
type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type SpriteAsset = Awaited<ReturnType<SpriteRepository['load']>>
type FontAsset = Awaited<ReturnType<FontRepository['load']>>

export interface Adventure11EntityAssets {
    projectileFrame: SpriteAsset
    mowerFrame: SpriteAsset
    mowerShadow: SpriteAsset
    damagedZombieArm: SpriteAsset
    seeds: SpriteAsset
    packetPlants: SpriteAsset
    cachedPacketPlants: SpriteAsset
    seedPacketLarger: SpriteAsset
    plantPreviews: SpriteAsset
    packetCostFont: FontAsset
}

type ShooterAnimationTarget = Extract<ClientAnimationTarget, 'pvz:peashooter' | 'pvz:repeater'>

interface ShooterPlantView {
    animationTarget: ShooterAnimationTarget
    body: ReanimPlayer
    idleHead: ReanimPlayer
    shootHead: ReanimPlayer
    idleRate: number
}

export class Adventure11EntityRenderer {
    private readonly entities = new Map<number, Node>()
    private readonly pending = new Set<number>()
    private readonly creationTasks = new Map<number, Promise<void>>()
    private readonly shooterPlants = new Map<number, ShooterPlantView>()
    private readonly zombies = new Map<number, Adventure11ZombieView>()
    private readonly mowerPlayersReady = new Set<number>()
    private readonly mowerStates = new Map<number, LawnMowerSnapshot['state']>()

    constructor(
        private readonly rootLayer: number,
        private readonly content: LoadedContent,
        private readonly animations: ClientAnimationRegistry,
        private readonly assets: Adventure11EntityAssets,
        private readonly entityLayer: Node,
        private readonly coinLayer: Node,
        private readonly awardLayer: Node,
        private readonly audio: Adventure11AudioPresenter,
        private readonly intro: Adventure11IntroPresenter,
    ) {}

    node(id: number): Node | undefined {
        return this.entities.get(id)
    }

    nodes(): Iterable<Node> {
        return this.entities.values()
    }

    particleOwner(node: Node): Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'entity' }> | null {
        for (const [entityId, root] of this.entities) {
            if (node !== root && !node.isChildOf(root)) continue
            let slot: Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'entity' }>['slot'] = 'root'
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

    particleParent(owner: Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'entity' }>): Node | null {
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

    async snapshot(): Promise<Adventure11EntitySnapshotV2[]> {
        await Promise.all(this.creationTasks.values())
        const result: Adventure11EntitySnapshotV2[] = []
        for (const [entityId, view] of this.shooterPlants) {
            result.push({
                kind: 'plant', entityId,
                body: view.body.snapshot(),
                idleHead: view.idleHead.snapshot(),
                shootHead: view.shootHead.snapshot(),
                idleRate: view.idleRate,
            })
        }
        for (const [entityId, view] of this.zombies) result.push(view.snapshot(entityId))
        for (const [entityId, node] of this.entities) {
            if (this.shooterPlants.has(entityId) || this.zombies.has(entityId)) continue
            const mower = node.getChildByName('MowerAnimation')?.getComponent(ReanimPlayer)
            if (mower) result.push({ kind: 'mower', entityId, animation: mower.snapshot() })
            else {
                const animation = node.getComponent(ReanimPlayer)
                if (animation) result.push({ kind: 'sun', entityId, animation: animation.snapshot() })
            }
        }
        return result.sort((left, right) => left.entityId - right.entityId)
    }

    async restore(snapshots: Adventure11EntitySnapshotV2[]): Promise<void> {
        await Promise.all(this.creationTasks.values())
        for (const snapshot of snapshots) {
            if (snapshot.kind === 'plant') {
                const view = this.shooterPlants.get(snapshot.entityId)
                if (!view) continue
                view.idleRate = snapshot.idleRate
                view.body.restore(snapshot.body)
                view.idleHead.restore(snapshot.idleHead)
                view.shootHead.restore(snapshot.shootHead)
                if (snapshot.idleHead.attachmentTrackId) view.idleHead.reattachAfterRestore(view.body)
                if (snapshot.shootHead.attachmentTrackId) view.shootHead.reattachAfterRestore(view.body)
                if (snapshot.shootHead.playing) view.shootHead.setOnFinish(() => this.finishShooterPlantShoot(view))
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
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        for (const event of events) {
            if (event.type !== 'zombiePartDropped') continue
            const entityId = event.data.entityId
            const part = event.data.part
            if (typeof entityId !== 'number' || (part !== 'head' && part !== 'arm')) continue
            const zombie = snapshot.zombies.find(candidate => candidate.entityId === entityId)
            const node = this.entities.get(entityId)
            if (zombie && node) {
                node.setPosition(zombie.x - WIDTH / 2, HEIGHT / 2 - zombie.y)
                this.zombies.get(entityId)?.sync(zombie)
            }
            this.spawnZombiePart(entityId, part, event.data.mowered === true)
        }
        for (const id of changes.removed) this.remove(id)
        for (const id of changes.added) {
            const task = this.create(id, snapshot)
                .catch(error => console.error('[Phase4] Failed to create entity', error))
                .finally(() => this.creationTasks.delete(id))
            this.creationTasks.set(id, task)
        }
        for (const entity of [...snapshot.plants, ...snapshot.zombies, ...snapshot.projectiles, ...snapshot.lawnMowers]) {
            this.entities.get(entity.entityId)?.setPosition(entity.x - WIDTH / 2, HEIGHT / 2 - entity.y)
        }
        for (const item of snapshot.items) {
            const node = this.entities.get(item.entityId)
            if (!node) continue
            const award = item.typeId === this.content.levels.levels[snapshot.levelId].award.id
            node.setPosition(
                award ? item.x + SEED_PACKET_WIDTH / 2 : item.x + 30,
                award ? -(item.y + SEED_PACKET_HEIGHT / 2) : -(item.y + 30),
            )
            if (!award) node.setScale(item.scale, item.scale, 1)
            uiNode({ node, opacity: item.alpha })
        }
        for (const mower of snapshot.lawnMowers) this.syncMower(mower)
        const selectedSeedId = snapshot.cursor.mode === 'seed' ? snapshot.cursor.seedId : undefined
        const upgradeTargets = new Set(this.content.loadedMods.plantUpgrades
            .filter(upgrade => upgrade.seedId === selectedSeedId)
            .map(upgrade => upgrade.targetPlantId))
        for (const plant of snapshot.plants) {
            this.syncShooterPlant(
                plant.entityId,
                plant.eatenFlashCounter,
                upgradeTargets.has(plant.typeId),
                snapshot.gameplayTick,
            )
        }
        for (const zombie of snapshot.zombies) this.zombies.get(zombie.entityId)?.sync(zombie)
        this.syncLayerOrder(snapshot)
        this.playEvents(snapshot, events)
    }

    private remove(id: number): void {
        this.pending.delete(id)
        this.shooterPlants.delete(id)
        this.zombies.get(id)?.destroy()
        this.zombies.delete(id)
        this.mowerPlayersReady.delete(id)
        this.mowerStates.delete(id)
        this.entities.get(id)?.destroy()
        this.entities.delete(id)
    }

    private playEvents(snapshot: WorldSnapshot, events: ServerEvent[]): void {
        for (const event of events) {
            if (event.type === 'plantFiring') {
                const id = event.data.plantId
                if (typeof id === 'number') this.playShooterPlantShoot(id)
            } else if (event.type === 'plantPlaced') {
                const id = event.data.entityId
                if (typeof id === 'number') this.spawnPlantingParticle(snapshot, id)
            } else if (event.type === 'projectileImpact') {
                const id = event.data.projectileId
                if (typeof id === 'number') this.entities.get(id)?.destroy()
                this.audio.projectileImpact()
                this.spawnPeaSplat(snapshot, event)
            }
        }
    }

    private async create(id: number, snapshot: WorldSnapshot): Promise<void> {
        if (this.pending.has(id) || this.entities.has(id)) return
        const entity = allEntities(snapshot).find(value => value.entityId === id)
        if (!entity) return
        this.pending.add(id)
        const isItem = snapshot.items.some(value => value.entityId === id)
        const isAward = entity.typeId === this.content.levels.levels[snapshot.levelId].award.id
        const node = uiNode({
            name: `Entity-${id}`, parent: isAward ? this.awardLayer : isItem ? this.coinLayer : this.entityLayer,
            anchor: { x: 0, y: 1 },
        }).node
        this.entities.set(id, node)
        try {
            if (snapshot.projectiles.some(value => value.entityId === id)) {
                uiNode({ node, anchor: { x: 0, y: 1 }, sprite: { frame: this.assets.projectileFrame, sizeMode: Sprite.SizeMode.RAW, trim: false } })
            } else if (snapshot.lawnMowers.some(value => value.entityId === id)) {
                await this.createMower(id, node, snapshot)
            } else if (snapshot.plants.some(value => value.entityId === id)) {
                const plant = snapshot.plants.find(value => value.entityId === id)!
                await this.createShooterPlant(id, node, plant.typeId)
            } else if (snapshot.zombies.some(value => value.entityId === id)) {
                const zombie = snapshot.zombies.find(value => value.entityId === id)!
                const view = new Adventure11ZombieView(
                    node, this.content.registry, this.content.loader, this.animations, this.entityLayer,
                    this.assets.mowerShadow, this.assets.damagedZombieArm,
                )
                this.zombies.set(id, view)
                view.sync(zombie)
            } else if (isAward) {
                this.createAward(node, snapshot)
            } else {
                const player = node.addComponent(ReanimPlayer)
                await player.load('pvz:sun', this.content.registry, this.content.loader)
                if (node.isValid) player.play({ loop: true, rate: 0.5 })
            }
        } catch (error) {
            if (node.isValid) node.destroy()
            this.entities.delete(id)
            throw error
        } finally {
            this.pending.delete(id)
        }
    }

    private createAward(node: Node, snapshot: WorldSnapshot): void {
        uiNode({ node, size: { width: SEED_PACKET_WIDTH, height: SEED_PACKET_HEIGHT }, anchor: { x: 0.5, y: 0.5 } })
        const backEffects = uiNode({ name: 'AwardBackEffects', parent: node }).node
        TodParticleSystem.spawn({ parent: backEffects, effect: 'seedpacket', x: 0, y: 60, z: -1 })
        const cost = this.content.levels.levels[snapshot.levelId].award.packetCost
        SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketNormal', parent: node, layer: this.rootLayer, x: 0, y: 0,
            seedType: 'sunflower', cost, costFont: this.assets.packetCostFont,
            seeds: this.assets.seeds, packetPlants: this.assets.packetPlants,
            cachedPacketPlants: this.assets.cachedPacketPlants,
        })
        const large = SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketLarge', parent: node, layer: this.rootLayer, x: 0, y: 0,
            scale: 2, seedType: 'sunflower', cost, costFont: this.assets.packetCostFont,
            seeds: null, seedPacketLarger: this.assets.seedPacketLarger,
            plantPreviews: this.assets.plantPreviews,
        })
        large.active = false
    }

    private async createShooterPlant(id: number, node: Node, typeId: string): Promise<void> {
        if (typeId !== 'pvz:peashooter' && typeId !== 'pvz:repeater') {
            throw new Error(`unsupported shooter plant: ${typeId}`)
        }
        const animationTarget = typeId
        const animations = this.animations.resolve(animationTarget)
        uiNode({
            name: 'PlantShadow', parent: node, position: { x: -3, y: -51, z: -1 }, anchor: { x: 0, y: 1 },
            sprite: { frame: this.assets.mowerShadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const body = uiNode({ name: 'Body', parent: node, position: animations.body }).node.addComponent(ReanimPlayer)
        const idleHead = uiNode({ name: 'IdleHead', parent: node, position: animations.idleHead }).node.addComponent(ReanimPlayer)
        const shootHead = uiNode({ name: 'ShootHead', parent: node, position: animations.shootHead }).node.addComponent(ReanimPlayer)
        await Promise.all([
            body.load(animations.body.reanimId, this.content.registry, this.content.loader),
            idleHead.load(animations.idleHead.reanimId, this.content.registry, this.content.loader),
            shootHead.load(animations.shootHead.reanimId, this.content.registry, this.content.loader),
        ])
        if (!node.isValid) return
        idleHead.attachToTrack(body, animations.idleHead.attachmentTrackId ?? 'anim_stem')
        shootHead.attachToTrack(body, animations.shootHead.attachmentTrackId ?? 'anim_stem')
        const idleRate = (15 + Math.random() * 5) / 12
        body.play({ loop: true, rate: idleRate * animations.body.rateScale })
        idleHead.play({ loop: true, rate: idleRate * animations.idleHead.rateScale })
        shootHead.hide()
        this.shooterPlants.set(id, { animationTarget, body, idleHead, shootHead, idleRate })
    }

    private playShooterPlantShoot(id: number): void {
        const view = this.shooterPlants.get(id)
        if (!view) return
        view.shootHead.play({
            loop: false, rate: 35 / 12 * this.animations.resolve(view.animationTarget).shootHead.rateScale,
            timeSeconds: 0, hideOnFinish: false,
            onFinish: () => this.finishShooterPlantShoot(view),
        })
        view.shootHead.blendFrom(view.idleHead, 0.1)
        view.idleHead.hide()
    }

    private finishShooterPlantShoot(view: ShooterPlantView): void {
        view.idleHead.play({
            loop: true, rate: view.idleRate * this.animations.resolve(view.animationTarget).idleHead.rateScale,
            timeSeconds: view.body.snapshot().timeSeconds,
        })
        view.idleHead.blendFrom(view.shootHead, 0.1)
        view.shootHead.hide()
    }

    private syncShooterPlant(id: number, eatenFlashCounter: number, upgradeTarget: boolean, tick: number): void {
        const view = this.shooterPlants.get(id)
        if (!view) return
        const grayness = Math.min(255, eatenFlashCounter * 3)
        const color = new Color(grayness, grayness, grayness, 255)
        for (const player of [view.body, view.idleHead, view.shootHead]) {
            player.setColorOverride(upgradeTarget ? upgradeFlashColor(tick) : Color.WHITE)
            player.setExtraAdditiveDraw(eatenFlashCounter > 0, color)
        }
        if (view.shootHead.snapshot().playing || view.idleHead.snapshot().playing) return
        view.idleHead.play({
            loop: true, rate: view.idleRate * this.animations.resolve(view.animationTarget).idleHead.rateScale,
            timeSeconds: view.body.snapshot().timeSeconds,
        })
    }

    private spawnZombiePart(entityId: number, part: 'head' | 'arm', mowered: boolean): void {
        const node = this.entities.get(entityId)
        if (!node) return
        const trackPosition = this.zombies.get(entityId)?.getTrackWorldPosition(part === 'head' ? 'anim_head1' : 'Zombie_outerarm_lower')
        const localPosition = trackPosition ? uiNode({ node: this.entityLayer }).transform.convertToNodeSpaceAR(trackPosition) : null
        const row = Math.round((HEIGHT / 2 - node.position.y - 80) / 100)
        TodParticleSystem.spawn({
            parent: this.entityLayer,
            effect: mowered ? part === 'head' ? 'moweredzombiehead' : 'moweredzombiearm' : part === 'head' ? 'zombiehead' : 'zombiearm',
            x: localPosition?.x ?? node.position.x + (part === 'head' ? 58 : 25),
            y: localPosition?.y ?? node.position.y + (part === 'head' ? -30 : -55),
            renderOrder: row * 10 + 1.01,
            useGameTime: false,
        })
        this.audio.zombiePartDropped()
    }

    private spawnPlantingParticle(snapshot: WorldSnapshot, entityId: number): void {
        const plant = snapshot.plants.find(candidate => candidate.entityId === entityId)
        if (!plant) return
        TodParticleSystem.spawn({
            parent: this.entityLayer, effect: 'planting',
            x: plant.x + 41 - WIDTH / 2, y: HEIGHT / 2 - plant.y - 74,
            renderOrder: 10000, useGameTime: false,
        })
    }

    private spawnPeaSplat(snapshot: WorldSnapshot, event: ServerEvent): void {
        const targetId = event.data.targetId
        const x = event.data.x
        const y = event.data.y
        if (typeof targetId !== 'number' || typeof x !== 'number' || typeof y !== 'number') return
        const zombie = snapshot.zombies.find(candidate => candidate.entityId === targetId)
        const parent = this.entities.get(targetId)
        if (!zombie || !parent) return
        const node = uiNode({
            name: 'PeaSplat', parent,
            position: { x: x + 49 - zombie.x, y: -Math.max(20, Math.min(100, y + 12 - zombie.y)) },
        }).node
        const player = node.addComponent(ParticlePlayer)
        void player.load('pvz:peasplat', this.content.registry, this.content.loader).then(() => {
            if (!node.isValid) return
            player.play(event.eventId >>> 0)
            tween(node).delay(0.21).call(() => { if (node.isValid) node.destroy() }).start()
        }).catch(error => {
            if (node.isValid) node.destroy()
            console.error('[Phase4] Failed to play pea splat', error)
        })
    }

    private syncLayerOrder(snapshot: WorldSnapshot): void {
        const entries: { node: Node, order: number }[] = []
        const add = (entityId: number, order: number) => {
            const node = this.entities.get(entityId)
            if (node?.isValid) entries.push({ node, order })
        }
        for (const entity of snapshot.plants) add(entity.entityId, entity.row * 10)
        for (const entity of snapshot.zombies) {
            add(entity.entityId, entity.row * 10 + 1)
            const shadow = this.zombies.get(entity.entityId)?.shadowNode
            if (shadow?.isValid) entries.push({ node: shadow, order: entity.row * 10 - 0.1 })
        }
        for (const entity of snapshot.projectiles) add(entity.entityId, entity.row * 10 + 2)
        for (const entity of snapshot.lawnMowers) add(entity.entityId, entity.row * 10 + 3)
        for (const child of this.entityLayer.children) {
            const particle = child.getComponent(TodParticleSystem)
            if (particle) entries.push({ node: child, order: particle.renderOrder })
        }
        entries.sort((left, right) => left.order - right.order)
        entries.forEach((entry, index) => entry.node.setSiblingIndex(index))
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

function upgradeFlashColor(tick: number): Color {
    const age = tick % 90
    const gray = Math.min(255, Math.trunc(200 * Math.abs(45 - age) / 45) + 55)
    return new Color(gray, gray, gray, 255)
}

type Positioned = { entityId: number, x: number, y: number }

function allEntities(snapshot: WorldSnapshot): Positioned[] {
    return [...snapshot.plants, ...snapshot.zombies, ...snapshot.projectiles, ...snapshot.items, ...snapshot.lawnMowers]
}
