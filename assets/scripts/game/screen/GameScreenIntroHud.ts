import { Color, EventMouse, EventTouch, Mask, Node, Rect, Size, SpriteFrame } from 'cc'
import { Animator } from '@/core/Animator'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { MoneyCounter } from '@/ui/MoneyCounter'
import { CrazyDaveWidget } from '@/ui/CrazyDaveWidget'
import { getAtlasFrame } from '@/ui/SeedPacketRenderer'
import { createStoneButton } from '@/ui/StoneButton'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { ZOMBIE_DEFINITIONS } from '../GameDefinitions'
import { GameDebugSettings } from '../GameDebugSettings'
import { MusicSystem } from '../music/MusicSystem'
import { createZombieAnimationView, playZombieBodyAnimation } from '../ZombieAnimation'
import { getAnimationRateSpeed } from '../PlantAnimation'
import {
    CRAZY_DAVE_FIRST_DIALOG_END,
    CRAZY_DAVE_FIRST_DIALOG_START,
    CRAZY_DAVE_INTRO_DELAY_SECONDS,
    CRAZY_DAVE_POST_SHOVEL_DIALOG_END,
    CRAZY_DAVE_POST_SHOVEL_DIALOG_START,
    CRAZY_DAVE_X,
    CRAZY_DAVE_Y,
    type CrazyDaveMessagePhase,
} from './CrazyDaveDialogConfig'
import { eventToBoardPixel } from './BoardPixelUtils'
import { linearFloat } from './GameScreenMath'
import {
    BOARD_OFFSET,
    COIN_BANK_RIGHT_TEXT_OFFSET,
    COIN_BANK_X,
    GAME_OVER_DOOR_INTERIOR_X,
    GAME_OVER_DOOR_INTERIOR_Y,
    GAME_OVER_DOOR_MASK_X,
    GAME_OVER_DOOR_MASK_Y,
    INTRO_STREET_ZOMBIE_BASE_X,
    INTRO_STREET_ZOMBIE_BASE_Y,
    INTRO_STREET_ZOMBIE_GRID_SIZE,
    INTRO_STREET_ZOMBIE_GRID_X_STEP,
    INTRO_STREET_ZOMBIE_GRID_Y_STEP,
    INTRO_STREET_ZOMBIE_ODD_COLUMN_Y_OFFSET,
    INTRO_STREET_ZOMBIE_ODD_COLUMN_Z_OFFSET,
    INTRO_STREET_ZOMBIE_PREVIEW_CAPACITY,
    INTRO_STREET_ZOMBIE_RANDOM_OFFSET,
    INTRO_STREET_ZOMBIE_ROW_Z_STEP,
    INTRO_STREET_ZOMBIE_WAVE,
    INTRO_STREET_ZOMBIE_Z_BASE,
    LAWN_MOWER_CACHED_DRAW_OFFSET_X,
    LEVEL_LABEL_BASELINE_Y,
    LEVEL_LABEL_RIGHT_X,
    MENU_BUTTON_HEIGHT,
    MENU_BUTTON_WIDTH,
    PROGRESS_METER_CEL_HEIGHT,
    PROGRESS_METER_FILL_RIGHT_INSET,
    PROGRESS_METER_HEAD_START_X,
    PROGRESS_METER_HEAD_Y,
    PROGRESS_METER_LEVEL_X,
    PROGRESS_METER_LEVEL_Y,
    PROGRESS_METER_PART_COLUMNS,
    PROGRESS_METER_PART_HEIGHT,
    PROGRESS_METER_PART_WIDTH,
    PROGRESS_METER_WIDTH,
    PROGRESS_METER_X,
    PROGRESS_METER_Y,
    SHOVEL_BUTTON_Y,
    SOD_ROW_X,
    SOD_ROW_Y,
    SOD_THREE_ROW_X,
    SOD_THREE_ROW_Y,
    SUN_AMOUNT_BASELINE_X,
    SUN_AMOUNT_BASELINE_Y,
    GameScreenCore,
} from './GameScreenCore'
import type { IntroStreetZombieSpec, ProgressFlagView } from './GameScreenViewTypes'
import type { GameEntity, SeedPacketState, SeedType, ZombieEntity, ZombieType } from '../GameTypes'

