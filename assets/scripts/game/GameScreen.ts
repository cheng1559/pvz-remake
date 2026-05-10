import {
    _decorator,
    Color,
    Component,
    EventKeyboard,
    EventMouse,
    EventTouch,
    game,
    Graphics,
    input,
    Input,
    JsonAsset,
    Label,
    Mask,
    Node,
    Rect,
    Size,
    Sprite,
    SpriteFrame,
    sys,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
} from 'cc'
import { Animator } from '@/core/Animator'
import { AnimNode } from '@/core/Animator/AnimNode'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import {
    MessageBoxAssets,
    type MessageBoxButtonFonts,
    type MessageBoxButtonSprites,
} from '@/ui/MessageBox/MessageBoxAssets'
import { UIButton } from '@/ui/Button'
import { getAtlasFrame, SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH, SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createStoneButton } from '@/ui/StoneButton'
import { createTooltipNode } from '@/ui/Tooltip/Tooltip'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { StartupResourceLoader } from '@/ui/StartupResourceLoader'
import { GAME_TICK_SECONDS, PLANT_DEFINITIONS, SEED_DEFINITIONS, ZOMBIE_DEFINITIONS, getGameSpeed } from './GameDefinitions'
import {
    getAnimationRateSpeed,
    playPotatoArmedAnimation,
    PlantShake,
    wirePlantAnimation,
    type PlantAnimationView,
} from './PlantAnimation'
import {
    attachFlagZombieAnimation,
    createZombieAnimationView,
    playZombieBodyAnimation,
    syncZombieTrackVisibility,
    wireZombieAnimation,
    type ZombieAnimationView,
} from './ZombieAnimation'
import { GameSession } from './GameSession'
import type {
    GameEntity,
    GameEvent,
    ItemEntity,
    AdviceStyle,
    LawnMowerEntity,
    PlantEntity,
    PlantType,
    ProjectileEntity,
    SeedPacketState,
    SeedType,
    ToolType,
    ZombieEntity,
    ZombieType,
} from './GameTypes'

const { ccclass } = _decorator

const BOARD_OFFSET = 220
const BOARD_RIGHT_X = -380
const MENU_BUTTON_WIDTH = 117
const MENU_BUTTON_HEIGHT = 46
const INTRO_PAN_RIGHT_START = 150
const INTRO_PAN_RIGHT_END = 350
const INTRO_PAN_LEFT_START = 450
const INTRO_PAN_LEFT_END = 600
const INTRO_ROLL_SOD_START = 600
const INTRO_ROLL_SOD_END = 800
const INTRO_LAWN_MOWER_ROW = 2
const INTRO_LAWN_MOWER_START = 820
const INTRO_LAWN_MOWER_END = 845
const INTRO_LAWN_MOWER_START_X = -80
const INTRO_LAWN_MOWER_END_X = -21
const INTRO_LAWN_MOWER_Y = 303
const INTRO_LAWN_MOWER_REANIM_X_OFFSET = 6
const INTRO_LAWN_MOWER_REANIM_Y_OFFSET = 19
const INTRO_LAWN_MOWER_SHADOW_X_OFFSET = -7
const INTRO_LAWN_MOWER_SHADOW_Y_OFFSET = 47
const INTRO_LAWN_MOWER_SCALE = 0.85
const LAWN_MOWER_CACHED_DRAW_OFFSET_X = -20
const GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET = INTRO_LAWN_MOWER_REANIM_X_OFFSET
const GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET = INTRO_LAWN_MOWER_REANIM_Y_OFFSET
const PROGRESS_METER_X = 600
const PROGRESS_METER_Y = 575
const PROGRESS_METER_WIDTH = 158
const PROGRESS_METER_CEL_HEIGHT = 27
const PROGRESS_METER_FILL_MAX_WIDTH = 143
const PROGRESS_METER_FILL_RIGHT_INSET = 7
const PROGRESS_METER_LEVEL_X = 638
const PROGRESS_METER_LEVEL_Y = 589
const PROGRESS_METER_HEAD_START_X = 580
const PROGRESS_METER_HEAD_Y = 572
const PROGRESS_METER_HEAD_MAX_PROGRESS = 135
const PROGRESS_METER_PART_WIDTH = 25
const PROGRESS_METER_PART_HEIGHT = 25
const PROGRESS_METER_PART_COLUMNS = 3
const LEVEL_LABEL_BASELINE_Y = 595
const LEVEL_LABEL_RIGHT_X = 780
const LEVEL_LABEL_WITH_PROGRESS_RIGHT_X = 593
const INTRO_END = 855
const SOD_ROW_X = 239 - BOARD_OFFSET
const SOD_ROW_Y = 265
const SUN_AMOUNT_BASELINE_X = 34
const SUN_AMOUNT_BASELINE_Y = 78
const SUN_FLASH_TICKS = 70
const SUN_FLASH_PERIOD_TICKS = 20
const POTATO_MINE_RISE_ANIM_RATE = 18
const CHOMPER_BITE_ANIM_RATE = 24
const CHOMPER_CHEW_ANIM_RATE = 15
const CHOMPER_SWALLOW_ANIM_RATE = 12
const CURSOR_PLANT_OFFSET_X = -35
const CURSOR_PLANT_OFFSET_Y = -60
const GRID_PREVIEW_Z = 999
const CURSOR_PREVIEW_Z = 1000
const CURSOR_PLANT_PREVIEW_OPACITY = 255
const GRID_PLANT_PREVIEW_OPACITY = 100
const DEBUG_ZOMBIE_COLLISION_RECTS = true
const DEBUG_ZOMBIE_BODY_RECT_COLOR = new Color(0, 220, 255, 220)
const DEBUG_ZOMBIE_ATTACK_RECT_COLOR = new Color(255, 64, 64, 220)
const DEBUG_ZOMBIE_RECT_LINE_WIDTH = 2
const ZOMBIE_BODY_REANIM_OFFSET_X = 15
const ZOMBIE_BODY_REANIM_OFFSET_Y = 8
const ZOMBIE_REANIM_BLEND_TIME = 0.2
const PAUSE_DIALOG_ZOMBIE_ANIMATION_PATH = 'animations/zombie_paper'
const PLANT_PREVIEW_CACHE_CELL_WIDTH = 220
const PLANT_PREVIEW_CACHE_CELL_HEIGHT = 160
const PLANT_PREVIEW_CACHE_COLUMNS = 8
const PLANT_PREVIEW_CACHE_OFFSET_X = -40
const PLANT_PREVIEW_CACHE_OFFSET_Y = -40
const ITEM_Z = 900
const MOUSE_BUTTON_RIGHT = 2
const RIGHT_MOUSE_EVENT_DEDUPE_MS = 50
const SEED_BANK_EXTENSION_OVERLAP = 12
const SHOVEL_BUTTON_BASE_X = 456
const SHOVEL_BUTTON_Y = 0
const SHOVEL_CURSOR_OFFSET_X = -15
const SHOVEL_CURSOR_OFFSET_Y = -65
const SHOVEL_TOOLTIP_OFFSET_X = 35
const SHOVEL_TOOLTIP_OFFSET_Y = 72
const SEED_TOOLTIP_OFFSET_Y = 70
const PLANT_HIGHLIGHT_COLOR = new Color(255, 255, 255, 196)
const ADVICE_HINT_Y = 527
const ADVICE_HINT_HEIGHT = 55
const ADVICE_TUTORIAL_LEVEL1_Y = 400
const ADVICE_TUTORIAL_LEVEL1_HEIGHT = 110
const ADVICE_MIDDLE_Y = 300
const ADVICE_MIDDLE_HEIGHT = 110
const ADVICE_HUGE_WAVE_Y = 330
const ADVICE_WIDTH = 800
const ADVICE_DURATION_FAST = 500
const ADVICE_DURATION_STAY = 10000
const ADVICE_DURATION_HUGE_WAVE = 750
const ADVICE_TEXT_SIZE = 28
const ADVICE_TEXT_OFFSET_Y = -4
const ADVICE_TEXT_MIN_ALPHA = 192
const HUGE_WAVE_TEXT_ENTER_TICKS = 20
const HUGE_WAVE_TEXT_LEAVE_TICKS = 40
const TUTORIAL_FLASH_TIME = 75
const FINAL_WAVE_ANIMATION_PATH = 'animations/finalwave'
const FINAL_WAVE_REANIM_X = 0
const FINAL_WAVE_REANIM_Y = 30
const GAME_OVER_PAN_START_TICKS = 150
const GAME_OVER_PAN_END_TICKS = 350
const GAME_OVER_CHOMP_TICK_1 = 510
const GAME_OVER_CHOMP_TICK_2 = 560
const GAME_OVER_SCREAM_TICK = 600
const GAME_OVER_GRAPHIC_START_TICKS = 600
const GAME_OVER_GRAPHIC_SHAKE_START_TICKS = 700
const GAME_OVER_GRAPHIC_SHAKE_END_TICKS = 800
const GAME_OVER_END_TICKS = 1100
const GAME_OVER_WINNER_WALK_START_TICKS = GAME_OVER_PAN_START_TICKS
const GAME_OVER_REANIM_RATE = 12
const GAME_OVER_TITLE_MAX_OPACITY = 255
const GAME_OVER_BLACK_MAX_OPACITY = 128
const GAME_OVER_DOOR_MASK_X = -130
const GAME_OVER_DOOR_MASK_Y = 202
const GAME_OVER_DOOR_INTERIOR_X = -126
const GAME_OVER_DOOR_INTERIOR_Y = 225
const GAME_OVER_DAY_ZOMBIE_CLIP_X = -123
const GAME_OVER_FULLSCREEN_ALPHA_KEYS = [
    0.00, 0.05, 0.09, 0.14, 0.18, 0.23, 0.27, 0.32, 0.36, 0.41, 0.45, 0.50,
]
const GAME_OVER_TITLE_KEYS = [
    { x: 388.9, y: 293.4, scale: 0.017 },
    { x: 365.2, y: 272.1, scale: 0.106 },
    { x: 341.6, y: 250.8, scale: 0.196 },
    { x: 317.9, y: 229.6, scale: 0.285 },
    { x: 294.2, y: 208.3, scale: 0.374 },
    { x: 270.6, y: 187.1, scale: 0.464 },
    { x: 247.0, y: 165.8, scale: 0.553 },
    { x: 223.3, y: 144.5, scale: 0.642 },
    { x: 199.7, y: 123.3, scale: 0.732 },
    { x: 176.0, y: 102.0, scale: 0.821 },
    { x: 152.4, y: 80.8, scale: 0.911 },
    { x: 129.9, y: 59.4, scale: 1.000 },
]
const SEED_TOOLTIP_NAMES: Record<SeedType, string> = {
    peashooter: 'Peashooter',
    sunflower: 'Sunflower',
    cherrybomb: 'Cherry Bomb',
    wallnut: 'Wall-nut',
    potatomine: 'Potato Mine',
    snowpea: 'Snow Pea',
    chomper: 'Chomper',
    repeater: 'Repeater',
}
const SEED_TOOLTIP_WAITING = 'recharging...'
const SEED_TOOLTIP_NOT_ENOUGH_SUN = 'not enough sun'
const PLANT_VISUAL_ADJUSTMENTS: Partial<Record<PlantType, { offsetX?: number, offsetY?: number, scale?: number }>> = {
    potatomine: { offsetX: 12, offsetY: 12, scale: 0.8 },
}
const PLANT_PREVIEW_CACHE_IDS: Record<PlantType, number> = {
    peashooter: 0,
    sunflower: 1,
    cherrybomb: 2,
    wallnut: 3,
    potatomine: 4,
    snowpea: 5,
    chomper: 6,
    repeater: 7,
}
const PLANT_SHADOW_ADJUSTMENTS: Partial<Record<PlantType, { offsetX: number, offsetY: number, scale?: number }>> = {
    chomper: { offsetX: -21, offsetY: 57 },
}
const PROJECTILE_SHADOW_WIDTH = 21
const PROJECTILE_SHADOW_HEIGHT = 9
const PROJECTILE_SHADOW_COLUMNS = 2
const PROJECTILE_SHADOW_DAY_CEL = 0
const PROJECTILE_SPRITES: Record<ProjectileEntity['type'], string> = {
    pea: 'projectilepea',
    snowpea: 'projectilesnowpea',
}
const PROJECTILE_SHADOW_ADJUSTMENTS: Record<ProjectileEntity['type'], { offsetX: number, scale?: number }> = {
    pea: { offsetX: 3 },
    snowpea: { offsetX: -1, scale: 1.3 },
}
const MONEY_ITEM_SPRITES: Partial<Record<ItemEntity['type'], string>> = {
    'silver-coin': 'coin_silver_dollar',
    'gold-coin': 'coin_gold_dollar',
    diamond: 'diamond',
}
const MONEY_FLIP_PERIOD_TICKS = 80
const MONEY_MIN_FLIP_SCALE_X = 0.18
const MONEY_GLOW_MIN_ALPHA = 120
const MONEY_GLOW_MAX_ALPHA = 210
const DIAMOND_SHINE_FRAME_COUNT = 5
const GAME_TEXTURES = [
    'background1',
    'background1unsodded',
    'seedbank',
    'seeds',
    'packet_plants',
    'packet_plants_cached',
    'plant_previews_cached',
    'seedpacket_larger',
    'shovelbank',
    'shovel',
    'peashooter_head',
    'coinglow',
    'coin_silver_dollar',
    'coin_silver2',
    'coin_gold_dollar',
    'coin_gold2',
    'diamond',
    'diamond_shine1',
    'diamond_shine2',
    'diamond_shine3',
    'diamond_shine4',
    'diamond_shine5',
    'projectilepea',
    'projectilesnowpea',
    'pea_shadows',
    'plantshadow',
    'lawnmower_cached',
    'sod1row',
    'finalwave',
    'flagmeter',
    'flagmeterparts',
    'flagmeterlevelprogress',
    'background1_gameover_interior_overlay',
    'background1_gameover_mask',
    'zombieswon',
]

interface PlantView extends PlantAnimationView {
    node: Node
    animator: Animator | null
    highlighted: boolean
    highlightOverlay: Node | null
    shootingAnimationActive: boolean
    shootingAnimationToken: number
}

interface ZombieView extends ZombieAnimationView {
    node: Node
    clipNode: Node | null
    visualRootNode: Node | null
    bodyNode: Node | null
    shadowNode: Node | null
    moweredAnimNode: AnimNode | null
    showingMowered: boolean
}

interface LawnMowerView {
    node: Node
    cachedNode: Node | null
    animatorNode: Node | null
    animNode: AnimNode | null
    state: LawnMowerEntity['state'] | null
}

interface MoneyItemView {
    iconNode: Node | null
    sideNode: Node | null
    glowNode: Node | null
    shineNode: Node | null
}

interface RenderEntitySnapshot {
    x: number
    y: number
    scale?: number
    alpha?: number
}

@ccclass('AdventureGameScreen')
export class AdventureGameScreen extends Component {
    public onBackToMenu: (() => void) | null = null
    public onMenuRequest: (() => void) | null = null
    public onPauseRequest: (() => void) | null = null
    public onGameOverRequest: (() => void) | null = null

