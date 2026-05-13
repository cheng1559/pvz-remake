import {
    _decorator,
    Camera,
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
import { AdviceWidget } from '@/ui/AdviceWidget'
import { UIHoverManager, type UIHoverPointer } from '@/ui/UIHoverManager'
import { getAtlasFrame, SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH, SeedPacketRenderer } from '@/ui/SeedPacketRenderer'
import { createStoneButton } from '@/ui/StoneButton'
import { createTooltipNode } from '@/ui/Tooltip/Tooltip'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { StartupResourceLoader } from '@/ui/StartupResourceLoader'
import {
    ADVENTURE_1_1,
    GAME_TICK_SECONDS,
    PLANT_DEFINITIONS,
    SEED_DEFINITIONS,
    ZOMBIE_DEFINITIONS,
    scaleGameDeltaTime,
} from './GameDefinitions'
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
    LevelDefinition,
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
const BOARD_ROOT_X = -400
const BOARD_ROOT_Y = 300
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
const INTRO_LAWN_MOWER_NO_SOD_START = 620
const INTRO_LAWN_MOWER_NO_SOD_END = 645
const INTRO_LAWN_MOWER_ROW_START_STEP = 5
const INTRO_LAWN_MOWER_START_X = -80
const INTRO_LAWN_MOWER_END_X = -21
const INTRO_LAWN_MOWER_REANIM_X_OFFSET = 6
const INTRO_LAWN_MOWER_REANIM_Y_OFFSET = 19
const INTRO_LAWN_MOWER_SHADOW_X_OFFSET = -7
const INTRO_LAWN_MOWER_SHADOW_Y_OFFSET = 47
const INTRO_LAWN_MOWER_SCALE = 0.85
const LAWN_MOWER_Y_OFFSET = 23
const INTRO_SEED_BANK_ON_START = 800
const INTRO_SEED_BANK_ON_END = 825
const INTRO_SEED_BANK_NO_SOD_ON_START = 600
const INTRO_SEED_BANK_NO_SOD_ON_END = 625
const INTRO_SEED_BANK_X = 10
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
const PROGRESS_METER_FLAG_RAISE_TIME = 100
const PROGRESS_METER_FLAG_RAISE_HEIGHT = 14
const LEVEL_LABEL_BASELINE_Y = 595
const LEVEL_LABEL_RIGHT_X = 780
const LEVEL_LABEL_WITH_PROGRESS_RIGHT_X = 593
const INTRO_HOUSE_NAME_Y = 550
const INTRO_HOUSE_NAME_DURATION = 250
const DEFAULT_PLAYER_NAME = 'Player'
const INTRO_STREET_ZOMBIE_GRID_SIZE = 5
const INTRO_STREET_ZOMBIE_PREVIEW_CAPACITY = 10
const INTRO_STREET_ZOMBIE_BASE_X = 830
const INTRO_STREET_ZOMBIE_GRID_X_STEP = 56
const INTRO_STREET_ZOMBIE_BASE_Y = 70
const INTRO_STREET_ZOMBIE_GRID_Y_STEP = 90
const INTRO_STREET_ZOMBIE_ODD_COLUMN_Y_OFFSET = 30
const INTRO_STREET_ZOMBIE_RANDOM_OFFSET = 15
const INTRO_STREET_ZOMBIE_WAVE = -2
const INTRO_STREET_ZOMBIE_Z_BASE = 100
const INTRO_STREET_ZOMBIE_ROW_Z_STEP = 4
const INTRO_STREET_ZOMBIE_ODD_COLUMN_Z_OFFSET = 2
const INTRO_END = 855
const INTRO_NO_SOD_READY_SET_PLANT_END = 838
const SOD_ROW_X = 239 - BOARD_OFFSET
const SOD_ROW_Y = 265
const SOD_THREE_ROW_X = 235 - BOARD_OFFSET
const SOD_THREE_ROW_Y = 149
const SUN_AMOUNT_BASELINE_X = 34
const SUN_AMOUNT_BASELINE_Y = 78
const SUN_FLASH_TICKS = 70
const SUN_FLASH_PERIOD_TICKS = 20
const BOARD_SHAKE_TICKS = 12
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
const MOBILE_GRID_GUIDE_OPACITY = 72
const MOBILE_ITEM_SWIPE_SAMPLE_STEP = 24
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
const HUGE_WAVE_TEXT = 'A HUGE WAVE OF ZOMBIES IS APPROACHING!'
const HUGE_WAVE_TEXT_Y = 330
const HUGE_WAVE_TEXT_HEIGHT = 55
const HUGE_WAVE_TEXT_DURATION = 750
const HUGE_WAVE_TEXT_ENTER_TICKS = 20
const HUGE_WAVE_TEXT_LEAVE_TICKS = 40
const TUTORIAL_FLASH_TIME = 75
const READY_SET_PLANT_ANIMATION_PATH = 'animations/startreadysetplant'
const READY_SET_PLANT_INTRO_TICKS = 183
const READY_SET_PLANT_REANIM_X = 400
const READY_SET_PLANT_REANIM_Y = 324
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
const LEVEL_COMPLETE_FADE_TICKS = 600
const LEVEL_COMPLETE_LIGHT_FILL_TICK = 300
const LEVEL_COMPLETE_FADE_START_TICKS = 400
const LEVEL_COMPLETE_FADE_DURATION_TICKS = 200
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
    'seedpacket_larger',
    'particles/seedpacketflash',
    'packet_plants',
    'packet_plants_cached',
    'plant_previews_cached',
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
    'sod3row',
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
    charredAnimNode: AnimNode | null
    showingMowered: boolean
    showingCharred: boolean
}

interface LawnMowerView {
    node: Node
    cachedNode: Node | null
    animatorNode: Node | null
    animNode: AnimNode | null
    state: LawnMowerEntity['state'] | null
}

interface IntroLawnMowerView {
    row: number
    node: Node
    shadowNode: Node
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

interface IntroStreetZombieSpec {
    type: ZombieType
    gridX: number
    gridY: number
}

interface SodRollView {
    node: Node
    animNode: AnimNode
}

interface ProgressFlagView {
    totalWavesAtFlag: number
    poleNode: Node
    flagNode: Node
}

interface BoardPixelRect {
    x: number
    y: number
    width: number
    height: number
}

@ccclass('AdventureGameScreen')
export class AdventureGameScreen extends Component {
    public onBackToMenu: (() => void) | null = null
    public onMenuRequest: (() => void) | null = null
    public onPauseRequest: (() => void) | null = null
    public onGameOverRequest: (() => void) | null = null
    public onAwardScreenRequest: ((seedType: SeedType) => void) | null = null
    public levelDefinition: LevelDefinition = ADVENTURE_1_1

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
    private _sodBaseNode: Node | null = null
    private _sodClipNode: Node | null = null
    private _sodClipSpriteName = 'sod1row'
    private _tutorialLawnFlashNode: Node | null = null
    private _sodRollViews: SodRollView[] = []
    private _introLawnMowerViews: IntroLawnMowerView[] = []
    private _introStreetZombieNodes: Node[] = []
    private _seedBankHeight = 87
    private _cursorPreview: Node | null = null
    private _gridPreview: Node | null = null
    private _mobileGridGuide: Node | null = null
    private _mobileGridGuideGraphics: Graphics | null = null
    private _mobileGridGuideCol = -1
    private _mobileGridGuideRow = -1
    private _previewSeedType: SeedType | null = null
    private _shovelCursor: Node | null = null
    private _sunLabel: FontRenderer = null!
    private _sunFlashTicks = 0
    private _boardShakeTicks = 0
    private _boardShakeAmountX = 0
    private _boardShakeAmountY = 0
    private _adviceFont: BitmapFontAssets | null = null
    private _adviceWidget: AdviceWidget | null = null
    private _houseNameNode: Node | null = null
    private _houseNameLabel: FontRenderer | null = null
    private _houseNameTicks = 0
    private _hugeWaveTextNode: Node | null = null
    private _hugeWaveTextLabel: FontRenderer | null = null
    private _hugeWaveTextTicks = 0
    private _resultLabel: Label = null!
    private _entityNodes: Map<number, Node> = new Map()
    private _plantViews: Map<number, PlantView> = new Map()
    private _zombieViews: Map<number, ZombieView> = new Map()
    private _lawnMowerViews: Map<number, LawnMowerView> = new Map()
    private _moneyItemViews: Map<number, MoneyItemView> = new Map()
    private _previousEntitySnapshots: Map<number, RenderEntitySnapshot> = new Map()
    private _seedPacketNodes: Map<SeedType, Node> = new Map()
    private _seedPacketCooldownClips: Map<SeedType, Node> = new Map()
    private _seedPacketSelectedHighlights: Map<SeedType, Node> = new Map()
    private _seedTooltipNode: Node | null = null
    private _seedTooltipKey = ''
    private _shovelTooltipNode: Node | null = null
    private _mousePixel = { x: -1, y: -1 }
    private _hasCursorPointer = false
    private readonly _boardHoverClient = {
        clearHover: () => this._clearBoardHoverState(),
        refreshHover: (pointer: UIHoverPointer | null, activeModalRoot: Node | null) =>
            this._refreshBoardHoverFromPointer(pointer, activeModalRoot),
    }
    private _plantAnimations: Map<PlantType, JsonAsset> = new Map()
    private _zombieAnimations: Map<ZombieType, JsonAsset> = new Map()
    private _flagZombieAnimation: JsonAsset | null = null
    private _moweredZombieAnimation: JsonAsset | null = null
    private _charredZombieAnimation: JsonAsset | null = null
    private _sunAnimation: JsonAsset | null = null
    private _sodRollAnimation: JsonAsset | null = null
    private _lawnMowerAnimation: JsonAsset | null = null
    private _finalWaveAnimation: JsonAsset | null = null
    private _finalWaveNode: Node | null = null
    private _finalWaveAnimNode: AnimNode | null = null
    private _readySetPlantAnimation: JsonAsset | null = null
    private _readySetPlantNode: Node | null = null
    private _readySetPlantAnimNode: AnimNode | null = null
    private _houseDoorBottomNode: Node | null = null
    private _houseDoorTopNode: Node | null = null
    private _gameOverOverlayNode: Node | null = null
    private _gameOverBlackNode: Node | null = null
    private _gameOverTitleNode: Node | null = null
    private _gameOverTicks = 0
    private _gameOverActive = false
    private _gameOverDialogRequested = false
    private _gameOverWinnerZombieId: number | null = null
    private _levelCompleteOverlayNode: Node | null = null
    private _levelCompleteFadeNode: Node | null = null
    private _levelCompleteTicks = 0
    private _levelCompleteActive = false
    private _levelCompleteLightFillPlayed = false
    private _levelAwardScreenShown = false
    private _levelAwardSeedType: SeedType | null = null
    private _sunFont: BitmapFontAssets | null = null
    private _packetCostFont: BitmapFontAssets | null = null
    private _levelFont: BitmapFontAssets | null = null
    private _buttonSprites: MessageBoxButtonSprites | null = null
    private _buttonFonts: MessageBoxButtonFonts | null = null
    private _progressMeterNode: Node | null = null
    private _progressMeterFillClip: Node | null = null
    private _progressMeterFillNode: Node | null = null
    private _progressMeterHeadNode: Node | null = null
    private _progressFlagViews: ProgressFlagView[] = []
    private _levelLabel: FontRenderer | null = null
    private _introTime = 0
    private _introReadySetPlantShown = false
    private _gameAccumulator = 0
    private _lastRightMouseDownAt = 0
    private _lastRightMouseDownX = Number.NaN
    private _lastRightMouseDownY = Number.NaN
    private _mobilePlantPressActive = false
    private _mobilePlantPressCancelOnReleaseInside = false
    private _mobilePlantPressLeftSeedPacket = false
    private _mobilePlantPressSeedPacketRect: BoardPixelRect | null = null
    private _lastTouchPixel: { x: number, y: number } | null = null
    private _refreshHoverAfterCursorRelease = true
    private _plantCursorHoverBlocked = false
    private _gameStarted = false
    private _bootstrapped = false