export abstract class GameScreenIntroHud extends GameScreenCore {
    protected async _drawStaticBoard() {
        const unsodded = SpriteLoader.get('background1unsodded')
        if (unsodded) {
            this._unsoddedNode = createSpriteNode({
                name: 'BackgroundUnsodded',
                spriteFrame: unsodded,
                parent: this._boardContent,
                x: -BOARD_OFFSET,
                y: 0,
            })
        }

        const background = SpriteLoader.get('background1')
        if (background) {
            this._soddedNode = createSpriteNode({
                name: 'Background',
                spriteFrame: background,
                parent: this._boardContent,
                x: -BOARD_OFFSET,
                y: 0,
            })
            this._soddedNode.active = this._startsWithFullLawn()
        }
        if (this._unsoddedNode) this._unsoddedNode.active = !this._startsWithFullLawn()
        this._drawBowlingStripe()

        const sodLayout = this._introSodLayout()
        const baseSod = sodLayout.baseSprite ? SpriteLoader.get(sodLayout.baseSprite) : null
        if (baseSod) {
            this._sodBaseNode = createSpriteNode({
                name: 'SodBase',
                spriteFrame: baseSod,
                parent: this._boardContent,
                x: sodLayout.baseX,
                y: -sodLayout.baseY,
            })
            this._sodBaseNode.active = sodLayout.baseVisible
        }

        const sod = SpriteLoader.get(sodLayout.clipSprite)
        if (sod) {
            this._sodClipRevealWidth = sodLayout.clipRevealWidth ?? sod.originalSize.width
            this._sodClipNode = createUINode('SodClip', {
                parent: this._boardContent,
                anchorX: 0,
                anchorY: 1,
                width: sodLayout.clipVisible ? 0 : this._sodClipRevealWidth,
                height: sod.originalSize.height,
                x: sodLayout.clipX,
                y: -sodLayout.clipY,
            })
            this._sodClipNode.active = sodLayout.clipVisible
            this._sodClipNode.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
            createSpriteNode({
                name: 'SodRow',
                spriteFrame: sod,
                parent: this._sodClipNode,
                x: sodLayout.clipSpriteOffsetX ?? 0,
                y: sodLayout.clipSpriteOffsetY ?? 0,
            })
            this._tutorialLawnFlashNode = createSpriteNode({
                name: 'TutorialLawnFlash',
                spriteFrame: sod,
                parent: this._boardContent,
                layer: this.node.layer,
                x: SOD_ROW_X,
                y: -SOD_ROW_Y,
            })
            this._tutorialLawnFlashNode.active = false
        }

        if (this._shouldPlayIntroSodRoll() && this._sodRollAnimation?.json) {
            for (const spec of this._introSodRollSpecs()) {
                const node = createUINode('SodRoll', {
                    parent: this._boardContent,
                    anchorX: 0,
                    anchorY: 1,
                    width: 800,
                    height: 600,
                    x: spec.x,
                    y: -spec.y,
                })
                node.active = false
                const animator = node.addComponent(Animator)
                await animator.parseJson(this._sodRollAnimation.json as Record<string, any>)
                const animNode = animator.addAnimNode('default')
                if (animNode) this._sodRollViews.push({ node, animNode })
            }
        }

        if (this._shouldCreateIntroLawnMower() && SpriteLoader.get('lawnmower_cached') && SpriteLoader.get('plantshadow')) {
            this._createIntroLawnMower()
        }

        if (!this._shouldSkipStandardIntro()) this._createIntroStreetZombies()
        this._createGameOverDoorLayers()
        this._entityLayer.setSiblingIndex(this._boardContent.children.length - 1)
    }

    protected _drawBowlingStripe() {
        if (this._session.level.bowling?.showBowlingStripe !== true) return

        const stripe = SpriteLoader.get('wallnut_bowlingstripe')
        if (!stripe) return

        const lineCol = this._session.level.bowling?.lineColMax ?? 2
        const stripeX = this._session.geometry.gridToPixel(lineCol + 1, 0).x - 12
        const stripeY = this._session.geometry.lawnYMin - 3
        this._bowlingStripeNode = createSpriteNode({
            name: 'WallnutBowlingStripe',
            spriteFrame: stripe,
            parent: this._boardContent,
            layer: this.node.layer,
            x: stripeX,
            y: -stripeY,
            anchorX: 0,
            anchorY: 1,
            z: 2,
        })
        this._bowlingStripeNode.active = false
    }

    protected _syncBowlingStripeVisibility() {
        if (!this._bowlingStripeNode?.isValid) return
        this._bowlingStripeNode.active = this._bowlingStripeRevealed &&
            this._session.level.bowling?.showBowlingStripe === true &&
            !this._gameOverActive
    }

    protected _introSodLayout() {
        if (this._session.level.adventureLevel === 4) {
            return {
                baseSprite: 'sod3row',
                baseVisible: true,
                baseX: SOD_THREE_ROW_X,
                baseY: SOD_THREE_ROW_Y,
                clipSprite: 'background1',
                clipX: 232 - BOARD_OFFSET,
                clipY: 0,
                clipVisible: true,
                clipRevealWidth: 773,
                clipSpriteOffsetX: -232,
                clipSpriteOffsetY: 0,
            }
        }
        if (this._session.level.adventureLevel === 3) {
            return {
                baseSprite: 'sod3row',
                baseVisible: true,
                baseX: SOD_THREE_ROW_X,
                baseY: SOD_THREE_ROW_Y,
                clipSprite: 'sod3row',
                clipX: SOD_THREE_ROW_X,
                clipY: SOD_THREE_ROW_Y,
                clipVisible: false,
                clipRevealWidth: 771,
                clipSpriteOffsetX: 0,
                clipSpriteOffsetY: 0,
            }
        }
        if (this._session.level.adventureLevel === 2) {
            return {
                baseSprite: 'sod1row',
                baseVisible: true,
                baseX: SOD_ROW_X,
                baseY: SOD_ROW_Y,
                clipSprite: 'sod3row',
                clipX: SOD_THREE_ROW_X,
                clipY: SOD_THREE_ROW_Y,
                clipVisible: true,
                clipRevealWidth: 771,
                clipSpriteOffsetX: 0,
                clipSpriteOffsetY: 0,
            }
        }

        return {
            baseSprite: '',
            baseVisible: false,
            baseX: 0,
            baseY: 0,
            clipSprite: 'sod1row',
            clipX: SOD_ROW_X,
            clipY: SOD_ROW_Y,
            clipVisible: true,
            clipRevealWidth: 771,
            clipSpriteOffsetX: 0,
            clipSpriteOffsetY: 0,
        }
    }

