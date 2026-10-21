import { Color, Node, Sprite, tween, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import { FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import type { ClientAnimationRegistry, ClientAnimationTarget } from '@/client/content/ClientAnimationRegistry'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { startGameTween } from '@/core/GameTween'
import { TodParticleSystem } from '@/core/Particle'
import { SeedPacketRenderer, SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH, type SeedPacketRenderArgs } from '@/client/hud/SeedPacketRenderer'
import type { LawnMowerSnapshot, ServerEvent, WorldSnapshot, ZombieSnapshot } from '@/shared/protocol/index'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import { LevelSunflowerView } from './LevelSunflowerView'
import { levelPlantVisual } from './LevelPlantVisuals'
import { LevelZombieView } from './LevelZombieView'
import type { LevelEntitySnapshot, LevelParticleOwnerSnapshot } from './LevelPresentationSnapshot'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

const WIDTH = 800
const HEIGHT = 600
type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type SpriteAsset = Awaited<ReturnType<SpriteRepository['load']>>
type FontAsset = Awaited<ReturnType<FontRepository['load']>>

export interface LevelEntityAssets {
    projectileFrame: SpriteAsset
    mowerFrame: SpriteAsset
    mowerShadow: SpriteAsset
    damagedZombieArm: SpriteAsset
    loadPacketSprite: SeedPacketRenderArgs['loadSprite']
    packetCostFont: FontAsset
}

type ShooterAnimationTarget = Extract<ClientAnimationTarget, 'pvz:peashooter' | 'pvz:repeater'>

interface ShooterPlantView {
    animationTarget: ShooterAnimationTarget
    body: ReanimPlayer
    idleHead: ReanimPlayer
    shootHead: ReanimPlayer
    blink: ReanimPlayer
    blinkAtTick: number
    idleRate: number
}

export class LevelEntityRenderer {
    private readonly entities = new Map<number, Node>()
    private readonly pending = new Set<number>()
    private readonly creationTasks = new Map<number, Promise<void>>()
    private readonly shooterPlants = new Map<number, ShooterPlantView>()
    private readonly sunflowers = new Map<number, LevelSunflowerView>()
    private readonly zombies = new Map<number, LevelZombieView>()
    private readonly mowerPlayersReady = new Set<number>()
    private readonly mowerStates = new Map<number, LawnMowerSnapshot['state']>()

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

    syncGameOverWinner(zombie: ZombieSnapshot, parent: Node, visible: boolean, ticks: number, y: number): void {
        const node = this.entities.get(zombie.entityId)
        const view = this.zombies.get(zombie.entityId)
        if (!node || !view) return
        if (node.parent !== parent) node.setParent(parent)
        if (view.shadowNode.parent !== parent) view.shadowNode.setParent(parent)
        node.active = view.shadowNode.active = visible
        view.syncGameOverWalk(zombie, ticks, y)
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
        for (const [entityId, view] of this.shooterPlants) {
            result.push({
                kind: 'plant', entityId,
                animations: {
                    body: view.body.snapshot(),
                    idleHead: view.idleHead.snapshot(),
                    shootHead: view.shootHead.snapshot(),
                    blink: view.blink.snapshot(),
                },
                idleRate: view.idleRate,
                blinkAtTick: view.blinkAtTick,
            })
        }
        for (const [entityId, view] of this.sunflowers) result.push(view.snapshot(entityId))
        for (const [entityId, view] of this.zombies) result.push(view.snapshot(entityId))
        for (const [entityId, node] of this.entities) {
            if (this.shooterPlants.has(entityId) || this.sunflowers.has(entityId) || this.zombies.has(entityId)) continue
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
                const sunflower = this.sunflowers.get(snapshot.entityId)
                if (sunflower) { sunflower.restore(snapshot); continue }
                const view = this.shooterPlants.get(snapshot.entityId)
                if (!view) continue
                const { body, idleHead, shootHead, blink } = snapshot.animations
                if (!idleHead || !shootHead || !blink || snapshot.idleRate === undefined || snapshot.blinkAtTick === undefined) {
                    throw new Error(`Missing shooter animation state for plant ${snapshot.entityId}`)
                }
                view.idleRate = snapshot.idleRate
                view.body.restore(body)
                view.idleHead.restore(idleHead)
                view.shootHead.restore(shootHead)
                view.blink.restore(blink)
                view.blinkAtTick = snapshot.blinkAtTick
                if (idleHead.attachmentTrackId) view.idleHead.reattachAfterRestore(view.body)
                if (shootHead.attachmentTrackId) view.shootHead.reattachAfterRestore(view.body)
                if (blink.attachmentTrackId) view.blink.reattachAfterRestore(view.idleHead)
                if (shootHead.playing) view.shootHead.setOnFinish(() => this.finishShooterPlantShoot(view))
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
            if (typeof entityId !== 'number' || (part !== 'head' && part !== 'arm' && part !== 'flag')) continue
            const zombie = snapshot.zombies.find(candidate => candidate.entityId === entityId)
            const node = this.entities.get(entityId)
            if (zombie && node) {
                node.setPosition(zombie.x - WIDTH / 2, HEIGHT / 2 - zombie.y)
                this.zombies.get(entityId)?.sync(zombie)
            }
            this.spawnZombiePart(entityId, part, event.data.mowered === true, zombie?.row ?? 0)
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
            this.sunflowers.get(plant.entityId)?.sync(plant.eatenFlashCounter, snapshot.gameplayTick)
            this.syncShooterPlant(
                plant.entityId,
                plant.eatenFlashCounter,
                upgradeTargets.has(plant.typeId),
                snapshot.gameplayTick,
            )
        }
        for (const zombie of snapshot.zombies) this.zombies.get(zombie.entityId)?.sync(zombie)
        for (const plant of snapshot.plants) {
            const node = this.entities.get(plant.entityId)
            if (node) node.active = GameDebugSettings.perfPlantsVisible
        }
        for (const zombie of snapshot.zombies) {
            const node = this.entities.get(zombie.entityId)
            if (node) node.active = GameDebugSettings.perfZombiesVisible
        }
        this.syncLayerOrder(snapshot)
        this.playEvents(snapshot, events)
        if (!this.intro.complete) this.intro.sync()
    }

    private remove(id: number): void {
        this.pending.delete(id)
        this.shooterPlants.delete(id)
        this.sunflowers.delete(id)
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
        const entity = allEntities(snapshot).find(value => value.entityId === id)
        if (!entity) return
        this.pending.add(id)
        const item = snapshot.items.find(value => value.entityId === id)
        const isAward = item?.typeId === this.content.levels.levels[snapshot.levelId].award.id
        const node = uiNode({
            name: `Entity-${id}`, parent: isAward ? this.awardLayer : item ? this.coinLayer : this.entityLayer,
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
                if (plant.typeId === 'pvz:sunflower') {
                    const view = await LevelSunflowerView.create(node, this.content, this.animations.resolve('pvz:sunflower'), this.assets.mowerShadow, snapshot.gameplayTick)
                    if (node.isValid) this.sunflowers.set(id, view)
                } else await this.createShooterPlant(id, node, plant.typeId, snapshot.gameplayTick)
            } else if (snapshot.zombies.some(value => value.entityId === id)) {
                const zombie = snapshot.zombies.find(value => value.entityId === id)!
                const view = new LevelZombieView(
                    node, this.content.registry, this.content.loader, this.animations, this.entityLayer,
                    this.assets.mowerShadow, this.assets.damagedZombieArm, zombie.typeId,
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
        const award = this.content.levels.levels[snapshot.levelId].award
        const cost = award.packetCost
        const seedType = levelPlantVisual(award.id).seedType
        SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketNormal', parent: node, layer: this.rootLayer, x: 0, y: 0,
            seedType, cost, costFont: this.assets.packetCostFont,
            loadSprite: this.assets.loadPacketSprite,
        })
        const large = SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketLarge', parent: node, layer: this.rootLayer, x: 0, y: 0,
            scale: 2, seedType, cost, costFont: this.assets.packetCostFont,
            loadSprite: this.assets.loadPacketSprite,
        })
        large.active = false
    }

    private async createShooterPlant(id: number, node: Node, typeId: string, tick: number): Promise<void> {
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
        const blink = uiNode({ name: 'Blink', parent: node, position: animations.blink }).node.addComponent(ReanimPlayer)
        await Promise.all([
            body.load(animations.body.reanimId, this.content.registry, this.content.loader),
            idleHead.load(animations.idleHead.reanimId, this.content.registry, this.content.loader),
            shootHead.load(animations.shootHead.reanimId, this.content.registry, this.content.loader),
            blink.load(animations.blink.reanimId, this.content.registry, this.content.loader),
        ])
        if (!node.isValid) return
        idleHead.attachToTrack(body, animations.idleHead.attachmentTrackId ?? 'anim_stem')
        shootHead.attachToTrack(body, animations.shootHead.attachmentTrackId ?? 'anim_stem')
        blink.attachToTrack(idleHead, animations.blink.attachmentTrackId ?? 'anim_face')
        const idleRate = (15 + Math.random() * 5) / 12
        body.play({ loop: true, rate: idleRate * animations.body.rateScale })
        idleHead.play({ loop: true, rate: idleRate * animations.idleHead.rateScale })
        shootHead.hide()
        blink.hide()
        this.shooterPlants.set(id, { animationTarget, body, idleHead, shootHead, blink, idleRate,
            blinkAtTick: tick + 400 + Math.floor(Math.random() * 400) })
    }

    private playShooterPlantShoot(id: number): void {
        const view = this.shooterPlants.get(id)
        if (!view) return
        view.blink.hide()
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
        for (const player of [view.body, view.idleHead, view.shootHead, view.blink]) {
            player.setColorOverride(upgradeTarget ? upgradeFlashColor(tick) : Color.WHITE)
            player.setExtraAdditiveDraw(eatenFlashCounter > 0, color)
        }
        if (tick >= view.blinkAtTick) {
            view.blinkAtTick = tick + 400 + Math.floor(Math.random() * 400)
            if (!view.shootHead.snapshot().playing) view.blink.play({
                loop: false, rate: 15 / 12 * this.animations.resolve(view.animationTarget).blink.rateScale, timeSeconds: 0,
            })
        }
        if (view.shootHead.snapshot().playing || view.idleHead.snapshot().playing) return
        view.idleHead.play({
            loop: true, rate: view.idleRate * this.animations.resolve(view.animationTarget).idleHead.rateScale,
            timeSeconds: view.body.snapshot().timeSeconds,
        })
    }

    private spawnZombiePart(entityId: number, part: 'head' | 'arm' | 'flag', mowered: boolean, row: number): void {
        const node = this.entities.get(entityId)
        if (!node) return
        const trackPosition = this.zombies.get(entityId)?.getTrackWorldPosition(part === 'flag' ? 'Zombie_flag' : part === 'head' ? 'anim_head1' : 'Zombie_outerarm_lower')
        const localPosition = trackPosition ? uiNode({ node: this.entityLayer }).transform.convertToNodeSpaceAR(trackPosition) : null
        TodParticleSystem.spawn({
            parent: this.entityLayer,
            effect: part === 'flag' ? 'zombieflag' : mowered ? part === 'head' ? 'moweredzombiehead' : 'moweredzombiearm' : part === 'head' ? 'zombiehead' : 'zombiearm',
            x: localPosition?.x ?? node.position.x + (part === 'flag' ? 18 : part === 'head' ? 58 : 25),
            y: localPosition?.y ?? node.position.y + (part === 'flag' ? -42 : part === 'head' ? -30 : -55),
            renderOrder: row * 10 + 1.01,
            useGameTime: false,
        })
        if (part !== 'flag') this.audio.zombiePartDropped()
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
            startGameTween(node, tween(node).delay(0.21).call(() => { if (node.isValid) node.destroy() }))
        }).catch(error => {
            if (node.isValid) node.destroy()
            console.error('[Level] Failed to play pea splat', error)
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