    onLoad() {
        this._session = new GameSession(this.levelDefinition)
        setUISize(this.node, 800, 600)
        this._boardRoot = createUINode('BoardRoot', {
            parent: this.node,
            width: 800,
            height: 600,
            anchorX: 0,
            anchorY: 1,
            x: BOARD_ROOT_X,
            y: BOARD_ROOT_Y,
        })
        this._boardRoot.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
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
        UIHoverManager.unregisterClient(this._boardHoverClient)
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
            StartupResourceLoader.loadJson('animations/zombie_charred'),
            StartupResourceLoader.loadJson(PAUSE_DIALOG_ZOMBIE_ANIMATION_PATH),
            StartupResourceLoader.loadJson('animations/sun'),
            StartupResourceLoader.loadJson('animations/sodroll'),
            StartupResourceLoader.loadJson('animations/lawnmower'),
            StartupResourceLoader.loadJson(FINAL_WAVE_ANIMATION_PATH),
            StartupResourceLoader.loadJson(READY_SET_PLANT_ANIMATION_PATH),
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
        this._charredZombieAnimation = results[afterZombies + 2] as JsonAsset | null
        const pauseDialogZombieAnimation = results[afterZombies + 3] as JsonAsset | null
        this._sunAnimation = results[afterZombies + 4] as JsonAsset | null
        this._sodRollAnimation = results[afterZombies + 5] as JsonAsset | null
        this._lawnMowerAnimation = results[afterZombies + 6] as JsonAsset | null
        this._finalWaveAnimation = results[afterZombies + 7] as JsonAsset | null
        this._readySetPlantAnimation = results[afterZombies + 8] as JsonAsset | null
        this._sunFont = results[afterZombies + 9] as BitmapFontAssets | null
        this._packetCostFont = results[afterZombies + 10] as BitmapFontAssets | null
        this._adviceFont = results[afterZombies + 11] as BitmapFontAssets | null
        this._levelFont = results[afterZombies + 12] as BitmapFontAssets | null
        this._buttonSprites = results[afterZombies + 13] as MessageBoxButtonSprites | null
        this._buttonFonts = results[afterZombies + 14] as MessageBoxButtonFonts | null
        await Promise.all([
            this._preloadPlantAnimationTextures(),
            this._preloadZombieAnimationTextures(pauseDialogZombieAnimation),
            this._preloadSunAnimationTextures(),
            this._preloadFinalWaveAnimationTextures(),
            this._preloadReadySetPlantAnimationTextures(),
        ])

        await this._drawStaticBoard()
        this._drawHud()
        this._showIntroHouseName()
        this._wireInput()
        UIHoverManager.registerClient(this._boardHoverClient)
        this._bootstrapped = true
        this._renderFrame()
    }