    protected _introSodRollSpecs() {
        if (this._session.level.adventureLevel === 4) {
            return [
                { x: -3, y: -198 },
                { x: -3, y: 203 },
            ]
        }
        if (this._session.level.adventureLevel === 2) {
            return [
                { x: 0, y: -102 },
                { x: 0, y: 111 },
            ]
        }

        return [{ x: 0, y: 0 }]
    }

    protected _shouldPlayIntroSodRoll() {
        return this._session.level.adventureLevel <= 2 || this._session.level.adventureLevel === 4
    }

    protected _shouldCreateIntroLawnMower() {
        return !this._shouldSkipStandardIntro() ||
            (this._session.level.pauseGameplayOnStart === true && this._session.level.hasLawnMowers !== false)
    }

    protected _createGameOverDoorLayers() {
        const doorAnchor = this._gameOverDoorAnchor()
        const interior = SpriteLoader.get('background1_gameover_interior_overlay')
        const mask = SpriteLoader.get('background1_gameover_mask')
        const interiorOffset = this._gameOverDoorInteriorOffset()
        if (interior) {
            this._houseDoorBottomNode = createSpriteNode({
                name: 'GameOverDoorInterior',
                spriteFrame: interior,
                parent: this._boardContent,
                layer: this.node.layer,
                x: doorAnchor.x + interiorOffset.x,
                y: -(doorAnchor.y + interiorOffset.y),
            })
            this._houseDoorBottomNode.active = false
        }

        if (mask) {
            this._houseDoorTopNode = createSpriteNode({
                name: 'GameOverDoorMask',
                spriteFrame: mask,
                parent: this._boardContent,
                layer: this.node.layer,
                x: doorAnchor.x,
                y: -doorAnchor.y,
            })
            this._houseDoorTopNode.active = false
        }
    }

    protected _gameOverDoorAnchor() {
        return {
            x: GAME_OVER_DOOR_MASK_X,
            y: GAME_OVER_DOOR_MASK_Y,
        }
    }

    protected _gameOverDoorInteriorOffset() {
        return {
            x: GAME_OVER_DOOR_INTERIOR_X - GAME_OVER_DOOR_MASK_X,
            y: GAME_OVER_DOOR_INTERIOR_Y - GAME_OVER_DOOR_MASK_Y,
        }
    }

    protected _createIntroLawnMower() {
        const shadow = SpriteLoader.get('plantshadow')
        const cachedMower = SpriteLoader.get('lawnmower_cached')
        if (!shadow || !cachedMower) return

        for (const row of this._session.level.activeRows) {
            const shadowNode = createSpriteNode({
                name: `IntroLawnMowerShadow_${row}`,
                spriteFrame: shadow,
                parent: this._boardContent,
                layer: this.node.layer,
                anchorX: 0.5,
                anchorY: 0.5,
            })
            shadowNode.active = false

            const node = createUINode(`IntroLawnMower_${row}`, {
                parent: this._boardContent,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                width: 120,
                height: 120,
            })
            node.active = false

            createSpriteNode({
                name: 'CachedMower',
                spriteFrame: cachedMower,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                x: LAWN_MOWER_CACHED_DRAW_OFFSET_X,
                y: 0,
            })

            this._introLawnMowerViews.push({ row, node, shadowNode })
        }

        this._syncIntroLawnMower()
    }

    protected _createIntroStreetZombies() {
        const specs = this._introStreetZombieSpecs()
        for (let i = 0; i < specs.length; i++) {
            const spec = specs[i]
            const zombie = this._createIntroZombieEntity(spec, i)
            const node = createUINode(`IntroStreetZombie_${i}`, {
                parent: this._entityLayer,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                width: 120,
                height: 120,
                x: zombie.x,
                y: -zombie.y,
                z: this._introStreetZombieZ(spec),
            })
            this._createZombieVisual(node, zombie, { manualTime: false })
            this._introStreetZombieNodes.push(node)
        }
        this._syncIntroStreetZombieLayerOrder()
    }

