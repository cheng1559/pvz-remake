import { modResources } from '@/client/content/ModResources'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { animateCurve } from '@/shared/content/animation'
import { LevelHitboxes } from './LevelHitboxes'
import { LevelHealthBars } from './LevelHealthBars'
import { LevelCoinBank } from './LevelCoinBank'
import { LevelProgressMeter } from './LevelProgressMeter'
import { Color, Component, instantiate, Mask, Node, Sprite, Tween, Vec3 } from 'cc'
import { Haptics, type HapticStyle } from '@/platform/Haptics'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { LevelSlots } from './LevelSlots'
import { UI } from '@/client/ui/UI'
import { formatMoney } from '@/client/ui/formatMoney'
import { seedBankExtraWidth } from './LevelGeometry'
import type { UIButton } from '@/client/ui/UIButton'
import { PlantPreview } from '@/client/hud/PlantPreview'
import type { ClientWorldChanges } from '@/client/game/ClientWorld'
import type { DialogQuestion, GameCommand, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
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
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { LevelSeedChooser, SEED_CHOOSER_SLIDE } from './LevelSeedChooser'
import { LevelBoardHud } from './LevelBoardHud'
import { createLevelRuleView, levelRulePresentation, type LevelRuleView } from './rules'
import { PlantingLineView } from './PlantingLineView'
import { uiAreaEdge } from '@/client/view/ClientViewport'

const WIDTH = 800
const HEIGHT = 600

/** Haptic styles from the lightest. */
const HAPTIC_STRENGTH: readonly HapticStyle[] = ['light', 'medium', 'heavy', 'explosion']

export type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>

/**
 * Profile values the level shows: the house name and Dave's quotes. `upgradeCost` is the seed-slot price Dave quotes;
 * `nextUpgradeCost` replaces it once the offer is bought. `almanacZombies`: the almanac's zombies (their IDs) once the
 * player has the almanac (LawnApp::CanShowAlmanac); `store`: the player has the store (LawnApp::CanShowStore).
 */
export interface LevelPlayer { name: string; upgradeCost: number; nextUpgradeCost: number; almanacZombies?: string[]; store?: boolean }

export class LevelView {
    /** The level rule's own view (the Whack-a-Zombie mallet); input passes it unclaimed clicks, the planting preview asks its canPlantAt. */
    rule?: LevelRuleView
    /** The level's red line, when it has one with a look. */
    plantingLine?: PlantingLineView
    private boardHud?: LevelBoardHud
    private seedChooser?: LevelSeedChooser
    private seedChooserSend: (command: GameCommand) => void = () => {}
    /** Builds a chooser for a level that opened none, the first time a repick asks for one. */
    private openSeedChooser?: (chooser: NonNullable<WorldSnapshot['seedChooser']>) => Promise<LevelSeedChooser>
    private openingSeedChooser = false
    /** Only animations this view disabled are eligible to resume. */
    private readonly heldAnimations = new Set<Component>()
    private standingStill = false
    private syncSeedChooserIntro = () => {}
    private pinScreen = () => {}
    /** How far the lawn sits right of its original gameplay position (wide viewports); the screen UI stays put. */
    private lawnShift = 0
    /** The size the lawn is shown at (a high view's 600/720); the screen UI keeps its own. */
    private lawnScale = 1
    /** The board: the lawn, with the screen UI pinned in it (pinScreen); the HUD, the screen UI's 800x600 layout. */
    private boardNode?: Node
    private hudNode?: Node
    private presentationPaused = false
    private gameplayTick = 0
    private money?: number
    /** Called when the server's purse changes (collected money, `/money`); the app saves it to the profile. */
    onMoneyChanged?: (money: number) => void
    /**
     * Crazy Dave's seed-slot offer was answered; the app records the upgrade or the refusal in the profile, with the
     * level's coins after the answer, so the profile saves both at once.
     */
    onPacketUpgradeAnswered?: (accepted: boolean, coins: number) => void
    /** The level granted an achievement the player did not have; `shown` when it was announced in the level. */
    onAchievementEarned?: (id: string, shown: boolean) => void
    /** The seed chooser opens the almanac, on a preview zombie's entry when it has its `nameKey`, or the store. */
    onOpenAlmanac?: (zombieId?: string) => void
    onOpenStore?: () => void
    private player!: LevelPlayer
    private answerDialog: (accept: boolean) => void = () => {}
    private seedBankSlots = 0
    private applySeedBankSlots: (slots: number) => void = () => {}
    private lastSnapshot?: WorldSnapshot
    /** Board::Pause's coin bank. */
    showPauseCoinBank(): void { this.hud.showPauseCoinBank() }
    /** The seed-slot purchase dialog holds the coin bank on screen. */
    private questionOpen = false
    private hitboxes!: LevelHitboxes
    private healthBars!: LevelHealthBars
    get introComplete(): boolean {
        return this.intro.complete
    }
    /** CanPauseNow allows the opening pan until the chooser accepts input, and waits for Dave to leave. */
    get canPauseOnFocusLoss(): boolean {
        return !this.boardHud?.daveOut && !this.lastSnapshot?.dialog && !this.questionOpen &&
            !(this.seedChooser?.active && this.seedChooser.acceptsInput)
    }
    get canOpenMenu(): boolean { return this.introComplete || !!this.seedChooser?.active && this.seedChooser.choosing && this.intro.elapsedTicks >= SEED_CHOOSER_SLIDE.onEnd }
    /** The chooser's menu button stays drawn, though disabled, from its arrival until the board's menu takes over. */
    get menuVisible(): boolean { return this.introComplete || !!this.seedChooser && this.intro.elapsedTicks >= SEED_CHOOSER_SLIDE.onEnd }

    private constructor(
        private readonly root: Node,
        readonly audio: LevelAudioPresenter,
        readonly intro: LevelIntro,
        private readonly end: LevelEndPresenter,
        readonly gameOver: LevelGameOverPresenter,
        private readonly entityRenderer: LevelEntityRenderer,
        private readonly hud: LevelHudPresenter,
        private readonly particles: LevelParticlePresenter,
        /** The level's gameplay definitions; Mods read them (where collected items fly). */
        readonly definitions: GameplayDefinitions,
        readonly level: LevelDefinition,
        readonly board: BoardDefinition,
    ) {}

    static async create(root: Node, content: LoadedContent, levelId: string, player: LevelPlayer, initial: WorldSnapshot): Promise<LevelView> {
        const playerName = player.name
        const level = content.levels.levels[levelId]
        if (!level) throw new Error(`Level is not installed: ${levelId}`)
        const boardDefinition = content.definitions.boards[level.board]
        const presentation = getLevelPresentation(level, content.presentation, levelId)
        const animations = content.animations
        animations.freeze()
        const [
            background, seedbank, sunFont, pico129, houseOfTerror16, houseOfTerror28, gameOverFrames, ui,
        ] = await Promise.all([
            modResources.sprite(presentation.board.background),
            modResources.sprite('pvz:seedbank'),
            modResources.font('pvz:continuumbold14'),
            modResources.font('pvz:pico129'),
            modResources.font('pvz:houseofterror16'),
            modResources.font('pvz:houseofterror28'),
            LevelGameOverPresenter.loadAssets(presentation.board.gameOver),
            UI.load(),
            content.views.preload(content, level),
            AdviceWidget.loadAssets(content.presentation.clips),
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
        // The top bar keeps its original margins from the UI area's edges.
        const bankLeft = uiAreaEdge(bankLayer, 'left'), bankRight = uiAreaEdge(bankLayer, 'right')
        // Edge-anchored controls can sit outside the HUD's 800 width, so their tooltips clamp to the visible screen.
        const tooltipSurface = uiNode({ name: 'TooltipSurface', parent: hud, position: { x: WIDTH / 2, y: -HEIGHT / 2 }, viewport: true }).node
        const mobileGridGuide = uiNode({
            name: 'MobilePlantGridGuide', parent: board, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 }, graphics: true, active: false,
        }).node
        mobileGridGuide.setSiblingIndex(bankLayer.getSiblingIndex())
        const bank = uiNode({
            node: slots.bank, parent: bankLeft, position: { x: 10, y: 0 }, anchor: { x: 0, y: 1 },
            sprite: { frame: seedbank, sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).node
        // SeedBank::Draw: past six slots the bank repeats its own right end, read from (width - extra - 12), at width - 12.
        const bankWidth = seedbank.originalSize.width, bankHeight = seedbank.originalSize.height
        const bankExtension = uiNode({
            name: 'SeedBankExtension', parent: bank, position: { x: bankWidth - 12, y: 0 }, anchor: { x: 0, y: 1 },
            size: { width: 12, height: bankHeight }, mask: Mask.Type.GRAPHICS_RECT, active: false,
        }).node
        bankExtension.setSiblingIndex(0)
        const bankExtensionImage = ui.image(bankExtension, seedbank).node
        uiNode({ node: slots.seedPacket, position: { x: 85, y: -8 }, anchor: { x: 0, y: 1 } })
        const sunText = ui.label(slots.sunText.parent!, {
            node: slots.sunText, text: '', font: sunFont, color: Color.BLACK,
            x: 34, y: 78, align: 'center', baseline: true, pixelAlign: true,
        })
        const coinLayer = uiNode({
            node: slots.coinLayer, size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const coinBank = await LevelCoinBank.create(content, ui, hud, coinLayer)
        const meterNodes = await LevelProgressMeter.create(content, ui, slots, hud, initial.wave, houseOfTerror16)

        const houseName = uiNode({
            node: slots.houseName, position: { x: -WIDTH / 2, y: HEIGHT / 2 },
            size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 }, opacity: 255,
        }).node
        ui.label(houseName, {
            node: slots.houseLabel, text: ui.text('PLAYERS_HOUSE').replace('{PLAYER}', playerName), font: houseOfTerror28,
            width: WIDTH, y: 550, align: 'center', baseline: true,
        })
        const initializePreview = (node: Node) => {
            uiNode({ node, position: { x: 0, y: 0 }, anchor: { x: 0, y: 1 }, sprite: { frame: null } })
            const preview = node.addComponent(PlantPreview)
            preview.initialize(content.presentation, undefined, { x: 0, y: 0, scale: 1 })
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
        // The plant and tool cursors follow the pointer over the lawn.
        const cursorLayer = uiNode({ name: 'CursorLayer', parent: hud }).node
        cursorLayer.setSiblingIndex(cursorPreview.getSiblingIndex())
        cursorPreview.setParent(cursorLayer)
        // What a level rule draws over the HUD (the mallet's POW, RENDER_LAYER_ABOVE_UI): under the cursors, and under a
        // seed chooser, which goes between the two.
        const ruleEffects = uiNode({ name: 'RuleEffects', parent: hud }).node
        ruleEffects.setSiblingIndex(cursorLayer.getSiblingIndex())
        const awardLayer = uiNode({
            node: slots.awardLayer, size: { width: WIDTH, height: HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const overlayLayer = uiNode({
            node: slots.overlayLayer, size: { width: WIDTH, height: HEIGHT },
        }).node
        const fadeParts = uiNode({
            node: slots.fade,
            graphics: true,
        })
        const levelCompleteFade = fadeParts.node
        levelCompleteFade.active = false
        const rulePresentation = levelRulePresentation(content.presentation, level)
        const graveRise = rulePresentation?.graveRise ?? content.presentation.graves.rise
        const audio = new LevelAudioPresenter(presentation.board.music)
        const createSeedChooser = async (chooser: NonNullable<WorldSnapshot['seedChooser']>) => {
            const created = await LevelSeedChooser.create(ui, content, hud, chooser.availableSeeds, chooser.slots, root, seedId => {
                // Board::SeedNotRecommendedForLevel, on the installed land boards.
                const seed = content.definitions.seeds[seedId]
                if (seed.kind !== 'plant') return undefined
                if (content.definitions.plants[seed.id].nocturnal && !boardDefinition.night) return 'NOCTURNAL_WARNING'
                if (seed.placement === 'grave' && !level.graves?.length) return 'NOT_RECOMMENDED_FOR_LEVEL'
                if (seed.placement === 'water') return 'NOT_RECOMMENDED_FOR_LEVEL'
                return undefined
            }, { almanac: player.almanacZombies !== undefined, store: player.store }, chooser.entries, chooser.cheatSeeds === true)
            created.placeBefore(cursorLayer)
            return created
        }
        const seedChooser = initial.seedChooser === undefined ? undefined : await createSeedChooser(initial.seedChooser)
        let view!: LevelView
        const intro = await presentation.createIntro({
            content, level, slots, board, entityLayer, bank, houseName, audio, ui,
            previewTooltipSurface: seedChooser?.previewTooltipSurface,
            almanacZombies: player.almanacZombies, openAlmanacZombie: zombie => view.onOpenAlmanac?.(zombie),
            chooserPages: player.almanacZombies !== undefined || player.store === true,
            seedChooser: seedChooser !== undefined,
            previewZombies: initial.wave.previewZombies ?? {},
            hasOpeningDialog: initial.dialog !== undefined,
        })
        const entityRenderer = new LevelEntityRenderer(
            content,
            entityLayer, coinLayer, awardLayer, intro, graveRise,
        )
        const end = new LevelEndPresenter(content, overlayLayer, levelCompleteFade, audio)
        entityRenderer.levelEndTicks = () => end.elapsed
        // The tutorial's arrow at a packet, over the HUD; a repick puts it under the bank it points at (raiseBankToChooser).
        const tutorialArrows = uiNode({ name: 'TutorialArrows', parent: coinLayer.parent! }).node
        const hudPresenter = LevelHudPresenter.create({
            ui, content, level, levelRule: () => view.rule, seedChooser: initial.seedChooser, initialSeeds: initial.seedPackets.map(packet => packet?.seedId), presentation, seedPacketSlot: slots.seedPacket, rootLayer: root.layer,
            packetCostFont: pico129,
            adviceNode: slots.advice, adviceParent: hud, tooltipSurface, controlsParent: bankRight, adviceFont: houseOfTerror28,
            tutorialArrowLayer: tutorialArrows, tutorialLawnFlash: slots.tutorialLawnFlash, cursorPreview, gridPreview, mobileGridGuide,
            cursorPlant, gridPlant,
            sunText, progressMeter: meterNodes.meter, progressFillClip: meterNodes.fillClip, progressFill: meterNodes.fill, progressHead: meterNodes.head, levelText: meterNodes.levelText, coinBank,
        })
        const particlePresenter = new LevelParticlePresenter(
            layout,
            new Map<Extract<LevelParticleOwnerSnapshot, { kind: 'screen' }>['slot'], Node>([
                ['board', board], ['entity-layer', entityLayer], ['coin-layer', coinLayer],
                ['hud', hud], ['award-layer', awardLayer], ['rule-effects', ruleEffects],
                ...hudPresenter.seedBank.packets.map((packet, index) => [index === 0 ? 'seed-packet' : `seed-packet-${index}` as const, packet.view.node] as const),
                ['overlay-layer', overlayLayer],
            ]),
            entityRenderer,
            intro,
        )
        const gameOver = new LevelGameOverPresenter(board, bank, entityLayer, overlayLayer, entityRenderer, audio, gameOverFrames, presentation.board.gameOver)
        view = new LevelView(root, audio, intro, end, gameOver, entityRenderer, hudPresenter, particlePresenter, content.definitions, level, boardDefinition)
        entityRenderer.sunBankOffset = () => bankLeft.position.x
        entityRenderer.uiOnLawn = (x, y) => view.uiOnLawn(x, y)
        entityRenderer.lawnScale = () => view.lawnScale
        entityRenderer.shake = (x, y, haptic) => view.shakeBoard(x, y, haptic)
        view.openSeedChooser = createSeedChooser
        if (seedChooser) view.attachSeedChooser(seedChooser)
        if (initial.tools || level.conveyor || initial.tutorial.dave) {
            view.boardHud = await LevelBoardHud.create(hud, bankLeft, content, ui, initial, cursorLayer, hudPresenter.seedBank, player, tooltipSurface, overlayLayer)
        }
        view.plantingLine = await PlantingLineView.create({ content, ui, ground: slots.sodClip, level, look: presentation.plantingLine, initial })
        if (level.rules) {
            view.rule = await createLevelRuleView({ kind: level.rules.kind, config: rulePresentation ?? {}, content, ui, initial, audio,
                cursorLayer, effectLayer: ruleEffects, ground: slots.sodClip, bank, bankHeight })
        }
        // The HUD and the seed bank layer are screen UI under the board. They cancel the lawn's shift and scale, and the
        // seed chooser holds them through its whole camera pan; restoring a completed intro clears that hold. The HUD's
        // lawn layers (items, awards, cursors) undo the pin, taking the lawn's top left and size back, so anything else
        // added to the HUD stays on screen at its own size.
        view.boardNode = board
        view.hudNode = hud
        view.pinScreen = () => {
            const pin = seedChooser && !intro.complete ? board.position.x : view.lawnShift
            const scale = view.lawnScale, unscale = 1 / scale
            const pinned = (node: Node) => {
                node.setPosition((-WIDTH / 2 - pin) * unscale, HEIGHT / 2 * unscale)
                node.setScale(unscale, unscale, 1)
            }
            pinned(hud)
            // A repick lifts the bank's layer into the HUD, over it (raiseBankToChooser).
            if (bankLayer.parent === hud) {
                bankLayer.setPosition(0, 0)
                bankLayer.setScale(1, 1, 1)
            } else pinned(bankLayer)
            for (const layer of [coinLayer, awardLayer, ruleEffects, cursorLayer]) {
                layer.setPosition(pin + WIDTH / 2 * (1 - scale), -HEIGHT / 2 * (1 - scale))
                layer.setScale(scale, scale, 1)
            }
        }
        // A repick lifts the bank over everything but the chooser: the lawn's entities and the HUD's coins and sun, which
        // would otherwise come between the bank and the chooser's cards resting in it. It goes back under the entities
        // after, where play draws it, the sun flying over it. Above the chooser it would hide those cards.
        // The level award (the seed packet a win drops) goes under the bank meanwhile, as the lawn's other items do.
        let bankRaised = false, awardIndex = 0
        const raiseBankToChooser = (raised: boolean) => {
            const chooser = view.seedChooser
            if (raised === bankRaised || !chooser) return
            bankRaised = raised
            if (hud.parent !== board) {
                // The HUD stands elsewhere, so the bank only goes over the entities beside it.
                if (raised !== bankLayer.getSiblingIndex() > entityLayer.getSiblingIndex()) bankLayer.setSiblingIndex(entityLayer.getSiblingIndex())
                return
            }
            const award = awardLayer.parent === hud
            if (raised) {
                if (award) { awardIndex = awardLayer.getSiblingIndex(); chooser.placeUnder(awardLayer) }
                if (tutorialArrows.parent === hud) chooser.placeUnder(tutorialArrows)
                bankLayer.setParent(hud, true)
                chooser.placeUnder(bankLayer)
            } else {
                bankLayer.setParent(board, true)
                // Right before the entity layer, where it was put at the start.
                bankLayer.setSiblingIndex(entityLayer.getSiblingIndex())
                if (tutorialArrows.parent === hud) tutorialArrows.setSiblingIndex(hud.children.length - 1)
                if (award) awardLayer.setSiblingIndex(awardIndex)
            }
            view.pinScreen()
        }
        // How far above its place the bank was when a repick's chooser started to drop, until it is back there.
        let hiddenBankY: number | undefined
        view.syncSeedChooserIntro = () => {
            const chooser = view.seedChooser
            if (!chooser) return
            // Keep the bank above the entities while the chooser is over it: until the intro's return pan finishes at tick
            // 600, and through a repick.
            const raiseBank = (above: boolean) => {
                if (above === bankLayer.getSiblingIndex() > entityLayer.getSiblingIndex()) return
                // The two layers are adjacent, so moving the bank to the entity layer's index swaps them.
                bankLayer.setSiblingIndex(entityLayer.getSiblingIndex())
            }
            // A repick in play drops and lifts the chooser on its own ticks, the camera staying put. The bank goes to its
            // choosing place at the left edge as the chooser drops and back as it lifts, as quickly (the intro's
            // SeedBankRight, SEED_BANK_OFFSET_X and SEED_BANK_OFFSET_X_END).
            const tick = intro.elapsedTicks
            const repick = intro.complete ? chooser.repickTick : undefined
            if (repick !== undefined) {
                chooser.syncIntro(repick)
                // A bank a rule still keeps above the screen (Whack-a-Zombie's, until there is sun) comes down as the chooser
                // drops, as the intro's does, for the cards to be chosen into it, and goes back up as the chooser lifts: the
                // level stood still meanwhile, so it is no nearer its time.
                if (repick <= SEED_CHOOSER_SLIDE.onEnd) hiddenBankY ??= bank.position.y
                bank.setPosition(repick <= SEED_CHOOSER_SLIDE.onEnd ? animateCurve(SEED_CHOOSER_SLIDE.onStart, SEED_CHOOSER_SLIDE.onEnd, repick, 10, 0, 'ease-in-out') : animateCurve(SEED_CHOOSER_SLIDE.offStart, SEED_CHOOSER_SLIDE.offEnd, repick, 0, 10, 'ease-in-out'),
                    hiddenBankY === undefined ? bank.position.y
                        : repick <= SEED_CHOOSER_SLIDE.onEnd ? animateCurve(SEED_CHOOSER_SLIDE.onStart, SEED_CHOOSER_SLIDE.onEnd, repick, hiddenBankY, 0, 'ease-in-out') : animateCurve(SEED_CHOOSER_SLIDE.offStart, SEED_CHOOSER_SLIDE.offEnd, repick, 0, hiddenBankY, 'ease-in-out'))
                if (repick >= SEED_CHOOSER_SLIDE.offEnd) hiddenBankY = undefined
                chooser.setBankShift(bank.position.x, bank.position.y)
                raiseBankToChooser(repick < SEED_CHOOSER_SLIDE.offEnd)
                return
            }
            chooser.syncIntro(tick)
            if (!seedChooser) return
            view.pinScreen()
            raiseBank(!intro.complete && tick < 600)
        }
        view.shakeTarget = { node: board, x: board.position.x, y: board.position.y }
        view.hitboxes = new LevelHitboxes(entityRenderer, content.definitions)
        view.healthBars = new LevelHealthBars(entityRenderer, content.definitions, ui, pico129)
        view.player = player
        view.applySeedBankSlots = count => {
            const extra = seedBankExtraWidth(count)
            bankExtension.active = extra > 0
            uiNode({ node: bankExtension, size: { width: extra + 12, height: bankHeight } })
            bankExtensionImage.setPosition(extra - (bankWidth - 12), 0)
            hudPresenter.seedBank.setSlots(count)
            seedChooser?.setSlots(count)
            view.boardHud?.setSeedBankSlots(count)
        }
        // SeedBank::UpdateWidth: any bank but the conveyor widens for its slots, chosen or filled.
        if (!level.conveyor) {
            view.seedBankSlots = initial.seedChooser?.slots ?? initial.seedPackets.length
            view.applySeedBankSlots(view.seedBankSlots)
        }
        if (view.boardHud) view.boardHud.onQuestion = question => view.askDialogQuestion(ui, question)
        intro.sync()
        view.pinScreen()
        // Over everything the HUD got since, as the arrow spawned in play always was.
        tutorialArrows.setSiblingIndex(tutorialArrows.parent!.children.length - 1)
        return view
    }

    /**
     * Mods that move or scale the lawn report it: `shift`, how far right of its original gameplay place they moved the
     * board (wide viewports); `scale`, the size to show the lawn at (a high view's 600/720), which the view gives the
     * board. What is left out stays. The screen UI cancels both and keeps its size; input, and what flies between the
     * lawn and the UI, map through the board (lawnPointAt, uiOnLawn).
     */
    setWorldView(view: { shift?: number, scale?: number }): void {
        if (view.shift !== undefined) this.lawnShift = view.shift
        if (view.scale !== undefined) {
            this.lawnScale = view.scale
            this.boardNode?.setScale(view.scale, view.scale, 1)
        }
        this.pinScreen()
    }

    /** The lawn pixel under a point of the screen (a pointer's UI location), wherever the board is moved or scaled. */
    lawnPointAt(x: number, y: number): { x: number, y: number } {
        if (!this.boardNode) return { x, y }
        const local = uiNode({ node: this.boardNode }).transform.convertToNodeSpaceAR(new Vec3(x, y))
        return { x: local.x + WIDTH / 2, y: HEIGHT / 2 - local.y }
    }

    /**
     * Where a point of the screen UI, in the HUD's 800x600 layout (y down), is on the lawn: the counter that sun and
     * money fly to, the screen's middle the award goes to.
     */
    uiOnLawn(x: number, y: number): { x: number, y: number } {
        if (!this.boardNode || !this.hudNode) return { x, y }
        const world = uiNode({ node: this.hudNode }).transform.convertToWorldSpaceAR(new Vec3(x, -y))
        const local = uiNode({ node: this.boardNode }).transform.convertToNodeSpaceAR(world)
        return { x: local.x + WIDTH / 2, y: HEIGHT / 2 - local.y }
    }

    updateIntro(dt: number): boolean {
        // Graves rise by the intro's time, between the level's frames.
        this.entityRenderer.syncGridItems()
        // Play counts the coin bank in gameplay ticks; before that the intro's time does.
        if (!this.introComplete && !this.questionOpen) this.hud.advanceCoinBank(dt * 100)
        this.hud.setCoinBankBesideDave(this.boardHud?.daveOut ?? false)
        if (this.boardHud) {
            this.boardHud.update(dt, this.intro.elapsedTicks)
            if (this.boardHud.blocksIntro) return false
        }
        const complete = this.intro.update(dt, this.seedChooser?.choosing ? SEED_CHOOSER_SLIDE.onEnd : undefined)
        this.seedChooser?.update(dt)
        this.syncSeedChooserIntro()
        return complete
    }

    bindSeedChooser(send: (command: GameCommand) => void): void {
        this.seedChooserSend = send
        this.seedChooser?.bind(send)
    }

    /** Advice the client itself has (a debug switch turned by its key): a string key, its %s filled with `args`' strings. */
    showAdvice(advice: { key: string, args?: string[] }): void {
        this.hud.showAdvice(advice.key, advice.args)
    }

    /** Presses the chooser's Let's Rock from the keyboard; whether there was one to press. */
    pressSeedChooserStart(): boolean {
        return this.seedChooser?.pressStart() ?? false
    }

    /** Takes the level's chooser, opened with the level or later by a repick; Mods wrap it to add to every chooser. */
    attachSeedChooser(chooser: LevelSeedChooser): void {
        this.seedChooser = chooser
        chooser.onAlmanac = () => this.onOpenAlmanac?.()
        chooser.onStore = () => this.onOpenStore?.()
        chooser.bind(this.seedChooserSend)
        if (this.standingStill) this.syncAnimationPause()
    }

    /** A repick stands the level still as a pause does: everything but the chooser over it waits. */
    private standStill(still: boolean): void {
        if (still === this.standingStill) return
        this.standingStill = still
        this.syncAnimationPause()
    }

    private syncAnimationPause(): void {
        const winner = this.presentationPaused ? this.gameOver.winnerId : undefined
        const shouldHold = (component: Component) =>
            (this.presentationPaused && (winner === undefined || !this.entityRenderer.runsDuringGameOver(winner, component))) ||
            (this.standingStill && !this.seedChooser?.holds(component.node))
        for (const component of this.heldAnimations) {
            if (component.isValid && shouldHold(component)) continue
            this.heldAnimations.delete(component)
            if (component.isValid) component.enabled = true
        }
        if (!this.presentationPaused && !this.standingStill) return
        for (const component of this.root.getComponentsInChildren(Component)) {
            if (component.enabled && (component instanceof ReanimPlayer || component instanceof ParticlePlayer) && shouldHold(component)) {
                this.heldAnimations.add(component)
                component.enabled = false
            }
        }
    }

    /** Sends the player's Yes/No to a dialogue question (`answerDialog`). */
    bindDialogAnswer(send: (accept: boolean) => void): void { this.answerDialog = send }

    /** CutScene's DIALOG_PURCHASE_PACKET_SLOT: the price, the slot count, and the purse beside it. */
    private askDialogQuestion(ui: UI, question: DialogQuestion): void {
        if (question.kind !== 'pvz:packetUpgrade') return
        this.hud.showCoinBank(100)
        const dialog = ui.dialog(this.root, {
            title: formatMoney(Number(question.cost)),
            message: ui.text('UPGRADE_DIALOG_BODY').replace(/\{SLOTS\}/g, String(question.slots)),
            confirmText: ui.text('DIALOG_BUTTON_YES'), cancelText: ui.text('DIALOG_BUTTON_NO'),
        })
        // aDialog->mX += 120, mY += 130: the panel moves within the screen, which still bounds its dragging.
        dialog.content.setPosition(dialog.content.position.x + 120, dialog.content.position.y - 130)
        this.questionOpen = true
        this.hud.setCoinBankBesideDave(true)
        void dialog.result.then(accept => {
            this.questionOpen = false
            if (this.root.isValid) this.answerDialog(accept)
        })
    }
    pointerOffsetY(seedId: string): number { return this.hud.pointerOffsetY(seedId) }

    setPointer(pointer?: { x: number, y: number }): void {
        this.rule?.setPointer?.(pointer)
        this.boardHud?.setPointer(pointer)
        this.entityRenderer.setPointer(pointer)
        this.hud.setPointer(pointer)
    }

    bindTools(select: (toolId: string) => void) { return this.boardHud?.bindTools(select) ?? [] }
    get dialogReady(): boolean { return this.boardHud?.dialogReady ?? false }

    resetCursor(): void {
        this.hud.resetCursor()
    }

    updateLevelComplete(dt: number): boolean {
        return this.end.update(dt)
    }

    updateGameOver(dt: number): boolean {
        return this.gameOver.update(dt)
    }

    seedPacketAt(snapshot: WorldSnapshot, index: number) { return this.hud.seedBank.packetAt(snapshot, index) }

    bindSeedPackets(select: (index: number) => void): UIButton[] {
        return this.hud.bindSeedPackets(select)
    }

    bindMenu(open: () => void): UIButton {
        return this.hud.bindMenu(open)
    }

    setPaused(paused: boolean): void {
        paused = paused || this.gameOver.active
        if (!paused && !this.presentationPaused) return
        this.presentationPaused = paused
        this.syncAnimationPause()
        const visit = (node: Node) => {
            if (paused) Tween.pauseAllByTarget(node)
            else Tween.resumeAllByTarget(node)
            for (const child of node.children) visit(child)
        }
        visit(this.root)
    }

    sync(snapshot: WorldSnapshot, changes: ClientWorldChanges, events: ServerEvent[]): void {
        this.lastSnapshot = snapshot
        this.gameplayTick = snapshot.gameplayTick
        for (const event of events) {
            if (event.type === 'achievementEarned' && typeof event.data.id === 'string') this.onAchievementEarned?.(event.data.id, event.data.announce === true)
            if (event.type !== 'packetUpgradePurchased' && event.type !== 'packetUpgradeDeclined') continue
            // CRAZY_DAVE_1510 quotes the next upgrade's price.
            if (event.type === 'packetUpgradePurchased') this.player.upgradeCost = this.player.nextUpgradeCost
            this.onPacketUpgradeAnswered?.(event.type === 'packetUpgradePurchased', snapshot.money)
            // The answer saved the coins; no separate onMoneyChanged.
            this.money = snapshot.money
        }
        const slots = snapshot.seedChooser?.slots ?? 0
        if (slots > this.seedBankSlots) { this.seedBankSlots = slots; this.applySeedBankSlots(slots) }
        const repick = snapshot.seedChooser?.repick === true
        this.audio.holdMusic(repick)
        if (repick && !this.seedChooser && this.openSeedChooser && !this.openingSeedChooser) {
            this.openingSeedChooser = true
            void this.openSeedChooser(snapshot.seedChooser!).then(chooser => {
                this.attachSeedChooser(chooser)
                if (this.lastSnapshot) chooser.sync(this.lastSnapshot)
                this.syncSeedChooserIntro()
            }).finally(() => { this.openingSeedChooser = false })
        }
        this.hud.seedBank.awaitingChooser = repick && !this.seedChooser
        this.standStill(repick)
        if (this.money !== undefined && snapshot.money !== this.money) this.onMoneyChanged?.(snapshot.money)
        this.money = snapshot.money
        this.boardHud?.sync(snapshot)
        this.seedChooser?.sync(snapshot)
        this.entityRenderer.sync(snapshot, changes, events)
        this.syncSeedChooserIntro()
        if (this.haptic) Haptics.play(this.haptic)
        this.haptic = undefined
        this.syncShake(snapshot.gameplayTick)
        this.end.sync(snapshot, events)
        this.hud.sync(snapshot, events, this.introComplete, this.menuVisible)
        this.rule?.sync?.(snapshot, events, this.introComplete)
        this.plantingLine?.sync(snapshot)
        for (const event of events) this.audio.play(event)
        this.hitboxes.sync(snapshot)
        this.healthBars.sync(snapshot)
        if (snapshot.result === 'lost') {
            this.end.cancelWarnings()
            this.gameOver.sync(snapshot, events)
            this.setPaused(true)
        }
    }

    private shake = { endTick: 0, ticks: 0, x: 0, y: 0, tick: 0 }
    private shakeTarget: { node: Node, x: number, y: number } | null = null
    /** The strongest haptic of this frame's shakes. */
    private haptic?: HapticStyle

    /** Board::ShakeBoard for 12 gameplay ticks (LevelStage.shake). */
    private shakeBoard(x: number, y: number, haptic: HapticStyle): void {
        this.shake = { x, y, ticks: 12, endTick: this.gameplayTick + 12, tick: -1 }
        if (!this.haptic || HAPTIC_STRENGTH.indexOf(haptic) > HAPTIC_STRENGTH.indexOf(this.haptic)) this.haptic = haptic
    }

    private syncShake(tick: number): void {
        const target = this.shakeTarget
        if (!target?.node.isValid || tick === this.shake.tick) return
        this.shake.tick = tick
        const remaining = this.shake.endTick - tick
        if (remaining <= 0) { target.node.setPosition(target.x, target.y); return }
        if (Math.random() < 1 / 3) this.shake.x = -this.shake.x
        // Board::Update: PvzpAnimateCurve(12, 0, mShakeCounter, 0, mShakeAmountX, CURVE_BOUNCE), and the same down.
        const { ticks, x, y } = this.shake
        target.node.setPosition(target.x + animateCurve(ticks, 0, remaining, 0, x, 'bounce'), target.y - animateCurve(ticks, 0, remaining, 0, y, 'bounce'))
    }

    async snapshot(flow: LevelFlowSnapshot): Promise<LevelPresentationSnapshot> {
        const hud = this.hud.snapshot()
        const [board, particles] = await Promise.all([
            this.entityRenderer.snapshot(),
            this.particles.snapshot(),
        ])
        // Typed, so the format it is written in is the one it is read in; parsed, so it is saved only if it reads back.
        const snapshot: LevelPresentationSnapshot = {
            schemaVersion: 5,
            flow,
            intro: this.intro.snapshot(),
            end: this.end.snapshot(),
            advice: hud.advice,
            hud: hud.hud,
            audio: this.audio.snapshot(),
            ...board,
            particles,
            extensions: {},
        }
        return parseLevelPresentationSnapshot(snapshot)
    }

    async restore(snapshot: LevelPresentationSnapshot): Promise<void> {
        await this.intro.restore(snapshot.intro)
        // The board, graves rising with the intro included, is shown as it was, quietly.
        await this.entityRenderer.restore(snapshot)
        this.syncSeedChooserIntro()
        this.hud.restore(snapshot.hud, snapshot.advice, this.introComplete, this.menuVisible)
        await Promise.all([this.end.restore(snapshot.end, snapshot.flow.completionStarted), this.audio.restore(snapshot.audio)])
        await this.particles.restore(snapshot.particles)
    }


}
