import { Color, instantiate, Mask, Node, Sprite } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { Adventure11Slots } from './Adventure11Slots'
import { FontRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import { FontMetricsUtil, FontRenderer } from '@/client/font'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import { Adventure11AudioPresenter } from './Adventure11AudioPresenter'
import { Adventure11IntroPresenter } from './Adventure11IntroPresenter'
import { Adventure11EndPresenter } from './Adventure11EndPresenter'
import { Adventure11EntityRenderer } from './Adventure11EntityRenderer'
import { Adventure11HudPresenter } from './Adventure11HudPresenter'
import {
    parseAdventure11PresentationSnapshotV2,
    type Adventure11FlowSnapshotV2,
    type Adventure11ParticleOwnerSnapshotV2,
    type Adventure11PresentationSnapshotV2,
} from './Adventure11PresentationSnapshotV2'
import { Adventure11ParticlePresenter } from './Adventure11ParticlePresenter'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'

const WIDTH = 800
const HEIGHT = 600
const PROGRESS_METER_WIDTH = 158
const PROGRESS_METER_HEIGHT = 27
const PROGRESS_FILL_WIDTH = 143

export type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>> & {
    readonly animations?: ClientAnimationRegistry
}

export class Adventure11View {
    get introComplete(): boolean {
        return this.intro.complete
    }

    private constructor(
        readonly audio: Adventure11AudioPresenter,
        private readonly intro: Adventure11IntroPresenter,
        private readonly end: Adventure11EndPresenter,
        private readonly entityRenderer: Adventure11EntityRenderer,
        private readonly hud: Adventure11HudPresenter,
        private readonly particles: Adventure11ParticlePresenter,
    ) {}

    static async create(root: Node, content: LoadedContent, playerName: string): Promise<Adventure11View> {
        const animations = content.animations ?? new ClientAnimationRegistry()
        animations.freeze()
        const sprites = new SpriteRepository(content.registry, content.loader)
        const fonts = new FontRepository(content.registry, content.loader)
        const [
            background, sod, seedbank, projectileFrame, seeds, packetPlants, cachedPacketPlants,
            mowerFrame, mowerShadow, damagedZombieArm, plantPreviews, seedPacketLarger, flagMeter, flagMeterParts,
            flagMeterLevelProgress, sunFont, pico129, houseOfTerror16, houseOfTerror28,
        ] = await Promise.all([
            sprites.load('pvz:background1unsodded'),
            sprites.load('pvz:sod1row'),
            sprites.load('pvz:seedbank'),
            sprites.load('pvz:projectilepea'),
            sprites.load('pvz:seeds'),
            sprites.load('pvz:packet_plants'),
            sprites.load('pvz:packet_plants_cached'),
            sprites.load('pvz:lawnmower_cached'),
            sprites.load('pvz:plantshadow'),
            sprites.load('pvz:zombie_outerarm_upper2'),
            sprites.load('pvz:plant_previews_cached'),
            sprites.load('pvz:seedpacket_larger'),
            sprites.load('pvz:flagmeter'),
            sprites.load('pvz:flagmeterparts'),
            sprites.load('pvz:flagmeterlevelprogress'),
            fonts.load('pvz:continuumbold14'),
            fonts.load('pvz:pico129'),
            fonts.load('pvz:houseofterror16'),
            fonts.load('pvz:houseofterror28'),
        ])
        const layout = instantiate(content.adventure11Prefab)
        root.addChild(layout)
        const slots = layout.getComponent(Adventure11Slots)
        if (!slots) throw new Error('Adventure 1-1 prefab is missing Adventure11Slots')
        uiNode({ node: layout, size: { width: WIDTH, height: HEIGHT } })
        const board = uiNode({ node: slots.board, size: { width: WIDTH, height: HEIGHT } }).node
        uiNode({
            node: slots.background, position: { x: 80 },
            sprite: { frame: background, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const sodClip = uiNode({
            node: slots.sodClip, position: { x: -381, y: 35 }, anchor: { x: 0, y: 1 },
            size: { width: 0, height: sod.originalSize.height }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        uiNode({
            node: slots.sodRow, anchor: { x: 0, y: 1 },
            sprite: { frame: sod, sizeMode: Sprite.SizeMode.RAW, trim: false },
        })
        const tutorialLawnFlash = uiNode({
            node: slots.tutorialLawnFlash, position: { x: -381, y: 35 }, anchor: { x: 0, y: 1 },
            sprite: { frame: sod, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        tutorialLawnFlash.active = false
        const entityLayer = uiNode({
            node: slots.entityLayer, size: { width: WIDTH, height: HEIGHT },
        }).node
        const sodRollNode = uiNode({
            node: slots.sodRoll, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const sodRoll = sodRollNode.addComponent(ReanimPlayer)
        await sodRoll.load('pvz:sodroll', content.registry, content.loader)
        sodRoll.play({ loop: false, rate: 1, hideOnFinish: false })
        sodRoll.pause()
        sodRollNode.active = false

        const introZombies: Node[] = []
        const introPositions: Array<{ x: number, y: number, z: number }> = []
        const introSpots = Array.from({ length: 5 }, (_, gridX) =>
            Array.from({ length: 5 }, (_, gridY) => ({ gridX, gridY })),
        ).flat().filter(({ gridX, gridY }) => gridX !== 4 || gridY !== 0)
        while (introPositions.length < 5) {
            const [{ gridX, gridY }] = introSpots.splice(Math.floor(Math.random() * introSpots.length), 1)
            introPositions.push({
                x: 430 + gridX * 56 + Math.floor(Math.random() * 15),
                y: 230 - gridY * 90 - (gridX % 2) * 30 - Math.floor(Math.random() * 15),
                z: 100 + gridY * 4 + (gridX % 2) * 2,
            })
        }
        await Promise.all(introPositions.map(async (position, index) => {
            const node = uiNode({
                name: `IntroZombie-${index}`, parent: entityLayer, position,
                size: { width: 120, height: 120 }, anchor: { x: 0, y: 1 },
            }).node
            uiNode({
                name: 'ZombieShadow', parent: node, position: { x: 23, y: -92 }, anchor: { x: 0, y: 1 },
                sprite: { frame: mowerShadow, sizeMode: Sprite.SizeMode.RAW, trim: false },
            })
            const player = uiNode({
                name: 'ZombieAnimation', parent: node, position: { x: 15, y: 8 },
                anchor: { x: 0, y: 1 },
            }).node.addComponent(ReanimPlayer)
            await player.load(Math.floor(Math.random() * 4) > 0 ? 'pvz:zombie_idle2' : 'pvz:zombie', content.registry, content.loader)
            player.play({ loop: true, rate: (12 + Math.random() * 12) / 12, timeSeconds: Math.random() * 20 })
            introZombies.push(node)
        }))
        introZombies.sort((left, right) => left.position.z - right.position.z)
            .forEach((node, index) => node.setSiblingIndex(index))
        const hud = uiNode({
            node: slots.hud, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const bank = uiNode({
            node: slots.bank, position: { x: 10, y: 0 }, anchor: { x: 0, y: 1 },
            sprite: { frame: seedbank, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        uiNode({ node: slots.seedPacket, position: { x: 85, y: -8 }, anchor: { x: 0, y: 1 } })
        const sunText = uiNode({ node: slots.sunText, anchor: { x: 0, y: 1 } })
            .node.addComponent(FontRenderer)
        sunText.setFontAssets(sunFont)
        sunText.fontColor = Color.BLACK
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
            node: slots.progressHead, position: { x: 138, y: 3 }, anchor: { x: 0, y: 1 },
            sprite: { frame: getAtlasFrame(flagMeterParts, 0, 25, 25, 3), sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        const levelText = uiNode({ node: slots.levelText, anchor: { x: 0, y: 1 } })
            .node.addComponent(FontRenderer)
        levelText.setFontAssets(houseOfTerror16)
        levelText.fontColor = new Color(224, 187, 98, 255)
        levelText.string = 'Level 1-1'
        levelText.forceRebuild()
        progressMeter.active = false
        levelText.node.active = false

        const houseName = uiNode({
            node: slots.houseName, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 }, opacity: 255,
        }).node
        const houseLabel = uiNode({
            node: slots.houseLabel, anchor: { x: 0, y: 1 },
            size: { width: WIDTH, height: HEIGHT },
        }).node.addComponent(FontRenderer)
        houseLabel.setFontAssets(houseOfTerror28)
        houseLabel.fontColor = Color.WHITE
        houseLabel.maxWidth = WIDTH
        houseLabel.textAlign = 2
        houseLabel.string = `${playerName}'s House`
        houseLabel.forceRebuild()
        houseLabel.node.setPosition(0, -(550 - FontMetricsUtil.getMetrics(houseOfTerror28.config).ascent))
        const previewFrame = getAtlasFrame(plantPreviews, 0, 220, 160, 8)
        const repeaterPreviewFrame = getAtlasFrame(plantPreviews, 7, 220, 160, 8)
        const cursorPreview = uiNode({
            node: slots.cursorPreview, size: { width: 220, height: 160 }, anchor: { x: 0, y: 1 },
        }).node
        const cursorPlant = uiNode({
            node: slots.cursorPlant, position: { x: -40, y: 40 },
            anchor: { x: 0, y: 1 },
            sprite: { frame: previewFrame, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).sprite!
        const gridPreview = uiNode({
            node: slots.gridPreview, size: { width: 220, height: 160 }, anchor: { x: 0, y: 1 },
        }).node
        const gridSprite = uiNode({
            node: slots.gridPlant, position: { x: -40, y: 40 },
            anchor: { x: 0, y: 1 },
            sprite: { frame: previewFrame, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).sprite!
        gridSprite.color = new Color(255, 255, 255, 100)
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
        const audio = new Adventure11AudioPresenter()
        let view!: Adventure11View
        let entityRenderer!: Adventure11EntityRenderer
        const intro = new Adventure11IntroPresenter(
            board, sodClip, sodRoll, introZombies, bank, houseName,
            () => entityRenderer.nodes(),
            audio, content.registry, content.loader,
        )
        entityRenderer = new Adventure11EntityRenderer(
            root.layer, content, animations, {
                projectileFrame, mowerFrame, mowerShadow, damagedZombieArm,
                seeds, packetPlants, cachedPacketPlants, seedPacketLarger, plantPreviews,
                packetCostFont: pico129,
            },
            entityLayer, coinLayer, awardLayer, audio, intro,
        )
        const end = new Adventure11EndPresenter(
            content, awardLayer, overlayLayer, levelCompleteFade,
            id => entityRenderer.node(id), audio,
        )
        const hudPresenter = Adventure11HudPresenter.create({
            content, seedPacketSlot: slots.seedPacket, rootLayer: root.layer,
            seeds, packetPlants, cachedPacketPlants, packetCostFont: pico129,
            adviceNode: slots.advice, adviceParent: hud, adviceFont: houseOfTerror28,
            tutorialArrowLayer: coinLayer.parent!, tutorialLawnFlash, cursorPreview, gridPreview,
            cursorPlant, gridPlant: gridSprite, normalPreview: previewFrame, repeaterPreview: repeaterPreviewFrame,
            sunText, sunFont, progressMeter, progressFillClip, progressFill, progressHead,
            levelText, levelFont: houseOfTerror16,
        })
        const particlePresenter = new Adventure11ParticlePresenter(
            content, layout,
            new Map<Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'screen' }>['slot'], Node>([
                ['board', board], ['entity-layer', entityLayer], ['coin-layer', coinLayer],
                ['hud', hud], ['seed-packet', hudPresenter.seedPacketNode], ['award-layer', awardLayer],
                ['overlay-layer', overlayLayer],
            ]),
            entityRenderer,
            intro,
        )
        view = new Adventure11View(audio, intro, end, entityRenderer, hudPresenter, particlePresenter)
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

    bindSeedPacket(select: () => void): void {
        this.hud.bindSeedPacket(select)
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        this.entityRenderer.sync(snapshot, changes, events)
        this.end.sync(snapshot, events)
        for (const item of snapshot.items) this.end.syncAward(item, snapshot.levelId)
        this.hud.sync(snapshot, events, this.introComplete)
        for (const event of events) this.audio.play(event)
    }

    async snapshot(flow: Adventure11FlowSnapshotV2): Promise<Adventure11PresentationSnapshotV2> {
        const hud = this.hud.snapshot()
        const [entities, particles] = await Promise.all([
            this.entityRenderer.snapshot(),
            this.particles.snapshot(),
        ])
        return parseAdventure11PresentationSnapshotV2({
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

    async restore(snapshot: Adventure11PresentationSnapshotV2): Promise<void> {
        await this.intro.restore(snapshot.intro)
        this.hud.restore(snapshot.hud, snapshot.advice)
        await this.entityRenderer.restore(snapshot.entities)
        await Promise.all([this.end.restore(snapshot.end), this.audio.restore(snapshot.audio)])
        await this.particles.restore(snapshot.particles)
    }


}