    protected _introStreetZombieSpecs(): IntroStreetZombieSpec[] {
        const zombieTypeCount = new Map<ZombieType, number>()
        let totalZombieCount = 0
        const addZombie = (zombieType: ZombieType, count = 1) => {
            if (zombieType === 'flag' || count <= 0) return

            zombieTypeCount.set(zombieType, (zombieTypeCount.get(zombieType) ?? 0) + count)
            totalZombieCount += count
        }
        for (let waveIndex = 0; waveIndex < this._session.numWaves; waveIndex++) {
            for (const zombieType of this._session.zombiesInWave(waveIndex)) {
                addZombie(zombieType)
            }
        }
        if (totalZombieCount <= 0) return []

        const occupied = Array.from({ length: INTRO_STREET_ZOMBIE_GRID_SIZE }, () =>
            Array.from({ length: INTRO_STREET_ZOMBIE_GRID_SIZE }, () => false),
        )
        const specs: IntroStreetZombieSpec[] = []
        for (const zombieType of Object.keys(ZOMBIE_DEFINITIONS) as ZombieType[]) {
            const count = zombieTypeCount.get(zombieType) ?? 0
            if (count <= 0) continue

            const previewCapacity = this._session.level.introZombiePreviewCapacity ?? INTRO_STREET_ZOMBIE_PREVIEW_CAPACITY
            const previewCount = Math.max(
                1,
                Math.min(count, Math.floor(count * previewCapacity / totalZombieCount)),
            )
            for (let i = 0; i < previewCount; i++) {
                const spot = this._pickIntroStreetZombieSpot(zombieType, occupied)
                occupied[spot.gridX][spot.gridY] = true
                specs.push({ type: zombieType, gridX: spot.gridX, gridY: spot.gridY })
            }
        }
        return specs
    }

    protected _pickIntroStreetZombieSpot(zombieType: ZombieType, occupied: boolean[][]) {
        const candidates: Array<{ gridX: number, gridY: number }> = []
        for (let gridX = 0; gridX < INTRO_STREET_ZOMBIE_GRID_SIZE; gridX++) {
            for (let gridY = 0; gridY < INTRO_STREET_ZOMBIE_GRID_SIZE; gridY++) {
                if (!this._canIntroZombieGoInGridSpot(zombieType, gridX, gridY, occupied)) continue
                if (!occupied[gridX][gridY]) candidates.push({ gridX, gridY })
            }
        }
        if (candidates.length === 0) return { gridX: 2, gridY: 2 }

        return candidates[Math.floor(Math.random() * candidates.length)]
    }

    protected _canIntroZombieGoInGridSpot(zombieType: ZombieType, gridX: number, gridY: number, occupied: boolean[][]) {
        if (occupied[gridX][gridY]) return false
        if (zombieType === 'pole-vaulting' && (gridX === 0 || (gridX === 1 && gridY === 0))) return false
        return gridX !== INTRO_STREET_ZOMBIE_GRID_SIZE - 1 || gridY !== 0
    }

    protected _createIntroZombieEntity(spec: IntroStreetZombieSpec, index: number): ZombieEntity {
        const definition = ZOMBIE_DEFINITIONS[spec.type]
        const x = spec.gridX * INTRO_STREET_ZOMBIE_GRID_X_STEP +
            INTRO_STREET_ZOMBIE_BASE_X +
            Math.floor(Math.random() * INTRO_STREET_ZOMBIE_RANDOM_OFFSET)
        const y = spec.gridY * INTRO_STREET_ZOMBIE_GRID_Y_STEP +
            INTRO_STREET_ZOMBIE_BASE_Y +
            (spec.gridX % 2 === 1 ? INTRO_STREET_ZOMBIE_ODD_COLUMN_Y_OFFSET : 0) +
            Math.floor(Math.random() * INTRO_STREET_ZOMBIE_RANDOM_OFFSET)
        return {
            id: -1000 - index,
            kind: 'zombie',
            type: spec.type,
            subclass: 'normal',
            fromWave: INTRO_STREET_ZOMBIE_WAVE,
            row: Math.max(0, Math.min(this._session.geometry.rows - 1, spec.gridY)),
            x,
            y,
            velocityX: 0,
            health: definition.maxHealth,
            maxHealth: definition.maxHealth,
            helmType: definition.helmType,
            helmHealth: definition.helmHealth,
            helmMaxHealth: definition.helmHealth,
            shieldType: definition.shieldType,
            shieldHealth: definition.shieldHealth,
            shieldMaxHealth: definition.shieldHealth,
            state: 'walking',
            currentAnimation: this._pickIntroZombieAnimation(),
            animationSpeed: this._pickIntroZombieAnimationSpeed(),
            animationTime: Math.random() * 20,
            moweredTime: 0,
            charredTime: 0,
            age: 0,
            chilledCounter: 0,
            hitFlashCounter: 0,
            hasHead: true,
            hasArm: true,
            hasTongue: false,
            hasObject: definition.hasFlag || definition.hasFloat,
            poleVaulting: spec.type === 'pole-vaulting',
            inPool: definition.hasFloat,
            dead: false,
            bodyRect: { ...definition.bodyRect },
            attackRect: { ...definition.attackRect },
        }
    }

    protected _introStreetZombieZ(spec: IntroStreetZombieSpec) {
        return INTRO_STREET_ZOMBIE_Z_BASE +
            spec.gridY * INTRO_STREET_ZOMBIE_ROW_Z_STEP +
            (spec.gridX % 2) * INTRO_STREET_ZOMBIE_ODD_COLUMN_Z_OFFSET
    }

