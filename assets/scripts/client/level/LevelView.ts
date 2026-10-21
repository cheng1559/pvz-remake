import { Color, Component, Graphics, instantiate, Mask, Node, Sprite, Tween } from 'cc'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { LevelSlots } from './LevelSlots'
import { FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import { UI } from '@/client/ui/UI'
import type { UIButton } from '@/client/ui/UIButton'
import { levelPlantVisual } from './LevelPlantVisuals'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import { PlantPreview } from '@/client/hud/PlantPreview'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { LevelAudioPresenter } from './LevelAudioPresenter'
import type { LevelIntro } from './LevelIntro'
import { getLevelPresentation } from './LevelPresentation'
import type { BoardDefinition, LevelDefinition } from '@/shared/content/gameplay'
import { LevelEndPresenter } from './LevelEndPresenter'
import { LevelEntityRenderer } from './LevelEntityRenderer'
import { LevelHudPresenter } from './LevelHudPresenter'
import {
    parseLevelPresentationSnapshot,
    type LevelFlowSnapshot,
    type LevelParticleOwnerSnapshot,
    type LevelPresentationSnapshot,
} from './LevelPresentationSnapshot'
import { LevelParticlePresenter } from './LevelParticlePresenter'
import { LevelGameOverPresenter } from './LevelGameOverPresenter'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { TodParticleSystem } from '@/core/Particle'

const WIDTH = 800
const HEIGHT = 600
const PROGRESS_METER_WIDTH = 158
const PROGRESS_METER_HEIGHT = 27
const PROGRESS_FILL_WIDTH = 143

export type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>> & {
    readonly animations?: ClientAnimationRegistry
}

export class LevelView {
    private readonly pausedComponents: Component[] = []
    private presentationPaused = false
    private hitboxes: Graphics | null = null
    get introComplete(): boolean {
        return this.intro.complete
    }

    private constructor(
        private readonly root: Node,
        readonly audio: LevelAudioPresenter,
        private readonly intro: LevelIntro,
        private readonly end: LevelEndPresenter,
        private readonly gameOver: LevelGameOverPresenter,
        private readonly entityRenderer: LevelEntityRenderer,
        private readonly hud: LevelHudPresenter,
        private readonly particles: LevelParticlePresenter,
        private readonly definitions: GameplayDefinitions,
        readonly level: LevelDefinition,
        readonly board: BoardDefinition,
    ) {}

    static async create(root: Node, content: LoadedContent, levelId: string, playerName: string): Promise<LevelView> {
        const level = content.levels.levels[levelId]
        if (!level) throw new Error(`Level is not installed: ${levelId}`)
        const boardDefinition = content.definitions.boards[level.board]
        const presentation = getLevelPresentation(level)
        const animations = content.animations ?? new ClientAnimationRegistry()
        animations.freeze()
        const sprites = new SpriteRepository(content.registry, content.loader)
        const fonts = new FontRepository(content.registry, content.loader)
        const [
            background, seedbank, projectileFrame,
            mowerFrame, mowerShadow, damagedZombieArm, flagMeter, flagMeterParts,
            flagMeterLevelProgress, sunFont, pico129, houseOfTerror16, houseOfTerror28, gameOverFrames, ui,
        ] = await Promise.all([
            sprites.load(presentation.board.background),
            sprites.load('pvz:seedbank'),
            sprites.load('pvz:projectilepea'),
            sprites.load('pvz:lawnmower_cached'),
            sprites.load('pvz:plantshadow'),
            sprites.load('pvz:zombie_outerarm_upper2'),
            sprites.load('pvz:flagmeter'),
            sprites.load('pvz:flagmeterparts'),
            sprites.load('pvz:flagmeterlevelprogress'),
            fonts.load('pvz:continuumbold14'),
            fonts.load('pvz:pico129'),
            fonts.load('pvz:houseofterror16'),
            fonts.load('pvz:houseofterror28'),
            LevelGameOverPresenter.loadAssets(presentation.board.gameOver),
            UI.load(),
        ])
        const layout = instantiate(content.levelPrefab)
        root.addChild(layout)
        const slots = layout.getComponent(LevelSlots)
        if (!slots) throw new Error('Level prefab is missing LevelSlots')
        uiNode({ node: layout, size: { width: WIDTH, height: HEIGHT } })
        const board = uiNode({ node: slots.board, size: { width: WIDTH, height: HEIGHT } }).node
        uiNode({
            node: slots.background, position: { x: presentation.board.backgroundX },
            sprite: { frame: background, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const entityLayer = uiNode({
            node: slots.entityLayer, size: { width: WIDTH, height: HEIGHT },
        }).node
        const hud = uiNode({
            node: slots.hud, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const bankLayer = uiNode({
            name: 'SeedBankLayer', parent: board, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        bankLayer.setSiblingIndex(entityLayer.getSiblingIndex())
        const bank = uiNode({
            node: slots.bank, parent: bankLayer, position: { x: 10, y: 0 }, anchor: { x: 0, y: 1 },
            sprite: { frame: seedbank, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        uiNode({ node: slots.seedPacket, position: { x: 85, y: -8 }, anchor: { x: 0, y: 1 } })
        const sunText = ui.label(slots.sunText.parent!, {
            node: slots.sunText, text: '', font: sunFont, color: Color.BLACK,
            x: 34, y: 78, align: 'center', baseline: true, pixelAlign: true,
        })
        const coinLayer = uiNode({
            node: slots.coinLayer, size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const progressMeter = uiNode({
            node: slots.progressMeter, position: { x: 600, y: -575 },
            size: { width: PROGRESS_METER_WIDTH, height: PROGRESS_METER_HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        uiNode({
            node: slots.progressBack, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeter, 0, PROGRESS_METER_WIDTH, PROGRESS_METER_HEIGHT, 1), sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const progressFillClip = uiNode({
            node: slots.progressFillClip, position: { x: 150 }, anchor: { x: 0, y: 1 },
            size: { width: 1, height: PROGRESS_METER_HEIGHT }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        const progressFill = uiNode({
            node: slots.progressFill, position: { x: -150 }, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeter, 1, PROGRESS_METER_WIDTH, PROGRESS_METER_HEIGHT, 1), sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        uiNode({
            node: slots.progressTrack, position: { x: 38, y: -14 }, anchor: { x: 0, y: 1 },
            sprite: { frame: flagMeterLevelProgress, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const progressHead = uiNode({
            node: slots.progressHead, position: { x: 138, y: 3, z: 3 }, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeterParts, 0, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        level.waves.forEach((wave, index) => {
            if (!wave.flagWave) return
            const x = 148 - 142 * (index + 1) / level.waves.length
            uiNode({
                name: `ProgressFlagPole-${index}`, parent: progressMeter, position: { x, y: 4, z: 2 }, anchor: { x: 0, y: 1 },
                sprite: { frame: getAtlasFrame(flagMeterParts, 1, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
            uiNode({
                name: `ProgressFlag-${index}`, parent: progressMeter, position: { x, y: 3, z: 2 }, anchor: { x: 0, y: 1 },
                sprite: { frame: getAtlasFrame(flagMeterParts, 2, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
        })
        progressHead.setSiblingIndex(progressMeter.children.length - 1)
        const levelText = ui.label(slots.levelText.parent!, {
            node: slots.levelText, text: '', font: houseOfTerror16, color: new Color(224, 187, 98, 255),
            x: 780, y: 595, align: 'right', baseline: true,
        })
        progressMeter.active = false
        levelText.node.active = false

        const houseName = uiNode({
            node: slots.houseName, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 }, opacity: 255,
        }).node
        ui.label(houseName, {
            node: slots.houseLabel, text: `${playerName}'s House`, font: houseOfTerror28,
            width: WIDTH, y: 550, align: 'center', baseline: true,
        })
        const loadPacketSprite = (name: string) => sprites.load(`pvz:${name}`)
        const initializePreview = (node: Node) => {
            uiNode({ node, position: { x: 0, y: 0 }, anchor: { x: 0, y: 1 }, sprite: { frame: null } })
            const preview = node.addComponent(PlantPreview)
            preview.initialize(undefined, async (parent, plantId) => {
                const atlas = await loadPacketSprite('plant_previews_cached')
                if (!parent.isValid) return
                uiNode({ name: 'CachedPlantPreview', parent, position: { x: -40, y: 40 }, anchor: { x: 0, y: 1 },
                    sprite: { frame: getAtlasFrame(atlas, levelPlantVisual(String(plantId)).preview, 220, 160, 8), sizeMode: Sprite.SizeMode.RAW, trim: false } })
            }, { x: 0, y: 0, scale: 1 })
            return preview
        }
        const cursorPreview = uiNode({
            node: slots.cursorPreview, size: { width: 220, height: 160 }, anchor: { x: 0, y: 1 },
        }).node
        const cursorPlant = initializePreview(slots.cursorPlant)
        const gridPreview = uiNode({
            node: slots.gridPreview, size: { width: 220, height: 160 }, anchor: { x: 0, y: 1 },
        }).node
        const gridPlant = initializePreview(slots.gridPlant)
        gridPlant.setColor(new Color(255, 255, 255, 100))
        cursorPreview.active = false
        gridPreview.active = false
        const awardLayer = uiNode({
            node: slots.awardLayer, size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const overlayLayer = uiNode({
            node: slots.overlayLayer, size: { width: WIDTH, height: HEIGHT },
        }).node
        const fadeParts = uiNode({
            node: slots.fade, size: { width: WIDTH, height: HEIGHT },
            graphics: true,
        })
        const levelCompleteFade = fadeParts.node
        levelCompleteFade.active = false
        const audio = new LevelAudioPresenter(presentation.board.music)
        let view!: LevelView
        let entityRenderer!: LevelEntityRenderer
        const intro = await presentation.createIntro({
            content, level, slots, board, entityLayer, bank, houseName, audio, mowerShadow,
            entityNodes: () => entityRenderer.nodes(),
        })
        entityRenderer = new LevelEntityRenderer(
            root.layer, content, animations, {
                projectileFrame, mowerFrame, mowerShadow, damagedZombieArm,
                loadPacketSprite,
                packetCostFont: pico129,
            },
            entityLayer, coinLayer, awardLayer, audio, intro,
        )
        const end = new LevelEndPresenter(
            content, awardLayer, overlayLayer, levelCompleteFade,
            id => entityRenderer.node(id), audio, ui,
        )
        const hudPresenter = LevelHudPresenter.create({
            ui, content, level, presentation, seedPacketSlot: slots.seedPacket, rootLayer: root.layer,
            loadPacketSprite, packetCostFont: pico129,
            adviceNode: slots.advice, adviceParent: hud, adviceFont: houseOfTerror28,
            tutorialArrowLayer: coinLayer.parent!, tutorialLawnFlash: slots.tutorialLawnFlash, cursorPreview, gridPreview,
            cursorPlant, gridPlant,
            sunText, progressMeter, progressFillClip, progressFill, progressHead, levelText,
        })
        const particlePresenter = new LevelParticlePresenter(
            content, layout,
            new Map<Extract<LevelParticleOwnerSnapshot, { kind: 'screen' }>['slot'], Node>([
                ['board', board], ['entity-layer', entityLayer], ['coin-layer', coinLayer],
                ['hud', hud], ['seed-packet', hudPresenter.seedPacketNode], ['award-layer', awardLayer],
                ...hudPresenter.seedBank.packets.slice(1).map((packet, index) => [`seed-packet-${index + 1}` as const, packet.view.node] as const),
                ['overlay-layer', overlayLayer],
            ]),
            entityRenderer,
            intro,
        )
        const gameOver = new LevelGameOverPresenter(board, bank, entityLayer, overlayLayer, entityRenderer, audio, gameOverFrames, presentation.board.gameOver)
        view = new LevelView(root, audio, intro, end, gameOver, entityRenderer, hudPresenter, particlePresenter, content.definitions, level, boardDefinition)
        intro.sync()
        return view
    }

    updateIntro(dt: number): boolean {
        return this.intro.update(dt)
    }

    setPointer(pointer?: { x: number, y: number }): void {
        this.hud.setPointer(pointer)
    }

    resetCursor(): void {
        this.hud.resetCursor()
    }

    updateLevelComplete(dt: number): boolean {
        return this.end.update(dt)
    }

    updateGameOver(dt: number): boolean {
        return this.gameOver.update(dt)
    }

    bindSeedPackets(select: (seedId: string) => void): UIButton[] {
        return this.hud.bindSeedPackets(select)
    }

    bindMenu(open: () => void): UIButton {
        return this.hud.bindMenu(open)
    }

    setPaused(paused: boolean): void {
        paused = paused || this.gameOver.active
        if (!paused && !this.presentationPaused) return
        this.presentationPaused = paused
        if (paused) {
            for (const component of this.root.getComponentsInChildren(Component)) {
                if (component.enabled && (component instanceof ReanimPlayer || component instanceof ParticlePlayer || component instanceof TodParticleSystem)) {
                    this.pausedComponents.push(component)
                    component.enabled = false
                }
            }
        } else {
            for (const component of this.pausedComponents) if (component.isValid) component.enabled = true
            this.pausedComponents.length = 0
        }
        const visit = (node: Node) => {
            if (paused) Tween.pauseAllByTarget(node)
            else Tween.resumeAllByTarget(node)
            for (const child of node.children) visit(child)
        }
        visit(this.root)
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        this.entityRenderer.sync(snapshot, changes, events)
        this.end.sync(snapshot, events)
        for (const item of snapshot.items) this.end.syncAward(item, snapshot.levelId)
        this.hud.sync(snapshot, events, this.introComplete)
        for (const event of events) this.audio.play(event)
        this.syncHitboxes(snapshot)
        if (snapshot.result === 'lost') {
            this.setPaused(true)
            this.end.cancelWarnings()
            this.gameOver.sync(snapshot, events)
        }
    }

    private syncHitboxes(snapshot: WorldSnapshot): void {
        if (!GameDebugSettings.hitboxesVisible) { this.hitboxes?.clear(); return }
        const graphics = this.hitboxes ??= uiNode({ name: 'Hitboxes', parent: this.root, graphics: true }).graphics!
        graphics.clear()
        graphics.lineWidth = 1
        const draw = (entity: { x: number, y: number }, rect: { x: number, y: number, width: number, height: number }, color: Color) => {
            graphics.strokeColor = color
            graphics.rect(entity.x - 400 + rect.x, 300 - entity.y - rect.y - rect.height, rect.width, rect.height)
            graphics.stroke()
        }
        for (const plant of snapshot.plants) draw(plant, this.definitions.plants[plant.typeId].body, Color.GREEN)
        for (const zombie of snapshot.zombies) {
            draw(zombie, this.definitions.zombies[zombie.typeId].body, Color.RED)
            draw(zombie, this.definitions.zombies[zombie.typeId].attack, Color.YELLOW)
        }
        for (const projectile of snapshot.projectiles) draw(projectile, this.definitions.projectiles[projectile.typeId].hitbox, Color.CYAN)
        for (const mower of snapshot.lawnMowers) draw(mower, this.definitions.lawnMowers[mower.typeId].attack, Color.YELLOW)
    }

    async snapshot(flow: LevelFlowSnapshot): Promise<LevelPresentationSnapshot> {
        const hud = this.hud.snapshot()
        const [entities, particles] = await Promise.all([
            this.entityRenderer.snapshot(),
            this.particles.snapshot(),
        ])
        return parseLevelPresentationSnapshot({
            schemaVersion: 2,
            flow,
            intro: this.intro.snapshot(),
            end: this.end.snapshot(),
            advice: hud.advice,
            hud: hud.hud,
            audio: this.audio.snapshot(),
            entities,
            particles,
            extensions: {},
        })
    }

    async restore(snapshot: LevelPresentationSnapshot): Promise<void> {
        await this.intro.restore(snapshot.intro)
        this.hud.restore(snapshot.hud, snapshot.advice, this.introComplete)
        await this.entityRenderer.restore(snapshot.entities)
        await Promise.all([this.end.restore(snapshot.end), this.audio.restore(snapshot.audio)])
        await this.particles.restore(snapshot.particles)
    }


}