    update(dt: number) {
        if (!this._bootstrapped) return

        const scaledDt = scaleGameDeltaTime(dt)
        let gameTicks = 0
        if (this._gameStarted) {
            if (!this._session.paused) {
                this._gameAccumulator += scaledDt
                while (this._gameAccumulator >= GAME_TICK_SECONDS) {
                    this._capturePreviousEntitySnapshots()
                    this._session.update()
                    this._gameAccumulator -= GAME_TICK_SECONDS
                    gameTicks++
                }
            }
        } else if (!this._session.paused) {
            this._updateIntro(scaledDt)
            this._updateAdviceWidget(scaledDt * 100)
        }
        if (this._gameOverActive && !this._session.paused) {
            this._updateGameOver(scaledDt / GAME_TICK_SECONDS)
        }
        if (this._levelCompleteActive && !this._session.paused) {
            this._updateLevelCompleteEffect(scaledDt / GAME_TICK_SECONDS)
        }
        if (gameTicks > 0) {
            this._updateAdviceWidget(gameTicks)
            this._updateTimedUiEffects(gameTicks)
        }
        if (this._gameOverActive) this._syncGameOverScene()
        if (this._levelCompleteActive) this._syncLevelCompleteEffect()
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

    public debugRemovePlant(row: number, col: number) {
        if (!this.isLevelRunning()) return false

        const removed = this._session.debugRemovePlant(row, col)
        if (removed) this._renderFrame()
        return removed
    }

    public debugCompleteLevel() {
        if (!this.isLevelRunning()) return false

        const completed = this._session.debugCompleteLevel()
        if (completed) this._renderFrame()
        return completed
    }

    public debugLoseLevel() {
        if (!this.isLevelRunning()) return false

        const lost = this._session.debugLoseLevel()
        if (lost) this._renderFrame()
        return lost
    }

    public debugSpawnNextWave() {
        if (!this.isLevelRunning()) return false

        const spawned = this._session.debugSpawnNextWave()
        if (spawned) this._renderFrame()
        return spawned
    }

    public debugSpawnNextFlagWave() {
        if (!this.isLevelRunning()) return false

        const spawned = this._session.debugSpawnNextFlagWave()
        if (spawned) this._renderFrame()
        return spawned
    }

    public debugDamageAllZombies(damage: number) {
        if (!this.isLevelRunning()) return null

        const damaged = this._session.debugDamageAllZombies(damage)
        if (damaged > 0) this._renderFrame()
        return damaged
    }

    public debugKillAllZombies() {
        if (!this.isLevelRunning()) return null

        const killed = this._session.debugKillAllZombies()
        if (killed > 0) this._renderFrame()
        return killed
    }

    public debugSummonZombie(type: ZombieType, row?: number, col?: number) {
        if (!this.isLevelRunning()) return false

        if (row == null) {
            this._session.debugAddZombieAutoRow(type)
            this._renderFrame()
            return true
        }

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

    public debugSetAutoCollectEnabled(enabled: boolean) {
        if (!this.isLevelRunning()) return null

        const autoCollectEnabled = this._session.debugSetAutoCollectEnabled(enabled)
        this._renderFrame()
        return autoCollectEnabled
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
            this._sodClipSpriteName = sodLayout.clipSprite
            this._sodClipNode = createUINode('SodClip', {
                parent: this._boardContent,
                anchorX: 0,
                anchorY: 1,
                width: sodLayout.clipVisible ? 0 : sod.originalSize.width,
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

        if (SpriteLoader.get('lawnmower_cached') && SpriteLoader.get('plantshadow')) {
            this._createIntroLawnMower()
        }

        this._createIntroStreetZombies()
        this._createGameOverDoorLayers()
        this._entityLayer.setSiblingIndex(this._boardContent.children.length - 1)
    }

    private _introSodLayout() {
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
        }
    }

    private _introSodRollSpecs() {
        if (this._session.level.adventureLevel === 2) {
            return [
                { x: 0, y: -102 },
                { x: 0, y: 111 },
            ]
        }

        return [{ x: 0, y: 0 }]
    }

    private _shouldPlayIntroSodRoll() {
        return this._session.level.adventureLevel <= 2
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

    private _createIntroStreetZombies() {
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

    private _introStreetZombieSpecs(): IntroStreetZombieSpec[] {
        const zombieTypeCount = new Map<ZombieType, number>()
        let totalZombieCount = 0

        for (const wave of this._session.level.zombieWaves) {
            for (const zombieType of wave.zombies) {
                if (zombieType === 'flag') continue

                zombieTypeCount.set(zombieType, (zombieTypeCount.get(zombieType) ?? 0) + 1)
                totalZombieCount++
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

            const previewCount = Math.max(
                1,
                Math.min(count, Math.floor(count * INTRO_STREET_ZOMBIE_PREVIEW_CAPACITY / totalZombieCount)),
            )
            for (let i = 0; i < previewCount; i++) {
                const spot = this._pickIntroStreetZombieSpot(occupied)
                occupied[spot.gridX][spot.gridY] = true
                specs.push({ type: zombieType, gridX: spot.gridX, gridY: spot.gridY })
            }
        }
        return specs
    }

    private _pickIntroStreetZombieSpot(occupied: boolean[][]) {
        const candidates: Array<{ gridX: number, gridY: number }> = []
        for (let gridX = 0; gridX < INTRO_STREET_ZOMBIE_GRID_SIZE; gridX++) {
            for (let gridY = 0; gridY < INTRO_STREET_ZOMBIE_GRID_SIZE; gridY++) {
                if (!this._canIntroZombieGoInGridSpot(gridX, gridY, occupied)) continue
                if (!occupied[gridX][gridY]) candidates.push({ gridX, gridY })
            }
        }
        if (candidates.length === 0) return { gridX: 2, gridY: 2 }

        return candidates[Math.floor(Math.random() * candidates.length)]
    }

    private _canIntroZombieGoInGridSpot(gridX: number, gridY: number, occupied: boolean[][]) {
        if (occupied[gridX][gridY]) return false
        return gridX !== INTRO_STREET_ZOMBIE_GRID_SIZE - 1 || gridY !== 0
    }

    private _createIntroZombieEntity(spec: IntroStreetZombieSpec, index: number): ZombieEntity {
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
            inPool: definition.hasFloat,
            dead: false,
            bodyRect: { ...definition.bodyRect },
            attackRect: { ...definition.attackRect },
        }
    }

    private _introStreetZombieZ(spec: IntroStreetZombieSpec) {
        return INTRO_STREET_ZOMBIE_Z_BASE +
            spec.gridY * INTRO_STREET_ZOMBIE_ROW_Z_STEP +
            (spec.gridX % 2) * INTRO_STREET_ZOMBIE_ODD_COLUMN_Z_OFFSET
    }

    private _pickIntroZombieAnimation() {
        return Math.floor(Math.random() * 4) > 0 ? 'anim_idle2' : 'anim_idle'
    }

    private _pickIntroZombieAnimationSpeed() {
        return (12 + Math.random() * 12) / 12
    }

    private _syncIntroStreetZombieLayerOrder() {
        const sorted = [...this._introStreetZombieNodes].sort((a, b) => a.position.z - b.position.z)
        for (const node of sorted) {
            if (node.isValid) node.setSiblingIndex(this._entityLayer.children.length - 1)
        }
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

    private _createProgressMeterFlags(parts: SpriteFrame) {
        const wavesPerFlag = this._progressMeterWavesPerFlag()
        const flagCount = this._progressMeterFlagCount(wavesPerFlag)
        const flagsPosEnd = 590 + PROGRESS_METER_WIDTH
        for (let flagWave = 1; flagWave <= flagCount; flagWave++) {
            const totalWavesAtFlag = flagWave * wavesPerFlag
            const flagX = this._linearFloat(0, this._session.numWaves, totalWavesAtFlag, flagsPosEnd, 606)
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
        const adviceNode = this._adviceWidget?.node
        if (!this._itemLayer?.isValid || !adviceNode?.isValid) return
        if (this._itemLayer.parent !== this._uiLayer || adviceNode.parent !== this._uiLayer) return

        const itemIndex = this._itemLayer.getSiblingIndex()
        const adviceIndex = adviceNode.getSiblingIndex()
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
            this._seedPacketSelectedHighlights.set(packet.seedType, this._createSeedPacketSelectedHighlight(packetNode))
            this._seedPacketCooldownClips.set(packet.seedType, this._createSeedPacketCooldownClip(packetNode, packet))
            this._wireSeedPacketInput(packetNode, packet.seedType)
        }
    }

    private _createSeedPacketSelectedHighlight(packetNode: Node) {
        const highlight = createUINode('SelectedHighlight', {
            parent: packetNode,
            layer: this.node.layer,
            active: false,
            anchorX: 0,
            anchorY: 1,
            width: SEED_PACKET_WIDTH,
            height: SEED_PACKET_HEIGHT,
            x: 0,
            y: 0,
            z: 15,
        })
        const flash = SpriteLoader.get('particles/seedpacketflash')
        if (flash) {
            createSpriteNode({
                name: 'SeedPacketFlash',
                spriteFrame: flash,
                parent: highlight,
                layer: this.node.layer,
                x: 0,
                y: 0,
                anchorX: 0,
                anchorY: 1,
            })
        }
        return highlight
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
        clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT
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
            if (!this._canUseBoardInput()) return false
            if (this._session.selectedSeed) return false

            event.propagationStopped = true
            const pixel = this._eventToBoardPixel(event)
            this._mousePixel = pixel
            this._hasCursorPointer = true
            this._session.dispatch({ type: 'selectSeed', seedType })
            if (sys.isMobile) this._beginMobilePlantPress(pixel, this._findSeedPacketAt(pixel)?.rect ?? null)
            this._renderFrame()
            return true
        }
        packetNode.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            if (sys.isMobile) return
            if (event.getButton() !== 0) return
            onPress(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!sys.isMobile) return
            if (this._session.selectedSeed) {
                event.propagationStopped = true
                const pixel = this._eventToBoardPixel(event)
                this._mousePixel = pixel
                this._hasCursorPointer = true
                if (this._session.selectedSeed === seedType) {
                    this._beginMobilePlantPress(pixel, this._findSeedPacketAt(pixel)?.rect ?? null, true)
                } else {
                    this._resetMobilePlantPress()
                    this._updateCursorPreview()
                }
                return
            }
            onPress(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!sys.isMobile) return
            event.propagationStopped = true
            this._onMobileTouchMove(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!sys.isMobile) return
            event.propagationStopped = true
            this._onMobileTouchEnd(event)
        }, this)
        packetNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            if (!sys.isMobile) return
            event.propagationStopped = true
            this._onMobileTouchEnd(event)
        }, this)
    }

    private _wireInput() {
        input.on(Input.EventType.MOUSE_DOWN, this._onGlobalMouseDown, this)
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this.node.on(Node.EventType.MOUSE_MOVE, (event: EventMouse) => {
            if (sys.isMobile) return
            UIHoverManager.rememberMouseEvent(event)
        })
        this.node.on(Node.EventType.MOUSE_LEAVE, () => {
            if (sys.isMobile) return
            if (UIHoverManager.isModalBlocked) {
                this._clearBoardHoverState()
                return
            }
            UIHoverManager.clearPointer()
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
            this._hasCursorPointer = true
            this._handlePointerDown(pixel)
        })
        this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!sys.isMobile) return
            this._onMobileTouchMove(event)
        })
        this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!sys.isMobile) return
            UIHoverManager.rememberTouchEvent(event, false)
            const pixel = this._eventToBoardPixel(event)
            this._mousePixel = pixel
            this._hasCursorPointer = true
            this._lastTouchPixel = pixel
            if (this._session.selectedSeed) {
                this._beginMobilePlantPress(pixel, this._findSeedPacketAt(pixel)?.rect ?? null)
                this._updateCursorPreview()
                return
            }
            this._handlePointerDown(pixel)
        })
        this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!sys.isMobile) return
            this._onMobileTouchEnd(event)
        })
        this.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            if (!sys.isMobile) return
            this._onMobileTouchCancel(event)
        })
    }

    private _beginMobilePlantPress(
        pixel: { x: number, y: number },
        seedPacketRect: BoardPixelRect | null,
        cancelOnReleaseInside = false,
    ) {
        this._mobilePlantPressActive = true
        this._mobilePlantPressSeedPacketRect = seedPacketRect
        this._mobilePlantPressCancelOnReleaseInside = cancelOnReleaseInside
        this._mobilePlantPressLeftSeedPacket = this._isMobilePlantPressReady(pixel)
        this._lastTouchPixel = pixel
    }

    private _onMobileTouchMove(event: EventTouch) {
        UIHoverManager.rememberTouchEvent(event, false)
        const pixel = this._eventToBoardPixel(event)
        const previous = this._lastTouchPixel
        this._mousePixel = pixel
        this._hasCursorPointer = true
        this._lastTouchPixel = pixel

        if (this._isMobilePlantPressReady(pixel)) {
            this._mobilePlantPressLeftSeedPacket = true
        }
        const collected = previous
            ? this._collectItemsAlongMobileSwipe(previous, pixel)
            : this._session.collectCurrencyItemAt(pixel.x, pixel.y)
        this._updateCursorPreview()
        if (collected) this._renderFrame()
    }

    private _onMobileTouchEnd(event: EventTouch) {
        UIHoverManager.rememberTouchEvent(event, false)
        const previous = this._lastTouchPixel
        const eventPixel = this._eventToBoardPixel(event)
        const pixel = previous ?? eventPixel
        this._mousePixel = pixel
        this._hasCursorPointer = true
        this._lastTouchPixel = null

        const collected = previous
            ? this._collectItemsAlongMobileSwipe(previous, pixel)
            : this._session.collectCurrencyItemAt(pixel.x, pixel.y)
        const pressReady = this._isMobilePlantPressReady(pixel)
        const shouldResolvePlantTouch = this._mobilePlantPressActive &&
            pressReady &&
            !!this._session.selectedSeed
        const shouldCancelPlantTouch = this._mobilePlantPressActive &&
            (this._mobilePlantPressCancelOnReleaseInside || this._mobilePlantPressLeftSeedPacket) &&
            !pressReady &&
            !!this._session.selectedSeed
        this._resetMobilePlantPress()

        if (shouldCancelPlantTouch) {
            this._session.dispatch({ type: 'clearCursor' })
            this._renderFrame()
            return
        }

        if (shouldResolvePlantTouch) {
            this._refreshHoverAfterCursorRelease = false
            this._session.dispatch({ type: 'placePlant', x: pixel.x, y: pixel.y })
            if (this._session.selectedSeed) {
                this._session.dispatch({ type: 'clearCursor' })
            }
            this._renderFrame()
            return
        }

        this._updateCursorPreview()
        if (collected) this._renderFrame()
    }

    private _onMobileTouchCancel(event: EventTouch) {
        if (this._mobilePlantPressActive && this._session.selectedSeed) {
            this._onMobileTouchEnd(event)
            return
        }

        UIHoverManager.rememberTouchEvent(event, false)
        this._resetMobilePlantPress()
        this._updateCursorPreview()
    }

    private _collectItemsAlongMobileSwipe(from: { x: number, y: number }, to: { x: number, y: number }) {
        if (!this._canUseBoardInput()) return false

        const dx = to.x - from.x
        const dy = to.y - from.y
        const distance = Math.hypot(dx, dy)
        const steps = Math.max(1, Math.ceil(distance / MOBILE_ITEM_SWIPE_SAMPLE_STEP))
        let collected = false
        for (let i = 0; i <= steps; i++) {
            const t = i / steps
            if (this._session.collectCurrencyItemAt(from.x + dx * t, from.y + dy * t)) collected = true
        }
        return collected
    }

    private _resetMobilePlantPress() {
        this._mobilePlantPressActive = false
        this._mobilePlantPressCancelOnReleaseInside = false
        this._mobilePlantPressLeftSeedPacket = false
        this._mobilePlantPressSeedPacketRect = null
        this._lastTouchPixel = null
    }

    private _isMobilePlantPressReady(pixel = this._mousePixel) {
        if (!this._mobilePlantPressActive) return false

        const rect = this._mobilePlantPressSeedPacketRect
        return !rect || !this._isPixelInRect(pixel, rect)
    }

    private _isPixelInRect(
        pixel: { x: number, y: number },
        rect: BoardPixelRect,
    ) {
        return pixel.x >= rect.x &&
            pixel.x <= rect.x + rect.width &&
            pixel.y >= rect.y &&
            pixel.y <= rect.y + rect.height
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
        this._hasCursorPointer = true

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
        return this._gameStarted && this._session.result === 'playing' && !this._session.paused && !this._levelCompleteActive
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
        if (this._gameStarted && !this._gameOverActive) this._syncBoardPosition()
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
        if (this._shouldPlayIntroSodRoll() && previousIntroTime < INTRO_ROLL_SOD_START && this._introTime >= INTRO_ROLL_SOD_START) {
            this._startSodRoll()
        }
        const introEnd = this._introEndTime()
        if (this._shouldPlayReadySetPlantIntro() &&
            !this._introReadySetPlantShown &&
            this._introTime >= introEnd - READY_SET_PLANT_INTRO_TICKS) {
            this._introReadySetPlantShown = true
            this._showReadySetPlant()
        }
        if (this._shouldPlayIntroSodRoll()) this._updateIntroSod()
        this._syncIntroLawnMower()
        this._syncIntroSeedBank()

        if (this._introTime < introEnd) return

        this._session.completeReadySetPlantIntro()
        this._gameStarted = true
        this._boardContent.setPosition(0, 0, 0)
        if (this._soddedNode) this._soddedNode.active = false
        if (this._unsoddedNode) this._unsoddedNode.active = true
        if (this._sodBaseNode) this._sodBaseNode.active = true
        if (this._sodClipNode) this._sodClipNode.active = true
        for (const view of this._sodRollViews) view.node.active = false
        for (const view of this._introLawnMowerViews) {
            view.node.active = false
            view.shadowNode.active = false
        }
        this._destroyIntroStreetZombies()
        if (this._seedBankNode) {
            this._seedBankNode.active = true
            this._seedBankNode.setPosition(INTRO_SEED_BANK_X, 0, 10)
        }
        if (this._menuButtonNode) this._menuButtonNode.active = true
        this._setSeedBankContentsVisible(true)
        this._restoreGameplayLayerOrder()
    }

    private _shouldPlayReadySetPlantIntro() {
        return (this._session.level.adventureLevel ?? 1) >= 3
    }

    private _introEndTime() {
        if (!this._shouldPlayIntroSodRoll() && this._shouldPlayReadySetPlantIntro()) {
            return INTRO_NO_SOD_READY_SET_PLANT_END
        }

        return INTRO_END
    }

    private _destroyIntroStreetZombies() {
        for (const node of this._introStreetZombieNodes) {
            if (node.isValid) node.destroy()
        }
        this._introStreetZombieNodes = []
    }

    private _syncIntroSeedBank() {
        if (!this._seedBankNode?.isValid) return

        const seedBankStart = this._introSeedBankOnStart()
        const seedBankEnd = this._introSeedBankOnEnd()
        if (this._introTime <= seedBankStart) {
            this._seedBankNode.active = false
            this._seedBankNode.setPosition(INTRO_SEED_BANK_X, this._seedBankHeight, 10)
            this._setSeedBankContentsVisible(false)
            return
        }

        this._seedBankNode.active = true
        this._setSeedBankContentsVisible(true)
        const y = this._introTime <= seedBankEnd
            ? this._easeInOut(seedBankStart, seedBankEnd, this._introTime, this._seedBankHeight, 0)
            : 0
        this._seedBankNode.setPosition(INTRO_SEED_BANK_X, y, 10)
    }

    private _introSeedBankOnStart() {
        return this._shouldPlayIntroSodRoll() ? INTRO_SEED_BANK_ON_START : INTRO_SEED_BANK_NO_SOD_ON_START
    }

    private _introSeedBankOnEnd() {
        return this._shouldPlayIntroSodRoll() ? INTRO_SEED_BANK_ON_END : INTRO_SEED_BANK_NO_SOD_ON_END
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
        if (this._sodRollViews.length === 0) return

        for (const view of this._sodRollViews) {
            view.node.active = true
            view.node.setSiblingIndex(this._boardContent.children.length - 1)
            view.animNode.play({
                name: 'default',
                loop: false,
                speed: 0,
                keepLastFrame: true,
            })
        }
        void SoundLoader.play(SoundEffect.DiggerZombie)
    }

    private _updateIntroSod() {
        if (!this._sodClipNode) return

        const transform = this._sodClipNode.getComponent(UITransform)
        const height = transform?.height ?? 127
        if (this._introTime < INTRO_ROLL_SOD_START) {
            setUISize(this._sodClipNode, 0, height, 0, 1)
            for (const view of this._sodRollViews) view.node.active = false
            return
        }

        const sodWidth = SpriteLoader.get(this._sodClipSpriteName)?.originalSize.width ?? 771
        const progress = this._linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime, 0, 1)
        const rollProgress = this._linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime + 1, 0, 1)
        setUISize(this._sodClipNode, sodWidth * progress, height, 0, 1)
        this._syncSodRollAnimation(rollProgress)
        for (const view of this._sodRollViews) {
            view.node.active = rollProgress < 1
            if (view.node.active) {
                view.node.setSiblingIndex(this._boardContent.children.length - 1)
            }
        }
    }

    private _syncIntroLawnMower(forcedX?: number) {
        const shadowOffset = this._getReadyLawnMowerShadowOffset()
        for (const view of this._introLawnMowerViews) {
            const start = this._introLawnMowerStartTime(view.row)
            const visible = forcedX != null || this._introTime > start
            view.node.active = visible
            view.shadowNode.active = visible
            if (!visible) continue

            const mowerX = forcedX ?? this._easeInOut(
                start,
                start + this._introLawnMowerDuration(),
                this._introTime,
                INTRO_LAWN_MOWER_START_X,
                INTRO_LAWN_MOWER_END_X,
            )
            const mowerY = this._introLawnMowerY(view.row)
            view.node.setPosition(
                mowerX + INTRO_LAWN_MOWER_REANIM_X_OFFSET,
                -(mowerY + INTRO_LAWN_MOWER_REANIM_Y_OFFSET),
                this._session.geometry.rowZ(view.row),
            )
            view.shadowNode.setPosition(
                mowerX + shadowOffset.x,
                -(mowerY + shadowOffset.y),
                this._session.geometry.rowZ(view.row) - 1,
            )
            view.shadowNode.setSiblingIndex(this._boardContent.children.length - 1)
            view.node.setSiblingIndex(this._boardContent.children.length - 1)
        }
    }

    private _introLawnMowerStartTime(row: number) {
        const baseStart = this._shouldPlayIntroSodRoll() ? INTRO_LAWN_MOWER_START : INTRO_LAWN_MOWER_NO_SOD_START
        return baseStart + (INTRO_LAWN_MOWER_ROW - row) * INTRO_LAWN_MOWER_ROW_START_STEP
    }

    private _introLawnMowerDuration() {
        if (!this._shouldPlayIntroSodRoll()) return INTRO_LAWN_MOWER_NO_SOD_END - INTRO_LAWN_MOWER_NO_SOD_START

        return INTRO_LAWN_MOWER_END - INTRO_LAWN_MOWER_START
    }

    private _introLawnMowerY(row: number) {
        return this._session.geometry.gridToPixel(0, row).y + LAWN_MOWER_Y_OFFSET
    }

    private _getReadyLawnMowerShadowOffset() {
        const shadow = SpriteLoader.get('plantshadow')
        return {
            x: INTRO_LAWN_MOWER_SHADOW_X_OFFSET + (shadow?.originalSize.width ?? 86) / 2,
            y: INTRO_LAWN_MOWER_SHADOW_Y_OFFSET + (shadow?.originalSize.height ?? 36) / 2,
        }
    }

    private _createAdviceWidget() {
        this._adviceWidget = new AdviceWidget({
            parent: this._uiLayer,
            layer: this.node.layer,
            font: this._adviceFont,
        })
    }

    private _showIntroHouseName() {
        this._showHouseName(`${DEFAULT_PLAYER_NAME}'s House`)
    }

    private _showAdvice(message: string, style: AdviceStyle) {
        this._adviceWidget?.show(message, style)
        this._syncItemLayerBehindAdvice()
    }

    private _clearAdvice() {
        this._adviceWidget?.clear()
    }

    private _updateAdviceWidget(ticks: number) {
        this._adviceWidget?.update(ticks, this._session.tick)
        this._updateHouseName(ticks)
        this._updateHugeWaveText(ticks)
    }

    private _showHouseName(message: string) {
        this._ensureHouseNameNode()
        if (!this._houseNameLabel) return

        this._houseNameTicks = INTRO_HOUSE_NAME_DURATION
        this._houseNameLabel.string = message
        this._houseNameLabel.forceRebuild()
        if (this._houseNameNode) this._houseNameNode.active = true
        this._syncHouseName()
    }

    private _ensureHouseNameNode() {
        if (this._houseNameNode?.isValid && this._houseNameLabel) return

        this._houseNameNode = createUINode('HouseNameText', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: this._session.geometry.width,
            height: this._session.geometry.height,
            x: this._session.geometry.width / 2,
            y: -this._session.geometry.height / 2,
        })
        this._houseNameNode.addComponent(UIOpacity).opacity = 255
        const labelNode = createUINode('HouseNameLabel', {
            parent: this._houseNameNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: this._session.geometry.width,
            height: this._session.geometry.height,
        })
        this._houseNameLabel = labelNode.addComponent(FontRenderer)
        if (this._adviceFont) this._houseNameLabel.setFontAssets(this._adviceFont)
        this._houseNameLabel.fontColor = Color.WHITE
        this._houseNameLabel.fontSize = 28
        this._houseNameLabel.lineSpacing = 0
        this._houseNameLabel.maxWidth = this._session.geometry.width
        this._houseNameLabel.textAlign = 2
        this._houseNameLabel.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(this._adviceFont?.config ?? null)
        labelNode.setPosition(
            -this._session.geometry.width / 2,
            this._session.geometry.height / 2 - (INTRO_HOUSE_NAME_Y - metrics.ascent),
            0,
        )
        this._houseNameNode.active = false
    }

    private _updateHouseName(ticks: number) {
        if (!this._houseNameNode?.active) return

        this._houseNameTicks = Math.max(0, this._houseNameTicks - ticks)
        if (this._houseNameTicks === 0) {
            this._houseNameNode.active = false
            return
        }
        this._syncHouseName()
    }

    private _syncHouseName() {
        const opacity = this._houseNameNode?.getComponent(UIOpacity)
        if (opacity) opacity.opacity = Math.max(0, Math.min(255, this._houseNameTicks * 15))
    }

    private _showHugeWaveText() {
        this._ensureHugeWaveTextNode()
        if (!this._hugeWaveTextLabel) return

        this._hugeWaveTextTicks = HUGE_WAVE_TEXT_DURATION
        this._hugeWaveTextLabel.string = HUGE_WAVE_TEXT
        this._hugeWaveTextLabel.forceRebuild()
        if (this._hugeWaveTextNode) this._hugeWaveTextNode.active = true
        this._syncHugeWaveText()
    }

    private _ensureHugeWaveTextNode() {
        if (this._hugeWaveTextNode?.isValid && this._hugeWaveTextLabel) return

        this._hugeWaveTextNode = createUINode('HugeWaveText', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: this._session.geometry.width,
            height: HUGE_WAVE_TEXT_HEIGHT,
            x: this._session.geometry.width / 2,
            y: -(HUGE_WAVE_TEXT_Y + HUGE_WAVE_TEXT_HEIGHT / 2),
        })
        this._hugeWaveTextNode.addComponent(UIOpacity).opacity = 255
        const labelNode = createUINode('HugeWaveTextLabel', {
            parent: this._hugeWaveTextNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: this._session.geometry.width - 40,
            height: HUGE_WAVE_TEXT_HEIGHT,
        })
        this._hugeWaveTextLabel = labelNode.addComponent(FontRenderer)
        if (this._adviceFont) this._hugeWaveTextLabel.setFontAssets(this._adviceFont)
        this._hugeWaveTextLabel.fontColor = new Color(255, 0, 0, 255)
        this._hugeWaveTextLabel.fontSize = 28
        this._hugeWaveTextLabel.lineSpacing = 0
        this._hugeWaveTextLabel.maxWidth = this._session.geometry.width - 40
        this._hugeWaveTextLabel.textAlign = 2
        this._hugeWaveTextLabel.forceRebuild()
        labelNode.setPosition(-this._session.geometry.width / 2 + 20, this._hugeWaveTextLocalTopY(), 0)
        this._hugeWaveTextNode.active = false
    }

    private _updateHugeWaveText(ticks: number) {
        if (!this._hugeWaveTextNode?.active) return

        this._hugeWaveTextTicks = Math.max(0, this._hugeWaveTextTicks - ticks)
        if (this._hugeWaveTextTicks === 0) {
            this._hugeWaveTextNode.active = false
            return
        }
        this._syncHugeWaveText()
    }

    private _clearHugeWaveText() {
        if (!this._hugeWaveTextNode?.isValid) return

        this._hugeWaveTextTicks = 0
        this._hugeWaveTextNode.active = false
        this._hugeWaveTextNode.setScale(1, 1, 1)
        const opacity = this._hugeWaveTextNode.getComponent(UIOpacity)
        if (opacity) opacity.opacity = 255
    }

    private _syncHugeWaveText() {
        if (!this._hugeWaveTextNode?.isValid) return

        const elapsedTicks = HUGE_WAVE_TEXT_DURATION - this._hugeWaveTextTicks
        let scale = 1
        let alpha = 1
        if (elapsedTicks < HUGE_WAVE_TEXT_ENTER_TICKS) {
            const t = Math.max(0, elapsedTicks) / HUGE_WAVE_TEXT_ENTER_TICKS
            scale = this._lerp(2.003, 1.001, t)
            alpha = t
        } else if (this._hugeWaveTextTicks < HUGE_WAVE_TEXT_LEAVE_TICKS) {
            alpha = Math.max(0, this._hugeWaveTextTicks / HUGE_WAVE_TEXT_LEAVE_TICKS)
        }

        this._hugeWaveTextNode.setScale(scale, scale, 1)
        const opacity = this._hugeWaveTextNode.getComponent(UIOpacity)
        if (opacity) opacity.opacity = Math.round(255 * alpha)
    }

    private _hugeWaveTextLocalTopY() {
        const fontConfig = this._adviceFont?.config ?? null
        const metrics = FontMetricsUtil.getMetrics(fontConfig)
        const rawConfig = fontConfig?.json as { defaultPointSize?: number } | undefined
        const defaultPointSize = rawConfig?.defaultPointSize ?? 28
        const scale = defaultPointSize > 0 ? 28 / defaultPointSize : 1
        const ascent = metrics.ascent > 0 ? metrics.ascent * scale : 28

        return HUGE_WAVE_TEXT_HEIGHT / 2 + ascent
    }

    private _updateTimedUiEffects(ticks: number) {
        if (this._sunFlashTicks > 0) {
            this._sunFlashTicks = Math.max(0, this._sunFlashTicks - ticks)
        }
        if (this._boardShakeTicks > 0) {
            this._boardShakeTicks = Math.max(0, this._boardShakeTicks - ticks)
            if (this._boardShakeTicks > 0 && Math.floor(Math.random() * 3) === 0) {
                this._boardShakeAmountX = -this._boardShakeAmountX
            }
        }
    }

    private _startBoardShake(amountX: number, amountY: number) {
        this._boardShakeTicks = BOARD_SHAKE_TICKS
        this._boardShakeAmountX = amountX
        this._boardShakeAmountY = amountY
    }

    private _syncBoardPosition(baseX = 0, baseY = 0) {
        const offset = this._boardShakeOffset()
        this._boardRoot.setPosition(BOARD_ROOT_X + offset.x, BOARD_ROOT_Y + offset.y, 0)
        this._boardContent.setPosition(baseX, baseY, 0)
        this._itemLayer.setPosition(baseX, baseY, 0)
    }

    private _boardShakeOffset() {
        if (this._boardShakeTicks <= 0) return { x: 0, y: 0 }

        const t = 1 - this._boardShakeTicks / BOARD_SHAKE_TICKS
        const bounce = Math.sin(t * Math.PI * 4) * (1 - t)
        return {
            x: Math.round(this._boardShakeAmountX * bounce),
            y: Math.round(this._boardShakeAmountY * bounce),
        }
    }

    private _restoreGameplayLayerOrder() {
        if (!this._gameStarted || !this._entityLayer?.isValid) return

        const mowerNodes = this._introLawnMowerViews.flatMap((view) => [view.shadowNode, view.node])
            .filter((node): node is Node => !!node?.isValid && node.parent === this._boardContent && node.active)
        if (mowerNodes.length === 0) {
            this._entityLayer.setSiblingIndex(this._boardContent.children.length - 1)
            return
        }

        const mowerIndex = Math.min(...mowerNodes.map((node) => node.getSiblingIndex()))
        this._entityLayer.setSiblingIndex(Math.max(0, mowerIndex))
    }

    private _syncSodRollAnimation(progress: number) {
        for (const view of this._sodRollViews) {
            const duration = view.animNode.getAnimationDuration('default')
            if (!duration) continue

            view.animNode.time = Math.max(0, duration - 1) * progress
        }
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
                case 'hugeWave':
                    this._showHugeWaveText()
                    break
                case 'sunFlash':
                    this._sunFlashTicks = SUN_FLASH_TICKS
                    break
                case 'boardShake':
                    this._startBoardShake(event.amountX, event.amountY)
                    break
                case 'finalWave':
                    this._showFinalWaveWarning()
                    break
                case 'levelAwardCollected':
                    this._startLevelCompleteEffect()
                    break
                case 'levelWon':
                    this._startLevelCompleteEffect()
                    break
                case 'levelLost':
                    this._startGameOver(event.zombieId)
                    break
            }
        }
    }

    private _showFinalWaveWarning() {
        this._clearAdvice()
        this._clearHugeWaveText()
        void this._playFinalWaveWarning()
    }

    private _showReadySetPlant() {
        this._clearAdvice()
        void SoundLoader.play(SoundEffect.ReadySetPlant)
        void this._playReadySetPlant()
    }

    private async _playReadySetPlant() {
        this._destroyReadySetPlant()

        const json = this._readySetPlantAnimation?.json as Record<string, any> | undefined
        if (!json) return

        const node = createUINode('ReadySetPlant', {
            parent: this._uiLayer,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 1,
            height: 1,
            x: READY_SET_PLANT_REANIM_X,
            y: -READY_SET_PLANT_REANIM_Y,
            z: CURSOR_PREVIEW_Z - 1,
        })
        node.setSiblingIndex(this._uiLayer.children.length - 1)
        this._readySetPlantNode = node

        const animator = node.addComponent(Animator)
        await animator.parseJson(json)
        if (!node.isValid || this._readySetPlantNode !== node) return

        const animNode = animator.addAnimNode('default')
        this._readySetPlantAnimNode = animNode
        animNode?.play({
            name: 'default',
            loop: false,
            speed: 1,
            onFinish: () => this._destroyReadySetPlant(node),
        })
    }

    private _destroyReadySetPlant(expectedNode?: Node) {
        if (expectedNode && this._readySetPlantNode !== expectedNode) return

        if (this._readySetPlantNode?.isValid) this._readySetPlantNode.destroy()
        this._readySetPlantNode = null
        this._readySetPlantAnimNode = null
    }

    private async _playFinalWaveWarning() {
        this._destroyFinalWaveWarning()

        const json = this._finalWaveAnimation?.json as Record<string, any> | undefined
        if (!json) return

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

    private _destroyFinalWaveWarning(expectedNode?: Node) {
        if (expectedNode && this._finalWaveNode !== expectedNode) return

        if (this._finalWaveNode?.isValid) this._finalWaveNode.destroy()
        this._finalWaveNode = null
        this._finalWaveAnimNode = null
    }

    private _startLevelCompleteEffect() {
        if (this._levelCompleteActive) return

        this._levelCompleteActive = true
        this._levelCompleteTicks = 0
        this._levelCompleteLightFillPlayed = false
        this._levelAwardScreenShown = false
        this._levelAwardSeedType = this._session.level.awardSeedType ?? null
        this._gameAccumulator = 0
        this._previousEntitySnapshots.clear()
        this._session.dispatch({ type: 'clearCursor' })
        this._clearAdvice()
        this._clearHugeWaveText()
        this._destroyReadySetPlant()
        this._destroyFinalWaveWarning()
        this._releasePlantCursorHoverBlock()
        this._setCanvasCursor('default')
        this._ensureLevelCompleteOverlay()
        this._syncLevelCompleteEffect()
        void SoundLoader.play(SoundEffect.WinMusic)
    }

    private _ensureLevelCompleteOverlay() {
        if (this._levelCompleteOverlayNode?.isValid) return

        this._levelCompleteOverlayNode = createUINode('LevelCompleteOverlay', {
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

        this._levelCompleteFadeNode = createUINode('LevelCompleteFade', {
            parent: this._levelCompleteOverlayNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 800,
            height: 600,
            x: 0,
            y: 0,
        })
        this._levelCompleteFadeNode.addComponent(Graphics)
    }

    private _updateLevelCompleteEffect(ticks: number) {
        if (ticks <= 0) return

        const previousTicks = this._levelCompleteTicks
        this._levelCompleteTicks = Math.min(LEVEL_COMPLETE_FADE_TICKS, this._levelCompleteTicks + ticks)
        if (
            !this._levelCompleteLightFillPlayed &&
            previousTicks < LEVEL_COMPLETE_LIGHT_FILL_TICK &&
            this._levelCompleteTicks >= LEVEL_COMPLETE_LIGHT_FILL_TICK
        ) {
            this._levelCompleteLightFillPlayed = true
            void SoundLoader.play(SoundEffect.LightFill)
        }
        if (this._levelCompleteTicks >= LEVEL_COMPLETE_FADE_TICKS) {
            this._requestLevelAwardScreen()
        }
        this._syncLevelCompleteEffect()
    }

    private _syncLevelCompleteEffect() {
        if (!this._levelCompleteActive) return

        this._ensureLevelCompleteOverlay()
        if (this._levelCompleteOverlayNode?.isValid) {
            this._levelCompleteOverlayNode.active = true
            this._levelCompleteOverlayNode.setSiblingIndex(this._uiLayer.children.length - 1)
        }

        const graphics = this._levelCompleteFadeNode?.getComponent(Graphics)
        if (!graphics) return

        const fadeT = Math.max(0, this._levelCompleteTicks - LEVEL_COMPLETE_FADE_START_TICKS) /
            LEVEL_COMPLETE_FADE_DURATION_TICKS
        const alpha = Math.round(255 * Math.max(0, Math.min(1, fadeT)))
        this._levelCompleteFadeNode!.active = alpha > 0
        graphics.clear()
        if (alpha <= 0) return

        graphics.fillColor = new Color(255, 255, 255, alpha)
        graphics.fillRect(0, -600, 800, 600)
    }

    private _requestLevelAwardScreen() {
        if (this._levelAwardScreenShown) return
        const seedType = this._levelAwardSeedType
        if (!seedType) return

        this._levelAwardScreenShown = true
        this.onAwardScreenRequest?.(seedType)
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
        this._clearHugeWaveText()
        this._destroyFinalWaveWarning()
        this._destroyReadySetPlant()
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
        this._boardRoot.setPosition(BOARD_ROOT_X, BOARD_ROOT_Y, 0)
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
            if (entity.type === 'final-seed-packet') {
                node.setScale(1, 1, 1)
                this._syncFinalSeedPacketVisual(node, scale)
            } else {
                node.setScale(scale, scale, 1)
            }
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

    private _createZombieVisual(
        node: Node,
        zombie: ZombieEntity,
        options: { manualTime?: boolean } = {},
    ): ZombieView {
        const view: ZombieView = {
            node,
            clipNode: null,
            visualRootNode: null,
            bodyNode: null,
            shadowNode: null,
            moweredAnimNode: null,
            charredAnimNode: null,
            showingMowered: false,
            showingCharred: false,
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
                } else if (zombie.state === 'charred') {
                    this._syncCharredZombieAnimation(view, zombie)
                } else {
                    const animation = view.body?.hasAnimation(zombie.currentAnimation)
                        ? zombie.currentAnimation
                        : zombie.currentAnimation === 'anim_idle2' && view.body?.hasAnimation('anim_idle')
                            ? 'anim_idle'
                            : zombie.currentAnimation
                    playZombieBodyAnimation(view, animation, {
                        speed: zombie.animationSpeed,
                        time: zombie.animationTime,
                        manualTime: options.manualTime,
                    })
                }
                if (zombie.type === 'flag') {
                    this._attachFlagZombieVisual(animatorNode, view, zombie)
                }
                this._syncZombieHitFlash(view, zombie)
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
            name: 'FinalSeedPacketNormal',
            parent: node,
            layer: this.node.layer,
            x: 0,
            y: 0,
            seedType,
            cost: SEED_DEFINITIONS[seedType].cost,
            seeds: SpriteLoader.get('seeds'),
            packetPlants: SpriteLoader.get('packet_plants'),
            cachedPacketPlants: SpriteLoader.get('packet_plants_cached'),
            costFont: this._packetCostFont,
        })
        SeedPacketRenderer.drawSeedPacket({
            name: 'FinalSeedPacketLarge',
            parent: node,
            layer: this.node.layer,
            x: 0,
            y: 0,
            scale: 2,
            seedType,
            cost: SEED_DEFINITIONS[seedType].cost,
            seeds: null,
            seedPacketLarger: SpriteLoader.get('seedpacket_larger'),
            plantPreviews: SpriteLoader.get('plant_previews_cached'),
            costFont: this._packetCostFont,
        })
        this._syncFinalSeedPacketVisual(node, item.scale)
    }

    private _syncFinalSeedPacketVisual(node: Node, scale: number) {
        const visualScale = Math.max(0.001, scale)
        const normalPacket = node.children.find((child) => child.name === 'FinalSeedPacketNormal')
        const largePacket = node.children.find((child) => child.name === 'FinalSeedPacketLarge')
        const topLeftX = -SEED_PACKET_WIDTH * visualScale / 2
        const topLeftY = SEED_PACKET_HEIGHT * visualScale / 2

        if (normalPacket?.isValid) {
            normalPacket.active = visualScale <= 1
            normalPacket.setScale(visualScale, visualScale, 1)
            normalPacket.setPosition(topLeftX, topLeftY, 0)
        }
        if (largePacket?.isValid) {
            largePacket.active = visualScale > 1
            largePacket.setScale(visualScale / 2, visualScale / 2, 1)
            largePacket.setPosition(topLeftX, topLeftY, 0)
        }
    }

    private _syncPlantHighlights() {
        const highlightedPlantId = this._session.selectedTool === 'shovel'
            ? this._session.getPlantAt(this._mousePixel.x, this._mousePixel.y)?.id ?? null
            : null

        for (const [plantId, view] of this._plantViews) {
            const plant = this._session.plants.find((item) => item.id === plantId)
            const highlighted = plantId === highlightedPlantId
            if (highlighted) {
                this._showPlantHighlight(view)
            } else if (plant && plant.eatenFlashCounter > 0) {
                this._showPlantEatenFlash(view, plant.eatenFlashCounter)
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

    private _showPlantEatenFlash(view: PlantView, flashCounter: number) {
        const grayness = Math.min(255, flashCounter * 3)
        view.animator?.setExtraAdditiveDraw(true, new Color(grayness, grayness, grayness, 255))
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

    private _attachFlagZombieVisual(parentNode: Node, view: ZombieView, zombie: ZombieEntity) {
        if (!this._flagZombieAnimation?.json || !view.body) return

        const animationJson = this._flagZombieAnimation.json as Record<string, any>
        void attachFlagZombieAnimation(parentNode, view, animationJson, {
            enabled: this._isZombieSceneAnimationEnabled(zombie.id),
            sortHost: view.animator,
        }).then(() => {
            syncZombieTrackVisibility(view, zombie)
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
        mask.type = Mask.Type.GRAPHICS_RECT
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
            if (view.showingCharred) this._clearCharredZombieAnimation(view)
            syncZombieTrackVisibility(view, zombie)
            this._syncZombieHitFlash(view, zombie)
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
        if (zombie.state === 'charred') {
            this._syncCharredZombieAnimation(view, zombie)
            return
        }
        if (view.showingMowered) this._clearMoweredZombieAnimation(view)
        if (view.showingCharred) this._clearCharredZombieAnimation(view)
        syncZombieTrackVisibility(view, zombie)
        this._syncZombieHitFlash(view, zombie)
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
        this._syncZombieHitFlash(view, zombie)
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

    private _syncCharredZombieAnimation(view: ZombieView, zombie: ZombieEntity) {
        if (!view.bodyNode) return

        if (view.showingMowered) this._clearMoweredZombieAnimation(view)
        if (view.shadowNode?.isValid) view.shadowNode.active = false
        view.bodyNode.active = false
        view.showingCharred = true
        if (!view.charredAnimNode) {
            this._createCharredZombieDriver(view)
        }
        if (!view.charredAnimNode) return

        if (!view.charredAnimNode.isPlaying) {
            view.charredAnimNode.play({
                name: 'anim_crumble',
                loop: false,
                speed: 0,
                keepLastFrame: true,
            })
        }
        const duration = view.charredAnimNode.getAnimationDuration('anim_crumble') ?? 1
        view.charredAnimNode.time = Math.min(Math.max(0, duration - 1), zombie.animationTime)
    }

    private _syncZombieHitFlash(view: ZombieView, zombie: ZombieEntity) {
        if (zombie.hitFlashCounter <= 0) {
            view.animator?.setExtraAdditiveDraw(false)
            return
        }

        const grayness = Math.min(255, zombie.hitFlashCounter * 10)
        view.animator?.setExtraAdditiveDraw(true, new Color(grayness, grayness, grayness, 255))
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

    private _createCharredZombieDriver(view: ZombieView) {
        if (!this._charredZombieAnimation?.json || !view.visualRootNode?.isValid) return

        const driverNode = createUINode('CharredDriver', {
            parent: view.visualRootNode,
            layer: view.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 1,
            height: 1,
            x: 22,
            y: 10,
        })
        const driver = driverNode.addComponent(Animator)
        driver.enabled = !this._session.paused
        void driver.parseJson(this._charredZombieAnimation.json as Record<string, any>).then(() => {
            if (!view.node.isValid) return

            view.charredAnimNode = driver.addAnimNode('default')
        })
    }

    private _clearMoweredZombieAnimation(view: ZombieView) {
        view.showingMowered = false
        if (view.shadowNode?.isValid) view.shadowNode.active = true
    }

    private _clearCharredZombieAnimation(view: ZombieView) {
        view.showingCharred = false
        if (view.bodyNode?.isValid) view.bodyNode.active = true
        if (view.shadowNode?.isValid) view.shadowNode.active = true
        if (view.charredAnimNode) view.charredAnimNode.stop()
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
            this._syncSeedPacketSelectedHighlight(packet)
            this._syncSeedPacketCooldown(packet)
        }
    }

    private _applyPacketColor(node: Node, packet: SeedPacketState) {
        if (!this._gameStarted) {
            this._applySpriteColorRecursive(node, new Color(128, 128, 128, 255), ['CooldownClip', 'SelectedHighlight'])
            return
        }

        const affordable = this._session.canAffordSeed(packet.seedType)
        const cooling = packet.cooldownRemaining > 0
        const mobileSelected = sys.isMobile && packet.selected
        const inactiveWithoutCooldown = !packet.active && !cooling && !mobileSelected
        const color =
            this._shouldShowFirstPlantSeedGuide(packet) ? this._getTutorialFlashingColor() :
                cooling ? new Color(128, 128, 128, 255) :
                affordable && !inactiveWithoutCooldown ? Color.WHITE : new Color(128, 128, 128, 255)
        this._applySpriteColorRecursive(node, color, ['CooldownClip', 'SelectedHighlight'])
    }

    private _syncSeedPacketSelectedHighlight(packet: SeedPacketState) {
        const highlight = this._seedPacketSelectedHighlights.get(packet.seedType)
        if (!highlight) return

        highlight.active = sys.isMobile &&
            this._gameStarted &&
            packet.selected &&
            packet.cooldownRemaining <= 0
    }

    private _syncSeedPacketCooldown(packet: SeedPacketState) {
        const clip = this._seedPacketCooldownClips.get(packet.seedType)
        if (!clip) return

        if (!this._gameStarted) {
            clip.active = false
            return
        }

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
            this._progressMeterHeadNode.setSiblingIndex(this._progressMeterNode.children.length - 1)
        }
        this._syncProgressMeterFlags()
    }

    private _syncProgressMeterFlags() {
        for (const view of this._progressFlagViews) {
            let height = 0
            if (view.totalWavesAtFlag < this._session.currentWave) {
                height = PROGRESS_METER_FLAG_RAISE_HEIGHT
            } else if (view.totalWavesAtFlag === this._session.currentWave) {
                height = Math.round(this._linearFloat(
                    PROGRESS_METER_FLAG_RAISE_TIME,
                    0,
                    this._session.flagRaiseCounter,
                    0,
                    PROGRESS_METER_FLAG_RAISE_HEIGHT,
                ))
            }
            view.poleNode.active = true
            view.flagNode.active = true
            view.flagNode.setPosition(
                view.flagNode.position.x,
                -(572 - height - PROGRESS_METER_Y),
                2,
            )
        }
    }

    private _progressMeterWavesPerFlag() {
        return this._session.numWaves < 10 ? this._session.numWaves : 10
    }

    private _progressMeterFlagCount(wavesPerFlag: number) {
        if (this._session.level.adventureLevel === 1) return 0
        return Math.floor(this._session.numWaves / wavesPerFlag)
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

    private _applySpriteColorRecursive(node: Node, color: Color, skipName?: string | string[]) {
        if (Array.isArray(skipName) ? skipName.includes(node.name) : node.name === skipName) return
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
        if (this._charredZombieAnimation?.json) {
            this._collectAnimationImages(this._charredZombieAnimation.json as Record<string, any>, textureNames)
        }
        if (extraAnimation?.json) {
            this._collectAnimationImages(extraAnimation.json as Record<string, any>, textureNames)
        }
        textureNames.add('zombie_outerarm_upper2')
        textureNames.add('zombie_cone2')
        textureNames.add('zombie_cone3')
        textureNames.add('zombie_bucket2')
        textureNames.add('zombie_bucket3')
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

    private async _preloadReadySetPlantAnimationTextures() {
        if (!this._readySetPlantAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._readySetPlantAnimation.json as Record<string, any>, textureNames)
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
            this._hideMobileGridGuide()
            this._previewSeedType = null
        }

        if (this._session.selectedTool === 'shovel') {
            if (this._canShowCursorObjectPreview()) {
                this._updateShovelCursor()
            } else {
                this._hideCursorObjectPreview()
            }
        } else {
            this._destroyShovelCursor()
        }

        if (!this._session.selectedSeed) {
            return
        }

        if (!this._canShowCursorObjectPreview()) {
            this._hideCursorObjectPreview()
            return
        }

        if (this._previewSeedType !== this._session.selectedSeed) {
            if (this._cursorPreview?.isValid) this._cursorPreview.destroy()
            if (this._gridPreview?.isValid) this._gridPreview.destroy()
            this._cursorPreview = null
            this._gridPreview = null
            this._hideMobileGridGuide()
            this._previewSeedType = this._session.selectedSeed
        }
        const mobilePlantPressReady = this._isMobilePlantPressReady()
        const showCursorPreview = !sys.isMobile || mobilePlantPressReady
        if (showCursorPreview && !this._cursorPreview?.isValid) {
            this._cursorPreview = this._createPlantPreviewNode('CursorPreview', CURSOR_PLANT_PREVIEW_OPACITY)
        } else if (!showCursorPreview) {
            if (this._cursorPreview?.isValid) this._cursorPreview.destroy()
            this._cursorPreview = null
        }
        const showGridPreview = !sys.isMobile
        if (showGridPreview && !this._gridPreview?.isValid) {
            this._gridPreview = this._createPlantPreviewNode('GridPreview', GRID_PLANT_PREVIEW_OPACITY, this._itemLayer)
        } else if (!showGridPreview) {
            if (this._gridPreview?.isValid) this._gridPreview.destroy()
            this._gridPreview = null
        }

        if (this._cursorPreview?.isValid) this._cursorPreview.active = true
        if (this._gridPreview?.isValid) this._gridPreview.active = true
        if (this._cursorPreview?.isValid) {
            this._cursorPreview.setPosition(
                this._mousePixel.x + CURSOR_PLANT_OFFSET_X,
                -(this._mousePixel.y + CURSOR_PLANT_OFFSET_Y),
                CURSOR_PREVIEW_Z,
            )
        }
        const seedType = this._session.selectedSeed
        const grid = seedType
            ? this._session.geometry.plantingPixelToGrid(this._mousePixel.x, this._mousePixel.y, seedType)
            : null
        if (
            this._gridPreview?.isValid &&
            seedType &&
            grid &&
            this._session.getPlantingReason(seedType, grid.col, grid.row) === 'ok'
        ) {
            const pixel = this._session.geometry.gridToPixel(grid.col, grid.row)
            this._gridPreview.active = true
            this._gridPreview.setPosition(pixel.x, -pixel.y, GRID_PREVIEW_Z)
        } else if (this._gridPreview?.isValid) {
            this._gridPreview.active = false
        }
        if (
            sys.isMobile &&
            mobilePlantPressReady &&
            seedType &&
            grid &&
            this._session.getPlantingReason(seedType, grid.col, grid.row) === 'ok'
        ) {
            this._updateMobileGridGuide(grid.col, grid.row)
        } else {
            this._hideMobileGridGuide()
        }
        this._orderPreviewNodes()
    }

    private _canShowCursorObjectPreview() {
        return this._hasCursorPointer &&
            !UIHoverManager.isModalBlocked &&
            !this._session.paused &&
            !this._gameOverActive
    }

    private _hideCursorObjectPreview() {
        if (this._cursorPreview?.isValid) this._cursorPreview.active = false
        if (this._gridPreview?.isValid) this._gridPreview.active = false
        this._hideMobileGridGuide()
        if (this._shovelCursor?.isValid) this._shovelCursor.active = false
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
        this._shovelCursor.active = true
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

    private _createPlantPreviewNode(name: string, opacity: number, parent: Node = this._uiLayer) {
        const seedType = this._session.selectedSeed!
        const plantType = SEED_DEFINITIONS[seedType].plantType
        return this._createCachedPlantPreviewNode(name, plantType, opacity, parent)
    }

    private _createCachedPlantPreviewNode(name: string, plantType: PlantType, opacity: number, parent: Node = this._uiLayer) {
        const atlas = SpriteLoader.get('plant_previews_cached')
        if (!atlas) {
            throw new Error("[GameScreen] Required sprite 'plant_previews_cached' is not loaded")
        }

        const node = createUINode(name, {
            parent,
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

    private _updateMobileGridGuide(col: number, row: number) {
        if (
            !this._mobileGridGuide?.isValid ||
            this._mobileGridGuide.parent !== this._boardContent ||
            !this._mobileGridGuideGraphics
        ) {
            if (this._mobileGridGuide?.isValid) this._mobileGridGuide.destroy()
            this._mobileGridGuide = createUINode('MobilePlantGridGuide', {
                parent: this._boardContent,
                layer: this.node.layer,
                anchorX: 0,
                anchorY: 1,
                width: this._session.geometry.width,
                height: this._session.geometry.height,
            })
            this._mobileGridGuideGraphics = this._mobileGridGuide.addComponent(Graphics)
            this._placeMobileGridGuideBehindForeground()
        }

        if (this._mobileGridGuideCol === col && this._mobileGridGuideRow === row) {
            this._mobileGridGuide.active = true
            return
        }
        this._mobileGridGuideCol = col
        this._mobileGridGuideRow = row

        const geometry = this._session.geometry
        const guideX = geometry.lawnXMin
        const guideY = geometry.lawnYMin
        const guideWidth = geometry.gridWidth * geometry.cols
        const guideHeight = geometry.gridHeight * geometry.rows
        const colX = geometry.lawnXMin + col * geometry.gridWidth
        const rowY = geometry.lawnYMin + row * geometry.gridHeight
        const graphics = this._mobileGridGuideGraphics

        this._mobileGridGuide.active = true
        graphics.clear()
        graphics.fillColor = new Color(255, 255, 255, MOBILE_GRID_GUIDE_OPACITY)
        graphics.fillRect(guideX, -(rowY + geometry.gridHeight), guideWidth, geometry.gridHeight)
        graphics.fillRect(colX, -(guideY + guideHeight), geometry.gridWidth, guideHeight)
    }

    private _hideMobileGridGuide() {
        if (this._mobileGridGuide?.isValid) this._mobileGridGuide.active = false
        this._mobileGridGuideCol = -1
        this._mobileGridGuideRow = -1
    }

    private _placeMobileGridGuideBehindForeground() {
        const guide = this._mobileGridGuide
        if (!guide?.isValid || guide.parent !== this._boardContent) return

        if (this._seedBankNode?.isValid && this._seedBankNode.parent === this._boardContent) {
            guide.setSiblingIndex(this._seedBankNode.getSiblingIndex())
            return
        }

        if (this._entityLayer?.isValid && this._entityLayer.parent === this._boardContent) {
            guide.setSiblingIndex(this._entityLayer.getSiblingIndex())
        }
    }

    private _orderPreviewNodes() {
        if (!this._gridPreview?.isValid || !this._cursorPreview?.isValid) return

        this._gridPreview.setSiblingIndex(0)
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

    private _refreshBoardHoverFromPointer(pointer: UIHoverPointer | null, activeModalRoot: Node | null) {
        if (this._levelAwardScreenShown) return false
        if (this._levelCompleteActive) {
            this._clearBoardHoverState()
            return false
        }
        if (activeModalRoot || !pointer?.canHover) {
            this._clearBoardHoverState()
            return false
        }

        this._mousePixel = this._pointerToBoardPixel(pointer)
        this._hasCursorPointer = true
        this._updateCursorPreview()
        return this._updateHoverItemAndSeedPacketState()
    }

    private _clearBoardHoverState() {
        this._mousePixel = { x: -1, y: -1 }
        this._hasCursorPointer = false
        this._hideCursorObjectPreview()
        this._hideTooltips()
        if (!this._levelAwardScreenShown) this._setCanvasCursor('default')
    }

    private _updateHoverItemAndSeedPacketState() {
        if (sys.isMobile) return false
        if (this._levelAwardScreenShown) return false
        if (this._gameOverActive || this._levelCompleteActive) {
            this._hideTooltips()
            this._setCanvasCursor('default')
            return false
        }
        if (this._session.paused) {
            this._hideTooltips()
            return false
        }
        if (this._hasCursorObject()) {
            this._hideTooltips()
            this._setCanvasCursor('default')
            return false
        }
        if (!this._gameStarted || this._mousePixel.x < 0 || this._mousePixel.y < 0) {
            this._hideTooltips()
            const hovering = this._isMenuButtonPixel(this._mousePixel)
            this._setCanvasCursor(hovering ? 'pointer' : 'default')
            return hovering
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
        const hovering = overCollectableItem || overPickableSeed || shovelHit || overMenuButton
        this._setCanvasCursor(hovering ? 'pointer' : 'default')
        return hovering
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
        const screen = this._eventScreenLocation(event)
        return this._screenLocationToBoardPixel(screen, event.getUILocation())
    }

    private _pointerToBoardPixel(pointer: UIHoverPointer) {
        return this._screenLocationToBoardPixel(pointer.location, pointer.uiLocation)
    }

    private _eventScreenLocation(event: EventMouse | EventTouch) {
        const touchLocation = (event as EventTouch).touch?.getLocation?.()
        return touchLocation ?? (event as EventMouse).getLocation?.() ?? event.getUILocation()
    }

    private _screenLocationToBoardPixel(screen: { x: number, y: number }, fallbackUi?: { x: number, y: number }) {
        const transform = this.node.getComponent(UITransform)!
        const local = new Vec3()
        const camera = this.node.scene.getComponentInChildren(Camera)
        if (camera) {
            const world = new Vec3()
            camera.screenToWorld(new Vec3(screen.x, screen.y, 0), world)
            transform.convertToNodeSpaceAR(world, local)
        } else {
            const ui = fallbackUi ?? screen
            transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0), local)
        }
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
        if (args.align === 'center') x -= Math.trunc(width / 2)
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
            SUN_AMOUNT_BASELINE_X - Math.trunc(width / 2),
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