    protected _pickIntroZombieAnimation() {
        return Math.floor(Math.random() * 4) > 0 ? 'anim_idle2' : 'anim_idle'
    }

    protected _pickIntroZombieAnimationSpeed() {
        return (12 + Math.random() * 12) / 12
    }

    protected _syncIntroStreetZombieLayerOrder() {
        const sorted = [...this._introStreetZombieNodes].sort((a, b) => a.position.z - b.position.z)
        for (const node of sorted) {
            if (node.isValid) node.setSiblingIndex(this._entityLayer.children.length - 1)
        }
    }

    protected _drawHud() {
        if (this._session.level.conveyor?.enabled === true) {
            this._drawConveyorSeedBank()
        } else {
            const bank = SpriteLoader.get('seedbank')
            if (bank) {
                this._seedBankHeight = bank.originalSize.height
                this._seedBankNode = createSpriteNode({
                    name: 'SeedBank',
                    spriteFrame: bank,
                    parent: this._boardContent,
                    x: 0,
                    y: -bank.originalSize.height,
                })
                this._seedBankNode.setSiblingIndex(Math.max(0, this._entityLayer.getSiblingIndex()))
                this._createSeedBankExtension(bank)
                this._seedBankNode.active = false
            }
        }

        this._sunLabel = this._createBitmapText({
            name: 'SunAmount',
            text: '0',
            baselineX: SUN_AMOUNT_BASELINE_X,
            baselineY: SUN_AMOUNT_BASELINE_Y,
            font: this._sunFont,
            color: Color.BLACK,
            parent: this._seedBankNode ?? this._uiLayer,
            align: 'center',
        })
        if (this._session.level.conveyor?.enabled === true) this._sunLabel.node.active = false
        this._createMoneyCounter()
        this._createAdviceWidget()
        this._resultLabel = this._createLabel('Result', 400, -285, '', 42, new Color(255, 240, 120))
        this._resultLabel.node.active = false
        this._drawSeedPackets()
        this._createShovel()
        this._createCrazyDave()
        this._createMenuButton()
        this._createProgressMeter()
        this._setSeedBankContentsVisible(false)
        this._syncItemLayerBehindAdvice()
    }

    protected _drawConveyorSeedBank() {
        this._seedBankHeight = 87
        this._seedBankNode = createUINode('SeedBank', {
            parent: this._boardContent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 600,
            height: this._seedBankHeight,
            x: 0,
            y: -this._seedBankHeight,
        })
        this._seedBankNode.setSiblingIndex(Math.max(0, this._entityLayer.getSiblingIndex()))
        this._seedBankNode.active = false

        const backdrop = SpriteLoader.get('conveyorbelt_backdrop')
        if (backdrop) {
            this._conveyorBackdropNode = createSpriteNode({
                name: 'ConveyorBeltBackdrop',
                spriteFrame: backdrop,
                parent: this._seedBankNode,
                layer: this.node.layer,
                x: 83,
                y: 0,
            })
            this._conveyorBackdropNode.active = false
        }

        const belt = SpriteLoader.get('conveyorbelt')
        if (belt) {
            this._conveyorBeltNode = createSpriteNode({
                name: 'ConveyorBelt',
                spriteFrame: getAtlasFrame(belt, 0, 502, 16, 1),
                parent: this._seedBankNode,
                layer: this.node.layer,
                x: 90,
                y: -63,
            })
            this._conveyorBeltNode.active = false
        }

        this._conveyorPacketClipNode = createUINode('ConveyorPacketClip', {
            parent: this._seedBankNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 501,
            height: 87,
            x: 90,
            y: 0,
            z: 5,
        })
        this._conveyorPacketClipNode.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
        this._conveyorPacketClipNode.active = false
    }

    protected _createMoneyCounter() {
        const coinBank = SpriteLoader.get('coinbank')
        if (!coinBank) return

        this._moneyCounter = new MoneyCounter({
            parent: this._uiLayer,
            layer: this.node.layer,
            coinBank,
            font: this._sunFont,
            amount: this._session.money,
            x: COIN_BANK_X,
            y: -(599 - coinBank.originalSize.height),
            active: false,
            textRightOffset: COIN_BANK_RIGHT_TEXT_OFFSET,
        })
    }

    protected _createProgressMeter() {
        const meter = SpriteLoader.get('flagmeter')
        const parts = SpriteLoader.get('flagmeterparts')
        const levelProgress = SpriteLoader.get('flagmeterlevelprogress')
        if (!meter || !parts || !levelProgress) return

        this._progressMeterNode = createUINode('ProgressMeter', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: PROGRESS_METER_WIDTH,
            height: PROGRESS_METER_CEL_HEIGHT,
            x: PROGRESS_METER_X,
            y: -PROGRESS_METER_Y,
        })
        this._progressMeterNode.active = false

        createSpriteNode({
            name: 'ProgressMeterBack',
            spriteFrame: getAtlasFrame(meter, 0, PROGRESS_METER_WIDTH, PROGRESS_METER_CEL_HEIGHT, 1),
            parent: this._progressMeterNode,
            layer: this.node.layer,
            x: 0,
            y: 0,
        })