    private _session = new GameSession()
    private _boardRoot: Node = null!
    private _boardContent: Node = null!
    private _entityLayer: Node = null!
    private _collisionDebugLayer: Node | null = null
    private _collisionDebugGraphics: Graphics | null = null
    private _uiLayer: Node = null!
    private _itemLayer: Node = null!
    private _seedBankNode: Node | null = null
    private _shovelBankNode: Node | null = null
    private _shovelNode: Node | null = null
    private _menuButtonNode: Node | null = null
    private _unsoddedNode: Node | null = null
    private _soddedNode: Node | null = null
    private _sodClipNode: Node | null = null
    private _tutorialLawnFlashNode: Node | null = null
    private _sodRollNode: Node | null = null
    private _introLawnMowerNode: Node | null = null
    private _introLawnMowerShadowNode: Node | null = null
    private _seedBankHeight = 87
    private _cursorPreview: Node | null = null
    private _gridPreview: Node | null = null
    private _previewSeedType: SeedType | null = null
    private _shovelCursor: Node | null = null
    private _sunLabel: FontRenderer = null!
    private _sunFlashTicks = 0
    private _adviceLabel: FontRenderer = null!
    private _adviceFont: BitmapFontAssets | null = null
    private _adviceNode: Node = null!
    private _adviceBackdrop: Graphics = null!
    private _adviceDurationTicks = 0
    private _adviceStyle: AdviceStyle = 'hint'
    private _resultLabel: Label = null!
    private _entityNodes: Map<number, Node> = new Map()
    private _plantViews: Map<number, PlantView> = new Map()
    private _zombieViews: Map<number, ZombieView> = new Map()
    private _lawnMowerViews: Map<number, LawnMowerView> = new Map()
    private _moneyItemViews: Map<number, MoneyItemView> = new Map()
    private _previousEntitySnapshots: Map<number, RenderEntitySnapshot> = new Map()
    private _seedPacketNodes: Map<SeedType, Node> = new Map()
    private _seedPacketCooldownClips: Map<SeedType, Node> = new Map()
    private _seedTooltipNode: Node | null = null
    private _seedTooltipKey = ''
    private _shovelTooltipNode: Node | null = null
    private _mousePixel = { x: -1, y: -1 }
    private _plantAnimations: Map<PlantType, JsonAsset> = new Map()
    private _zombieAnimations: Map<ZombieType, JsonAsset> = new Map()
    private _flagZombieAnimation: JsonAsset | null = null
    private _moweredZombieAnimation: JsonAsset | null = null
    private _sunAnimation: JsonAsset | null = null
    private _sodRollAnimation: JsonAsset | null = null
    private _sodRollAnimNode: AnimNode | null = null
    private _lawnMowerAnimation: JsonAsset | null = null
    private _finalWaveAnimation: JsonAsset | null = null
    private _finalWaveNode: Node | null = null
    private _finalWaveAnimNode: AnimNode | null = null
    private _houseDoorBottomNode: Node | null = null
    private _houseDoorTopNode: Node | null = null
    private _gameOverOverlayNode: Node | null = null
    private _gameOverBlackNode: Node | null = null
    private _gameOverTitleNode: Node | null = null
    private _gameOverTicks = 0
    private _gameOverActive = false
    private _gameOverDialogRequested = false
    private _gameOverWinnerZombieId: number | null = null
    private _sunFont: BitmapFontAssets | null = null
    private _packetCostFont: BitmapFontAssets | null = null
    private _levelFont: BitmapFontAssets | null = null
    private _buttonSprites: MessageBoxButtonSprites | null = null
    private _buttonFonts: MessageBoxButtonFonts | null = null
    private _progressMeterNode: Node | null = null
    private _progressMeterFillClip: Node | null = null
    private _progressMeterFillNode: Node | null = null
    private _progressMeterHeadNode: Node | null = null
    private _levelLabel: FontRenderer | null = null
    private _introTime = 0
    private _gameAccumulator = 0
    private _lastRightMouseDownAt = 0
    private _lastRightMouseDownX = Number.NaN
    private _lastRightMouseDownY = Number.NaN
    private _refreshHoverAfterCursorRelease = true
    private _plantCursorHoverBlocked = false
    private _gameStarted = false
    private _bootstrapped = false

    onLoad() {
        Animator.timeScale = getGameSpeed()
        setUISize(this.node, 800, 600)
        this._boardRoot = createUINode('BoardRoot', {
            parent: this.node,
            width: 800,
            height: 600,
            anchorX: 0,
            anchorY: 1,
            x: -400,
            y: 300,
        })
        this._boardRoot.addComponent(Mask).type = Mask.Type.RECT
        this._boardContent = createUINode('BoardContent', {
            parent: this._boardRoot,
            anchorX: 0,
            anchorY: 1,
            width: 1400,
            height: 600,
            x: BOARD_OFFSET,
            y: 0,
        })
        this._entityLayer = createUINode('Entities', { parent: this._boardContent, anchorX: 0, anchorY: 1 })
        if (DEBUG_ZOMBIE_COLLISION_RECTS) {
            this._collisionDebugLayer = createUINode('ZombieCollisionDebug', {
                parent: this._entityLayer,
                anchorX: 0,
                anchorY: 1,
                width: 1400,
                height: 600,
            })
            this._collisionDebugGraphics = this._collisionDebugLayer.addComponent(Graphics)
        }
        this._uiLayer = createUINode('HUD', { parent: this._boardRoot, anchorX: 0, anchorY: 1 })
        this._itemLayer = createUINode('Items', { parent: this._uiLayer, anchorX: 0, anchorY: 1 })

        void this._bootstrap()
    }

    onDestroy() {
        Animator.timeScale = 1
        input.off(Input.EventType.MOUSE_DOWN, this._onGlobalMouseDown, this)
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this._releasePlantCursorHoverBlock()
        this._setCanvasCursor('default')
        this.unscheduleAllCallbacks()
    }

    private async _bootstrap() {
        const results = await Promise.all([
            ...GAME_TEXTURES.map((name) => SpriteLoader.load(name)),
            ...Object.values(PLANT_DEFINITIONS).map((plant) => StartupResourceLoader.loadJson(plant.animationPath)),
            ...Object.values(ZOMBIE_DEFINITIONS).map((zombie) => StartupResourceLoader.loadJson(zombie.animationPath)),
            StartupResourceLoader.loadJson('animations/zombie_flagpole'),
            StartupResourceLoader.loadJson('animations/lawnmoweredzombie'),
            StartupResourceLoader.loadJson(PAUSE_DIALOG_ZOMBIE_ANIMATION_PATH),
            StartupResourceLoader.loadJson('animations/sun'),
            StartupResourceLoader.loadJson('animations/sodroll'),
            StartupResourceLoader.loadJson('animations/lawnmower'),
            StartupResourceLoader.loadJson(FINAL_WAVE_ANIMATION_PATH),
            FontLoader.load('continuumbold14'),
            FontLoader.load('pico129'),
            FontLoader.load('houseofterror28'),
            FontLoader.load('houseofterror16'),
            MessageBoxAssets.loadButtonSprites(),
            MessageBoxAssets.loadButtonFonts(),
        ])
        const plantTypes = Object.keys(PLANT_DEFINITIONS) as PlantType[]
        for (let i = 0; i < plantTypes.length; i++) {
            const json = results[GAME_TEXTURES.length + i] as JsonAsset | null
            if (json) this._plantAnimations.set(plantTypes[i], json)
        }
        const zombieTypes = Object.keys(ZOMBIE_DEFINITIONS) as ZombieType[]
        const afterPlants = GAME_TEXTURES.length + plantTypes.length
        for (let i = 0; i < zombieTypes.length; i++) {
            const json = results[afterPlants + i] as JsonAsset | null
            if (json) this._zombieAnimations.set(zombieTypes[i], json)
        }
        const afterZombies = afterPlants + zombieTypes.length
        this._flagZombieAnimation = results[afterZombies] as JsonAsset | null
        this._moweredZombieAnimation = results[afterZombies + 1] as JsonAsset | null
        const pauseDialogZombieAnimation = results[afterZombies + 2] as JsonAsset | null
        this._sunAnimation = results[afterZombies + 3] as JsonAsset | null
        this._sodRollAnimation = results[afterZombies + 4] as JsonAsset | null
        this._lawnMowerAnimation = results[afterZombies + 5] as JsonAsset | null
        this._finalWaveAnimation = results[afterZombies + 6] as JsonAsset | null
        this._sunFont = results[afterZombies + 7] as BitmapFontAssets | null
        this._packetCostFont = results[afterZombies + 8] as BitmapFontAssets | null
        this._adviceFont = results[afterZombies + 9] as BitmapFontAssets | null
        this._levelFont = results[afterZombies + 10] as BitmapFontAssets | null
        this._buttonSprites = results[afterZombies + 11] as MessageBoxButtonSprites | null
        this._buttonFonts = results[afterZombies + 12] as MessageBoxButtonFonts | null
        await Promise.all([
            this._preloadPlantAnimationTextures(),
            this._preloadZombieAnimationTextures(pauseDialogZombieAnimation),
            this._preloadSunAnimationTextures(),
            this._preloadFinalWaveAnimationTextures(),
        ])

        await this._drawStaticBoard()
        this._drawHud()
        this._wireInput()
        this._bootstrapped = true
        this._renderFrame()
    }

    update(dt: number) {
        if (!this._bootstrapped) return

        const gameSpeed = getGameSpeed()
        Animator.timeScale = gameSpeed
        let gameTicks = 0
        if (this._gameStarted) {
            if (!this._session.paused) {
                this._gameAccumulator += dt * gameSpeed
                while (this._gameAccumulator >= GAME_TICK_SECONDS) {
                    this._capturePreviousEntitySnapshots()
                    this._session.update()
                    this._gameAccumulator -= GAME_TICK_SECONDS
                    gameTicks++
                }
            }
        } else if (!this._session.paused) {
            this._updateIntro(dt)
        }
        if (this._gameOverActive && !this._session.paused) {
            this._updateGameOver(dt * gameSpeed / GAME_TICK_SECONDS)
        }
        if (gameTicks > 0) {
            this._updateAdviceWidget(gameTicks)
            this._updateTimedUiEffects(gameTicks)
        }
        if (this._gameOverActive) this._syncGameOverScene()
        this._renderFrame()
    }

    public pauseGame() {
        this._session.dispatch({ type: 'pause' })
        this._gameAccumulator = 0
        this._previousEntitySnapshots.clear()
        this._setGameplayAnimationsPaused(true)
        this._renderFrame()
    }

    public resumeGame() {
        this._session.dispatch({ type: 'resume' })
        this._setGameplayAnimationsPaused(false)
        this._renderFrame()
    }

    public isPaused() {
        return this._session.paused
    }

    public isLevelRunning() {
        return this._bootstrapped && this._gameStarted && this._session.result === 'playing'
    }

    public getGridSize() {
        return {
            rows: this._session.geometry.rows,
            cols: this._session.geometry.cols,
        }
    }

    public debugPlacePlant(type: PlantType, row: number, col: number) {
        if (!this.isLevelRunning()) return false

        this._session.debugAddPlant(type, row, col)
        this._renderFrame()
        return true
    }

    public debugSummonZombie(type: ZombieType, row: number, col?: number) {
        if (!this.isLevelRunning()) return false

        const x = col == null ? undefined : this._session.geometry.gridToPixel(col, row).x
        this._session.debugAddZombie(type, row, x)
        this._renderFrame()
        return true
    }

    public debugSetLawnMower(row: number, status: 'trigger' | 'reset') {
        if (!this.isLevelRunning()) return false

        const changed = this._session.debugSetLawnMower(row, status)
        if (changed) this._renderFrame()
        return changed
    }

    public debugSetAllLawnMowers(status: 'trigger' | 'reset') {
        if (!this.isLevelRunning()) return -1

        const changed = this._session.debugSetAllLawnMowers(status)
        if (changed > 0) this._renderFrame()
        return changed
    }

    public debugAddSun(amount: number) {
        if (!this.isLevelRunning()) return null

        const sun = this._session.debugAddSun(amount)
        this._renderFrame()
        return sun
    }

    public debugSetSun(amount: number) {
        if (!this.isLevelRunning()) return null

        const sun = this._session.debugSetSun(amount)
        this._renderFrame()
        return sun
    }

    public debugSetRechargingEnabled(enabled: boolean) {
        if (!this.isLevelRunning()) return null

        const rechargingEnabled = this._session.debugSetRechargingEnabled(enabled)
        this._renderFrame()
        return rechargingEnabled
    }

    public debugSetSunSpawningEnabled(enabled: boolean) {
        if (!this.isLevelRunning()) return null

        const sunSpawningEnabled = this._session.debugSetSunSpawningEnabled(enabled)
        this._renderFrame()
        return sunSpawningEnabled
    }

    private async _drawStaticBoard() {
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
            this._soddedNode.active = false
        }

        const sod = SpriteLoader.get('sod1row')
        if (sod) {
            this._sodClipNode = createUINode('SodClip', {
                parent: this._boardContent,
                anchorX: 0,
                anchorY: 1,
                width: 0,
                height: sod.originalSize.height,
                x: SOD_ROW_X,
                y: -SOD_ROW_Y,
            })
            this._sodClipNode.addComponent(Mask).type = Mask.Type.RECT
            createSpriteNode({
                name: 'SodRow',
                spriteFrame: sod,
                parent: this._sodClipNode,
                x: 0,
                y: 0,
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

        if (this._sodRollAnimation?.json) {
            this._sodRollNode = createUINode('SodRoll', {
                parent: this._boardContent,
                anchorX: 0,
                anchorY: 1,
                width: 800,
                height: 600,
                x: 0,
                y: 0,
            })
            this._sodRollNode.active = false
            const animator = this._sodRollNode.addComponent(Animator)
            await animator.parseJson(this._sodRollAnimation.json as Record<string, any>)
            this._sodRollAnimNode = animator.addAnimNode('default')
        }

        if (SpriteLoader.get('lawnmower_cached') && SpriteLoader.get('plantshadow')) {
            this._createIntroLawnMower()
        }

        this._createGameOverDoorLayers()
        this._entityLayer.setSiblingIndex(this._boardContent.children.length - 1)
    }

    private _createGameOverDoorLayers() {
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

    private _gameOverDoorAnchor() {
        return {
            x: GAME_OVER_DOOR_MASK_X,
            y: GAME_OVER_DOOR_MASK_Y,
        }
    }

    private _gameOverDoorInteriorOffset() {
        return {
            x: GAME_OVER_DOOR_INTERIOR_X - GAME_OVER_DOOR_MASK_X,
            y: GAME_OVER_DOOR_INTERIOR_Y - GAME_OVER_DOOR_MASK_Y,
        }
    }

    private _createIntroLawnMower() {
        this._introLawnMowerShadowNode = createSpriteNode({
            name: 'IntroLawnMowerShadow',
            spriteFrame: SpriteLoader.get('plantshadow')!,
            parent: this._boardContent,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
        })
        this._introLawnMowerShadowNode.active = false

        this._introLawnMowerNode = createUINode('IntroLawnMower', {
            parent: this._boardContent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
        })
        this._introLawnMowerNode.active = false

        const cachedMower = SpriteLoader.get('lawnmower_cached')
        if (cachedMower) {
            createSpriteNode({
                name: 'CachedMower',
                spriteFrame: cachedMower,
                parent: this._introLawnMowerNode,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                x: LAWN_MOWER_CACHED_DRAW_OFFSET_X,
                y: 0,
            })
        }

        this._syncIntroLawnMower()
    }

    private _drawHud() {
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
        this._createAdviceWidget()
        this._resultLabel = this._createLabel('Result', 400, -285, '', 42, new Color(255, 240, 120))
        this._resultLabel.node.active = false
        this._drawSeedPackets()
        this._createShovel()
        this._createMenuButton()
        this._createProgressMeter()
        this._setSeedBankContentsVisible(false)
        this._syncItemLayerBehindAdvice()
    }

    private _createProgressMeter() {
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
        this._progressMeterFillClip.addComponent(Mask).type = Mask.Type.RECT
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

    private _capturePreviousEntitySnapshots() {
        this._previousEntitySnapshots.clear()
        for (const entity of this._session.allEntities()) {
            this._previousEntitySnapshots.set(entity.id, this._createRenderEntitySnapshot(entity))
        }
    }

    private _createRenderEntitySnapshot(entity: GameEntity): RenderEntitySnapshot {
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

    private _syncItemLayerBehindAdvice() {
        if (!this._itemLayer?.isValid || !this._adviceNode?.isValid) return
        if (this._itemLayer.parent !== this._uiLayer || this._adviceNode.parent !== this._uiLayer) return

        const itemIndex = this._itemLayer.getSiblingIndex()
        const adviceIndex = this._adviceNode.getSiblingIndex()
        const targetIndex = itemIndex < adviceIndex ? adviceIndex - 1 : adviceIndex
        this._itemLayer.setSiblingIndex(Math.max(0, targetIndex))
    }

    private _createShovel() {
        if (!this._levelHasShovel()) return

        const bank = SpriteLoader.get('shovelbank')
        const shovel = SpriteLoader.get('shovel')
        if (!bank || !shovel) return

        this._shovelBankNode = createSpriteNode({
            name: 'ShovelBank',
            spriteFrame: bank,
            parent: this._uiLayer,
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

    private _createMenuButton() {
        if (!this._buttonSprites || !this._buttonFonts) return

        this._menuButtonNode = createStoneButton({
            name: 'MenuButton',
            parent: this._uiLayer,
            layer: this.node.layer,
            label: 'Menu',
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

    private _drawSeedPackets() {
        const parent = this._seedBankNode ?? this._uiLayer
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const x = this._getSeedPacketPositionX(i)
            const y = -8
            const packetNode = SeedPacketRenderer.drawSeedPacket({
                name: `SeedPacket_${packet.seedType}`,
                x,
                y,
                parent,
                layer: this.node.layer,
                seedType: packet.seedType,
                cost: SEED_DEFINITIONS[packet.seedType].cost,
                seeds: SpriteLoader.get('seeds') ?? null,
                packetPlants: SpriteLoader.get('packet_plants') ?? null,
                cachedPacketPlants: SpriteLoader.get('packet_plants_cached') ?? null,
                costFont: this._packetCostFont,
            })
            this._seedPacketNodes.set(packet.seedType, packetNode)
            this._seedPacketCooldownClips.set(packet.seedType, this._createSeedPacketCooldownClip(packetNode, packet))
            this._wireSeedPacketInput(packetNode, packet.seedType)
        }
    }

    private _createSeedPacketCooldownClip(packetNode: Node, packet: SeedPacketState) {
        const clip = createUINode('CooldownClip', {
            parent: packetNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: SEED_PACKET_WIDTH,
            height: 0,
            x: 0,
            y: 0,
            z: 20,
        })
        clip.addComponent(Mask).type = Mask.Type.RECT
        clip.active = false

        const darkPacket = SeedPacketRenderer.drawSeedPacket({
            name: 'CooldownPacket',
            x: 0,
            y: 0,
            parent: clip,
            layer: this.node.layer,
            seedType: packet.seedType,
            cost: SEED_DEFINITIONS[packet.seedType].cost,
            drawCost: false,
            seeds: SpriteLoader.get('seeds') ?? null,
            packetPlants: SpriteLoader.get('packet_plants') ?? null,
            cachedPacketPlants: SpriteLoader.get('packet_plants_cached') ?? null,
            costFont: this._packetCostFont,
        })
        this._applySpriteColorRecursive(darkPacket, new Color(64, 64, 64, 255))
        const costNode = packetNode.children.find((child) => child.name === 'Cost')
        if (costNode) clip.setSiblingIndex(costNode.getSiblingIndex())
        return clip
    }

    private _wireSeedPacketInput(packetNode: Node, seedType: SeedType) {
        const onPress = (event: EventMouse | EventTouch) => {
            if (!this._canUseBoardInput()) return
            if (this._session.selectedSeed) return

            event.propagationStopped = true
            const pixel = this._eventToBoardPixel(event)
            this._mousePixel = pixel
            this._session.dispatch({ type: 'selectSeed', seedType })
            this._renderFrame()
        }
        packetNode.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            if (sys.isMobile) return
            if (event.getButton() !== 0) return
            onPress(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!sys.isMobile) return
            onPress(event)
        }, this)
    }

    private _wireInput() {
        input.on(Input.EventType.MOUSE_DOWN, this._onGlobalMouseDown, this)
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this.node.on(Node.EventType.MOUSE_MOVE, (event: EventMouse) => {
            if (sys.isMobile) return
            this._mousePixel = this._eventToBoardPixel(event)
            this._updateCursorPreview()
            this._updateHoverItemAndSeedPacketState()
        })
        this.node.on(Node.EventType.MOUSE_LEAVE, () => {
            if (sys.isMobile) return
            this._mousePixel = { x: -1, y: -1 }
            this._hideTooltips()
            this._setCanvasCursor('default')
        })
        this.node.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            if (sys.isMobile) return
            if (event.getButton() === MOUSE_BUTTON_RIGHT) {
                this._onRightMouseCancel(event)
                return
            }
            if (event.getButton() !== 0) return
            const pixel = this._eventToBoardPixel(event)
            this._mousePixel = pixel
            this._handlePointerDown(pixel)
        })
        this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!sys.isMobile) return
            this._mousePixel = this._eventToBoardPixel(event)
            this._updateCursorPreview()
        })
        this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!sys.isMobile) return
            const pixel = this._eventToBoardPixel(event)
            this._mousePixel = pixel
            this._handlePointerDown(pixel)
        })
    }

    private _onKeyDown(event: EventKeyboard) {
        if (event.keyCode !== 32) return
        if (!this._gameStarted || this._session.result !== 'playing') return
        if (this._session.paused) return

        this.pauseGame()
        void SoundLoader.play(SoundEffect.Pause)
        this.onPauseRequest?.()
    }

    private _onGlobalMouseDown(event: EventMouse) {
        if (sys.isMobile) return

        if (event.getButton() !== MOUSE_BUTTON_RIGHT) return
        this._onRightMouseCancel(event)
    }

    private _onRightMouseCancel(event: EventMouse) {
        if (!this._canUseBoardInput()) return
        if (this._isDuplicateRightMouseDown(event)) return

        UIButton.rememberMouseLocation(event)
        const pixel = this._eventToBoardPixel(event)
        this._mousePixel = pixel

        const seedHit = this._findSeedPacketAt(pixel)
        if (seedHit && !this._hasCursorObject()) {
            this._session.dispatch({ type: 'selectSeed', seedType: seedHit.packet.seedType })
            this._renderFrame()
            event.propagationStopped = true
            return
        }

        if (!this._hasCursorObject()) {
            return
        }

        this._cancelCursor(true)
        event.propagationStopped = true
    }

    private _isDuplicateRightMouseDown(event: EventMouse) {
        const location = event.getLocation()
        const now = Date.now()
        const isDuplicate =
            now - this._lastRightMouseDownAt <= RIGHT_MOUSE_EVENT_DEDUPE_MS &&
            location.x === this._lastRightMouseDownX &&
            location.y === this._lastRightMouseDownY
        this._lastRightMouseDownAt = now
        this._lastRightMouseDownX = location.x
        this._lastRightMouseDownY = location.y
        return isDuplicate
    }

    private _handlePointerDown(pixel: { x: number, y: number }) {
        if (!this._canUseBoardInput()) return

        if (this._session.selectedSeed) {
            const plantCount = this._session.plants.length
            this._refreshHoverAfterCursorRelease = false
            this._session.dispatch({ type: 'placePlant', x: pixel.x, y: pixel.y })
            if (!this._session.selectedSeed && this._session.plants.length === plantCount) {
                this._refreshHoverAfterCursorRelease = true
            }
            this._renderFrame()
            return
        }

        if (this._session.collectItemAt(pixel.x, pixel.y)) {
            this._renderFrame()
            return
        }

        if (this._session.selectedTool) {
            this._refreshHoverAfterCursorRelease = false
            this._session.dispatch({ type: 'useToolAt', x: pixel.x, y: pixel.y })
            this._renderFrame()
            return
        }

        const seedType = this._hitSeedPacket(pixel)
        if (seedType) {
            this._session.dispatch({ type: 'selectSeed', seedType })
            this._renderFrame()
            return
        }

        const toolType = this._hitTool(pixel)
        if (toolType) {
            this._session.dispatch({ type: 'selectTool', toolType })
            this._renderFrame()
            return
        }

        this._session.dispatch({ type: 'placePlant', x: pixel.x, y: pixel.y })
        this._renderFrame()
    }

    private _canUseBoardInput() {
        return this._gameStarted && this._session.result === 'playing' && !this._session.paused
    }

    private _cancelCursor(refreshHover = true) {
        if (!this._hasCursorObject()) return false

        this._refreshHoverAfterCursorRelease = refreshHover
        this._session.dispatch({ type: 'clearCursor' })
        void SoundLoader.play(SoundEffect.Drop)
        this._renderFrame()
        return true
    }

    private _hasCursorObject() {
        return !!this._session.selectedSeed || !!this._session.selectedTool
    }

    private _syncPlantCursorHoverBlock() {
        const shouldBlock = this._hasCursorObject()
        if (shouldBlock === this._plantCursorHoverBlocked) return

        this._plantCursorHoverBlocked = shouldBlock
        if (shouldBlock) {
            UIButton.beginHoverSuppress()
        } else {
            UIButton.endHoverSuppress(this._refreshHoverAfterCursorRelease)
            this._refreshHoverAfterCursorRelease = true
        }
    }

    private _releasePlantCursorHoverBlock() {
        if (!this._plantCursorHoverBlocked) return

        this._plantCursorHoverBlocked = false
        UIButton.endHoverSuppress(false)
        this._refreshHoverAfterCursorRelease = true
    }

    private _renderFrame() {
        if (this._gameStarted) {
            this._handleEvents(this._session.drainEvents())
        }
        this._syncPlantCursorHoverBlock()
        this._syncSunAmount()
        this._resultLabel.string = ''

        if (this._gameStarted) {
            for (const entity of this._session.allEntities()) {
                this._syncEntity(entity)
            }
        }
        this._syncEntityLayerOrder()
        this._drawZombieCollisionDebug()
        this._restoreGameplayLayerOrder()
        this._syncGameOverLayerOrder()
        this._syncPlantHighlights()
        this._syncSeedPacketState()
        this._syncProgressMeter()
        this._syncTutorialLawnFlash()
        this._syncShovelState()
        this._updateCursorPreview()
        this._updateHoverItemAndSeedPacketState()
    }

    private _updateIntro(dt: number) {
        const previousIntroTime = this._introTime
        this._introTime += dt * 100
        this._boardContent.setPosition(this._introBoardX(), 0, 0)
        if (previousIntroTime < INTRO_ROLL_SOD_START && this._introTime >= INTRO_ROLL_SOD_START) {
            this._startSodRoll()
        }
        this._updateIntroSod()
        this._syncIntroLawnMower()

        if (this._introTime < INTRO_END) return

        this._gameStarted = true
        this._boardContent.setPosition(0, 0, 0)
        if (this._soddedNode) this._soddedNode.active = false
        if (this._unsoddedNode) this._unsoddedNode.active = true
        if (this._sodClipNode) this._sodClipNode.active = true
        if (this._sodRollNode) this._sodRollNode.active = false
        if (this._introLawnMowerNode) this._introLawnMowerNode.active = false
        if (this._introLawnMowerShadowNode) this._introLawnMowerShadowNode.active = false
        if (this._seedBankNode) {
            this._seedBankNode.active = true
            this._seedBankNode.setPosition(10, 0, 10)
        }
        if (this._menuButtonNode) this._menuButtonNode.active = true
        this._setSeedBankContentsVisible(true)
        this._restoreGameplayLayerOrder()
    }

    private _introBoardX() {
        if (this._introTime <= INTRO_PAN_RIGHT_START) return BOARD_OFFSET
        if (this._introTime <= INTRO_PAN_RIGHT_END) {
            return this._easeInOut(
                INTRO_PAN_RIGHT_START,
                INTRO_PAN_RIGHT_END,
                this._introTime,
                BOARD_OFFSET,
                BOARD_RIGHT_X,
            )
        }
        if (this._introTime <= INTRO_PAN_LEFT_START) return BOARD_RIGHT_X
        if (this._introTime <= INTRO_PAN_LEFT_END) {
            return this._easeInOut(
                INTRO_PAN_LEFT_START,
                INTRO_PAN_LEFT_END,
                this._introTime,
                BOARD_RIGHT_X,
                0,
            )
        }
        return 0
    }

    private _startSodRoll() {
        if (!this._sodRollNode || !this._sodRollAnimNode) return

        this._sodRollNode.active = true
        this._sodRollNode.setSiblingIndex(this._boardContent.children.length - 1)
        this._sodRollAnimNode.play({
            name: 'default',
            loop: false,
            speed: 0,
            keepLastFrame: true,
        })
        void SoundLoader.play(SoundEffect.DiggerZombie)
    }