        this._progressMeterFillClip = createUINode('ProgressFillClip', {
            parent: this._progressMeterNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 1,
            height: PROGRESS_METER_CEL_HEIGHT,
            x: PROGRESS_METER_WIDTH - PROGRESS_METER_FILL_RIGHT_INSET - 1,
            y: 0,
            z: 1,
        })
        this._progressMeterFillClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
        this._progressMeterFillNode = createSpriteNode({
            name: 'ProgressMeterFill',
            spriteFrame: getAtlasFrame(meter, 1, PROGRESS_METER_WIDTH, PROGRESS_METER_CEL_HEIGHT, 1),
            parent: this._progressMeterFillClip,
            layer: this.node.layer,
            x: -(PROGRESS_METER_WIDTH - PROGRESS_METER_FILL_RIGHT_INSET - 1),
            y: 0,
        })

        createSpriteNode({
            name: 'ProgressLevelTrack',
            spriteFrame: levelProgress,
            parent: this._progressMeterNode,
            layer: this.node.layer,
            x: PROGRESS_METER_LEVEL_X - PROGRESS_METER_X,
            y: -(PROGRESS_METER_LEVEL_Y - PROGRESS_METER_Y),
            z: 2,
        })

        this._progressMeterHeadNode = createSpriteNode({
            name: 'ProgressZombieHead',
            spriteFrame: getAtlasFrame(
                parts,
                0,
                PROGRESS_METER_PART_WIDTH,
                PROGRESS_METER_PART_HEIGHT,
                PROGRESS_METER_PART_COLUMNS,
            ),
            parent: this._progressMeterNode,
            layer: this.node.layer,
            x: PROGRESS_METER_WIDTH + PROGRESS_METER_HEAD_START_X - PROGRESS_METER_X,
            y: -(PROGRESS_METER_HEAD_Y - PROGRESS_METER_Y),
            z: 3,
        })

        this._createProgressMeterFlags(parts)
        this._progressMeterHeadNode.setSiblingIndex(this._progressMeterNode.children.length - 1)