    private _updateIntroSod() {
        if (!this._sodClipNode) return

        const transform = this._sodClipNode.getComponent(UITransform)
        const height = transform?.height ?? 127
        if (this._introTime < INTRO_ROLL_SOD_START) {
            setUISize(this._sodClipNode, 0, height, 0, 1)
            if (this._sodRollNode) this._sodRollNode.active = false
            return
        }

        const sodWidth = SpriteLoader.get('sod1row')?.originalSize.width ?? 771
        const progress = this._linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime, 0, 1)
        const rollProgress = this._linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime + 1, 0, 1)
        setUISize(this._sodClipNode, sodWidth * progress, height, 0, 1)
        this._syncSodRollAnimation(rollProgress)
        if (this._sodRollNode) {
            this._sodRollNode.active = rollProgress < 1
            if (this._sodRollNode.active) {
                this._sodRollNode.setSiblingIndex(this._boardContent.children.length - 1)
            }
        }
    }

    private _syncIntroLawnMower(forcedX?: number) {
        if (!this._introLawnMowerNode || !this._introLawnMowerShadowNode) return

        const visible = forcedX != null || this._introTime > INTRO_LAWN_MOWER_START
        this._introLawnMowerNode.active = visible
        this._introLawnMowerShadowNode.active = visible
        if (!visible) return

        const mowerX = forcedX ?? this._easeInOut(
            INTRO_LAWN_MOWER_START,
            INTRO_LAWN_MOWER_END,
            this._introTime,
            INTRO_LAWN_MOWER_START_X,
            INTRO_LAWN_MOWER_END_X,
        )
        this._introLawnMowerNode.setPosition(
            mowerX + INTRO_LAWN_MOWER_REANIM_X_OFFSET,
            -(INTRO_LAWN_MOWER_Y + INTRO_LAWN_MOWER_REANIM_Y_OFFSET),
            this._session.geometry.rowZ(INTRO_LAWN_MOWER_ROW),
        )
        const shadowOffset = this._getReadyLawnMowerShadowOffset()
        this._introLawnMowerShadowNode.setPosition(
            mowerX + shadowOffset.x,
            -(INTRO_LAWN_MOWER_Y + shadowOffset.y),
            this._session.geometry.rowZ(INTRO_LAWN_MOWER_ROW) - 1,
        )
        this._introLawnMowerShadowNode.setSiblingIndex(this._boardContent.children.length - 1)
        this._introLawnMowerNode.setSiblingIndex(this._boardContent.children.length - 1)
    }

    private _getReadyLawnMowerShadowOffset() {
        const shadow = SpriteLoader.get('plantshadow')
        return {
            x: INTRO_LAWN_MOWER_SHADOW_X_OFFSET + (shadow?.originalSize.width ?? 86) / 2,
            y: INTRO_LAWN_MOWER_SHADOW_Y_OFFSET + (shadow?.originalSize.height ?? 36) / 2,
        }
    }

    private _createAdviceWidget() {
        this._adviceNode = createUINode('AdviceWidget', {
            parent: this._uiLayer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: ADVICE_WIDTH,
            height: ADVICE_HINT_HEIGHT,
            x: ADVICE_WIDTH / 2,
            y: -(ADVICE_HINT_Y + ADVICE_HINT_HEIGHT / 2),
        })
        this._adviceBackdrop = this._adviceNode.addComponent(Graphics)
        this._adviceNode.addComponent(UIOpacity).opacity = 255
        const labelNode = createUINode('AdviceLabel', {
            parent: this._adviceNode,
            anchorX: 0,
            anchorY: 1,
            width: ADVICE_WIDTH - 40,
            height: ADVICE_HINT_HEIGHT,
        })
        this._adviceLabel = labelNode.addComponent(FontRenderer)
        if (this._adviceFont) this._adviceLabel.setFontAssets(this._adviceFont)
        this._adviceLabel.fontSize = ADVICE_TEXT_SIZE
        this._adviceLabel.lineSpacing = 0
        this._adviceLabel.maxWidth = ADVICE_WIDTH - 40
        this._adviceLabel.textAlign = 2
        this._adviceLabel.string = ''
        this._adviceLabel.forceRebuild()
        this._adviceNode.active = false
    }

    private _showAdvice(message: string, style: AdviceStyle) {
        if (!this._adviceNode?.isValid) return

        this._adviceStyle = style
        this._adviceDurationTicks = this._adviceDurationForStyle(style)
        this._adviceLabel.string = message
        this._adviceLabel.forceRebuild()
        this._applyAdviceLayout()
        this._adviceNode.active = true
        this._drawAdviceBackdrop()
        this._syncItemLayerBehindAdvice()
    }

    private _clearAdvice() {
        if (!this._adviceNode?.isValid) return

        this._adviceLabel.string = ''
        this._adviceLabel.forceRebuild()
        this._adviceBackdrop.clear()
        this._adviceNode.active = false
        this._adviceNode.setScale(1, 1, 1)
        const opacity = this._adviceNode.getComponent(UIOpacity)
        if (opacity) opacity.opacity = 255
        this._adviceDurationTicks = 0
    }

    private _updateAdviceWidget(ticks: number) {
        if (!this._adviceNode?.active) return
        if (this._adviceDurationTicks >= ADVICE_DURATION_STAY) {
            this._applyAdviceLayout()
            this._drawAdviceBackdrop()
            return
        }

        this._adviceDurationTicks = Math.max(0, this._adviceDurationTicks - ticks)
        if (this._adviceDurationTicks === 0) {
            this._adviceNode.active = false
            return
        }

        this._applyAdviceLayout()
        this._drawAdviceBackdrop()
    }

    private _updateTimedUiEffects(ticks: number) {
        if (this._sunFlashTicks > 0) {
            this._sunFlashTicks = Math.max(0, this._sunFlashTicks - ticks)
        }
    }

    private _applyAdviceLayout() {
        const layout = this._adviceLayout()
        const labelWidth = ADVICE_WIDTH - 40
        this._adviceLabel.fontColor = layout.textColor
        this._adviceLabel.fontSize = layout.fontSize
        this._adviceLabel.lineSpacing = layout.lineHeight
        this._adviceLabel.maxWidth = labelWidth
        this._adviceLabel.textAlign = 2
        this._adviceLabel.forceRebuild()
        setUISize(this._adviceNode, ADVICE_WIDTH, layout.height)
        this._adviceNode.setPosition(ADVICE_WIDTH / 2, -(layout.y + layout.height / 2), 0)
        setUISize(this._adviceLabel.node, labelWidth, layout.height, 0, 1)
        this._adviceLabel.node.setPosition(-labelWidth / 2, this._getAdviceTextLocalTopY(layout, labelWidth), 0)
        this._syncAdviceTransform()
    }

    private _drawAdviceBackdrop() {
        if (!this._adviceBackdrop) return

        const layout = this._adviceLayout()
        this._adviceBackdrop.clear()
        if (layout.backdropAlpha <= 0) return

        this._adviceBackdrop.fillColor = new Color(0, 0, 0, layout.backdropAlpha)
        this._adviceBackdrop.fillRect(-ADVICE_WIDTH / 2, -layout.height / 2, ADVICE_WIDTH, layout.height)
    }

    private _syncAdviceTransform() {
        const opacity = this._adviceNode.getComponent(UIOpacity)
        if (this._adviceStyle !== 'huge-wave') {
            this._adviceNode.setScale(1, 1, 1)
            if (opacity) opacity.opacity = 255
            return
        }

        const elapsedTicks = ADVICE_DURATION_HUGE_WAVE - this._adviceDurationTicks
        let scale = 1
        let alpha = 1
        if (elapsedTicks < HUGE_WAVE_TEXT_ENTER_TICKS) {
            const t = Math.max(0, elapsedTicks) / HUGE_WAVE_TEXT_ENTER_TICKS
            scale = this._lerp(2.003, 1.001, t)
            alpha = t
        } else if (this._adviceDurationTicks < HUGE_WAVE_TEXT_LEAVE_TICKS) {
            alpha = Math.max(0, this._adviceDurationTicks / HUGE_WAVE_TEXT_LEAVE_TICKS)
        }

        this._adviceNode.setScale(scale, scale, 1)
        if (opacity) opacity.opacity = Math.round(255 * alpha)
    }

    private _adviceLayout() {
        const alpha = this._advicePulseAlpha()
        switch (this._adviceStyle) {
            case 'huge-wave':
                return {
                    y: ADVICE_HUGE_WAVE_Y,
                    height: ADVICE_HINT_HEIGHT,
                    textOffsetY: 0,
                    textColor: new Color(255, 0, 0, 255),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 0,
                }
            case 'big-middle':
                return {
                    y: ADVICE_MIDDLE_Y,
                    height: ADVICE_MIDDLE_HEIGHT,
                    textOffsetY: 0,
                    textColor: new Color(253, 245, 173, alpha),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 128,
                }
            case 'tutorial-level1':
            case 'tutorial-level1-stay':
                return {
                    y: ADVICE_TUTORIAL_LEVEL1_Y,
                    height: ADVICE_TUTORIAL_LEVEL1_HEIGHT,
                    textOffsetY: ADVICE_TEXT_OFFSET_Y,
                    textColor: new Color(253, 245, 173, alpha),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 128,
                }
            case 'hint-stay':
            case 'hint':
            default:
                return {
                    y: ADVICE_HINT_Y,
                    height: ADVICE_HINT_HEIGHT,
                    textOffsetY: ADVICE_TEXT_OFFSET_Y,
                    textColor: new Color(253, 245, 173, alpha),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 128,
                }
        }
    }

    private _getAdviceTextLocalTopY(layout: {
        y: number
        height: number
        textOffsetY: number
        fontSize: number
    }, labelWidth: number) {
        const fontConfig = this._adviceFont?.config ?? null
        const metrics = FontMetricsUtil.getMetrics(fontConfig)
        if (metrics.height <= 0) return this._adviceLabel.contentHeight / 2 + layout.textOffsetY

        const wrapped = FontMetricsUtil.measureWordWrapped(fontConfig, this._adviceLabel.string, labelWidth)
        const lineCount = Math.max(1, wrapped.lineWidths.length)
        const rawConfig = fontConfig?.json as { defaultPointSize?: number } | undefined
        const defaultPointSize = rawConfig?.defaultPointSize ?? layout.fontSize
        const scale = defaultPointSize > 0 ? layout.fontSize / defaultPointSize : 1
        const wrappedHeight = (
            metrics.height - metrics.ascentPadding + Math.max(0, lineCount - 1) * metrics.lineSpacing
        ) * scale
        const centeredRectY = layout.y + layout.textOffsetY + Math.trunc((layout.height - wrappedHeight) / 2)
        const textTopY = centeredRectY - metrics.ascentPadding * scale
        return layout.y + layout.height / 2 - textTopY
    }

    private _adviceDurationForStyle(style: AdviceStyle) {
        switch (style) {
            case 'hint-stay':
            case 'tutorial-level1-stay':
                return ADVICE_DURATION_STAY
            case 'tutorial-level1':
                return ADVICE_DURATION_FAST
            case 'huge-wave':
                return ADVICE_DURATION_HUGE_WAVE
            case 'big-middle':
            case 'hint':
            default:
                return ADVICE_DURATION_FAST
        }
    }

    private _advicePulseAlpha() {
        if (this._adviceStyle === 'huge-wave') return 255

        const t = (this._session.tick % 75) / 75
        const peak = 1 - Math.abs(t * 2 - 1)
        return Math.round(ADVICE_TEXT_MIN_ALPHA + (255 - ADVICE_TEXT_MIN_ALPHA) * peak)
    }

    private _restoreGameplayLayerOrder() {
        if (!this._gameStarted || !this._entityLayer?.isValid) return

        const mowerNodes = [this._introLawnMowerShadowNode, this._introLawnMowerNode]
            .filter((node): node is Node => !!node?.isValid && node.parent === this._boardContent && node.active)
        if (mowerNodes.length === 0) {
            this._entityLayer.setSiblingIndex(this._boardContent.children.length - 1)
            return
        }

        const mowerIndex = Math.min(...mowerNodes.map((node) => node.getSiblingIndex()))
        this._entityLayer.setSiblingIndex(Math.max(0, mowerIndex))
    }

    private _syncSodRollAnimation(progress: number) {
        if (!this._sodRollAnimNode) return

        const duration = this._sodRollAnimNode.getAnimationDuration('default')
        if (!duration) return

        this._sodRollAnimNode.time = Math.max(0, duration - 1) * progress
    }

    private _handleEvents(events: GameEvent[]) {
        for (const event of events) {
            switch (event.type) {
                case 'entityRemoved':
                    this._removeEntityNode(event.entityId)
                    break
                case 'animationRequested':
                    if (this._zombieViews.has(event.entityId)) {
                        this._playZombieAnimation(event.entityId, event.animation)
                    } else {
                        this._playPlantAnimation(event.entityId, event.animation)
                    }
                    break
                case 'soundRequested':
                    void SoundLoader.play(event.sound)
                    break
                case 'foleyRequested':
                    void SoundLoader.playFoley(event.sound, event.pitchRange)
                    break
                case 'advice':
                    this._showAdvice(event.message, event.style ?? 'hint')
                    break
                case 'adviceCleared':
                    this._clearAdvice()
                    break
                case 'sunFlash':
                    this._sunFlashTicks = SUN_FLASH_TICKS
                    break
                case 'finalWave':
                    this._showFinalWaveWarning()
                    break
                case 'levelLost':
                    this._startGameOver(event.zombieId)
                    break
            }
        }
    }

    private _showFinalWaveWarning() {
        this._clearAdvice()
        void this._playFinalWaveWarning()
    }

    private async _playFinalWaveWarning() {
        this._destroyFinalWaveWarning()

        const node = createUINode('FinalWaveWarning', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: FINAL_WAVE_REANIM_X,
            y: -FINAL_WAVE_REANIM_Y,
            z: CURSOR_PREVIEW_Z - 2,
        })
        node.setSiblingIndex(this._uiLayer.children.length - 1)
        this._finalWaveNode = node

        const json = this._finalWaveAnimation?.json as Record<string, any> | undefined
        if (!json) {
            this._createFinalWaveFallback(node)
            this.scheduleOnce(() => this._destroyFinalWaveWarning(node), 2)
            return
        }

        const animator = node.addComponent(Animator)
        await animator.parseJson(json)
        if (!node.isValid || this._finalWaveNode !== node) return

        const animNode = animator.addAnimNode('default')
        this._finalWaveAnimNode = animNode
        animNode?.play({
            name: 'default',
            loop: false,
            speed: 1,
            onFinish: () => this._destroyFinalWaveWarning(node),
        })
    }

    private _createFinalWaveFallback(parent: Node) {
        const spriteFrame = SpriteLoader.get('finalwave')
        if (!spriteFrame) return

        createSpriteNode({
            name: 'FinalWaveSprite',
            spriteFrame,
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: 220,
            y: -260,
        })
    }

    private _destroyFinalWaveWarning(expectedNode?: Node) {
        if (expectedNode && this._finalWaveNode !== expectedNode) return

        if (this._finalWaveNode?.isValid) this._finalWaveNode.destroy()
        this._finalWaveNode = null
        this._finalWaveAnimNode = null
    }

    private _startGameOver(zombieId: number | null) {
        if (this._gameOverActive) return

        this._gameOverActive = true
        this._gameOverTicks = 0
        this._gameOverDialogRequested = false
        this._gameAccumulator = 0
        this._previousEntitySnapshots.clear()
        this._gameOverWinnerZombieId = zombieId
        this._session.dispatch({ type: 'clearCursor' })
        this._clearAdvice()
        this._destroyFinalWaveWarning()
        this._releasePlantCursorHoverBlock()
        this._setCanvasCursor('default')
        this._hideGameplayUiForGameOver()
        this._syncSceneAnimationState()
        this._ensureGameOverOverlay()
        this._syncGameOverScene()
        void SoundLoader.play(SoundEffect.LoseMusic)
    }

    private _hideGameplayUiForGameOver() {
        if (this._seedBankNode?.isValid) this._seedBankNode.active = false
        if (this._menuButtonNode?.isValid) this._menuButtonNode.active = false
        if (this._shovelBankNode?.isValid) this._shovelBankNode.active = false
        if (this._shovelNode?.isValid) this._shovelNode.active = false
        if (this._progressMeterNode?.isValid) this._progressMeterNode.active = false
        if (this._levelLabel?.node?.isValid) this._levelLabel.node.active = false
    }

    private _ensureGameOverOverlay() {
        if (this._gameOverOverlayNode?.isValid) return

        this._gameOverOverlayNode = createUINode('GameOverOverlay', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
            z: CURSOR_PREVIEW_Z - 1,
        })

        this._gameOverBlackNode = createUINode('GameOverBlack', {
            parent: this._gameOverOverlayNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
        })
        const graphics = this._gameOverBlackNode.addComponent(Graphics)
        graphics.fillColor = Color.BLACK
        graphics.fillRect(0, -600, 800, 600)

        const title = SpriteLoader.get('zombieswon')
        if (title) {
            this._gameOverTitleNode = createSpriteNode({
                name: 'ZombiesWonTitle',
                spriteFrame: title,
                parent: this._gameOverOverlayNode,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
            })
            this._gameOverTitleNode.addComponent(UIOpacity).opacity = 0
            this._gameOverTitleNode.active = false
        }

        this._gameOverOverlayNode.active = false
    }

    private _updateGameOver(ticks: number) {
        if (ticks <= 0) return
        if (this._gameOverTicks >= GAME_OVER_END_TICKS) {
            this._requestGameOverDialog()
            return
        }

        const previousTicks = this._gameOverTicks
        this._gameOverTicks = Math.min(GAME_OVER_END_TICKS, this._gameOverTicks + ticks)
        this._updateGameOverWinnerWalk(previousTicks, this._gameOverTicks)
        this._playGameOverTimedSounds(previousTicks, this._gameOverTicks)
        this._syncGameOverScene()
        this._requestGameOverDialog()
    }

    private _requestGameOverDialog() {
        if (!this._gameOverActive || this._gameOverDialogRequested) return
        if (this._gameOverTicks < GAME_OVER_END_TICKS) return

        this._gameOverDialogRequested = true
        this._setCanvasCursor('default')
        this.onGameOverRequest?.()
    }

    private _updateGameOverWinnerWalk(previousTicks: number, currentTicks: number) {
        if (currentTicks <= GAME_OVER_WINNER_WALK_START_TICKS) return

        const walkingTicks = currentTicks - Math.max(previousTicks, GAME_OVER_WINNER_WALK_START_TICKS)
        if (walkingTicks <= 0) return

        const winner = this._session.zombies.find((zombie) => zombie.id === this._gameOverWinnerZombieId)
        winner?.advanceGameOverWalk(walkingTicks)
    }

    private _playGameOverTimedSounds(previousTicks: number, currentTicks: number) {
        if (previousTicks < GAME_OVER_CHOMP_TICK_1 && currentTicks >= GAME_OVER_CHOMP_TICK_1) {
            void SoundLoader.playFoley(SoundEffect.Chomp)
        }
        if (previousTicks < GAME_OVER_CHOMP_TICK_2 && currentTicks >= GAME_OVER_CHOMP_TICK_2) {
            void SoundLoader.playFoley(SoundEffect.Chomp)
        }
        if (previousTicks < GAME_OVER_SCREAM_TICK && currentTicks >= GAME_OVER_SCREAM_TICK) {
            void SoundLoader.playFoley(SoundEffect.Scream)
        }
    }

    private _syncGameOverScene() {
        if (!this._gameOverActive) return

        if (this._houseDoorBottomNode?.isValid) this._houseDoorBottomNode.active = true
        if (this._houseDoorTopNode?.isValid) this._houseDoorTopNode.active = true
        this._syncGameOverLayerOrder()
        const boardX = this._gameOverBoardX()
        this._boardContent.setPosition(boardX, 0, 0)
        this._itemLayer.setPosition(boardX, 0, 0)

        this._ensureGameOverOverlay()
        if (this._gameOverOverlayNode?.isValid) {
            this._gameOverOverlayNode.active = true
            this._gameOverOverlayNode.setSiblingIndex(this._uiLayer.children.length - 1)
        }
        this._syncGameOverBlack()
        this._syncGameOverTitle()
    }

    private _syncGameOverLayerOrder() {
        if (!this._gameOverActive || !this._entityLayer?.isValid) return

        if (this._houseDoorBottomNode?.isValid) {
            this._houseDoorBottomNode.setSiblingIndex(Math.max(0, this._entityLayer.getSiblingIndex()))
            this._entityLayer.setSiblingIndex(this._houseDoorBottomNode.getSiblingIndex() + 1)
        }
        if (this._houseDoorTopNode?.isValid) {
            this._houseDoorTopNode.setSiblingIndex(this._entityLayer.getSiblingIndex() + 1)
        }
    }

    private _syncGameOverBlack() {
        if (!this._gameOverBlackNode?.isValid) return

        const frame = this._gameOverReanimFrame()
        const alpha = frame < 0
            ? 0
            : Math.round(255 * this._sampleNumberKeyframes(GAME_OVER_FULLSCREEN_ALPHA_KEYS, frame))
        this._gameOverBlackNode.active = alpha > 0
        const graphics = this._gameOverBlackNode.getComponent(Graphics)
        if (!graphics) return

        graphics.clear()
        graphics.fillColor = new Color(0, 0, 0, Math.min(GAME_OVER_BLACK_MAX_OPACITY, alpha))
        graphics.fillRect(0, -600, 800, 600)
    }

    private _syncGameOverTitle() {
        if (!this._gameOverTitleNode?.isValid) return
        if (this._gameOverDialogRequested) {
            this._gameOverTitleNode.active = false
            return
        }

        const frame = this._gameOverReanimFrame()
        if (frame < 0) {
            this._gameOverTitleNode.active = false
            return
        }

        this._gameOverTitleNode.active = true
        const key = this._sampleGameOverTitleKey(frame)
        let x = key.x
        let y = key.y
        const scale = key.scale

        if (this._gameOverTicks >= GAME_OVER_GRAPHIC_SHAKE_START_TICKS &&
            this._gameOverTicks < GAME_OVER_GRAPHIC_SHAKE_END_TICKS) {
            const shake = this._gameOverTicks - GAME_OVER_GRAPHIC_SHAKE_START_TICKS
            x += Math.sin(shake * 0.75) * 3
            y += Math.cos(shake * 0.92) * 2
        }

        this._gameOverTitleNode.setPosition(x, -y, 0)
        this._gameOverTitleNode.setScale(scale, scale, 1)
        const opacity = this._gameOverTitleNode.getComponent(UIOpacity) ?? this._gameOverTitleNode.addComponent(UIOpacity)
        opacity.opacity = GAME_OVER_TITLE_MAX_OPACITY
    }

    private _gameOverReanimFrame() {
        const elapsed = this._gameOverTicks - GAME_OVER_GRAPHIC_START_TICKS
        if (elapsed < 0) return -1
        return elapsed * GAME_OVER_REANIM_RATE / 100
    }

    private _sampleNumberKeyframes(keys: readonly number[], frame: number) {
        if (frame <= 0) return keys[0] ?? 0

        const left = Math.min(keys.length - 1, Math.floor(frame))
        const right = Math.min(keys.length - 1, left + 1)
        const t = Math.max(0, Math.min(1, frame - left))
        return this._lerp(keys[left], keys[right], t)
    }

    private _sampleGameOverTitleKey(frame: number) {
        if (frame <= 0) return GAME_OVER_TITLE_KEYS[0]

        const left = Math.min(GAME_OVER_TITLE_KEYS.length - 1, Math.floor(frame))
        const right = Math.min(GAME_OVER_TITLE_KEYS.length - 1, left + 1)
        const t = Math.max(0, Math.min(1, frame - left))
        const start = GAME_OVER_TITLE_KEYS[left]
        const end = GAME_OVER_TITLE_KEYS[right]
        return {
            x: this._lerp(start.x, end.x, t),
            y: this._lerp(start.y, end.y, t),
            scale: this._lerp(start.scale, end.scale, t),
        }
    }

    private _gameOverBoardX() {
        if (this._gameOverTicks <= GAME_OVER_PAN_START_TICKS) return 0
        if (this._gameOverTicks >= GAME_OVER_PAN_END_TICKS) return BOARD_OFFSET
        return this._easeInOut(GAME_OVER_PAN_START_TICKS, GAME_OVER_PAN_END_TICKS, this._gameOverTicks, 0, BOARD_OFFSET)
    }

    private _syncEntity(entity: GameEntity) {
        let node = this._entityNodes.get(entity.id)
        if (!node) {
            node = this._createEntityNode(entity)
            this._entityNodes.set(entity.id, node)
        }
        const renderState = this._getRenderEntityState(entity)
        if (entity.kind === 'item') {
            node.setPosition(
                renderState.x + entity.width / 2,
                -(renderState.y + entity.height / 2),
                this._entityZ(entity),
            )
            const scale = renderState.scale ?? entity.scale
            node.setScale(scale, scale, 1)
            const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity)
            opacity.opacity = renderState.alpha ?? entity.alpha
            this._syncMoneyItemAnimation(entity)
            return
        }
        node.setPosition(renderState.x, -renderState.y, this._entityZ(entity))
        if (entity.kind === 'zombie') {
            this._syncZombieGameOverClip(entity, renderState)
            this._syncZombieAnimation(entity)
        } else if (entity.kind === 'lawnmower') {
            this._syncLawnMowerAnimation(entity)
        }
    }

    private _getRenderEntityState(entity: GameEntity): RenderEntitySnapshot {
        if (entity.kind === 'zombie' &&
            this._gameOverActive &&
            entity.id === this._gameOverWinnerZombieId) {
            return {
                x: entity.x,
                y: entity.y,
            }
        }

        const previous = this._previousEntitySnapshots.get(entity.id)
        if (!previous || this._session.paused) return this._createRenderEntitySnapshot(entity)

        const t = this._renderInterpolationAlpha()
        const current = this._createRenderEntitySnapshot(entity)
        return {
            x: this._lerp(previous.x, current.x, t),
            y: this._lerp(previous.y, current.y, t),
            scale: previous.scale == null || current.scale == null
                ? current.scale
                : this._lerp(previous.scale, current.scale, t),
            alpha: previous.alpha == null || current.alpha == null
                ? current.alpha
                : Math.round(this._lerp(previous.alpha, current.alpha, t)),
        }
    }

    private _renderInterpolationAlpha() {
        return Math.max(0, Math.min(1, this._gameAccumulator / GAME_TICK_SECONDS))
    }

    private _createEntityNode(entity: GameEntity) {
        switch (entity.kind) {
            case 'plant':
                return this._createPlantNode(entity)
            case 'zombie':
                return this._createZombieNode(entity)
            case 'projectile':
                return this._createProjectileNode(entity)
            case 'item':
                return this._createItemNode(entity)
            case 'lawnmower':
                return this._createLawnMowerNode(entity)
        }
    }

    private _syncEntityLayerOrder() {
        const entries: { node: Node, order: number }[] = []
        for (const entity of [
            ...this._session.plants,
            ...this._session.zombies,
            ...this._session.projectiles,
            ...this._session.lawnMowers,
        ]) {
            const node = this._entityNodes.get(entity.id)
            if (!node?.isValid) continue

            const rowOrder = entity.row * 10
            const typeOrder =
                entity.kind === 'lawnmower' ? 3 :
                    entity.kind === 'projectile' ? 2 :
                    entity.kind === 'zombie' ? 1 : 0
            entries.push({ node, order: rowOrder + typeOrder })
        }

        entries.sort((a, b) => a.order - b.order)
        for (let i = 0; i < entries.length; i++) {
            entries[i].node.setSiblingIndex(i)
        }
    }

    private _drawZombieCollisionDebug() {
        const graphics = this._collisionDebugGraphics
        if (!DEBUG_ZOMBIE_COLLISION_RECTS || !graphics) return

        graphics.clear()
        graphics.lineWidth = DEBUG_ZOMBIE_RECT_LINE_WIDTH
        for (const zombie of this._session.zombies) {
            if (zombie.dead) continue
            this._strokeBoardRect(
                graphics,
                zombie.x + zombie.bodyRect.x,
                zombie.y + zombie.bodyRect.y,
                zombie.bodyRect.width,
                zombie.bodyRect.height,
                DEBUG_ZOMBIE_BODY_RECT_COLOR,
            )
            this._strokeBoardRect(
                graphics,
                zombie.x + zombie.attackRect.x,
                zombie.y + zombie.attackRect.y,
                zombie.attackRect.width,
                zombie.attackRect.height,
                DEBUG_ZOMBIE_ATTACK_RECT_COLOR,
            )
        }

        this._collisionDebugLayer?.setSiblingIndex(this._entityLayer.children.length - 1)
    }

    private _strokeBoardRect(graphics: Graphics, x: number, y: number, width: number, height: number, color: Color) {
        graphics.strokeColor = color
        graphics.rect(x, -(y + height), width, height)
        graphics.stroke()
    }

    private _createPlantNode(plant: PlantEntity) {
        const node = createUINode(`Plant_${plant.id}`, { parent: this._entityLayer, anchorX: 0, anchorY: 1, width: 100, height: 100 })
        const view = this._createPlantVisual(node, plant.type, true, 255, true, 0)
        this._plantViews.set(plant.id, view)
        return node
    }

    private _createZombieNode(zombie: ZombieEntity) {
        const node = createUINode(`Zombie_${zombie.id}`, { parent: this._entityLayer, anchorX: 0, anchorY: 1, width: 120, height: 120 })
        const view = this._createZombieVisual(node, zombie)
        this._zombieViews.set(zombie.id, view)
        return node
    }

    private _createProjectileNode(projectile: ProjectileEntity) {
        const node = createUINode(`Projectile_${projectile.id}`, {
            parent: this._entityLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: projectile.width,
            height: projectile.height,
        })

        const shadow = SpriteLoader.get('pea_shadows')
        if (shadow) {
            const adjust = PROJECTILE_SHADOW_ADJUSTMENTS[projectile.type]
            const shadowFrame = getAtlasFrame(
                shadow,
                PROJECTILE_SHADOW_DAY_CEL,
                PROJECTILE_SHADOW_WIDTH,
                PROJECTILE_SHADOW_HEIGHT,
                PROJECTILE_SHADOW_COLUMNS,
            )
            const shadowNode = createSpriteNode({
                name: 'ProjectileShadow',
                spriteFrame: shadowFrame,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                x: adjust.offsetX,
                y: -(projectile.shadowY - projectile.y),
                z: -1,
            })
            const scale = adjust.scale ?? 1
            shadowNode.setScale(scale, scale, 1)
        }

        const spriteFrame = SpriteLoader.get(PROJECTILE_SPRITES[projectile.type])
        if (spriteFrame) {
            createSpriteNode({
                name: 'ProjectileSprite',
                spriteFrame,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
            })
        }

        return node
    }

    private _createZombieVisual(node: Node, zombie: ZombieEntity): ZombieView {
        const view: ZombieView = {
            node,
            clipNode: null,
            visualRootNode: null,
            bodyNode: null,
            shadowNode: null,
            moweredAnimNode: null,
            showingMowered: false,
            ...createZombieAnimationView(),
        }
        const clipNode = createUINode('ZombieClip', {
            parent: node,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: this._session.geometry.width,
            height: this._session.geometry.height,
        })
        const visualRootNode = createUINode('ZombieVisualRoot', {
            parent: clipNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
        })
        view.clipNode = clipNode
        view.visualRootNode = visualRootNode
        const visualParent = visualRootNode
        const shadow = SpriteLoader.get('plantshadow')
        if (shadow) {
            view.shadowNode = createSpriteNode({
                name: 'ZombieShadow',
                spriteFrame: shadow,
                parent: visualParent,
                x: 23,
                y: -92,
            })
        }
        const zombieAnimation = this._zombieAnimations.get(zombie.type)
        if (zombieAnimation?.json) {
            const animatorNode = new Node('Animator')
            animatorNode.layer = node.layer
            animatorNode.setPosition(ZOMBIE_BODY_REANIM_OFFSET_X, ZOMBIE_BODY_REANIM_OFFSET_Y, 0)
            visualParent.addChild(animatorNode)
            view.bodyNode = animatorNode
            const animator = animatorNode.addComponent(Animator)
            view.animator = animator
            animator.enabled = this._isZombieSceneAnimationEnabled(zombie.id)
            const animationJson = zombieAnimation.json as Record<string, any>
            void animator.parseJson(animationJson).then(() => {
                animator.enabled = this._isZombieSceneAnimationEnabled(zombie.id)
                wireZombieAnimation(animator, view, zombie.type)
                syncZombieTrackVisibility(view, zombie)
                if (zombie.state === 'mowered') {
                    this._syncMoweredZombieAnimation(view, zombie)
                } else {
                    playZombieBodyAnimation(view, zombie.currentAnimation, {
                        speed: zombie.animationSpeed,
                        time: zombie.animationTime,
                    })
                }
                if (zombie.type === 'flag') {
                    this._attachFlagZombieVisual(animatorNode, view, zombie.id)
                }
                this._syncSceneAnimationState()
            })
        }
        return view
    }

    private _createItemNode(item: ItemEntity) {
        const node = createUINode(`Item_${item.id}`, {
            parent: this._itemLayer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: item.width,
            height: item.height,
        })
        node.addComponent(UIOpacity).opacity = item.alpha
        if (item.type === 'sun' || item.type === 'small-sun' || item.type === 'large-sun') {
            this._createSunVisual(node)
        } else if (item.type === 'final-seed-packet') {
            this._createFinalSeedPacketVisual(node, item)
        } else {
            this._createMoneyItemVisual(node, item)
        }
        return node
    }

    private _createLawnMowerNode(mower: LawnMowerEntity) {
        const node = createUINode(`LawnMower_${mower.id}`, {
            parent: this._entityLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
        })
        const view: LawnMowerView = {
            node,
            cachedNode: null,
            animatorNode: null,
            animNode: null,
            state: null,
        }
        this._lawnMowerViews.set(mower.id, view)

        const shadow = SpriteLoader.get('plantshadow')
        if (shadow) {
            const shadowOffset = this._getReadyLawnMowerShadowOffset()
            createSpriteNode({
                name: 'LawnMowerShadow',
                spriteFrame: shadow,
                parent: node,
                layer: this.node.layer,
                anchorX: 0.5,
                anchorY: 0.5,
                x: shadowOffset.x,
                y: -shadowOffset.y,
                z: -1,
            })
        }

        const cachedMower = SpriteLoader.get('lawnmower_cached')
        if (cachedMower) {
            view.cachedNode = createSpriteNode({
                name: 'CachedMower',
                spriteFrame: cachedMower,
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                x: GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET + LAWN_MOWER_CACHED_DRAW_OFFSET_X,
                y: -GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET,
            })
        }

        if (this._lawnMowerAnimation?.json) {
            const animatorNode = createUINode('Animator', {
                parent: node,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                width: 120,
                height: 120,
                x: GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET,
                y: -GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET,
            })
            animatorNode.setScale(INTRO_LAWN_MOWER_SCALE, INTRO_LAWN_MOWER_SCALE, 1)
            animatorNode.active = false
            view.animatorNode = animatorNode
            const animator = animatorNode.addComponent(Animator)
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            void animator.parseJson(this._lawnMowerAnimation.json as Record<string, any>).then(() => {
                animator.enabled = this._isGameplaySceneAnimationEnabled()
                view.animNode = animator.addAnimNode('default')
                this._syncLawnMowerAnimation(mower)
                this._syncSceneAnimationState()
            })
        }

        return node
    }

    private _syncLawnMowerAnimation(mower: LawnMowerEntity) {
        const view = this._lawnMowerViews.get(mower.id)
        if (!view) return

        if (view.cachedNode?.isValid) view.cachedNode.active = mower.state === 'ready'
        if (view.animatorNode?.isValid) view.animatorNode.active = mower.state === 'triggered'
        if (!view.animNode) return

        const speed = mower.state === 'triggered'
            ? getAnimationRateSpeed(view.animNode, 'anim_normal', 70)
            : 0
        if (view.state !== mower.state) {
            view.animNode.play({
                name: 'anim_normal',
                loop: true,
                speed,
            })
            view.state = mower.state
            return
        }
        view.animNode.speed = speed
    }

    private _createSunVisual(node: Node) {
        if (!this._sunAnimation?.json) {
            const sunFrame = SpriteLoader.get('sun1')
            if (sunFrame) createSpriteNode({ spriteFrame: sunFrame, parent: node, x: 0, y: 0 })
            return
        }

        const animatorNode = new Node('Animator')
        animatorNode.layer = node.layer
        animatorNode.setPosition(0, 0, 0)
        node.addChild(animatorNode)
        const animator = animatorNode.addComponent(Animator)
        animator.enabled = this._isGameplaySceneAnimationEnabled()
        void animator.parseJson(this._sunAnimation.json as Record<string, any>).then(() => {
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            const sun = animator.addAnimNode('default')
            sun?.play({ name: 'default', speed: getAnimationRateSpeed(sun, 'default', 6), loop: true })
            this._syncSceneAnimationState()
        })
    }

    private _createMoneyItemVisual(node: Node, item: ItemEntity) {
        const spriteName = MONEY_ITEM_SPRITES[item.type]
        if (!spriteName) return

        const spriteFrame = SpriteLoader.get(spriteName)
        if (!spriteFrame) return

        const view: MoneyItemView = {
            iconNode: null,
            sideNode: null,
            glowNode: null,
            shineNode: null,
        }

        if (item.type === 'silver-coin' || item.type === 'gold-coin') {
            const glowFrame = SpriteLoader.get('coinglow')
            if (glowFrame) {
                view.glowNode = createSpriteNode({
                    name: 'MoneyGlow',
                    spriteFrame: glowFrame,
                    parent: node,
                    layer: this.node.layer,
                    anchorX: 0.5,
                    anchorY: 0.5,
                    x: -14,
                    y: 12,
                    z: -1,
                })
                view.glowNode.addComponent(UIOpacity).opacity = MONEY_GLOW_MIN_ALPHA
            }
            const sideFrame = SpriteLoader.get(item.type === 'silver-coin' ? 'coin_silver2' : 'coin_gold2')
            if (sideFrame) {
                view.sideNode = createSpriteNode({
                    name: 'MoneySide',
                    spriteFrame: sideFrame,
                    parent: node,
                    layer: this.node.layer,
                    anchorX: 0.5,
                    anchorY: 0.5,
                })
                view.sideNode.active = false
            }
        }

        view.iconNode = createSpriteNode({
            name: 'MoneyItem',
            spriteFrame,
            parent: node,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
        })

        if (item.type === 'diamond') {
            const shineFrame = SpriteLoader.get('diamond_shine1')
            if (shineFrame) {
                view.shineNode = createSpriteNode({
                    name: 'DiamondShine',
                    spriteFrame: shineFrame,
                    parent: node,
                    layer: this.node.layer,
                    anchorX: 0.5,
                    anchorY: 0.5,
                    z: 1,
                })
            }
        }

        this._moneyItemViews.set(item.id, view)
    }

    private _syncMoneyItemAnimation(item: ItemEntity) {
        const view = this._moneyItemViews.get(item.id)
        if (!view) return

        if (item.type === 'silver-coin' || item.type === 'gold-coin') {
            const shouldAnimate = item.hitGround && !item.beingCollected
            if (view.iconNode?.isValid) {
                if (shouldAnimate) {
                    const phase = ((this._session.tick + item.id * 13) % MONEY_FLIP_PERIOD_TICKS) / MONEY_FLIP_PERIOD_TICKS
                    const scaleX = Math.max(MONEY_MIN_FLIP_SCALE_X, Math.abs(Math.cos(phase * Math.PI * 2)))
                    const showSide = !!view.sideNode?.isValid && scaleX <= MONEY_MIN_FLIP_SCALE_X + 0.04
                    view.iconNode.active = !showSide
                    view.iconNode.setScale(scaleX, 1, 1)
                    if (view.sideNode?.isValid) view.sideNode.active = showSide
                } else {
                    view.iconNode.active = true
                    view.iconNode.setScale(1, 1, 1)
                    if (view.sideNode?.isValid) view.sideNode.active = false
                }
            }
            if (view.glowNode?.isValid) {
                view.glowNode.active = shouldAnimate
                const opacity = view.glowNode.getComponent(UIOpacity) ?? view.glowNode.addComponent(UIOpacity)
                const glowPhase = (Math.sin((this._session.tick + item.id * 17) * 0.15) + 1) / 2
                opacity.opacity = Math.round(MONEY_GLOW_MIN_ALPHA + (MONEY_GLOW_MAX_ALPHA - MONEY_GLOW_MIN_ALPHA) * glowPhase)
            }
            return
        }

        if (item.type !== 'diamond' || !view.shineNode?.isValid || item.beingCollected) return

        const frame = 1 + Math.floor(((this._session.tick + item.id * 7) / 6) % DIAMOND_SHINE_FRAME_COUNT)
        const sprite = view.shineNode.getComponent(Sprite)
        const spriteFrame = SpriteLoader.get(`diamond_shine${frame}`)
        if (sprite && spriteFrame) sprite.spriteFrame = spriteFrame
    }

    private _createFinalSeedPacketVisual(node: Node, item: ItemEntity) {
        const seedType = item.awardSeedType ?? 'sunflower'
        SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacket',
            parent: node,
            layer: this.node.layer,
            x: -SEED_PACKET_WIDTH / 2,
            y: SEED_PACKET_HEIGHT / 2,
            seedType,
            drawCost: false,
            seeds: SpriteLoader.get('seeds'),
            packetPlants: SpriteLoader.get('packet_plants'),
            cachedPacketPlants: SpriteLoader.get('packet_plants_cached'),
        })
    }

    private _syncPlantHighlights() {
        const highlightedPlantId = this._session.selectedTool === 'shovel'
            ? this._session.getPlantAt(this._mousePixel.x, this._mousePixel.y)?.id ?? null
            : null

        for (const [plantId, view] of this._plantViews) {
            const highlighted = plantId === highlightedPlantId
            if (highlighted) {
                this._showPlantHighlight(view)
            } else {
                this._hidePlantHighlight(view)
            }
            view.highlighted = highlighted
        }
    }

    private _showPlantHighlight(view: PlantView) {
        view.animator?.setExtraAdditiveDraw(true, PLANT_HIGHLIGHT_COLOR)
    }

    private _hidePlantHighlight(view: PlantView) {
        view.animator?.setExtraAdditiveDraw(false)
    }

    private _createPlantVisual(
        node: Node,
        plantType: PlantType,
        includeShadow: boolean,
        opacity: number,
        animated: boolean,
        staticAnimTime: number,
    ): PlantView {
        const shadow = SpriteLoader.get('plantshadow')
        if (includeShadow && shadow) {
            const shadowAdjust = PLANT_SHADOW_ADJUSTMENTS[plantType] ?? { offsetX: -3, offsetY: 51 }
            const shadowNode = createSpriteNode({
                name: 'PlantShadow',
                spriteFrame: shadow,
                parent: node,
                x: shadowAdjust.offsetX,
                y: -shadowAdjust.offsetY,
            })
            const shadowScale = shadowAdjust.scale ?? 1
            shadowNode.setScale(shadowScale, shadowScale, 1)
        }

        const view: PlantView = {
            node,
            plantType,
            animator: null,
            body: null,
            head: null,
            face: null,
            face2: null,
            glow: null,
            idleSpeed: 1,
            highlighted: false,
            highlightOverlay: null,
            shootingAnimationActive: false,
            shootingAnimationToken: 0,
        }
        const plantAnimation = this._plantAnimations.get(plantType)
        if (plantAnimation?.json) {
            const animatorNode = new Node('Animator')
            animatorNode.layer = node.layer
            const visualAdjust = PLANT_VISUAL_ADJUSTMENTS[plantType]
            animatorNode.setPosition(visualAdjust?.offsetX ?? 0, -(visualAdjust?.offsetY ?? 0), 0)
            const visualScale = visualAdjust?.scale ?? 1
            animatorNode.setScale(visualScale, visualScale, 1)
            node.addChild(animatorNode)
            const animator = animatorNode.addComponent(Animator)
            view.animator = animator
            animator.enabled = this._isGameplaySceneAnimationEnabled()
            const animationJson = plantAnimation.json as Record<string, any>
            void animator.parseJson(animationJson).then(() => {
                animator.enabled = this._isGameplaySceneAnimationEnabled()
                this._setAnimatorOpacity(animator, animationJson, opacity)
                wirePlantAnimation(animator, view, plantType, { animated, staticAnimTime, shakeNode: animatorNode })
                this._syncSceneAnimationState()
            })
        }
        return view
    }

    private _setAnimatorOpacity(animator: Animator, animationJson: Record<string, any>, opacity: number) {
        const color = new Color(255, 255, 255, opacity)
        for (const nodeData of Object.values(animationJson)) {
            const tracks = (nodeData as { tracks?: Record<string, unknown> }).tracks
            if (!tracks) continue
            for (const trackName of Object.keys(tracks)) {
                animator.setTrackColor(trackName, color)
            }
        }
    }

    private _attachFlagZombieVisual(parentNode: Node, view: ZombieView, zombieId: number) {
        if (!this._flagZombieAnimation?.json || !view.body) return

        const animationJson = this._flagZombieAnimation.json as Record<string, any>
        void attachFlagZombieAnimation(parentNode, view, animationJson, {
            enabled: this._isZombieSceneAnimationEnabled(zombieId),
            sortHost: view.animator,
        }).then(() => {
            this._syncSceneAnimationState()
        })
    }

    private _syncZombieGameOverClip(zombie: ZombieEntity, renderState: RenderEntitySnapshot) {
        const view = this._zombieViews.get(zombie.id)
        if (!view) return

        if (!this._gameOverActive || zombie.id !== this._gameOverWinnerZombieId) {
            view.node.active = true
            this._clearZombieGameOverClip(view)
            return
        }

        const visible = this._gameOverTicks > GAME_OVER_WINNER_WALK_START_TICKS
        view.node.active = visible
        if (!visible) {
            this._clearZombieGameOverClip(view)
            return
        }

        this._applyZombieBoardClip(
            view,
            renderState,
            GAME_OVER_DAY_ZOMBIE_CLIP_X,
            0,
            this._session.geometry.width,
            this._session.geometry.height,
        )
    }

    private _applyZombieBoardClip(
        view: ZombieView,
        renderState: RenderEntitySnapshot,
        boardX: number,
        boardY: number,
        width: number,
        height: number,
    ) {
        if (!view.clipNode?.isValid || !view.visualRootNode?.isValid) return

        const localX = boardX - renderState.x
        const localY = renderState.y - boardY
        setUISize(view.clipNode, width, height, 0, 1)
        view.clipNode.setPosition(localX, localY, 0)
        view.visualRootNode.setPosition(-localX, -localY, 0)

        const mask = view.clipNode.getComponent(Mask) ?? view.clipNode.addComponent(Mask)
        mask.type = Mask.Type.RECT
        mask.enabled = true
    }

    private _clearZombieGameOverClip(view: ZombieView) {
        if (!view.clipNode?.isValid) return

        const mask = view.clipNode.getComponent(Mask)
        if (mask) mask.enabled = false
        view.clipNode.setPosition(0, 0, 0)
        if (view.visualRootNode?.isValid) view.visualRootNode.setPosition(0, 0, 0)
    }

    private _syncZombieAnimation(zombie: ZombieEntity) {
        const view = this._zombieViews.get(zombie.id)
        if (!view) return
        this._setNodeAnimatorsEnabled(view.node, this._isZombieSceneAnimationEnabled(zombie.id))
        if (this._gameOverActive && zombie.id !== this._gameOverWinnerZombieId) return

        if (this._gameOverActive && zombie.id === this._gameOverWinnerZombieId) {
            if (view.showingMowered) this._clearMoweredZombieAnimation(view)
            syncZombieTrackVisibility(view, zombie)
            playZombieBodyAnimation(view, zombie.currentAnimation, {
                speed: zombie.animationSpeed,
                time: zombie.animationTime,
                manualTime: true,
                loop: true,
                blendTime: this._getZombieAnimationBlendTime(view, zombie.currentAnimation),
            })
            return
        }
        if (zombie.state === 'mowered') {
            this._syncMoweredZombieAnimation(view, zombie)
            return
        }
        if (view.showingMowered) this._clearMoweredZombieAnimation(view)
        syncZombieTrackVisibility(view, zombie)
        const blendTime = this._getZombieAnimationBlendTime(view, zombie.currentAnimation)
        playZombieBodyAnimation(view, zombie.currentAnimation, {
            speed: zombie.animationSpeed,
            time: zombie.animationTime,
            blendTime,
        })
    }

    private _syncMoweredZombieAnimation(view: ZombieView, zombie: ZombieEntity) {
        if (!view.body) return

        syncZombieTrackVisibility(view, zombie)
        if (view.shadowNode?.isValid) view.shadowNode.active = false
        view.showingMowered = true
        view.body.speed = 0
        if (!view.moweredAnimNode) {
            this._createMoweredZombieDriver(view)
        }
        if (!view.moweredAnimNode) return

        if (!view.moweredAnimNode.isPlaying) {
            view.moweredAnimNode.play({
                name: 'default',
                loop: false,
                speed: 0,
                keepLastFrame: true,
            })
            view.body.attachToTrack({ node: view.moweredAnimNode, track: 'locator' })
        }
        const duration = view.moweredAnimNode.getAnimationDuration('default') ?? 1
        view.moweredAnimNode.time = Math.min(Math.max(0, duration - 1), zombie.animationTime)
    }

    private _createMoweredZombieDriver(view: ZombieView) {
        if (!this._moweredZombieAnimation?.json || !view.node.isValid) return

        const driverNode = createUINode('MoweredDriver', {
            parent: view.node,
            layer: view.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 1,
            height: 1,
        })
        const driver = driverNode.addComponent(Animator)
        driver.enabled = !this._session.paused
        void driver.parseJson(this._moweredZombieAnimation.json as Record<string, any>).then(() => {
            if (!view.node.isValid) return

            view.moweredAnimNode = driver.addAnimNode('default')
        })
    }

    private _clearMoweredZombieAnimation(view: ZombieView) {
        view.showingMowered = false
        if (view.shadowNode?.isValid) view.shadowNode.active = true
    }

    private _playZombieAnimation(entityId: number, animation: string) {
        const view = this._zombieViews.get(entityId)
        if (!view) return
        const zombie = this._session.zombies.find((item) => item.id === entityId)
        const blendTime = this._getZombieAnimationBlendTime(view, animation)
        playZombieBodyAnimation(view, animation, {
            speed: zombie?.animationSpeed ?? 1,
            time: zombie?.animationTime ?? 0,
            blendTime,
        })
    }

    private _getZombieAnimationBlendTime(view: ZombieView, nextAnimation: string) {
        if (!view.currentAnimation || view.currentAnimation === nextAnimation) return 0
        return ZOMBIE_REANIM_BLEND_TIME
    }

    private _playPlantAnimation(entityId: number, animation: string) {
        const view = this._plantViews.get(entityId)
        if (!view) return

        if (animation.startsWith('anim_blink')) {
            if (this._isPlantBlinkBlocked(entityId, view)) {
                this._endPlantBlinkAnimation(view)
                return
            }
            this._playPlantBlinkAnimation(view, animation)
            return
        }

        switch (animation) {
            case 'shoot':
                this._playShooterAnimation(view)
                break
            case 'potato-rise':
                this._playBodyAnimation(view, 'anim_rise', POTATO_MINE_RISE_ANIM_RATE, false, 'anim_armed')
                break
            case 'potato-armed':
                playPotatoArmedAnimation(view)
                break
            case 'chomper-bite':
                this._playBodyAnimation(view, 'anim_bite', CHOMPER_BITE_ANIM_RATE, true)
                break
            case 'chomper-chew':
                this._playBodyAnimation(view, 'anim_chew', CHOMPER_CHEW_ANIM_RATE, false)
                break
            case 'chomper-swallow':
                this._playBodyAnimation(view, 'anim_swallow', CHOMPER_SWALLOW_ANIM_RATE, true, 'anim_idle')
                break
            case 'idle':
                this._playBodyIdleAnimation(view)
                break
        }
    }

    private _playShooterAnimation(view: PlantView) {
        this._endPlantBlinkAnimation(view)
        if (!view.head?.hasAnimation('anim_shooting')) return

        const animRate = view.plantType === 'repeater' ? 45 : 35
        const shootingToken = ++view.shootingAnimationToken
        view.shootingAnimationActive = true
        view.head.play({
            name: 'anim_shooting',
            speed: getAnimationRateSpeed(view.head, 'anim_shooting', animRate),
            blendTime: 0.1,
            keepLastFrame: true,
            onFinish: () => {
                if (view.shootingAnimationToken !== shootingToken) return
                view.shootingAnimationActive = false
                view.head?.play({ name: 'anim_head_idle', speed: view.idleSpeed, loop: true, blendTime: 0.1 })
            },
        })
    }

    private _playBodyAnimation(
        view: PlantView,
        animation: string,
        animRate: number,
        keepLastFrame: boolean,
        nextAnimation?: string,
    ) {
        if (!view.body?.hasAnimation(animation)) return

        view.body.play({
            name: animation,
            speed: getAnimationRateSpeed(view.body, animation, animRate),
            blendTime: 0.1,
            keepLastFrame,
            onFinish: () => {
                if (!nextAnimation) return
                if (nextAnimation === 'anim_idle') {
                    this._playBodyIdleAnimation(view)
                } else if (nextAnimation === 'anim_armed') {
                    playPotatoArmedAnimation(view)
                }
            },
        })
    }

    private _playBodyIdleAnimation(view: PlantView) {
        view.body?.play({
            name: 'anim_idle',
            speed: view.idleSpeed,
            loop: true,
            blendTime: 0.1,
        })
    }

    private _playPlantBlinkAnimation(view: PlantView, animation: string) {
        const face = animation === 'anim_blink2' ? view.face2 : view.face
        if (!face?.hasAnimation(animation)) return

        if (view.plantType === 'potatomine') {
            view.animator?.hideTrack('anim_eye')
        }
        face.play({
            name: animation,
            speed: getAnimationRateSpeed(face, animation, 15),
            keepLastFrame: false,
            onFinish: () => {
                if (view.plantType === 'potatomine') {
                    view.animator?.showTrack('anim_eye')
                }
            },
        })
    }

    private _endPlantBlinkAnimation(view: PlantView) {
        view.animator?.stopAnimNode(view.face)
        view.animator?.stopAnimNode(view.face2)
        view.animator?.showTrack('anim_eye')
    }

    private _isPlantBlinkBlocked(entityId: number, view: PlantView) {
        const plant = this._session.plants.find((item) => item.id === entityId)
        return view.shootingAnimationActive || (!!plant && plant.shootingCounter !== 0)
    }

    private _syncSeedPacketState() {
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const node = this._seedPacketNodes.get(packet.seedType)
            if (!node) continue
            node.setPosition(this._getSeedPacketPositionX(i), -8, 10)
            this._applyPacketColor(node, packet)
            this._syncSeedPacketCooldown(packet)
        }
    }

    private _applyPacketColor(node: Node, packet: SeedPacketState) {
        const affordable = this._session.canAffordSeed(packet.seedType)
        const cooling = packet.cooldownRemaining > 0
        const inactiveWithoutCooldown = !packet.active && !cooling
        const color =
            this._shouldShowFirstPlantSeedGuide(packet) ? this._getTutorialFlashingColor() :
                cooling ? new Color(128, 128, 128, 255) :
                affordable && !inactiveWithoutCooldown ? Color.WHITE : new Color(128, 128, 128, 255)
        this._applySpriteColorRecursive(node, color, 'CooldownClip')
    }

    private _syncSeedPacketCooldown(packet: SeedPacketState) {
        const clip = this._seedPacketCooldownClips.get(packet.seedType)
        if (!clip) return

        const cooldownTicks = SEED_DEFINITIONS[packet.seedType].cooldownTicks
        const percentDark = cooldownTicks > 0 ? packet.cooldownRemaining / cooldownTicks : 0
        if (percentDark <= 0) {
            clip.active = false
            return
        }

        const height = Math.min(SEED_PACKET_HEIGHT, Math.round(68 * percentDark) + 2)
        setUISize(clip, SEED_PACKET_WIDTH, height, 0, 1)
        clip.active = true
    }

    private _syncProgressMeter() {
        this._syncLevelLabel()

        if (!this._progressMeterNode?.isValid) return

        const visible = this._gameStarted && !this._gameOverActive && this._session.progressMeterWidth > 0
        this._progressMeterNode.active = visible
        if (!visible) return

        const clipWidth = Math.max(
            1,
            Math.min(
                PROGRESS_METER_FILL_MAX_WIDTH,
                Math.round(PROGRESS_METER_FILL_MAX_WIDTH * this._session.progressMeterWidth / 150),
            ),
        )
        const clipX = PROGRESS_METER_WIDTH - clipWidth - PROGRESS_METER_FILL_RIGHT_INSET
        if (this._progressMeterFillClip?.isValid) {
            setUISize(this._progressMeterFillClip, clipWidth, PROGRESS_METER_CEL_HEIGHT, 0, 1)
            this._progressMeterFillClip.setPosition(clipX, 0, 1)
        }
        if (this._progressMeterFillNode?.isValid) {
            this._progressMeterFillNode.setPosition(-clipX, 0, 0)
        }
        if (this._progressMeterHeadNode?.isValid) {
            const headProgress = Math.round(PROGRESS_METER_HEAD_MAX_PROGRESS * this._session.progressMeterWidth / 150)
            this._progressMeterHeadNode.setPosition(
                PROGRESS_METER_WIDTH - headProgress + PROGRESS_METER_HEAD_START_X - PROGRESS_METER_X,
                -(PROGRESS_METER_HEAD_Y - PROGRESS_METER_Y),
                3,
            )
        }
    }

    private _syncLevelLabel() {
        if (!this._levelLabel?.node?.isValid) return

        const visible = this._gameStarted && !this._gameOverActive
        this._levelLabel.node.active = visible
        if (!visible) return

        const text = this._levelLabelText()
        if (this._levelLabel.string !== text) {
            this._levelLabel.string = text
            this._levelLabel.forceRebuild()
        }

        const baselineX = this._session.progressMeterWidth > 0
            ? LEVEL_LABEL_WITH_PROGRESS_RIGHT_X
            : LEVEL_LABEL_RIGHT_X
        const metrics = FontMetricsUtil.getMetrics(this._levelFont?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(this._levelFont?.config ?? null, text) || this._levelLabel.contentWidth
        this._levelLabel.node.setPosition(
            baselineX - width,
            -(LEVEL_LABEL_BASELINE_Y - metrics.ascent),
            0,
        )
    }

    private _levelLabelText() {
        const level = this._session.level.adventureLevel
        const area = Math.max(1, Math.floor((level - 1) / 10) + 1)
        const subLevel = ((level - 1) % 10) + 1
        return `Level ${area}-${subLevel}`
    }

    private _syncShovelState() {
        if (this._shovelNode?.isValid) {
            this._shovelNode.active = this._gameStarted && !this._gameOverActive && this._levelHasShovel() && this._session.selectedTool !== 'shovel'
        }
        if (this._shovelBankNode?.isValid) {
            this._shovelBankNode.active = this._gameStarted && !this._gameOverActive && this._levelHasShovel()
        }
    }

    private _syncTutorialLawnFlash() {
        if (!this._tutorialLawnFlashNode?.isValid) return

        if (!this._shouldShowFirstPlantLawnGuide()) {
            this._tutorialLawnFlashNode.active = false
            return
        }

        const sprite = this._tutorialLawnFlashNode.getComponent(Sprite)
        if (sprite) sprite.color = this._getTutorialFlashingColor()
        this._tutorialLawnFlashNode.active = true
    }

    private _shouldShowFirstPlantLawnGuide() {
        return this._gameStarted && this._session.shouldShowTutorialLawnGuide()
    }

    private _shouldShowFirstPlantSeedGuide(packet: SeedPacketState) {
        return this._gameStarted &&
            this._session.shouldShowTutorialSeedGuide(packet.seedType) &&
            packet.active &&
            packet.cooldownRemaining <= 0
    }

    private _getTutorialFlashingColor() {
        const age = this._session.tick % TUTORIAL_FLASH_TIME
        const midpoint = Math.floor(TUTORIAL_FLASH_TIME / 2)
        const gray = Math.max(55, Math.min(255, Math.round(55 + 200 * Math.abs(midpoint - age) / midpoint)))
        return new Color(gray, gray, gray, 255)
    }

    private _levelHasShovel() {
        return this._session.level.adventureLevel >= 5
    }

    private _applySpriteColorRecursive(node: Node, color: Color, skipName?: string) {
        if (node.name === skipName) return
        if (node.getComponent(FontRenderer)) return

        const sprite = node.getComponent(Sprite)
        if (sprite) sprite.color = color
        for (const child of node.children) {
            this._applySpriteColorRecursive(child, color, skipName)
        }
    }

    private _setGameplayAnimationsPaused(paused: boolean) {
        const animators = this.node.getComponentsInChildren(Animator)
        for (const animator of animators) {
            if (animator.isValid) animator.enabled = !paused
        }
        this._syncSceneAnimationState()
    }

    private _syncSceneAnimationState() {
        const gameplayEnabled = this._isGameplaySceneAnimationEnabled()
        for (const view of this._plantViews.values()) {
            if (view.animator?.isValid) view.animator.enabled = gameplayEnabled
            if (view.node?.isValid) {
                const shakes = view.node.getComponentsInChildren(PlantShake)
                for (const shake of shakes) {
                    if (shake.isValid) shake.enabled = gameplayEnabled
                }
            }
        }
        for (const [zombieId, view] of this._zombieViews) {
            this._setNodeAnimatorsEnabled(view.node, this._isZombieSceneAnimationEnabled(zombieId))
        }
        for (const view of this._lawnMowerViews.values()) {
            this._setNodeAnimatorsEnabled(view.node, gameplayEnabled)
        }

        this._setNodeAnimatorsEnabled(this._itemLayer, gameplayEnabled)
    }

    private _setNodeAnimatorsEnabled(node: Node | null, enabled: boolean) {
        if (!node?.isValid) return

        const animators = node.getComponentsInChildren(Animator)
        for (const animator of animators) {
            if (animator.isValid) animator.enabled = enabled
        }
    }

    private _isGameplaySceneAnimationEnabled() {
        return !this._session.paused && !this._gameOverActive
    }

    private _isZombieSceneAnimationEnabled(zombieId: number) {
        if (this._session.paused) return false
        return !this._gameOverActive || zombieId === this._gameOverWinnerZombieId
    }

    private async _preloadPlantAnimationTextures() {
        const textureNames = new Set<string>()
        for (const animation of this._plantAnimations.values()) {
            this._collectAnimationImages(animation.json as Record<string, any>, textureNames)
        }
        textureNames.add('plantshadow')
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    private async _preloadZombieAnimationTextures(extraAnimation: JsonAsset | null) {
        const textureNames = new Set<string>()
        for (const animation of this._zombieAnimations.values()) {
            this._collectAnimationImages(animation.json as Record<string, any>, textureNames)
        }
        if (this._flagZombieAnimation?.json) {
            this._collectAnimationImages(this._flagZombieAnimation.json as Record<string, any>, textureNames)
        }
        if (this._moweredZombieAnimation?.json) {
            this._collectAnimationImages(this._moweredZombieAnimation.json as Record<string, any>, textureNames)
        }
        if (extraAnimation?.json) {
            this._collectAnimationImages(extraAnimation.json as Record<string, any>, textureNames)
        }
        textureNames.add('plantshadow')
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    private async _preloadSunAnimationTextures() {
        if (!this._sunAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._sunAnimation.json as Record<string, any>, textureNames)
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    private async _preloadFinalWaveAnimationTextures() {
        if (!this._finalWaveAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._finalWaveAnimation.json as Record<string, any>, textureNames)
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    private _collectAnimationImages(json: Record<string, any>, output: Set<string>) {
        for (const nodeName in json) {
            const tracks = json[nodeName]?.tracks
            for (const trackName in tracks ?? {}) {
                for (const frame of tracks[trackName]?.frames ?? []) {
                    if (frame?.image) output.add(frame.image)
                }
            }
        }
    }

    private _updateCursorPreview() {
        if (!this._gameStarted) return

        if (!this._session.selectedSeed) {
            if (this._cursorPreview?.isValid) this._cursorPreview.destroy()
            if (this._gridPreview?.isValid) this._gridPreview.destroy()
            this._cursorPreview = null
            this._gridPreview = null
            this._previewSeedType = null
        }

        if (this._session.selectedTool === 'shovel') {
            this._updateShovelCursor()
        } else {
            this._destroyShovelCursor()
        }

        if (!this._session.selectedSeed) {
            return
        }

        if (this._previewSeedType !== this._session.selectedSeed) {
            if (this._cursorPreview?.isValid) this._cursorPreview.destroy()
            if (this._gridPreview?.isValid) this._gridPreview.destroy()
            this._cursorPreview = null
            this._gridPreview = null
            this._previewSeedType = this._session.selectedSeed
        }
        if (!this._cursorPreview?.isValid) {
            this._cursorPreview = this._createPlantPreviewNode('CursorPreview', CURSOR_PLANT_PREVIEW_OPACITY)
        }
        if (!this._gridPreview?.isValid) {
            this._gridPreview = this._createPlantPreviewNode('GridPreview', GRID_PLANT_PREVIEW_OPACITY)
        }

        this._cursorPreview.setPosition(
            this._mousePixel.x + CURSOR_PLANT_OFFSET_X,
            -(this._mousePixel.y + CURSOR_PLANT_OFFSET_Y),
            CURSOR_PREVIEW_Z,
        )
        const seedType = this._session.selectedSeed
        const grid = seedType
            ? this._session.geometry.plantingPixelToGrid(this._mousePixel.x, this._mousePixel.y, seedType)
            : null
        if (seedType && grid && this._session.getPlantingReason(seedType, grid.col, grid.row) === 'ok') {
            const pixel = this._session.geometry.gridToPixel(grid.col, grid.row)
            this._gridPreview.active = true
            this._gridPreview.setPosition(pixel.x, -pixel.y, GRID_PREVIEW_Z)
        } else {
            this._gridPreview.active = false
        }
        this._orderPreviewNodes()
    }

    private _updateShovelCursor() {
        const shovel = SpriteLoader.get('shovel')
        if (!shovel) return

        if (!this._shovelCursor?.isValid) {
            this._shovelCursor = createSpriteNode({
                name: 'ShovelCursor',
                spriteFrame: shovel,
                parent: this._uiLayer,
                layer: this.node.layer,
            })
        }
        this._shovelCursor.setPosition(
            this._mousePixel.x + SHOVEL_CURSOR_OFFSET_X,
            -(this._mousePixel.y + SHOVEL_CURSOR_OFFSET_Y),
            CURSOR_PREVIEW_Z,
        )
        this._shovelCursor.setSiblingIndex(this._uiLayer.children.length - 1)
    }

    private _destroyShovelCursor() {
        if (this._shovelCursor?.isValid) this._shovelCursor.destroy()
        this._shovelCursor = null
    }

    private _createPlantPreviewNode(name: string, opacity: number) {
        const seedType = this._session.selectedSeed!
        const plantType = SEED_DEFINITIONS[seedType].plantType
        return this._createCachedPlantPreviewNode(name, plantType, opacity)
    }

    private _createCachedPlantPreviewNode(name: string, plantType: PlantType, opacity: number) {
        const atlas = SpriteLoader.get('plant_previews_cached')
        if (!atlas) {
            throw new Error("[GameScreen] Required sprite 'plant_previews_cached' is not loaded")
        }

        const node = createUINode(name, {
            parent: this._uiLayer,
            anchorX: 0,
            anchorY: 1,
            width: PLANT_PREVIEW_CACHE_CELL_WIDTH,
            height: PLANT_PREVIEW_CACHE_CELL_HEIGHT,
        })
        const spriteNode = createSpriteNode({
            name: 'CachedPlantPreview',
            spriteFrame: getAtlasFrame(
                atlas,
                PLANT_PREVIEW_CACHE_IDS[plantType],
                PLANT_PREVIEW_CACHE_CELL_WIDTH,
                PLANT_PREVIEW_CACHE_CELL_HEIGHT,
                PLANT_PREVIEW_CACHE_COLUMNS,
            ),
            parent: node,
            layer: this.node.layer,
            x: PLANT_PREVIEW_CACHE_OFFSET_X,
            y: -PLANT_PREVIEW_CACHE_OFFSET_Y,
            width: PLANT_PREVIEW_CACHE_CELL_WIDTH,
            height: PLANT_PREVIEW_CACHE_CELL_HEIGHT,
        })
        const sprite = spriteNode.getComponent(Sprite)
        if (sprite) sprite.color = new Color(255, 255, 255, opacity)
        return node
    }

    private _orderPreviewNodes() {
        if (!this._gridPreview?.isValid || !this._cursorPreview?.isValid) return

        this._gridPreview.setSiblingIndex(Math.max(0, this._cursorPreview.getSiblingIndex()))
        this._cursorPreview.setSiblingIndex(this._uiLayer.children.length - 1)
    }

    private _hitSeedPacket(pixel: { x: number, y: number }): SeedType | null {
        const hit = this._findSeedPacketAt(pixel)
        if (!hit) return null
        if (!hit.packet.active || hit.packet.cooldownRemaining > 0) return null
        return hit.packet.seedType
    }

    private _findSeedPacketAt(pixel: { x: number, y: number }) {
        for (let i = this._session.seedPackets.length - 1; i >= 0; i--) {
            const packet = this._session.seedPackets[i]
            const node = this._seedPacketNodes.get(packet.seedType)
            const rect = node ? this._getNodeBoardPixelRect(node, SEED_PACKET_WIDTH, SEED_PACKET_HEIGHT) : null
            if (!rect) continue
            if (pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height) {
                return { packet, rect }
            }
        }
        return null
    }

    private _hitTool(pixel: { x: number, y: number }): ToolType | null {
        const rect = this._getShovelBoardPixelRect()
        if (!rect) return null
        return pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height
            ? 'shovel'
            : null
    }

    private _updateHoverItemAndSeedPacketState() {
        if (sys.isMobile) return
        if (this._gameOverActive) {
            this._hideTooltips()
            this._setCanvasCursor('default')
            return
        }
        if (this._session.paused) {
            this._hideTooltips()
            return
        }
        if (!this._gameStarted || this._mousePixel.x < 0 || this._mousePixel.y < 0 || this._hasCursorObject()) {
            this._hideTooltips()
            this._setCanvasCursor(this._isMenuButtonPixel(this._mousePixel) ? 'pointer' : 'default')
            return
        }

        const seedHit = this._findSeedPacketAt(this._mousePixel)
        if (seedHit) {
            this._showSeedTooltip(seedHit.packet, seedHit.rect)
        } else {
            this._hideSeedTooltip()
        }

        const shovelHit = this._hitTool(this._mousePixel) === 'shovel'
        if (shovelHit) {
            this._showShovelTooltip()
        } else {
            this._hideShovelTooltip()
        }

        const overCollectableItem = this._session.hasItemAt(this._mousePixel.x, this._mousePixel.y)
        const overPickableSeed = seedHit ? this._canPickUpSeedPacket(seedHit.packet) : false
        const overMenuButton = this._isMenuButtonPixel(this._mousePixel)
        this._setCanvasCursor(overCollectableItem || overPickableSeed || shovelHit || overMenuButton ? 'pointer' : 'default')
    }

    private _showSeedTooltip(
        packet: SeedPacketState,
        rect: { x: number, y: number, width: number, height: number },
    ) {
        const label = SEED_TOOLTIP_NAMES[packet.seedType]
        const warningText = this._getSeedTooltipWarning(packet)
        const textWidth = FontMetricsUtil.measureTextWidth(this._packetCostFont?.config ?? null, label)
        const warningWidth = warningText ? FontMetricsUtil.measureTextWidth(this._packetCostFont?.config ?? null, warningText) : 0
        const width = Math.max(textWidth, warningWidth) + 10
        const x = Math.round(rect.x + (SEED_PACKET_WIDTH - width) / 2)
        const y = -Math.round(rect.y + SEED_TOOLTIP_OFFSET_Y)
        const key = `${packet.seedType}|${warningText}|${x}|${y}`
        if (this._seedTooltipNode?.isValid && this._seedTooltipKey === key) {
            this._seedTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
            return
        }

        this._hideSeedTooltip()
        this._seedTooltipKey = key
        this._seedTooltipNode = createTooltipNode({
            name: 'SeedTooltip',
            text: label,
            warningText,
            font: this._packetCostFont,
            parent: this._uiLayer,
            layer: this.node.layer,
            x,
            y,
            z: CURSOR_PREVIEW_Z - 1,
        })
        this._seedTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
    }

    private _hideSeedTooltip() {
        this._seedTooltipKey = ''
        if (this._seedTooltipNode?.isValid) this._seedTooltipNode.destroy()
        this._seedTooltipNode = null
    }

    private _showShovelTooltip() {
        const rect = this._getShovelBoardPixelRect()
        if (!rect) return
        if (this._shovelTooltipNode?.isValid) {
            this._shovelTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
            return
        }

        this._shovelTooltipNode = createTooltipNode({
            name: 'ShovelTooltip',
            text: 'remove a plant',
            font: this._packetCostFont,
            parent: this._uiLayer,
            layer: this.node.layer,
            x: rect.x + SHOVEL_TOOLTIP_OFFSET_X,
            y: -(rect.y + SHOVEL_TOOLTIP_OFFSET_Y),
            z: CURSOR_PREVIEW_Z - 1,
            centerX: true,
        })
        this._shovelTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
    }

    private _hideShovelTooltip() {
        if (this._shovelTooltipNode?.isValid) this._shovelTooltipNode.destroy()
        this._shovelTooltipNode = null
    }

    private _hideTooltips() {
        this._hideSeedTooltip()
        this._hideShovelTooltip()
    }

    private _getSeedTooltipWarning(packet: SeedPacketState) {
        if (!packet.active || packet.cooldownRemaining > 0) return SEED_TOOLTIP_WAITING
        if (!this._session.canAffordSeed(packet.seedType)) return SEED_TOOLTIP_NOT_ENOUGH_SUN
        return ''
    }

    private _canPickUpSeedPacket(packet: SeedPacketState) {
        return packet.active &&
            packet.cooldownRemaining <= 0 &&
            this._session.canAffordSeed(packet.seedType)
    }

    private _isMenuButtonPixel(pixel: { x: number, y: number }) {
        if (!this._menuButtonNode?.activeInHierarchy) return false
        const rect = this._session.geometry.menuButtonRect
        return pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height
    }

    private _setCanvasCursor(style: string) {
        if (!sys.isBrowser) return
        const canvas = game.canvas
        if (canvas) canvas.style.cursor = style
    }

    private _getShovelBoardPixelRect() {
        if (!this._shovelBankNode?.activeInHierarchy) return null
        const bank = SpriteLoader.get('shovelbank')
        return this._getNodeBoardPixelRect(
            this._shovelBankNode,
            bank?.originalSize.width ?? 70,
            this._seedBankHeight,
        )
    }

    private _createSeedBankExtension(seedBankFrame: SpriteFrame) {
        const extraWidth = this._getSeedBankExtraWidth()
        if (extraWidth <= 0 || !this._seedBankNode) return null

        const sourceWidth = extraWidth + SEED_BANK_EXTENSION_OVERLAP
        const atlasRect = seedBankFrame.rect
        const sourceX = atlasRect.x + seedBankFrame.originalSize.width - sourceWidth
        const frame = new SpriteFrame()
        frame.reset({
            texture: seedBankFrame.texture,
            rect: new Rect(sourceX, atlasRect.y, sourceWidth, seedBankFrame.originalSize.height),
            originalSize: new Size(sourceWidth, seedBankFrame.originalSize.height),
            offset: new Vec2(0, 0),
            isRotate: false,
        })

        return createSpriteNode({
            name: 'SeedBankExtension',
            spriteFrame: frame,
            parent: this._seedBankNode,
            layer: this.node.layer,
            x: seedBankFrame.originalSize.width - SEED_BANK_EXTENSION_OVERLAP,
            y: 0,
        })
    }

    private _getSeedPacketPositionX(index: number) {
        const packetCount = this._session.seedPackets.length
        if (packetCount <= 7) return index * 59 + 85
        if (packetCount === 8) return index * 54 + 81
        if (packetCount === 9) return index * 52 + 80
        return index * 51 + 79
    }

    private _getSeedBankExtraWidth() {
        const packetCount = this._session.seedPackets.length
        if (packetCount <= 6) return 0
        if (packetCount === 7) return 60
        if (packetCount === 8) return 76
        if (packetCount === 9) return 112
        return 153
    }

    private _getShovelButtonX() {
        return this._getSeedBankExtraWidth() + SHOVEL_BUTTON_BASE_X
    }

    private _getNodeBoardPixelRect(node: Node, width: number, height: number) {
        const parent = node.parent
        const parentPos = parent?.position ?? Vec3.ZERO
        const nodePos = node.position
        return {
            x: parentPos.x + nodePos.x,
            y: -(parentPos.y + nodePos.y),
            width,
            height,
        }
    }

    private _entityZ(entity: GameEntity) {
        if (entity.kind === 'item') return ITEM_Z
        return this._session.geometry.rowZ(entity.row)
    }

    private _removeEntityNode(entityId: number) {
        const node = this._entityNodes.get(entityId)
        if (node?.isValid) node.destroy()
        this._entityNodes.delete(entityId)
        this._plantViews.delete(entityId)
        this._zombieViews.delete(entityId)
        this._lawnMowerViews.delete(entityId)
        this._moneyItemViews.delete(entityId)
        this._previousEntitySnapshots.delete(entityId)
    }

    private _eventToBoardPixel(event: EventMouse | EventTouch) {
        const ui = event.getUILocation()
        const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0))
        return {
            x: local.x + 400,
            y: 300 - local.y,
        }
    }

    private _createLabel(
        name: string,
        x: number,
        y: number,
        text: string,
        size: number,
        color: Color,
        parent: Node = this._uiLayer,
        width = 500,
    ) {
        const node = createUINode(name, {
            parent,
            anchorX: 0.5,
            anchorY: 0.5,
            width,
            height: size + 8,
            x,
            y,
        })
        const label = node.addComponent(Label)
        label.string = text
        label.fontSize = size
        label.lineHeight = size + 4
        label.color = color
        label.horizontalAlign = Label.HorizontalAlign.CENTER
        label.verticalAlign = Label.VerticalAlign.CENTER
        return label
    }

    private _createBitmapText(args: {
        name: string
        text: string
        baselineX: number
        baselineY: number
        font: BitmapFontAssets | null
        color: Color
        parent: Node
        align?: 'left' | 'center' | 'right'
        maxWidth?: number
        textAlign?: number
    }) {
        const node = createUINode(args.name, {
            parent: args.parent,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (args.font) renderer.setFontAssets(args.font)
        renderer.fontColor = args.color
        renderer.string = args.text
        if (args.maxWidth != null) renderer.maxWidth = args.maxWidth
        if (args.textAlign != null) renderer.textAlign = args.textAlign
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text) || renderer.contentWidth
        let x = args.baselineX
        if (args.align === 'center') x -= width / 2
        if (args.align === 'right') x -= width
        node.setPosition(x, -(args.baselineY - metrics.ascent), 0)
        return renderer
    }

    private _syncSunAmount() {
        const text = `${this._session.sun}`
        const color = this._sunAmountColor()
        if (this._sunLabel.string !== text) {
            this._sunLabel.string = text
            this._sunLabel.forceRebuild()
        }
        if (!this._sunLabel.fontColor.equals(color)) {
            this._sunLabel.fontColor = color
            this._sunLabel.forceRebuild()
        }

        const metrics = FontMetricsUtil.getMetrics(this._sunFont?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(this._sunFont?.config ?? null, text) || this._sunLabel.contentWidth
        this._sunLabel.node.setPosition(
            SUN_AMOUNT_BASELINE_X - width / 2,
            -(SUN_AMOUNT_BASELINE_Y - metrics.ascent),
            0,
        )
    }

    private _sunAmountColor() {
        if (this._sunFlashTicks > 0 && this._sunFlashTicks % SUN_FLASH_PERIOD_TICKS < SUN_FLASH_PERIOD_TICKS / 2) {
            return new Color(255, 0, 0, 255)
        }
        return Color.BLACK
    }

    private _easeInOut(startTick: number, endTick: number, tick: number, start: number, end: number) {
        const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
        const eased = this._todCurveS(this._todCurveS(t))
        return Math.round(start + (end - start) * eased)
    }

    private _linear(startTick: number, endTick: number, tick: number, start: number, end: number) {
        return Math.round(this._linearFloat(startTick, endTick, tick, start, end))
    }

    private _linearFloat(startTick: number, endTick: number, tick: number, start: number, end: number) {
        const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
        return start + (end - start) * t
    }

    private _lerp(start: number, end: number, t: number) {
        return start + (end - start) * t
    }

    private _todCurveS(t: number) {
        return 3 * t * t - 2 * t * t * t
    }

    private _setSeedBankContentsVisible(visible: boolean) {
        if (!this._seedBankNode) return
        for (const child of this._seedBankNode.children) {
            child.active = visible
        }
    }

    private _addSpriteIfLoaded(parent: Node, spriteName: string, x: number, y: number, scale: number) {
        const spriteFrame: SpriteFrame | undefined = SpriteLoader.get(spriteName)
        if (!spriteFrame) return null
        const node = createSpriteNode({ spriteFrame, parent, x, y })
        node.setScale(scale, scale, 1)
        return node
    }
}