        this._levelLabel = this._createBitmapText({
            name: 'LevelLabel',
            text: this._levelLabelText(),
            baselineX: LEVEL_LABEL_RIGHT_X,
            baselineY: LEVEL_LABEL_BASELINE_Y,
            font: this._levelFont,
            color: new Color(224, 187, 98, 255),
            parent: this._uiLayer,
            align: 'right',
        })
        this._levelLabel.node.active = false
    }

    protected _createProgressMeterFlags(parts: SpriteFrame) {
        const wavesPerFlag = this._progressMeterWavesPerFlag()
        const flagCount = this._progressMeterFlagCount(wavesPerFlag)
        const flagsPosEnd = 590 + PROGRESS_METER_WIDTH
        for (let flagWave = 1; flagWave <= flagCount; flagWave++) {
            const totalWavesAtFlag = flagWave * wavesPerFlag
            const flagX = linearFloat(0, this._session.numWaves, totalWavesAtFlag, flagsPosEnd, 606)
            const localX = flagX - PROGRESS_METER_X
            const poleNode = createSpriteNode({
                name: `ProgressFlagPole_${flagWave}`,
                spriteFrame: getAtlasFrame(
                    parts,
                    1,
                    PROGRESS_METER_PART_WIDTH,
                    PROGRESS_METER_PART_HEIGHT,
                    PROGRESS_METER_PART_COLUMNS,
                ),
                parent: this._progressMeterNode!,
                layer: this.node.layer,
                x: localX,
                y: -(571 - PROGRESS_METER_Y),
                z: 2,
            })
            const flagNode = createSpriteNode({
                name: `ProgressFlag_${flagWave}`,
                spriteFrame: getAtlasFrame(
                    parts,
                    2,
                    PROGRESS_METER_PART_WIDTH,
                    PROGRESS_METER_PART_HEIGHT,
                    PROGRESS_METER_PART_COLUMNS,
                ),
                parent: this._progressMeterNode!,
                layer: this.node.layer,
                x: localX,
                y: -(572 - PROGRESS_METER_Y),
                z: 2,
            })
            this._progressFlagViews.push({ totalWavesAtFlag, poleNode, flagNode })
        }
    }

    protected _capturePreviousEntitySnapshots() {
        this._previousEntitySnapshots.clear()
        for (const entity of this._session.allEntities()) {
            this._previousEntitySnapshots.set(entity.id, this._createRenderEntitySnapshot(entity))
        }
    }

    protected _createRenderEntitySnapshot(entity: GameEntity): RenderEntitySnapshot {
        if (entity.kind === 'item') {
            return {
                x: entity.x,
                y: entity.y,
                scale: entity.scale,
                alpha: entity.alpha,
            }
        }
        return {
            x: entity.x,
            y: entity.y,
        }
    }

    protected _syncItemLayerBehindAdvice() {
        const adviceNode = this._adviceWidget?.node
        if (!this._itemLayer?.isValid || !adviceNode?.isValid) return
        if (this._itemLayer.parent !== this._uiLayer || adviceNode.parent !== this._uiLayer) return

        const itemIndex = this._itemLayer.getSiblingIndex()
        const adviceIndex = adviceNode.getSiblingIndex()
        const targetIndex = itemIndex < adviceIndex ? adviceIndex - 1 : adviceIndex
        this._itemLayer.setSiblingIndex(Math.max(0, targetIndex))
    }

    protected _createShovel() {
        if (!this._levelHasShovel()) return

        const bank = SpriteLoader.get('shovelbank')
        const shovel = SpriteLoader.get('shovel')
        if (!bank || !shovel) return

        this._shovelBankNode = createSpriteNode({
            name: 'ShovelBank',
            spriteFrame: bank,
            parent: this._boardContent,
            layer: this.node.layer,
            x: this._getShovelButtonX(),
            y: -SHOVEL_BUTTON_Y,
        })
        this._shovelBankNode.active = false
        this._shovelNode = createSpriteNode({
            name: 'Shovel',
            spriteFrame: shovel,
            parent: this._shovelBankNode,
            layer: this.node.layer,
            x: -7,
            y: 3,
        })
    }

    protected _createCrazyDave() {
        if (!this._session.level.showCrazyDave || !this._crazyDaveAnimation?.json) return

        const node = createUINode('CrazyDave', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 320,
            height: 360,
            x: CRAZY_DAVE_X,
            y: -CRAZY_DAVE_Y,
        })
        node.active = false

        const widget = node.addComponent(CrazyDaveWidget)
        this._crazyDave = widget
        void widget.initialize({
            animation: this._crazyDaveAnimation,
            bubbleSprite: SpriteLoader.get('store_speechbubble2') ?? null,
            daveFont: this._daveFont,
            continueFont: this._packetCostFont,
            continueText: LawnStringLoader.translate('[CLICK_TO_CONTINUE]', this._lawnStrings),
            wallnutAnimation: this._plantAnimations.get('wallnut') ?? null,
            layer: this.node.layer,
            animationsEnabled: this._isGameplaySceneAnimationEnabled(),
        }).then((ready) => {
            if (!ready || !widget.isValid) return
            this.scheduleOnce(() => {
                if (!widget.isValid) return
                widget.playIntro(this._session.level.crazyDaveIntro === true, () => {
                    this._startCrazyDaveOpeningDialog()
                })
            }, CRAZY_DAVE_INTRO_DELAY_SECONDS)
            this._syncCrazyDaveState()
        })
    }

    protected _startCrazyDaveOpeningDialog() {
        if (this._crazyDaveDialogStarted) return
        if (!this._session.level.pauseGameplayOnStart || !this._session.level.crazyDaveIntro) return

        this._crazyDaveDialogStarted = true
        this._showCrazyDaveMessage(CRAZY_DAVE_FIRST_DIALOG_START, 'intro')
    }

    protected _showCrazyDaveMessage(index: number, phase: CrazyDaveMessagePhase) {
        const rawText = this._getCrazyDaveText(index)
        if (!rawText || !this._crazyDave?.showMessage(rawText, { clickToContinue: true })) return

        this._crazyDaveMessageIndex = index
        this._crazyDaveDialogPhase = phase
        this._revealBowlingStripeForCrazyDaveMessage(index)
    }

    protected _advanceCrazyDaveDialog() {
        if (this._crazyDaveDialogPhase !== 'intro' && this._crazyDaveDialogPhase !== 'post-shovel') return false

        const endIndex = this._crazyDaveDialogPhase === 'intro'
            ? CRAZY_DAVE_FIRST_DIALOG_END
            : CRAZY_DAVE_POST_SHOVEL_DIALOG_END
        if (this._crazyDaveMessageIndex < endIndex) {
            this._showCrazyDaveMessage(this._crazyDaveMessageIndex + 1, this._crazyDaveDialogPhase)
            return true
        }

        if (this._crazyDaveDialogPhase === 'intro') {
            this._finishCrazyDaveOpeningDialog()
        } else {
            this._finishCrazyDavePostShovelDialog()
        }
        return true
    }

    protected _finishCrazyDaveOpeningDialog() {
        this._hideCrazyDaveBubble()
        this._crazyDaveDialogPhase = 'shovel'
        this._showAdviceKey('ADVICE_CLICK_SHOVEL')
        this._hideCrazyDaveAfterLeave()
    }

    protected _finishCrazyDavePostShovelDialog() {
        this._hideCrazyDaveBubble()
        this._crazyDaveDialogPhase = 'off'
        MusicSystem.fadeOut(50)
        this._hideCrazyDaveAfterLeave(() => this._startGameplayLawnMowerIntro())
    }

    protected _syncShovelTutorialAfterPickup() {
        if (this._crazyDaveDialogPhase !== 'shovel') return

        this._showAdviceKey(this._crazyDaveShovelDugPlant ? 'ADVICE_KEEP_DIGGING' : 'ADVICE_CLICK_PLANT')
    }

    protected _syncShovelTutorialAfterDig(previousPlantCount: number) {
        if (this._crazyDaveDialogPhase !== 'shovel') return

        const plantCount = this._session.plants.length
        if (plantCount === 0) {
            this._completeShovelTutorial()
            return
        }
        if (plantCount < previousPlantCount) {
            this._crazyDaveShovelDugPlant = true
            this._showAdviceKey('ADVICE_KEEP_DIGGING')
            return
        }
        if (this._crazyDaveShovelDugPlant) {
            this._showAdviceKey('ADVICE_KEEP_DIGGING')
            return
        }
        if (!this._session.selectedTool) {
            this._showAdviceKey('ADVICE_CLICK_SHOVEL')
        }
    }

    protected _syncShovelTutorialAfterCancel() {
        if (this._crazyDaveDialogPhase !== 'shovel') return

        this._showAdviceKey(this._crazyDaveShovelDugPlant ? 'ADVICE_KEEP_DIGGING' : 'ADVICE_CLICK_SHOVEL')
    }

    protected _completeShovelTutorial() {
        this._clearAdvice()
        this._crazyDaveDialogPhase = 'post-shovel'
        this._crazyDaveHidden = false
        this._syncCrazyDaveState()
        if (!this._crazyDave?.isValid) {
            this._showCrazyDaveMessage(CRAZY_DAVE_POST_SHOVEL_DIALOG_START, 'post-shovel')
            return
        }
        this._crazyDave.enterThen(() => {
            this._showCrazyDaveMessage(CRAZY_DAVE_POST_SHOVEL_DIALOG_START, 'post-shovel')
        })
    }

    protected _hideCrazyDaveBubble() {
        this._crazyDave?.hideBubble()
        this._crazyDaveMessageIndex = -1
    }

    protected _getCrazyDaveText(index: number) {
        return LawnStringLoader.translateOptional(`[CRAZY_DAVE_${index}]`, this._lawnStrings)
    }

    protected _showAdviceKey(key: string) {
        const message = LawnStringLoader.translateOptional(`[${key}]`, this._lawnStrings)
        if (message) this._showAdvice(message, 'hint-stay')
    }

    protected _hideCrazyDaveAfterLeave(onHidden?: () => void) {
        if (!this._crazyDave?.isValid) {
            this._crazyDaveHidden = true
            this._syncCrazyDaveState()
            onHidden?.()
            return
        }

        this._crazyDave.leave(true, () => {
            this._crazyDaveHidden = true
            this._syncCrazyDaveState()
            onHidden?.()
        })
    }

    protected _updateCrazyDave(ticks: number) {
        const allowBlink = this._crazyDaveDialogPhase === 'intro' || this._crazyDaveDialogPhase === 'post-shovel'
        this._crazyDave?.updateTicks(ticks, allowBlink)
    }

    protected _createMenuButton() {
        if (!this._buttonSprites || !this._buttonFonts) return

        this._menuButtonNode = createStoneButton({
            name: 'MenuButton',
            parent: this._uiLayer,
            layer: this.node.layer,
            label: LawnStringLoader.translate('[MENU_BUTTON]', this._lawnStrings),
            x: 681,
            y: 10,
            width: MENU_BUTTON_WIDTH,
            height: MENU_BUTTON_HEIGHT,
            sprites: this._buttonSprites,
            fonts: {
                normal: this._buttonFonts.normal,
                highlight: this._buttonFonts.highlight,
            },
            rightClickTriggers: false,
            onClick: () => {
                if (this._cancelCursor()) return

                this.pauseGame()
                void SoundLoader.play(SoundEffect.Pause)
                this.onMenuRequest?.()
            },
        })
        this._menuButtonNode.active = false
    }

    protected _drawSeedPackets() {
        const parent = this._seedBankNode ?? this._uiLayer
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const x = this._getSeedPacketPositionX(i)
            const y = -8
            const view = this._createSeedPacketView({
                name: `SeedPacket_${packet.seedType}`,
                x,
                y,
                parent,
                layer: this.node.layer,
                seedType: packet.seedType,
                costFont: this._packetCostFont,
            })
            this._seedPacketViews.set(packet.seedType, view)
            this._wireSeedPacketInput(view.node, packet.seedType)
        }
    }

    protected _wireSeedPacketInput(packetNode: Node, seedType: SeedType) {
        const onPress = (event: EventMouse | EventTouch) => {
            if (!this._canUseBoardInput()) return false
            if (this._session.selectedSeed) return false

            const pixel = eventToBoardPixel(this.node, event)
            this._mousePixel = pixel
            this._hasCursorPointer = true
            const source = this._findSeedSourceAt(pixel)
            if (source?.kind !== 'seed' || source.seedType !== seedType) return false

            this._selectSeedSource(source)
            if (GameDebugSettings.isMobileMode() && this._session.selectedSeed) this._beginMobilePlantPress(pixel, source.rect)
            this._renderFrame()
            event.propagationStopped = true
            return true
        }
        packetNode.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            if (GameDebugSettings.isMobileMode()) return
            if (event.getButton() !== 0) return
            onPress(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            onPress(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            event.propagationStopped = true
            this._onMobileTouchMove(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            event.propagationStopped = true
            this._onMobileTouchEnd(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            event.propagationStopped = true
            this._onMobileTouchEnd(event)
        }, this)
    }

}
