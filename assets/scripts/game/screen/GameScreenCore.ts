import {
    Color,
    Component,
    EventKeyboard,
    EventMouse,
    EventTouch,
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
} from 'cc'
import { DEBUG } from 'cc/env'
import { Animator } from '@/core/Animator'
import { AnimNode } from '@/core/Animator/AnimNode'
import { ParticleDefinitionLoader, TodParticleSystem, type TodParticleEffect } from '@/core/Particle'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { LawnStringLoader } from '@/core/LawnStringLoader'
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
import { MoneyCounter } from '@/ui/MoneyCounter'
import { CrazyDaveWidget } from '@/ui/CrazyDaveWidget'
import { getAtlasFrame, SEED_PACKET_HEIGHT, SEED_PACKET_WIDTH } from '@/ui/SeedPacketRenderer'
import { createStoneButton } from '@/ui/StoneButton'
import { createTooltipNode } from '@/ui/Tooltip/Tooltip'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import { StartupResourceLoader } from '@/ui/StartupResourceLoader'
import { CursorManager } from '@/ui/CursorManager'
import { ProfileStore } from '@/game/persistence/ProfileStore'
import {
    ADVENTURE_1_1,
    GAME_TICK_SECONDS,
    getLevelGameplayMusicTune,
    PLANT_DEFINITIONS,
    SEED_DEFINITIONS,
    ZOMBIE_DEFINITIONS,
    scaleGameDeltaTime,
} from '../GameDefinitions'
import {
    getAnimationRateSpeed,
    playPotatoArmedAnimation,
    PlantShake,
    wirePlantAnimation,
} from '../PlantAnimation'
import {
    attachFlagZombieAnimation,
    createZombieAnimationView,
    playZombieBodyAnimation,
    syncZombieTrackVisibility,
    wireZombieAnimation,
} from '../ZombieAnimation'
import { GameSession } from '../GameSession'
import { GameDebugSettings } from '../GameDebugSettings'
import { MusicSystem } from '../music/MusicSystem'
import {
    CRAZY_DAVE_ANIMATION_PATH,
    CRAZY_DAVE_FIRST_DIALOG_END,
    CRAZY_DAVE_FIRST_DIALOG_START,
    CRAZY_DAVE_INTRO_DELAY_SECONDS,
    CRAZY_DAVE_POST_SHOVEL_DIALOG_END,
    CRAZY_DAVE_POST_SHOVEL_DIALOG_START,
    CRAZY_DAVE_WALLNUT_BOWLING_LINE_DIALOG,
    CRAZY_DAVE_X,
    CRAZY_DAVE_Y,
    type CrazyDaveDialogPhase,
    type CrazyDaveMessagePhase,
} from './CrazyDaveDialogConfig'
import {
    DIAMOND_ANIMATION_PATH,
    FINAL_WAVE_ANIMATION_PATH,
    GAME_TEXTURES,
    GOLD_COIN_ANIMATION_PATH,
    PAUSE_DIALOG_ZOMBIE_ANIMATION_PATH,
    READY_SET_PLANT_ANIMATION_PATH,
    SILVER_COIN_ANIMATION_PATH,
} from './GameScreenResources'
import {
    MONEY_COIN_ANIMATION_SPEED_MAX,
    MONEY_COIN_ANIMATION_SPEED_MIN,
    MONEY_COIN_REANIM_X,
    MONEY_COIN_REANIM_Y,
    MONEY_DIAMOND_ANIMATION_RATE_MAX,
    MONEY_DIAMOND_ANIMATION_RATE_MIN,
    MONEY_DIAMOND_REANIM_X,
    MONEY_DIAMOND_REANIM_Y,
    MONEY_ITEM_SPRITES,
    MONEY_STATIC_GLOW_X,
    MONEY_STATIC_GLOW_Y,
} from './MoneyItemVisualConfig'
import { easeInOut, lerp, linearFloat } from './GameScreenMath'
import { eventToBoardPixel, getNodeBoardPixelRect, isPixelInRect, uiLocationToBoardPixel } from './BoardPixelUtils'
import { SeedPacketView, type SeedPacketViewArgs } from './SeedPacketView'
import {
    PLANT_PREVIEW_CACHE_IDS,
    PLANT_SHADOW_ADJUSTMENTS,
    PLANT_VISUAL_ADJUSTMENTS,
    PROJECTILE_SHADOW_ADJUSTMENTS,
    PROJECTILE_SHADOW_COLUMNS,
    PROJECTILE_SHADOW_DAY_CEL,
    PROJECTILE_SHADOW_HEIGHT,
    PROJECTILE_SHADOW_WIDTH,
    PROJECTILE_SPRITES,
    SEED_TOOLTIP_FALLBACK_NAMES,
    SEED_TOOLTIP_KEYS,
    SEED_TOOLTIP_NOT_ENOUGH_SUN,
    SEED_TOOLTIP_WAITING,
} from './GameVisualConfig'
import type {
    BoardPixelRect,
    IntroLawnMowerView,
    IntroStreetZombieSpec,
    LawnMowerView,
    MoneyItemView,
    PlantView,
    ProgressFlagView,
    RenderEntitySnapshot,
    SodRollView,
    ZombieView,
} from './GameScreenViewTypes'
import type {
    GameEntity,
    GameEvent,
    ConveyorPacketState,
    ItemEntity,
    AdviceStyle,
    LawnMowerEntity,
    LevelAward,
    LevelAwardKind,
    LevelDefinition,
    PlantEntity,
    PlantType,
    ProjectileEntity,
    SeedPacketState,
    SeedType,
    ToolType,
    ZombieEntity,
    ZombieType,
} from '../GameTypes'

type SeedSourceHit =
    | { kind: 'seed', packet: SeedPacketState, rect: BoardPixelRect, seedType: SeedType }
    | { kind: 'conveyor', packet: ConveyorPacketState, rect: BoardPixelRect, seedType: SeedType, packetId: number }

export const BOARD_OFFSET = 220
export const BOARD_ROOT_X = -400
export const BOARD_ROOT_Y = 300
export const BOARD_RIGHT_X = -380
export const MENU_BUTTON_WIDTH = 117
export const MENU_BUTTON_HEIGHT = 46
export const INTRO_PAN_RIGHT_START = 150
export const INTRO_PAN_RIGHT_END = 350
export const INTRO_PAN_LEFT_START = 450
export const INTRO_PAN_LEFT_END = 600
export const INTRO_ROLL_SOD_START = 600
export const INTRO_ROLL_SOD_END = 800
export const INTRO_SOD_READY_SET_PLANT_END = 1038
export const INTRO_LAWN_MOWER_ROW = 2
export const INTRO_LAWN_MOWER_START = 820
export const INTRO_LAWN_MOWER_END = 845
export const INTRO_LAWN_MOWER_NO_SOD_START = 620
export const INTRO_LAWN_MOWER_NO_SOD_END = 645
export const INTRO_LAWN_MOWER_ROW_START_STEP = 5
export const INTRO_LAWN_MOWER_START_X = -80
export const INTRO_LAWN_MOWER_END_X = -21
export const INTRO_LAWN_MOWER_REANIM_X_OFFSET = 6
export const INTRO_LAWN_MOWER_REANIM_Y_OFFSET = 19
export const INTRO_LAWN_MOWER_SHADOW_X_OFFSET = -7
export const INTRO_LAWN_MOWER_SHADOW_Y_OFFSET = 47
export const INTRO_LAWN_MOWER_SCALE = 0.85
export const GAMEPLAY_LAWN_MOWER_INTRO_START = 0
export const LAWN_MOWER_Y_OFFSET = 23
export const INTRO_SEED_BANK_ON_START = 800
export const INTRO_SEED_BANK_ON_END = 825
export const INTRO_SEED_BANK_NO_SOD_ON_START = 600
export const INTRO_SEED_BANK_NO_SOD_ON_END = 625
export const GAMEPLAY_SEED_BANK_INTRO_DURATION = 25
export const INTRO_SEED_BANK_X = 10
export const LAWN_MOWER_CACHED_DRAW_OFFSET_X = -20
export const GAMEPLAY_LAWN_MOWER_REANIM_X_OFFSET = INTRO_LAWN_MOWER_REANIM_X_OFFSET
export const GAMEPLAY_LAWN_MOWER_REANIM_Y_OFFSET = INTRO_LAWN_MOWER_REANIM_Y_OFFSET
export const PROGRESS_METER_X = 600
export const PROGRESS_METER_Y = 575
export const PROGRESS_METER_WIDTH = 158
export const PROGRESS_METER_CEL_HEIGHT = 27
export const PROGRESS_METER_FILL_MAX_WIDTH = 143
export const PROGRESS_METER_FILL_RIGHT_INSET = 7
export const PROGRESS_METER_LEVEL_X = 638
export const PROGRESS_METER_LEVEL_Y = 589
export const PROGRESS_METER_HEAD_START_X = 580
export const PROGRESS_METER_HEAD_Y = 572
export const PROGRESS_METER_HEAD_MAX_PROGRESS = 135
export const PROGRESS_METER_PART_WIDTH = 25
export const PROGRESS_METER_PART_HEIGHT = 25
export const PROGRESS_METER_PART_COLUMNS = 3
export const PROGRESS_METER_FLAG_RAISE_TIME = 100
export const PROGRESS_METER_FLAG_RAISE_HEIGHT = 14
export const LEVEL_LABEL_BASELINE_Y = 595
export const LEVEL_LABEL_RIGHT_X = 780
export const LEVEL_LABEL_WITH_PROGRESS_RIGHT_X = 593
export const COIN_BANK_X = 57
export const COIN_BANK_RIGHT_TEXT_OFFSET = 116
export const COIN_BANK_DISPLAY_TICKS = 1000
export const COIN_BANK_FADE_TICKS = 15
export const INTRO_HOUSE_NAME_Y = 550
export const INTRO_HOUSE_NAME_DURATION = 250
export const DEFAULT_PLAYER_NAME = 'Player'

const ADVICE_LAWN_STRING_KEYS: Record<string, string> = {
    'Click on a seed packet to pick it up!': 'ADVICE_CLICK_SEED_PACKET',
    'Click on the grass to plant your seed!': 'ADVICE_CLICK_ON_GRASS',
    'Nicely done!': 'ADVICE_PLANTED_PEASHOOTER',
    'Click on the falling sun to collect it!': 'ADVICE_CLICK_ON_SUN',
    "Keep on collecting sun!\nYou'll need it to grow more plants!": 'ADVICE_CLICKED_ON_SUN',
    "Excellent! You've collected\nenough for your next plant!": 'ADVICE_ENOUGH_SUN',
    'Click on the peashooter to plant another one!': 'ADVICE_CLICK_PEASHOOTER',
    "Don't let the zombies reach your house!": 'ADVICE_ZOMBIE_ONSLAUGHT',
    'You need more sun to do that!': 'ADVICE_CANT_AFFORD_PLANT',
    'Sunflowers are an extremely important plant!': 'ADVICE_PLANT_SUNFLOWER1',
    'Try to plant at least 3 of them!': 'ADVICE_PLANT_SUNFLOWER2',
    'Planting at least 3 sunflowers improves your\nchances of surviving a zombie attack!': 'ADVICE_PLANT_SUNFLOWER3',
    'The more sunflowers you have,\nthe faster you can grow plants!': 'ADVICE_MORE_SUNFLOWERS',
    'Try to plant at least 3 sunflowers!': 'ADVICE_PLANT_SUNFLOWER4',
    'Planting sunflowers will improve your chances \nof surviving the zombie attack!': 'ADVICE_PLANT_SUNFLOWER5',
}
export const INTRO_STREET_ZOMBIE_GRID_SIZE = 5
export const INTRO_STREET_ZOMBIE_PREVIEW_CAPACITY = 10
export const INTRO_STREET_ZOMBIE_BASE_X = 830
export const INTRO_STREET_ZOMBIE_GRID_X_STEP = 56
export const INTRO_STREET_ZOMBIE_BASE_Y = 70
export const INTRO_STREET_ZOMBIE_GRID_Y_STEP = 90
export const INTRO_STREET_ZOMBIE_ODD_COLUMN_Y_OFFSET = 30
export const INTRO_STREET_ZOMBIE_RANDOM_OFFSET = 15
export const INTRO_STREET_ZOMBIE_WAVE = -2
export const INTRO_STREET_ZOMBIE_Z_BASE = 100
export const INTRO_STREET_ZOMBIE_ROW_Z_STEP = 4
export const INTRO_STREET_ZOMBIE_ODD_COLUMN_Z_OFFSET = 2
export const INTRO_END = 855
export const INTRO_NO_SOD_READY_SET_PLANT_END = 838
export const LEVEL_AWARD_FLASH_TIME = 75
export const SOD_ROW_X = 239 - BOARD_OFFSET
export const SOD_ROW_Y = 265
export const SOD_THREE_ROW_X = 235 - BOARD_OFFSET
export const SOD_THREE_ROW_Y = 149
export const SUN_AMOUNT_BASELINE_X = 34
export const SUN_AMOUNT_BASELINE_Y = 78
export const SUN_FLASH_TICKS = 70
export const SUN_FLASH_PERIOD_TICKS = 20
export const BOARD_SHAKE_TICKS = 12
export const POTATO_MINE_RISE_ANIM_RATE = 18
export const CHOMPER_BITE_ANIM_RATE = 24
export const CHOMPER_CHEW_ANIM_RATE = 15
export const CHOMPER_SWALLOW_ANIM_RATE = 12
export const CURSOR_PLANT_OFFSET_X = -35
export const CURSOR_PLANT_OFFSET_Y = -60
export const GRID_PREVIEW_Z = 998
export const CURSOR_PREVIEW_Z = 999
export const CURSOR_PLANT_PREVIEW_OPACITY = 255
export const GRID_PLANT_PREVIEW_OPACITY = 100
export const MOBILE_GRID_GUIDE_OPACITY = 72
export const MOBILE_ITEM_SWIPE_SAMPLE_STEP = 24
export const DEBUG_HITBOX_EDGE_WIDTH = 1
export const DEBUG_BODY_RECT_COLOR = new Color(0, 255, 0, 255)
export const DEBUG_ATTACK_RECT_COLOR = new Color(255, 0, 0, 255)
export const ZOMBIE_BODY_REANIM_OFFSET_X = 15
export const ZOMBIE_BODY_REANIM_OFFSET_Y = 8
export const ZOMBIE_REANIM_BLEND_TIME = 0.2
export const PLANT_PREVIEW_CACHE_CELL_WIDTH = 220
export const PLANT_PREVIEW_CACHE_CELL_HEIGHT = 160
export const PLANT_PREVIEW_CACHE_COLUMNS = 8
export const PLANT_PREVIEW_CACHE_OFFSET_X = -40
export const PLANT_PREVIEW_CACHE_OFFSET_Y = -40
export const ITEM_Z = 900
export const MOUSE_BUTTON_RIGHT = 2
export const RIGHT_MOUSE_EVENT_DEDUPE_MS = 50
export const SEED_BANK_EXTENSION_OVERLAP = 12
export const SHOVEL_BUTTON_BASE_X = 456
export const SHOVEL_BUTTON_Y = 0
export const SHOVEL_CURSOR_OFFSET_X = -15
export const SHOVEL_CURSOR_OFFSET_Y = -65
export const SHOVEL_TOOLTIP_OFFSET_X = 35
export const SHOVEL_TOOLTIP_OFFSET_Y = 72
export const SEED_TOOLTIP_OFFSET_Y = 70
export const PLANT_HIGHLIGHT_COLOR = new Color(255, 255, 255, 196)
export const HUGE_WAVE_TEXT = 'A HUGE WAVE OF ZOMBIES IS APPROACHING!'
export const HUGE_WAVE_TEXT_Y = 330
export const HUGE_WAVE_TEXT_HEIGHT = 55
export const HUGE_WAVE_TEXT_DURATION = 750
export const HUGE_WAVE_TEXT_ENTER_TICKS = 20
export const HUGE_WAVE_TEXT_LEAVE_TICKS = 40
export const TUTORIAL_FLASH_TIME = 75
export const READY_SET_PLANT_INTRO_TICKS = 183
export const NO_READY_SET_PLANT_MUSIC_FADE_TICKS = 200
export const READY_SET_PLANT_REANIM_X = 400
export const READY_SET_PLANT_REANIM_Y = 324
export const FINAL_WAVE_REANIM_X = 0
export const FINAL_WAVE_REANIM_Y = 30
export const GAME_OVER_PAN_START_TICKS = 150
export const GAME_OVER_PAN_END_TICKS = 350
export const GAME_OVER_CHOMP_TICK_1 = 510
export const GAME_OVER_CHOMP_TICK_2 = 560
export const GAME_OVER_SCREAM_TICK = 600
export const GAME_OVER_GRAPHIC_START_TICKS = 600
export const GAME_OVER_GRAPHIC_SHAKE_START_TICKS = 700
export const GAME_OVER_GRAPHIC_SHAKE_END_TICKS = 800
export const GAME_OVER_END_TICKS = 1100
export const GAME_OVER_WINNER_WALK_START_TICKS = GAME_OVER_PAN_START_TICKS
export const GAME_OVER_REANIM_RATE = 12
export const GAME_OVER_TITLE_MAX_OPACITY = 255
export const GAME_OVER_BLACK_MAX_OPACITY = 128
export const GAME_OVER_DOOR_MASK_X = -130
export const GAME_OVER_DOOR_MASK_Y = 202
export const GAME_OVER_DOOR_INTERIOR_X = -126
export const GAME_OVER_DOOR_INTERIOR_Y = 225
export const GAME_OVER_DAY_ZOMBIE_CLIP_X = -123
export const GAME_OVER_FULLSCREEN_ALPHA_KEYS = [
    0.00, 0.05, 0.09, 0.14, 0.18, 0.23, 0.27, 0.32, 0.36, 0.41, 0.45, 0.50,
]
export const GAME_OVER_TITLE_KEYS = [
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
export const LEVEL_COMPLETE_FADE_TICKS = 600
export const LEVEL_COMPLETE_LIGHT_FILL_TICK = 300
export const LEVEL_COMPLETE_FADE_START_TICKS = 400
export const LEVEL_COMPLETE_FADE_DURATION_TICKS = 200
export abstract class GameScreenCore extends Component {
    public onBackToMenu: (() => void) | null = null
    public onMenuRequest: (() => void) | null = null
    public onPauseRequest: (() => void) | null = null
    public onGameOverRequest: (() => void) | null = null
    public onAwardScreenRequest: ((award: LevelAward) => void) | null = null
    public onMoneyChanged: ((amount: number) => void) | null = null
    public levelDefinition: LevelDefinition = ADVENTURE_1_1
    public firstTimeAdventure = true
    public initialMoney = 0

    protected _session = new GameSession()
    protected _boardRoot: Node = null!
    protected _boardContent: Node = null!
    protected _entityLayer: Node = null!
    protected _collisionDebugLayer: Node | null = null
    protected _collisionDebugGraphics: Graphics | null = null
    protected _debugHitboxesVisible = false
    protected _uiLayer: Node = null!
    protected _itemLayer: Node = null!
    protected _seedBankNode: Node | null = null
    protected _conveyorBackdropNode: Node | null = null
    protected _conveyorBeltNode: Node | null = null
    protected _conveyorPacketClipNode: Node | null = null
    protected _bowlingStripeNode: Node | null = null
    protected _shovelBankNode: Node | null = null
    protected _shovelNode: Node | null = null
    protected _menuButtonNode: Node | null = null
    protected _unsoddedNode: Node | null = null
    protected _soddedNode: Node | null = null
    protected _sodBaseNode: Node | null = null
    protected _sodClipNode: Node | null = null
    protected _sodClipRevealWidth = 771
    protected _tutorialLawnFlashNode: Node | null = null
    protected _sodRollViews: SodRollView[] = []
    protected _sodRollParticleSystems: TodParticleSystem[] = []
    protected _introLawnMowerViews: IntroLawnMowerView[] = []
    protected _introStreetZombieNodes: Node[] = []
    protected _seedBankHeight = 87
    protected _cursorPreview: Node | null = null
    protected _gridPreview: Node | null = null
    protected _mobileGridGuide: Node | null = null
    protected _mobileGridGuideGraphics: Graphics | null = null
    protected _mobileGridGuideCol = -1
    protected _mobileGridGuideRow = -1
    protected _previewSeedType: SeedType | null = null
    protected _shovelCursor: Node | null = null
    protected _sunLabel: FontRenderer = null!
    protected _sunFlashTicks = 0
    protected _boardShakeTicks = 0
    protected _boardShakeAmountX = 0
    protected _boardShakeAmountY = 0
    protected _adviceFont: BitmapFontAssets | null = null
    protected _daveFont: BitmapFontAssets | null = null
    protected _lawnStrings: Record<string, string> = {}
    protected _adviceWidget: AdviceWidget | null = null
    protected _houseNameNode: Node | null = null
    protected _houseNameLabel: FontRenderer | null = null
    protected _houseNameTicks = 0
    protected _hugeWaveTextNode: Node | null = null
    protected _hugeWaveTextLabel: FontRenderer | null = null
    protected _hugeWaveTextTicks = 0
    protected _resultLabel: Label = null!
    protected _entityNodes: Map<number, Node> = new Map()
    protected _plantViews: Map<number, PlantView> = new Map()
    protected _zombieViews: Map<number, ZombieView> = new Map()
    protected _lawnMowerViews: Map<number, LawnMowerView> = new Map()
    protected _moneyItemViews: Map<number, MoneyItemView> = new Map()
    protected _moneyCounter: MoneyCounter | null = null
    protected _domKeyDownListener: ((event: KeyboardEvent) => void) | null = null
    protected _lastHandledKeyboardEvent: Event | KeyboardEvent | null = null
    protected _coinBankFadeTicks = 0
    protected _previousEntitySnapshots: Map<number, RenderEntitySnapshot> = new Map()
    protected _seedPacketViews: Map<SeedType, SeedPacketView> = new Map()
    protected _seedPacketTutorialArrows: Map<SeedType, TodParticleSystem> = new Map()
    protected _conveyorPacketViews: Map<number, SeedPacketView> = new Map()
    protected _bowlingStripeRevealed = false
    protected _seedTooltipNode: Node | null = null
    protected _seedTooltipKey = ''
    protected _shovelTooltipNode: Node | null = null
    protected _mousePixel = { x: -1, y: -1 }
    protected _hasCursorPointer = false
    protected readonly _boardHoverClient = {
        clearHover: () => this._clearBoardHoverState(),
        refreshHover: (pointer: UIHoverPointer | null, activeModalRoot: Node | null) =>
            this._refreshBoardHoverFromPointer(pointer, activeModalRoot),
    }
    protected _plantAnimations: Map<PlantType, JsonAsset> = new Map()
    protected _zombieAnimations: Map<ZombieType, JsonAsset> = new Map()
    protected _flagZombieAnimation: JsonAsset | null = null
    protected _moweredZombieAnimation: JsonAsset | null = null
    protected _charredZombieAnimation: JsonAsset | null = null
    protected _sunAnimation: JsonAsset | null = null
    protected _sodRollAnimation: JsonAsset | null = null
    protected _lawnMowerAnimation: JsonAsset | null = null
    protected _finalWaveAnimation: JsonAsset | null = null
    protected _silverCoinAnimation: JsonAsset | null = null
    protected _goldCoinAnimation: JsonAsset | null = null
    protected _diamondAnimation: JsonAsset | null = null
    protected _crazyDaveAnimation: JsonAsset | null = null
    protected _finalWaveNode: Node | null = null
    protected _finalWaveAnimNode: AnimNode | null = null
    protected _readySetPlantAnimation: JsonAsset | null = null
    protected _readySetPlantNode: Node | null = null
    protected _readySetPlantAnimNode: AnimNode | null = null
    protected _crazyDave: CrazyDaveWidget | null = null
    protected _crazyDaveHidden = false
    protected _crazyDaveMessageIndex = -1
    protected _crazyDaveDialogPhase: CrazyDaveDialogPhase = 'off'
    protected _crazyDaveDialogStarted = false
    protected _crazyDaveShovelDugPlant = false
    protected _houseDoorBottomNode: Node | null = null
    protected _houseDoorTopNode: Node | null = null
    protected _gameOverOverlayNode: Node | null = null
    protected _gameOverBlackNode: Node | null = null
    protected _gameOverTitleNode: Node | null = null
    protected _gameOverTicks = 0
    protected _gameOverActive = false
    protected _gameOverDialogRequested = false
    protected _gameOverWinnerZombieId: number | null = null
    protected _levelCompleteOverlayNode: Node | null = null
    protected _levelCompleteFadeNode: Node | null = null
    protected _levelCompleteTicks = 0
    protected _levelCompleteActive = false
    protected _levelCompleteLightFillPlayed = false
    protected _levelAwardScreenShown = false
    protected _levelAward: LevelAward | null = null
    protected _sunFont: BitmapFontAssets | null = null
    protected _packetCostFont: BitmapFontAssets | null = null
    protected _levelFont: BitmapFontAssets | null = null
    protected _buttonSprites: MessageBoxButtonSprites | null = null
    protected _buttonFonts: MessageBoxButtonFonts | null = null
    protected _progressMeterNode: Node | null = null
    protected _progressMeterFillClip: Node | null = null
    protected _progressMeterFillNode: Node | null = null
    protected _progressMeterHeadNode: Node | null = null
    protected _progressFlagViews: ProgressFlagView[] = []
    protected _levelLabel: FontRenderer | null = null
    protected _introTime = 0
    protected _introReadySetPlantShown = false
    protected _introMusicFadeStarted = false
    protected _gameAccumulator = 0
    protected _lastRightMouseDownAt = 0
    protected _lastRightMouseDownX = Number.NaN
    protected _lastRightMouseDownY = Number.NaN
    protected _mobileCursorPressActive = false
    protected _mobileCursorPressCancelOnReleaseInside = false
    protected _mobileCursorPressLeftSource = false
    protected _mobileCursorPressSourceRect: BoardPixelRect | null = null
    protected _lastTouchPixel: { x: number, y: number } | null = null
    protected _refreshHoverAfterCursorRelease = true
    protected _plantCursorHoverBlocked = false
    protected _gameStarted = false
    protected _gameplayMusicStarted = false
    protected _gameplayUpdatesPaused = false
    protected _gameplayLawnMowerIntroTicks = -1
    protected _gameplaySeedBankIntroTicks = -1
    protected _conveyorBeltAnimTicks = 0
    protected _bootstrapped = false

    onLoad() {
        this._session = new GameSession(this.levelDefinition, {
            firstTimeAdventure: this.firstTimeAdventure,
            initialMoney: this.initialMoney,
        })
        this._debugHitboxesVisible = GameDebugSettings.hitboxesVisible
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
        this._collisionDebugLayer = createUINode('HitboxDebug', {
            parent: this._entityLayer,
            anchorX: 0,
            anchorY: 1,
            width: 1400,
            height: 600,
        })
        this._collisionDebugLayer.active = this._debugHitboxesVisible
        this._collisionDebugGraphics = this._collisionDebugLayer.addComponent(Graphics)
        this._uiLayer = createUINode('HUD', { parent: this._boardRoot, anchorX: 0, anchorY: 1 })
        this._itemLayer = createUINode('Items', { parent: this._uiLayer, anchorX: 0, anchorY: 1 })

        void this._bootstrap()
    }

    onDestroy() {
        UIHoverManager.unregisterClient(this._boardHoverClient)
        this._unbindDomKeyboardEvents()
        input.off(Input.EventType.MOUSE_DOWN, this._onGlobalMouseDown, this)
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this._releasePlantCursorHoverBlock()
        this.unscheduleAllCallbacks()
    }

    protected async _bootstrap() {
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
            StartupResourceLoader.loadJson(SILVER_COIN_ANIMATION_PATH),
            StartupResourceLoader.loadJson(GOLD_COIN_ANIMATION_PATH),
            StartupResourceLoader.loadJson(DIAMOND_ANIMATION_PATH),
            StartupResourceLoader.loadJson(CRAZY_DAVE_ANIMATION_PATH),
            ...(DEBUG ? [] : [ParticleDefinitionLoader.preloadAll()]),
            FontLoader.load('continuumbold14'),
            FontLoader.load('pico129'),
            FontLoader.load('houseofterror28'),
            FontLoader.load('houseofterror16'),
            FontLoader.load('briannetod16'),
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
        let resultIndex = afterZombies
        this._flagZombieAnimation = results[resultIndex++] as JsonAsset | null
        this._moweredZombieAnimation = results[resultIndex++] as JsonAsset | null
        this._charredZombieAnimation = results[resultIndex++] as JsonAsset | null
        const pauseDialogZombieAnimation = results[resultIndex++] as JsonAsset | null
        this._sunAnimation = results[resultIndex++] as JsonAsset | null
        this._sodRollAnimation = results[resultIndex++] as JsonAsset | null
        this._lawnMowerAnimation = results[resultIndex++] as JsonAsset | null
        this._finalWaveAnimation = results[resultIndex++] as JsonAsset | null
        this._readySetPlantAnimation = results[resultIndex++] as JsonAsset | null
        this._silverCoinAnimation = results[resultIndex++] as JsonAsset | null
        this._goldCoinAnimation = results[resultIndex++] as JsonAsset | null
        this._diamondAnimation = results[resultIndex++] as JsonAsset | null
        this._crazyDaveAnimation = results[resultIndex++] as JsonAsset | null
        if (!DEBUG) resultIndex++ // ParticleDefinitionLoader.preloadAll()
        this._sunFont = results[resultIndex++] as BitmapFontAssets | null
        this._packetCostFont = results[resultIndex++] as BitmapFontAssets | null
        this._adviceFont = results[resultIndex++] as BitmapFontAssets | null
        this._levelFont = results[resultIndex++] as BitmapFontAssets | null
        this._daveFont = results[resultIndex++] as BitmapFontAssets | null
        this._buttonSprites = results[resultIndex++] as MessageBoxButtonSprites | null
        this._buttonFonts = results[resultIndex++] as MessageBoxButtonFonts | null
        this._lawnStrings = await LawnStringLoader.load()
        await Promise.all([
            this._preloadPlantAnimationTextures(),
            this._preloadZombieAnimationTextures(pauseDialogZombieAnimation),
            this._preloadSunAnimationTextures(),
            this._preloadCoinAnimationTextures(),
            this._preloadCrazyDaveAnimationTextures(),
            this._preloadFinalWaveAnimationTextures(),
            this._preloadReadySetPlantAnimationTextures(),
        ])

        await this._drawStaticBoard()
        this._drawHud()
        if (this._shouldSkipStandardIntro()) {
            this._startGameWithoutStandardIntro()
        } else {
            this._showIntroHouseName()
        }
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
                while (!this._gameplayUpdatesPaused && this._gameAccumulator >= GAME_TICK_SECONDS) {
                    this._capturePreviousEntitySnapshots()
                    this._session.update()
                    this._gameAccumulator -= GAME_TICK_SECONDS
                    gameTicks++
                }
                if (this._gameplayUpdatesPaused) this._gameAccumulator = 0
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
            this._updateCrazyDave(gameTicks)
            this._updateGameplayLawnMowerIntro(gameTicks)
            this._updateGameplaySeedBankIntro(gameTicks)
            this._updateConveyorBeltAnimation(gameTicks)
        } else if (!this._session.paused) {
            const uiTicks = scaledDt / GAME_TICK_SECONDS
            this._updateTimedUiEffects(uiTicks)
            this._updateCrazyDave(uiTicks)
            this._updateGameplayLawnMowerIntro(uiTicks)
            this._updateGameplaySeedBankIntro(uiTicks)
            this._updateConveyorBeltAnimation(uiTicks)
        }
        if (!this._session.paused) {
            MusicSystem.update(scaledDt / GAME_TICK_SECONDS, {
                zombiesOnScreen: this._gameStarted ? this._session.countZombiesOnScreenForMusic() : 0,
            })
        }
        if (this._gameOverActive) this._syncGameOverScene()
        if (this._levelCompleteActive) this._syncLevelCompleteEffect()
        this._renderFrame()
    }

    public pauseGame() {
        this._session.dispatch({ type: 'pause' })
        MusicSystem.pause()
        this._gameAccumulator = 0
        this._previousEntitySnapshots.clear()
        this._setGameplayAnimationsPaused(true)
        this._renderFrame()
    }

    public resumeGame() {
        this._session.dispatch({ type: 'resume' })
        MusicSystem.resume()
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

    public debugPlacePlant(type: PlantType, row: number, col: number, bowlingAnimRate?: number) {
        if (!this.isLevelRunning()) return false

        this._session.debugAddPlant(type, row, col, bowlingAnimRate)
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

    public debugAddMoney(amount: number) {
        if (!this.isLevelRunning()) return null

        const money = this._session.debugAddMoney(amount)
        this._showMoneyCounter()
        this._renderFrame()
        return money
    }

    public debugSetMoney(amount: number) {
        if (!this.isLevelRunning()) return null

        const money = this._session.debugSetMoney(amount)
        this._showMoneyCounter()
        this._renderFrame()
        return money
    }

    public debugSpawnItem(
        type: ItemEntity['type'] | 'level-award',
        row?: number,
        col?: number,
        awardKind?: LevelAwardKind,
    ) {
        if (!this.isLevelRunning()) return null

        const position = this._debugItemSpawnPosition(row, col)
        const item = this._session.debugAddItem(type, position.x, position.y, awardKind)
        this._renderFrame()
        return item
    }

    public debugSetRechargingEnabled(enabled: boolean) {
        GameDebugSettings.setRechargingEnabled(enabled)
        const rechargingEnabled = this._session.debugSetRechargingEnabled(enabled)
        if (this._bootstrapped) this._renderFrame()
        return rechargingEnabled
    }

    public debugSetSunCostEnabled(enabled: boolean) {
        GameDebugSettings.setSunCostEnabled(enabled)
        const sunCostEnabled = this._session.debugSetSunCostEnabled(enabled)
        if (this._bootstrapped) this._renderFrame()
        return sunCostEnabled
    }

    public debugSetSunSpawningEnabled(enabled: boolean) {
        if (!this.isLevelRunning()) return null

        const sunSpawningEnabled = this._session.debugSetSunSpawningEnabled(enabled)
        this._renderFrame()
        return sunSpawningEnabled
    }

    public debugSetAutoCollectEnabled(enabled: boolean) {
        GameDebugSettings.setAutoCollectEnabled(enabled)
        const autoCollectEnabled = this._session.debugSetAutoCollectEnabled(enabled)
        if (this._bootstrapped) this._renderFrame()
        return autoCollectEnabled
    }

    public debugSetHitboxesVisible(visible: boolean) {
        GameDebugSettings.setHitboxesVisible(visible)
        this._debugHitboxesVisible = visible
        if (this._collisionDebugLayer?.isValid) {
            this._collisionDebugLayer.active = visible
        }
        if (!visible) {
            this._collisionDebugGraphics?.clear()
        }
        if (this._bootstrapped) this._renderFrame()
        return this._debugHitboxesVisible
    }

    protected _debugItemSpawnPosition(row?: number, col?: number) {
        const resolvedRow = row ?? this._session.level.activeRows[Math.floor(this._session.level.activeRows.length / 2)] ?? 2
        const resolvedCol = col ?? Math.floor(this._session.geometry.cols / 2)
        const pixel = this._session.geometry.gridToPixel(resolvedCol, resolvedRow)
        return {
            x: pixel.x + this._session.geometry.gridWidth / 2 - 30,
            y: pixel.y + this._session.geometry.gridHeight / 2 - 30,
        }
    }

    protected abstract _drawStaticBoard(): Promise<void>
    protected abstract _drawHud(): void
    protected abstract _updateCrazyDave(ticks: number): void
    protected abstract _advanceCrazyDaveDialog(): boolean
    protected abstract _syncShovelTutorialAfterPickup(): void
    protected abstract _syncShovelTutorialAfterDig(previousPlantCount: number): void
    protected abstract _syncShovelTutorialAfterCancel(): void
    protected abstract _syncEntity(entity: GameEntity): void
    protected abstract _syncEntityLayerOrder(): void
    protected abstract _drawHitboxDebug(): void
    protected abstract _syncPlantHighlights(): void
    protected abstract _playZombieAnimation(entityId: number, animation: string): void
    protected abstract _playPlantAnimation(entityId: number, animation: string): void

    protected _wireInput() {
        this._bindDomKeyboardEvents()
        input.on(Input.EventType.MOUSE_DOWN, this._onGlobalMouseDown, this)
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this)
        this.node.on(Node.EventType.MOUSE_MOVE, (event: EventMouse) => {
            if (GameDebugSettings.isMobileMode()) return
            UIHoverManager.rememberMouseEvent(event)
        })
        this.node.on(Node.EventType.MOUSE_LEAVE, () => {
            if (GameDebugSettings.isMobileMode()) return
            if (UIHoverManager.isModalBlocked) {
                this._clearBoardHoverState()
                return
            }
            UIHoverManager.clearPointer()
        })
        this.node.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            if (GameDebugSettings.isMobileMode()) return
            if (event.getButton() === MOUSE_BUTTON_RIGHT) {
                this._onRightMouseCancel(event)
                return
            }
            if (event.getButton() !== 0) return
            const pixel = eventToBoardPixel(this.node, event)
            this._mousePixel = pixel
            this._hasCursorPointer = true
            this._handlePointerDown(pixel)
        })
        this.node.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            this._onMobileTouchMove(event)
        })
        this.node.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            UIHoverManager.rememberTouchEvent(event, false)
            const pixel = eventToBoardPixel(this.node, event)
            this._mousePixel = pixel
            this._hasCursorPointer = true
            this._lastTouchPixel = pixel
            if (this._session.selectedSeed) {
                const source = this._findSeedSourceAt(pixel, true)
                if (source) {
                    const canPickUp = this._canPickUpSeedSource(source)
                    if (canPickUp) {
                        this._resetMobilePlantPress()
                        this._session.dispatch({ type: 'clearCursor' })
                        this._selectSeedSource(source)
                        this._beginMobilePlantPress(pixel, source.rect)
                        this._renderFrame()
                    } else {
                        this._beginMobilePlantPress(pixel, source.rect, true)
                        this._updateCursorPreview()
                    }
                    return
                }
                this._beginMobilePlantPress(pixel, null)
                this._updateCursorPreview()
                return
            }
            if (this._session.selectedTool) {
                const toolRect = this._hitTool(pixel) === this._session.selectedTool
                    ? this._getToolBoardPixelRect(this._session.selectedTool)
                    : null
                this._beginMobileToolPress(pixel, toolRect, toolRect !== null)
                this._updateCursorPreview()
                return
            }
            const toolType = this._hitTool(pixel)
            this._handlePointerDown(pixel)
            if (toolType && this._session.selectedTool === toolType) {
                this._beginMobileToolPress(pixel, this._getToolBoardPixelRect(toolType))
                this._updateCursorPreview()
            }
        })
        this.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            this._onMobileTouchEnd(event)
        })
        this.node.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            if (!GameDebugSettings.isMobileMode()) return
            this._onMobileTouchCancel(event)
        })
    }

    protected _beginMobilePlantPress(
        pixel: { x: number, y: number },
        seedPacketRect: BoardPixelRect | null,
        cancelOnReleaseInside = false,
    ) {
        this._beginMobileCursorPress(pixel, seedPacketRect, cancelOnReleaseInside)
    }

    protected _beginMobileToolPress(
        pixel: { x: number, y: number },
        toolRect: BoardPixelRect | null,
        cancelOnReleaseInside = false,
    ) {
        this._beginMobileCursorPress(pixel, toolRect, cancelOnReleaseInside)
    }

    protected _beginMobileCursorPress(
        pixel: { x: number, y: number },
        sourceRect: BoardPixelRect | null,
        cancelOnReleaseInside = false,
    ) {
        this._mobileCursorPressActive = true
        this._mobileCursorPressSourceRect = sourceRect
        this._mobileCursorPressCancelOnReleaseInside = cancelOnReleaseInside
        this._mobileCursorPressLeftSource = this._isMobileCursorPressReady(pixel)
        this._lastTouchPixel = pixel
    }

    protected _onMobileTouchMove(event: EventTouch) {
        UIHoverManager.rememberTouchEvent(event, false)
        const pixel = eventToBoardPixel(this.node, event)
        const previous = this._lastTouchPixel
        this._mousePixel = pixel
        this._hasCursorPointer = true
        this._lastTouchPixel = pixel

        if (this._isMobileCursorPressReady(pixel)) {
            this._mobileCursorPressLeftSource = true
        }
        const collected = previous
            ? this._collectItemsAlongMobileSwipe(previous, pixel)
            : this._session.collectCurrencyItemAt(pixel.x, pixel.y)
        this._updateCursorPreview()
        if (collected) this._renderFrame()
    }

    protected _onMobileTouchEnd(event: EventTouch) {
        UIHoverManager.rememberTouchEvent(event, false)
        const previous = this._lastTouchPixel
        const eventPixel = eventToBoardPixel(this.node, event)
        const pixel = previous ?? eventPixel
        this._mousePixel = pixel
        this._hasCursorPointer = true
        this._lastTouchPixel = null

        const collected = previous
            ? this._collectItemsAlongMobileSwipe(previous, pixel)
            : this._session.collectCurrencyItemAt(pixel.x, pixel.y)
        const pressReady = this._isMobileCursorPressReady(pixel)
        const shouldResolvePlantTouch = this._mobileCursorPressActive &&
            pressReady &&
            !!this._session.selectedSeed
        const shouldCancelPlantTouch = this._mobileCursorPressActive &&
            (this._mobileCursorPressCancelOnReleaseInside || this._mobileCursorPressLeftSource) &&
            !pressReady &&
            !!this._session.selectedSeed
        const shouldResolveToolTouch = this._mobileCursorPressActive &&
            pressReady &&
            !!this._session.selectedTool
        const shouldCancelToolTouch = this._mobileCursorPressActive &&
            (this._mobileCursorPressCancelOnReleaseInside || this._mobileCursorPressLeftSource) &&
            !pressReady &&
            !!this._session.selectedTool
        this._resetMobilePlantPress()

        if (shouldCancelPlantTouch || shouldCancelToolTouch) {
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

        if (shouldResolveToolTouch) {
            const plantCount = this._session.plants.length
            this._refreshHoverAfterCursorRelease = false
            this._session.dispatch({ type: 'useToolAt', x: pixel.x, y: pixel.y })
            this._syncShovelTutorialAfterDig(plantCount)
            this._renderFrame()
            return
        }

        if (this._session.selectedTool) {
            this._hasCursorPointer = false
        }

        this._updateCursorPreview()
        if (collected) this._renderFrame()
    }

    protected _onMobileTouchCancel(event: EventTouch) {
        if (this._mobileCursorPressActive && (this._session.selectedSeed || this._session.selectedTool)) {
            this._onMobileTouchEnd(event)
            return
        }

        UIHoverManager.rememberTouchEvent(event, false)
        this._resetMobilePlantPress()
        this._updateCursorPreview()
    }

    protected _collectItemsAlongMobileSwipe(from: { x: number, y: number }, to: { x: number, y: number }) {
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

    protected _resetMobilePlantPress() {
        this._resetMobileCursorPress()
    }

    protected _resetMobileCursorPress() {
        this._mobileCursorPressActive = false
        this._mobileCursorPressCancelOnReleaseInside = false
        this._mobileCursorPressLeftSource = false
        this._mobileCursorPressSourceRect = null
        this._lastTouchPixel = null
    }

    protected _isMobilePlantPressReady(pixel = this._mousePixel) {
        return this._isMobileCursorPressReady(pixel)
    }

    protected _isMobileCursorPressReady(pixel = this._mousePixel) {
        if (!this._mobileCursorPressActive) return false

        const rect = this._mobileCursorPressSourceRect
        return !rect || !isPixelInRect(pixel, rect)
    }

    protected _onKeyDown(event: EventKeyboard) {
        if (event.keyCode !== 32 && event.keyCode !== 13) return

        const rawEvent = event.rawEvent as Event | undefined
        if (rawEvent && rawEvent === this._lastHandledKeyboardEvent) return
        this._handleAdvanceKey(event.keyCode)
    }

    protected _bindDomKeyboardEvents() {
        if (this._domKeyDownListener || !sys.isBrowser || typeof globalThis.addEventListener !== 'function') return

        this._domKeyDownListener = (event) => this._onDomKeyDown(event)
        globalThis.addEventListener('keydown', this._domKeyDownListener, true)
    }

    protected _unbindDomKeyboardEvents() {
        if (!this._domKeyDownListener) return
        if (typeof globalThis.removeEventListener === 'function') {
            globalThis.removeEventListener('keydown', this._domKeyDownListener, true)
        }
        this._domKeyDownListener = null
    }

    protected _onDomKeyDown(event: KeyboardEvent) {
        const keyCode = event.key === 'Enter' ? 13 : event.key === ' ' || event.code === 'Space' ? 32 : 0
        if (keyCode === 0) return

        if (this._handleAdvanceKey(keyCode)) {
            this._lastHandledKeyboardEvent = event
            event.preventDefault()
            event.stopPropagation()
        }
    }

    protected _handleAdvanceKey(keyCode: number) {
        if (this._advanceCrazyDaveDialog()) {
            this._renderFrame()
            return true
        }
        if (!this._gameStarted || this._session.result !== 'playing') return false
        if (this._session.paused) return false
        if (this._gameplayUpdatesPaused) return false
        if (keyCode !== 32) return false

        this.pauseGame()
        void SoundLoader.play(SoundEffect.Pause)
        this.onPauseRequest?.()
        return true
    }

    protected _onGlobalMouseDown(event: EventMouse) {
        if (GameDebugSettings.isMobileMode()) return

        if (event.getButton() !== MOUSE_BUTTON_RIGHT) return
        this._onRightMouseCancel(event)
    }

    protected _onRightMouseCancel(event: EventMouse) {
        if (!this._canUseBoardInput()) return
        if (this._isCrazyDaveBoardInputBlocked()) return
        if (this._isDuplicateRightMouseDown(event)) return

        UIButton.rememberMouseLocation(event)
        const pixel = eventToBoardPixel(this.node, event)
        this._mousePixel = pixel
        this._hasCursorPointer = true

        const seedSource = this._findSeedSourceAt(pixel, true)
        if (seedSource && !this._hasCursorObject()) {
            this._selectSeedSource(seedSource)
            this._renderFrame()
            event.propagationStopped = true
            return
        }

        if (!this._hasCursorObject()) {
            return
        }

        const canceled = this._cancelCursor(true)
        if (canceled) this._syncShovelTutorialAfterCancel()
        event.propagationStopped = true
    }

    protected _isDuplicateRightMouseDown(event: EventMouse) {
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

    protected _handlePointerDown(pixel: { x: number, y: number }) {
        if (!this._canUseBoardInput()) return

        if (this._advanceCrazyDaveDialog()) {
            this._renderFrame()
            return
        }
        if (this._isCrazyDaveBoardInputBlocked()) return

        if (this._session.selectedSeed) {
            const seedSource = this._findSeedSourceAt(pixel, true)
            if (seedSource) {
                this._cancelCursor(true)
                return
            }
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
            const plantCount = this._session.plants.length
            this._refreshHoverAfterCursorRelease = false
            this._session.dispatch({ type: 'useToolAt', x: pixel.x, y: pixel.y })
            this._syncShovelTutorialAfterDig(plantCount)
            this._renderFrame()
            return
        }

        const seedSource = this._findSeedSourceAt(pixel)
        if (seedSource) {
            this._selectSeedSource(seedSource)
            this._renderFrame()
            return
        }

        const toolType = this._hitTool(pixel)
        if (toolType) {
            this._session.dispatch({ type: 'selectTool', toolType })
            this._syncShovelTutorialAfterPickup()
            this._renderFrame()
            return
        }

        this._session.dispatch({ type: 'placePlant', x: pixel.x, y: pixel.y })
        this._renderFrame()
    }

    protected _canUseBoardInput() {
        return this._gameStarted && this._session.result === 'playing' && !this._session.paused && !this._levelCompleteActive
    }

    protected _isCrazyDaveBoardInputBlocked() {
        return this._gameplayUpdatesPaused && !this._canUseShovelTutorialInput()
    }

    protected _canUseShovelTutorialInput() {
        return this._crazyDaveDialogPhase === 'shovel' && this._crazyDaveHidden
    }

    protected _cancelCursor(refreshHover = true) {
        if (!this._hasCursorObject()) return false

        this._refreshHoverAfterCursorRelease = refreshHover
        this._session.dispatch({ type: 'clearCursor' })
        void SoundLoader.play(SoundEffect.Drop)
        this._renderFrame()
        return true
    }

    protected _hasCursorObject() {
        return !!this._session.selectedSeed || !!this._session.selectedTool
    }

    protected _syncPlantCursorHoverBlock() {
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

    protected _releasePlantCursorHoverBlock() {
        if (!this._plantCursorHoverBlocked) return

        this._plantCursorHoverBlocked = false
        UIButton.endHoverSuppress(false)
        this._refreshHoverAfterCursorRelease = true
    }

    protected _renderFrame() {
        if (this._gameStarted) {
            this._handleEvents(this._session.drainEvents())
        }
        this._syncPlantCursorHoverBlock()
        this._syncSunAmount()
        this._syncMoneyCounter()
        this._resultLabel.string = ''

        if (this._gameStarted) {
            for (const entity of this._session.allEntities()) {
                this._syncEntity(entity)
            }
        }
        if (this._gameStarted && !this._gameOverActive) this._syncBoardPosition()
        this._syncEntityLayerOrder()
        this._drawHitboxDebug()
        this._restoreGameplayLayerOrder()
        this._syncGameOverLayerOrder()
        this._syncPlantHighlights()
        this._syncSeedPacketState()
        this._syncConveyorVisibility()
        this._syncProgressMeter()
        this._syncTutorialLawnFlash()
        this._syncShovelState()
        this._syncGameplayHudVisibility()
        this._syncCrazyDaveState()
        this._crazyDave?.syncBubbleShake()
        this._updateCursorPreview()
        this._updateHoverItemAndSeedPacketState()
    }

    protected _updateIntro(dt: number) {
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
        if (!this._shouldPlayReadySetPlantIntro() &&
            !this._introMusicFadeStarted &&
            this._introTime >= introEnd - NO_READY_SET_PLANT_MUSIC_FADE_TICKS) {
            this._introMusicFadeStarted = true
            MusicSystem.fadeOut(NO_READY_SET_PLANT_MUSIC_FADE_TICKS)
        }
        if (this._shouldPlayIntroSodRoll()) this._updateIntroSod()
        this._syncIntroLawnMower()
        this._syncIntroSeedBank()

        if (this._introTime < introEnd) return

        this._session.completeReadySetPlantIntro()
        this._gameStarted = true
        this._gameplayUpdatesPaused = false
        this._boardContent.setPosition(0, 0, 0)
        this._applyGameplayBoardState()
        for (const view of this._sodRollViews) view.node.active = false
        for (const view of this._introLawnMowerViews) {
            view.node.active = false
            view.shadowNode.active = false
        }
        this._destroyIntroStreetZombies()
        this._applyGameplayHudState()
        this._restoreGameplayLayerOrder()
        this._startGameplayMusic()
    }

    protected _startGameWithoutStandardIntro() {
        this._session.completeReadySetPlantIntro()
        this._gameStarted = true
        this._gameplayUpdatesPaused = this._session.level.pauseGameplayOnStart === true
        this._boardContent.setPosition(0, 0, 0)
        this._applyGameplayBoardState()
        this._destroyIntroStreetZombies()
        this._applyGameplayHudState()
        this._restoreGameplayLayerOrder()
        if (!this._gameplayUpdatesPaused) this._startGameplayMusic()
    }

    protected _startGameplayMusic() {
        if (this._gameplayMusicStarted) return

        const tune = getLevelGameplayMusicTune(this._session.level)
        if (!tune) return

        this._gameplayMusicStarted = true
        void MusicSystem.playTune(tune)
    }

    protected _applyGameplayBoardState() {
        const fullLawn = this._startsWithFullLawn()
        if (this._soddedNode) this._soddedNode.active = fullLawn
        if (this._unsoddedNode) this._unsoddedNode.active = !fullLawn
        if (this._sodBaseNode) this._sodBaseNode.active = !fullLawn
        if (this._sodClipNode) this._sodClipNode.active = !fullLawn
        for (const view of this._sodRollViews) view.node.active = false
    }

    protected _applyGameplayHudState() {
        const minimalHud = this._usesMinimalHud()
        const seedBankVisible = !minimalHud && (!this._gameplayUpdatesPaused || this._isGameplaySeedBankIntroActive())
        if (this._seedBankNode) {
            this._seedBankNode.active = seedBankVisible
            this._seedBankNode.setPosition(
                this._gameplaySeedBankX(),
                this._isGameplaySeedBankIntroActive() || (this._gameplayUpdatesPaused && this._session.level.pauseGameplayOnStart === true)
                    ? this._seedBankHeight
                    : 0,
                10,
            )
        }
        this._syncGameplayHudVisibility()
        this._setSeedBankContentsVisible(seedBankVisible)
        this._syncConveyorVisibility()
    }

    protected _syncGameplayHudVisibility() {
        if (this._menuButtonNode) {
            this._menuButtonNode.active = !this._usesMinimalHud() && this._isGameplayHudVisible()
        }
    }

    protected _isGameplayHudVisible() {
        return this._gameStarted &&
            !this._gameplayUpdatesPaused &&
            !this._isGameplayLawnMowerIntroActive() &&
            !this._isGameplaySeedBankIntroActive() &&
            !this._gameOverActive
    }

    protected _gameplaySeedBankX() {
        return INTRO_SEED_BANK_X
    }

    protected _shouldPlayReadySetPlantIntro() {
        return (this._session.level.adventureLevel ?? 1) >= 3 && !this._session.level.suppressReadySetPlant
    }

    protected _shouldSkipStandardIntro() {
        return this._session.level.skipIntro === true
    }

    protected _startsWithFullLawn() {
        return this._session.level.startWithFullLawn === true
    }

    protected _usesMinimalHud() {
        return this._session.level.hideSeedBank === true
    }

    protected _introEndTime() {
        if (this._shouldPlayIntroSodRoll() && this._shouldPlayReadySetPlantIntro()) {
            return INTRO_SOD_READY_SET_PLANT_END
        }
        if (!this._shouldPlayIntroSodRoll() && this._shouldPlayReadySetPlantIntro()) {
            return INTRO_NO_SOD_READY_SET_PLANT_END
        }

        return INTRO_END
    }

    protected _destroyIntroStreetZombies() {
        for (const node of this._introStreetZombieNodes) {
            if (node.isValid) node.destroy()
        }
        this._introStreetZombieNodes = []
    }

    protected _syncIntroSeedBank() {
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
        this._syncConveyorPacketState()
        this._syncConveyorVisibility()
        const y = this._introTime <= seedBankEnd
            ? easeInOut(seedBankStart, seedBankEnd, this._introTime, this._seedBankHeight, 0)
            : 0
        this._seedBankNode.setPosition(INTRO_SEED_BANK_X, y, 10)
    }

    protected _introSeedBankOnStart() {
        return this._shouldPlayIntroSodRoll() ? INTRO_SEED_BANK_ON_START : INTRO_SEED_BANK_NO_SOD_ON_START
    }

    protected _introSeedBankOnEnd() {
        return this._shouldPlayIntroSodRoll() ? INTRO_SEED_BANK_ON_END : INTRO_SEED_BANK_NO_SOD_ON_END
    }

    protected _introBoardX() {
        if (this._introTime <= INTRO_PAN_RIGHT_START) return BOARD_OFFSET
        if (this._introTime <= INTRO_PAN_RIGHT_END) {
            return easeInOut(
                INTRO_PAN_RIGHT_START,
                INTRO_PAN_RIGHT_END,
                this._introTime,
                BOARD_OFFSET,
                BOARD_RIGHT_X,
            )
        }
        if (this._introTime <= INTRO_PAN_LEFT_START) return BOARD_RIGHT_X
        if (this._introTime <= INTRO_PAN_LEFT_END) {
            return easeInOut(
                INTRO_PAN_LEFT_START,
                INTRO_PAN_LEFT_END,
                this._introTime,
                BOARD_RIGHT_X,
                0,
            )
        }
        return 0
    }

    protected _startSodRoll() {
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
        this._sodRollParticleSystems = this._introSodParticleSpecs().map((spec) =>
            TodParticleSystem.spawn({
                parent: this._boardContent,
                effect: 'sodroll',
                x: spec.x,
                y: -spec.y,
                z: 0,
            }),
        )
        for (const system of this._sodRollParticleSystems) {
            system.node.setSiblingIndex(this._boardContent.children.length - 1)
        }
        void SoundLoader.play(SoundEffect.DiggerZombie)
    }

    protected _updateIntroSod() {
        if (!this._sodClipNode) return

        const transform = this._sodClipNode.getComponent(UITransform)
        const height = transform?.height ?? 127
        if (this._introTime < INTRO_ROLL_SOD_START) {
            setUISize(this._sodClipNode, 0, height, 0, 1)
            for (const view of this._sodRollViews) view.node.active = false
            return
        }

        const sodWidth = this._sodClipRevealWidth
        const progress = linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime, 0, 1)
        const rollProgress = linearFloat(INTRO_ROLL_SOD_START, INTRO_ROLL_SOD_END, this._introTime + 1, 0, 1)
        setUISize(this._sodClipNode, sodWidth * progress, height, 0, 1)
        this._syncSodRollAnimation(rollProgress)
        for (const view of this._sodRollViews) {
            view.node.active = rollProgress < 1
            if (view.node.active) {
                view.node.setSiblingIndex(this._boardContent.children.length - 1)
            }
        }
        this._sodRollParticleSystems = this._sodRollParticleSystems.filter((system) => {
            const node = system?.node
            if (!system?.isValid || !node?.isValid) return false

            node.setSiblingIndex(this._boardContent.children.length - 1)
            return true
        })
    }

    protected _introSodParticleSpecs() {
        if (this._session.level.adventureLevel === 4) {
            return [{ x: 32, y: 150 }, { x: 32, y: 511 }]
        }
        if (this._session.level.adventureLevel === 2) {
            return [{ x: 35, y: 246 }, { x: 35, y: 459 }]
        }
        return [{ x: 35, y: 348 }]
    }

    protected _syncIntroLawnMower(forcedX?: number) {
        const shadowOffset = this._getReadyLawnMowerShadowOffset()
        for (const view of this._introLawnMowerViews) {
            const start = this._introLawnMowerStartTime(view.row)
            const visible = forcedX != null || this._introTime > start
            view.node.active = visible
            view.shadowNode.active = visible
            if (!visible) continue

            const mowerX = forcedX ?? easeInOut(
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

    protected _introLawnMowerStartTime(row: number) {
        const baseStart = this._shouldPlayIntroSodRoll() ? INTRO_LAWN_MOWER_START : INTRO_LAWN_MOWER_NO_SOD_START
        return baseStart + (INTRO_LAWN_MOWER_ROW - row) * INTRO_LAWN_MOWER_ROW_START_STEP
    }

    protected _introLawnMowerDuration() {
        if (!this._shouldPlayIntroSodRoll()) return INTRO_LAWN_MOWER_NO_SOD_END - INTRO_LAWN_MOWER_NO_SOD_START

        return INTRO_LAWN_MOWER_END - INTRO_LAWN_MOWER_START
    }

    protected _startGameplayLawnMowerIntro() {
        if (this._session.level.hasLawnMowers === false || this._session.lawnMowers.length === 0) {
            this._finishGameplayLawnMowerIntro()
            return
        }

        this._gameplayLawnMowerIntroTicks = 0
        this._gameplayUpdatesPaused = true
        for (const view of this._introLawnMowerViews) {
            view.node.active = false
            view.shadowNode.active = false
        }
        this._syncGameplayLawnMowerIntro()
        this._syncGameplayHudVisibility()
    }

    protected _updateGameplayLawnMowerIntro(ticks: number) {
        if (!this._isGameplayLawnMowerIntroActive()) return

        this._gameplayLawnMowerIntroTicks += ticks
        this._syncGameplayLawnMowerIntro()
        if (this._gameplayLawnMowerIntroTicks >= this._gameplayLawnMowerIntroEnd()) {
            this._finishGameplayLawnMowerIntro()
        }
    }

    protected _syncGameplayLawnMowerIntro() {
        for (const mower of this._session.lawnMowers) this._syncEntity(mower)
        this._restoreGameplayLayerOrder()
    }

    protected _finishGameplayLawnMowerIntro() {
        this._gameplayLawnMowerIntroTicks = -1
        for (const view of this._introLawnMowerViews) {
            view.node.active = false
            view.shadowNode.active = false
        }
        this._startGameplaySeedBankIntro()
    }

    protected _isGameplayLawnMowerIntroActive() {
        return this._gameplayLawnMowerIntroTicks >= 0
    }

    protected _gameplayLawnMowerIntroStartTime(row: number) {
        const starts = this._session.lawnMowers.map((mower) => (INTRO_LAWN_MOWER_ROW - mower.row) * INTRO_LAWN_MOWER_ROW_START_STEP)
        const minStart = starts.length > 0 ? Math.min(...starts) : 0
        return GAMEPLAY_LAWN_MOWER_INTRO_START + (INTRO_LAWN_MOWER_ROW - row) * INTRO_LAWN_MOWER_ROW_START_STEP - minStart
    }

    protected _gameplayLawnMowerIntroEnd() {
        const starts = this._session.lawnMowers.map((mower) => this._gameplayLawnMowerIntroStartTime(mower.row))
        return (starts.length > 0 ? Math.max(...starts) : 0) + this._introLawnMowerDuration()
    }

    protected _isGameplayLawnMowerEntityVisible(mower: LawnMowerEntity) {
        if (!this._gameStarted || this._gameOverActive || mower.dead) return false
        if (!this._isGameplayLawnMowerIntroActive()) {
            if (this._isGameplaySeedBankIntroActive()) return true
            return !this._gameplayUpdatesPaused
        }
        return mower.state === 'ready' && this._gameplayLawnMowerIntroTicks >= this._gameplayLawnMowerIntroStartTime(mower.row)
    }

    protected _gameplayLawnMowerRenderX(mower: LawnMowerEntity, fallbackX: number) {
        if (!this._isGameplayLawnMowerIntroActive() || mower.state !== 'ready') return fallbackX

        const start = this._gameplayLawnMowerIntroStartTime(mower.row)
        return easeInOut(
            start,
            start + this._introLawnMowerDuration(),
            this._gameplayLawnMowerIntroTicks,
            INTRO_LAWN_MOWER_START_X,
            INTRO_LAWN_MOWER_END_X,
        )
    }

    protected _startGameplaySeedBankIntro() {
        if (!this._seedBankNode?.isValid || this._usesMinimalHud()) {
            this._finishGameplaySeedBankIntro()
            return
        }

        this._gameplaySeedBankIntroTicks = 0
        this._gameplayUpdatesPaused = true
        this._syncGameplaySeedBankIntro()
        this._syncGameplayHudVisibility()
    }

    protected _updateGameplaySeedBankIntro(ticks: number) {
        if (!this._isGameplaySeedBankIntroActive()) return

        this._gameplaySeedBankIntroTicks += ticks
        this._syncGameplaySeedBankIntro()
        if (this._gameplaySeedBankIntroTicks >= GAMEPLAY_SEED_BANK_INTRO_DURATION) {
            this._finishGameplaySeedBankIntro()
        }
    }

    protected _syncGameplaySeedBankIntro() {
        if (!this._seedBankNode?.isValid) return

        const y = easeInOut(0, GAMEPLAY_SEED_BANK_INTRO_DURATION, this._gameplaySeedBankIntroTicks, this._seedBankHeight, 0)
        this._seedBankNode.active = true
        this._seedBankNode.setPosition(this._gameplaySeedBankX(), y, 10)
        this._setSeedBankContentsVisible(true)
        this._syncConveyorPacketState()
        this._syncConveyorVisibility()
    }

    protected _finishGameplaySeedBankIntro() {
        this._gameplaySeedBankIntroTicks = -1
        if (this._seedBankNode?.isValid) {
            this._seedBankNode.active = !this._usesMinimalHud()
            this._seedBankNode.setPosition(this._gameplaySeedBankX(), 0, 10)
        }
        this._setSeedBankContentsVisible(!this._usesMinimalHud())
        this._gameplayUpdatesPaused = false
        this._syncGameplayHudVisibility()
        this._syncConveyorVisibility()
        this._startGameplayMusic()
    }

    protected _isGameplaySeedBankIntroActive() {
        return this._gameplaySeedBankIntroTicks >= 0
    }

    protected _introLawnMowerY(row: number) {
        return this._session.geometry.gridToPixel(0, row).y + LAWN_MOWER_Y_OFFSET
    }

    protected _getReadyLawnMowerShadowOffset() {
        const shadow = SpriteLoader.get('plantshadow')
        return {
            x: INTRO_LAWN_MOWER_SHADOW_X_OFFSET + (shadow?.originalSize.width ?? 86) / 2,
            y: INTRO_LAWN_MOWER_SHADOW_Y_OFFSET + (shadow?.originalSize.height ?? 36) / 2,
        }
    }

    protected _createAdviceWidget() {
        this._adviceWidget = new AdviceWidget({
            parent: this._uiLayer,
            layer: this.node.layer,
            font: this._adviceFont,
        })
    }

    protected _showIntroHouseName() {
        const playerName = ProfileStore.getCurrentProfile()?.name || DEFAULT_PLAYER_NAME
        this._showHouseName(this._formatLawnString('PLAYERS_HOUSE', `${playerName}'s House`, {
            PLAYER: playerName,
        }))
    }

    protected _showAdvice(message: string, style: AdviceStyle) {
        this._adviceWidget?.show(this._localizedAdviceMessage(message), style)
        this._syncItemLayerBehindAdvice()
    }

    protected _clearAdvice() {
        this._adviceWidget?.clear()
    }

    protected _updateAdviceWidget(ticks: number) {
        this._adviceWidget?.update(ticks, this._session.tick)
        this._updateHouseName(ticks)
        this._updateHugeWaveText(ticks)
    }

    protected _showHouseName(message: string) {
        this._ensureHouseNameNode()
        if (!this._houseNameLabel) return

        this._houseNameTicks = INTRO_HOUSE_NAME_DURATION
        this._houseNameLabel.string = message
        this._houseNameLabel.forceRebuild()
        if (this._houseNameNode) this._houseNameNode.active = true
        this._syncHouseName()
    }

    protected _ensureHouseNameNode() {
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
        this._houseNameLabel.fontSize = 0
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

    protected _updateHouseName(ticks: number) {
        if (!this._houseNameNode?.active) return

        this._houseNameTicks = Math.max(0, this._houseNameTicks - ticks)
        if (this._houseNameTicks === 0) {
            this._houseNameNode.active = false
            return
        }
        this._syncHouseName()
    }

    protected _syncHouseName() {
        const opacity = this._houseNameNode?.getComponent(UIOpacity)
        if (opacity) opacity.opacity = Math.max(0, Math.min(255, this._houseNameTicks * 15))
    }

    protected _showHugeWaveText() {
        this._ensureHugeWaveTextNode()
        if (!this._hugeWaveTextLabel) return

        this._hugeWaveTextTicks = HUGE_WAVE_TEXT_DURATION
        this._hugeWaveTextLabel.string = this._lawnString('ADVICE_HUGE_WAVE', HUGE_WAVE_TEXT)
        this._hugeWaveTextLabel.forceRebuild()
        if (this._hugeWaveTextNode) this._hugeWaveTextNode.active = true
        this._syncHugeWaveText()
    }

    protected _ensureHugeWaveTextNode() {
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
        this._hugeWaveTextLabel.fontSize = 0
        this._hugeWaveTextLabel.lineSpacing = 0
        this._hugeWaveTextLabel.maxWidth = this._session.geometry.width - 40
        this._hugeWaveTextLabel.textAlign = 2
        this._hugeWaveTextLabel.forceRebuild()
        labelNode.setPosition(-this._session.geometry.width / 2 + 20, this._hugeWaveTextLocalTopY(), 0)
        this._hugeWaveTextNode.active = false
    }

    protected _updateHugeWaveText(ticks: number) {
        if (!this._hugeWaveTextNode?.active) return

        this._hugeWaveTextTicks = Math.max(0, this._hugeWaveTextTicks - ticks)
        if (this._hugeWaveTextTicks === 0) {
            this._hugeWaveTextNode.active = false
            return
        }
        this._syncHugeWaveText()
    }

    protected _clearHugeWaveText() {
        if (!this._hugeWaveTextNode?.isValid) return

        this._hugeWaveTextTicks = 0
        this._hugeWaveTextNode.active = false
        this._hugeWaveTextNode.setScale(1, 1, 1)
        const opacity = this._hugeWaveTextNode.getComponent(UIOpacity)
        if (opacity) opacity.opacity = 255
    }

    protected _syncHugeWaveText() {
        if (!this._hugeWaveTextNode?.isValid) return

        const elapsedTicks = HUGE_WAVE_TEXT_DURATION - this._hugeWaveTextTicks
        let scale = 1
        let alpha = 1
        if (elapsedTicks < HUGE_WAVE_TEXT_ENTER_TICKS) {
            const t = Math.max(0, elapsedTicks) / HUGE_WAVE_TEXT_ENTER_TICKS
            scale = lerp(2.003, 1.001, t)
            alpha = t
        } else if (this._hugeWaveTextTicks < HUGE_WAVE_TEXT_LEAVE_TICKS) {
            alpha = Math.max(0, this._hugeWaveTextTicks / HUGE_WAVE_TEXT_LEAVE_TICKS)
        }

        this._hugeWaveTextNode.setScale(scale, scale, 1)
        const opacity = this._hugeWaveTextNode.getComponent(UIOpacity)
        if (opacity) opacity.opacity = Math.round(255 * alpha)
    }

    protected _hugeWaveTextLocalTopY() {
        const fontConfig = this._adviceFont?.config ?? null
        const metrics = FontMetricsUtil.getMetrics(fontConfig)
        const ascent = metrics.ascent > 0 ? metrics.ascent : 28

        return HUGE_WAVE_TEXT_HEIGHT / 2 + ascent
    }

    protected _updateTimedUiEffects(ticks: number) {
        if (this._sunFlashTicks > 0) {
            this._sunFlashTicks = Math.max(0, this._sunFlashTicks - ticks)
        }
        if (this._coinBankFadeTicks > 0) {
            this._coinBankFadeTicks = Math.max(0, this._coinBankFadeTicks - ticks)
        }
        if (this._boardShakeTicks > 0) {
            this._boardShakeTicks = Math.max(0, this._boardShakeTicks - ticks)
            if (this._boardShakeTicks > 0 && Math.floor(Math.random() * 3) === 0) {
                this._boardShakeAmountX = -this._boardShakeAmountX
            }
        }
    }

    protected _startBoardShake(amountX: number, amountY: number, ticks = BOARD_SHAKE_TICKS) {
        this._boardShakeTicks = ticks
        this._boardShakeAmountX = amountX
        this._boardShakeAmountY = amountY
    }

    protected _syncBoardPosition(baseX = 0, baseY = 0) {
        const offset = this._boardShakeOffset()
        this._boardRoot.setPosition(BOARD_ROOT_X + offset.x, BOARD_ROOT_Y + offset.y, 0)
        this._boardContent.setPosition(baseX, baseY, 0)
        this._itemLayer.setPosition(baseX, baseY, 0)
    }

    protected _boardShakeOffset() {
        if (this._boardShakeTicks <= 0) return { x: 0, y: 0 }

        const t = 1 - this._boardShakeTicks / BOARD_SHAKE_TICKS
        const bounce = 1 - Math.abs(2 * t - 1)
        return {
            x: Math.round(this._boardShakeAmountX * bounce),
            y: Math.round(this._boardShakeAmountY * bounce),
        }
    }

    protected _restoreGameplayLayerOrder() {
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

    protected _syncSodRollAnimation(progress: number) {
        for (const view of this._sodRollViews) {
            const duration = view.animNode.getAnimationDuration('default')
            if (!duration) continue

            view.animNode.time = Math.max(0, duration - 1) * progress
        }
    }

    protected _handleEvents(events: GameEvent[]) {
        for (const event of events) {
            switch (event.type) {
                case 'entitySpawned':
                    this._syncEntityById(event.entityId)
                    break
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
                case 'coinBankShown':
                    this._showMoneyCounter()
                    break
                case 'moneyChanged':
                    this.onMoneyChanged?.(event.amount)
                    break
                case 'boardShake':
                    this._startBoardShake(event.amountX, event.amountY)
                    break
                case 'cherryBombDetonated':
                case 'explodeONutDetonated':
                    this._spawnParticleAt('powie', event.x, event.y, 10000)
                    break
                case 'particleRequested':
                    this._spawnZombiePartParticle(event.entityId, event.effect)
                    break
                case 'particleAtRequested':
                    this._spawnParticleAt(event.effect, event.x, event.y, event.renderOrder, event.tint)
                    break
                case 'particleAttachedRequested':
                    this._spawnAttachedZombieParticle(
                        event.entityId,
                        event.effect,
                        event.x,
                        event.y,
                    )
                    break
                case 'particleEntityAttachedRequested':
                    this._spawnAttachedEntityParticle(event.entityId, event.effect, event.x, event.y, event.z)
                    break
                case 'seedPacketFlashRequested':
                    this._spawnSeedPacketFlash(event.seedType)
                    break
                case 'finalWave':
                    this._showFinalWaveWarning()
                    break
                case 'musicBurstRequested':
                    MusicSystem.startBurst()
                    break
                case 'levelAwardCollected':
                    this._playLevelAwardCollectedEffects(
                        event.entityId,
                        event.x,
                        event.y,
                    )
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

    protected _showFinalWaveWarning() {
        this._clearAdvice()
        this._clearHugeWaveText()
        void this._playFinalWaveWarning()
    }

    protected _spawnZombiePartParticle(entityId: number, effect: TodParticleEffect) {
        const view = this._zombieViews.get(entityId)
        if (!view?.node.isValid) return

        const trackNames: Partial<Record<TodParticleEffect, string>> = {
            zombiehead: 'anim_head1',
            zombiearm: 'Zombie_outerarm_lower',
            zombiepolevaulterhead: 'anim_head1',
            zombiepolevaulterarm: 'Zombie_polevaulter_outerarm_lower',
            moweredzombiehead: 'anim_head1',
            moweredzombiearm: 'Zombie_outerarm_lower',
            moweredzombiepolevaulterhead: 'anim_head1',
            moweredzombiepolevaulterarm: 'Zombie_polevaulter_outerarm_lower',
            zombietrafficcone: 'anim_cone',
            zombiepail: 'anim_bucket',
            zombieflag: 'Zombie_flag',
        }
        const fallbackOffsets: Partial<Record<TodParticleEffect, { x: number; y: number }>> = {
            zombiehead: { x: 58, y: -30 },
            zombiearm: { x: 25, y: -55 },
            zombiepolevaulterhead: { x: 58, y: -30 },
            zombiepolevaulterarm: { x: 25, y: -55 },
            moweredzombiehead: { x: 58, y: -30 },
            moweredzombiearm: { x: 25, y: -55 },
            moweredzombiepolevaulterhead: { x: 58, y: -30 },
            moweredzombiepolevaulterarm: { x: 25, y: -55 },
            zombietrafficcone: { x: 58, y: -18 },
            zombiepail: { x: 58, y: -18 },
            zombieflag: { x: 18, y: -42 },
        }

        const trackName = trackNames[effect]
        const fallback = fallbackOffsets[effect]
        if (!trackName || !fallback) return

        const trackWorldPosition = view.animator?.getTrackWorldPosition(trackName)
        const entityLayerTransform = this._entityLayer.getComponent(UITransform)
        const localPosition = trackWorldPosition && entityLayerTransform
            ? entityLayerTransform.convertToNodeSpaceAR(trackWorldPosition)
            : null
        const x = localPosition?.x ?? view.node.position.x + fallback.x
        const y = localPosition?.y ?? view.node.position.y + fallback.y
        const zombie = this._session.zombies.find((candidate) => candidate.id === entityId)
        const renderOrder = zombie
            ? this._entityLayerOrder(zombie) + 0.01
            : this._zombiePartFallbackRenderOrder(view.node.position.y)
        TodParticleSystem.spawn({
            parent: this._entityLayer,
            effect,
            x,
            y,
            renderOrder,
        })
    }

    protected _zombiePartFallbackRenderOrder(nodeY: number) {
        let nearestRow = this._session.level.activeRows[0] ?? 0
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const row of this._session.level.activeRows) {
            const rowY = this._session.geometry.gridToPixel(0, row).y
            const distance = Math.abs(rowY + nodeY)
            if (distance >= nearestDistance) continue

            nearestDistance = distance
            nearestRow = row
        }
        return nearestRow * 10 + 1.01
    }

    protected _spawnParticleAt(
        effect: TodParticleEffect,
        x: number,
        y: number,
        renderOrder = this._particleRenderOrderForEffect(effect, y),
        tint?: { r: number, g: number, b: number },
    ) {
        TodParticleSystem.spawn({
            parent: this._entityLayer,
            effect,
            x,
            y: -y,
            renderOrder,
            tint: tint ? new Color(tint.r, tint.g, tint.b, 255) : undefined,
        })
    }

    protected _particleRenderOrderForEffect(effect: TodParticleEffect, y: number) {
        const row = this._nearestRenderRowForY(y)
        switch (effect) {
            case 'planting':
                return 10000
            case 'potatominerise':
                return this._rowParticleRenderOrder(row, 0.4)
            case 'wallnuteatsmall':
                return this._rowParticleRenderOrder(row, 1.1)
            case 'snowpeapuff':
                return this._rowParticleRenderOrder(row, 3.1)
            case 'potatomine':
                return this._rowParticleRenderOrder(row, 4)
            case 'wallnuteatlarge':
                return this._rowParticleRenderOrder(row, 0.9)
            default:
                return this._rowParticleRenderOrder(row, 0.4)
        }
    }

    protected _rowParticleRenderOrder(row: number, offset: number) {
        return row * 10 + offset
    }

    protected _nearestRenderRowForY(y: number) {
        let nearestRow = this._session.level.activeRows[0] ?? 0
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const row of this._session.level.activeRows) {
            const rowY = this._session.geometry.gridToPixel(0, row).y
            const distance = Math.abs(rowY - y)
            if (distance >= nearestDistance) continue

            nearestDistance = distance
            nearestRow = row
        }
        return nearestRow
    }

    protected _spawnAttachedZombieParticle(
        entityId: number,
        effect: TodParticleEffect,
        x: number,
        y: number,
    ) {
        const view = this._zombieViews.get(entityId)
        if (!view?.node.isValid) return

        const system = TodParticleSystem.spawn({
            parent: view.node,
            effect,
            x,
            y: -y,
            z: 1,
        })
        system.node.setSiblingIndex(view.node.children.length - 1)
    }

    protected _spawnAttachedEntityParticle(
        entityId: number,
        effect: TodParticleEffect,
        x: number,
        y: number,
        z = 1,
    ) {
        const entity = this._findEntityById(entityId)
        const node = this._entityNodes.get(entityId)
        if (!entity || !node?.isValid) return false

        const system = TodParticleSystem.spawn({
            parent: node,
            effect,
            x,
            y: -y,
            z,
        })
        system.node.setSiblingIndex(z <= 0 ? 0 : node.children.length - 1)
        return true
    }

    protected _findEntityById(entityId: number): GameEntity | null {
        return this._session.allEntities().find((entity) => entity.id === entityId) ?? null
    }

    protected _syncEntityById(entityId: number) {
        const entity = this._findEntityById(entityId)
        if (!entity) return false

        this._syncEntity(entity)
        return true
    }

    protected _spawnSeedPacketFlash(seedType: SeedType) {
        const packetNode = this._seedPacketViews.get(seedType)?.node
        if (!packetNode?.isValid) return

        const flash = TodParticleSystem.spawn({
            parent: packetNode,
            effect: 'seedpacketflash',
            x: 0,
            y: 0,
            z: 16,
        })
        flash.node.setSiblingIndex(packetNode.children.length - 1)
    }

    protected _playLevelAwardCollectedEffects(
        entityId: number,
        x: number,
        y: number,
    ) {
        const itemNode = this._entityNodes.get(entityId)

        const starburst = TodParticleSystem.spawn({
            parent: this._itemLayer,
            effect: 'starburst',
            x: x + 30,
            y: -(y + 30),
            z: 1,
        })
        starburst.node.setSiblingIndex(this._itemLayer.children.length - 1)

        if (!itemNode?.isValid) return

        const pickup = TodParticleSystem.spawn({
            parent: itemNode,
            effect: 'award',
            x: 0,
            y: 0,
            z: -1,
        })
        pickup.node.setSiblingIndex(0)
    }

    protected _showReadySetPlant() {
        this._clearAdvice()
        this._introMusicFadeStarted = true
        MusicSystem.fadeOut(150)
        void SoundLoader.play(SoundEffect.ReadySetPlant)
        void this._playReadySetPlant()
    }

    protected async _playReadySetPlant() {
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

    protected _destroyReadySetPlant(expectedNode?: Node) {
        if (expectedNode && this._readySetPlantNode !== expectedNode) return

        if (this._readySetPlantNode?.isValid) this._readySetPlantNode.destroy()
        this._readySetPlantNode = null
        this._readySetPlantAnimNode = null
    }

    protected async _playFinalWaveWarning() {
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

    protected _destroyFinalWaveWarning(expectedNode?: Node) {
        if (expectedNode && this._finalWaveNode !== expectedNode) return

        if (this._finalWaveNode?.isValid) this._finalWaveNode.destroy()
        this._finalWaveNode = null
        this._finalWaveAnimNode = null
    }

    protected abstract _startLevelCompleteEffect(): void
    protected abstract _updateLevelCompleteEffect(ticks: number): void
    protected abstract _syncLevelCompleteEffect(): void
    protected abstract _startGameOver(zombieId: number | null): void
    protected abstract _updateGameOver(ticks: number): void

    protected _syncSeedPacketState() {
        for (let i = 0; i < this._session.seedPackets.length; i++) {
            const packet = this._session.seedPackets[i]
            const view = this._seedPacketViews.get(packet.seedType)
            if (!view) continue
            view.node.setPosition(this._getSeedPacketPositionX(i), -8, 10)
            view.sync({
                gameStarted: this._gameStarted,
                active: packet.active,
                selected: packet.selected,
                cooldownRemaining: packet.cooldownRemaining,
                cooldownTotal: packet.cooldownTotal,
                canAfford: this._session.canAffordSeed(packet.seedType),
                tutorialColor: this._shouldShowFirstPlantSeedGuide(packet) ? this._getTutorialFlashingColor() : null,
                mobile: GameDebugSettings.isMobileMode(),
            })
            this._syncSeedPacketTutorialArrow(packet, view.node)
        }
        this._syncConveyorPacketState()
    }

    protected _createSeedPacketView(args: SeedPacketViewArgs) {
        return new SeedPacketView(args)
    }

    protected _syncSeedPacketTutorialArrow(packet: SeedPacketState, packetNode: Node) {
        const current = this._seedPacketTutorialArrows.get(packet.seedType)
        const currentNode = current?.node
        if (!this._shouldShowFirstPlantSeedGuide(packet)) {
            if (current?.isValid && currentNode?.isValid) currentNode.destroy()
            this._seedPacketTutorialArrows.delete(packet.seedType)
            return
        }
        const rect = getNodeBoardPixelRect(packetNode, SEED_PACKET_WIDTH, SEED_PACKET_HEIGHT)
        if (current?.isValid && currentNode?.isValid) {
            currentNode.setPosition(rect.x, -rect.y, 20)
            if (currentNode.parent === this._uiLayer) return
        }
        if (current?.isValid && currentNode?.isValid) currentNode.destroy()

        const arrow = TodParticleSystem.spawn({
            parent: this._uiLayer,
            effect: 'seedpacketpick',
            x: rect.x,
            y: -rect.y,
            z: 20,
        })
        arrow.node.setSiblingIndex(this._uiLayer.children.length - 1)
        this._seedPacketTutorialArrows.set(packet.seedType, arrow)
    }

    protected _syncConveyorVisibility() {
        const visible = this._isConveyorRendered()
        if (this._conveyorBackdropNode?.isValid) this._conveyorBackdropNode.active = visible
        if (this._conveyorBeltNode?.isValid) this._conveyorBeltNode.active = visible
        if (this._conveyorPacketClipNode?.isValid) this._conveyorPacketClipNode.active = visible
        this._syncConveyorBeltFrame(visible)
        for (const packet of this._session.conveyorPackets) {
            const node = this._conveyorPacketViews.get(packet.id)?.node
            if (node?.isValid) node.active = visible
        }
        this._syncBowlingStripeVisibility()
    }

    protected _isConveyorVisible() {
        return this._gameStarted &&
            this._session.level.conveyor?.enabled === true &&
            !this._gameplayUpdatesPaused &&
            !this._isGameplaySeedBankIntroActive() &&
            !this._gameOverActive
    }

    protected _isConveyorRendered() {
        return (this._gameStarted || this._isGameplaySeedBankIntroActive() || this._isIntroSeedBankVisible()) &&
            this._session.level.conveyor?.enabled === true &&
            !this._isGameplayLawnMowerIntroActive() &&
            (this._isIntroSeedBankVisible() || this._isGameplaySeedBankIntroActive() || !this._gameplayUpdatesPaused) &&
            !this._gameOverActive
    }

    protected _isIntroSeedBankVisible() {
        return !this._gameStarted &&
            this._seedBankNode?.active === true &&
            this._introTime > this._introSeedBankOnStart()
    }

    protected _syncBowlingStripeVisibility() {
    }

    protected _revealBowlingStripeForCrazyDaveMessage(index: number) {
        if (this._session.level.bowling?.showBowlingStripe !== true) return
        if (index !== CRAZY_DAVE_WALLNUT_BOWLING_LINE_DIALOG) return

        this._bowlingStripeRevealed = true
        this._syncBowlingStripeVisibility()
    }

    protected _syncConveyorBeltFrame(visible: boolean) {
        if (!visible || !this._conveyorBeltNode?.isValid) return

        const belt = SpriteLoader.get('conveyorbelt')
        const sprite = this._conveyorBeltNode.getComponent(Sprite)
        if (!belt || !sprite) return

        sprite.spriteFrame = getAtlasFrame(belt, Math.floor(this._conveyorBeltAnimTicks / 4) % 6, 502, 16, 1)
    }

    protected _updateConveyorBeltAnimation(ticks: number) {
        if (!this._isConveyorVisible() || this._session.hasLevelAwardDropped) return
        this._conveyorBeltAnimTicks += ticks
    }

    protected _syncConveyorPacketState() {
        for (const [packetId, view] of this._conveyorPacketViews) {
            if (this._session.conveyorPackets.some((packet) => packet.id === packetId)) continue
            if (view.node.isValid) view.node.destroy()
            this._conveyorPacketViews.delete(packetId)
        }

        for (const packet of this._session.conveyorPackets) {
            const view = this._conveyorPacketViews.get(packet.id) ?? this._createConveyorPacketNode(packet)
            if (!view) continue

            const x = this._conveyorPacketClipNode?.isValid ? this._conveyorPacketLocalX(packet) : packet.x
            view.node.setPosition(x, -8, 10)
            view.node.active = this._isConveyorRendered()
            view.sync({
                gameStarted: this._gameStarted,
                active: packet.active,
                selected: packet.selected,
                cooldownRemaining: 0,
                cooldownTotal: 0,
                canAfford: true,
                tutorialColor: null,
                mobile: GameDebugSettings.isMobileMode(),
                conveyor: true,
            })
        }
    }

    protected _createConveyorPacketNode(packet: ConveyorPacketState) {
        const parent = this._conveyorPacketClipNode ?? this._seedBankNode ?? this._uiLayer
        const view = this._createSeedPacketView({
            name: `ConveyorPacket_${packet.id}_${packet.seedType}`,
            x: parent === this._conveyorPacketClipNode ? this._conveyorPacketLocalX(packet) : packet.x,
            y: -8,
            parent,
            layer: this.node.layer,
            seedType: packet.seedType,
            drawCost: false,
            costFont: this._packetCostFont,
        })
        this._conveyorPacketViews.set(packet.id, view)
        this._wireConveyorPacketInput(view.node, packet.id)
        return view
    }

    protected _conveyorPacketLocalX(packet: ConveyorPacketState) {
        return packet.x - 90
    }

    protected _wireConveyorPacketInput(packetNode: Node, packetId: number) {
        const onPress = (event: EventMouse | EventTouch) => {
            if (!this._canUseBoardInput()) return false
            if (this._session.selectedSeed) return false
            if (this._session.selectedTool) return false

            const pixel = eventToBoardPixel(this.node, event)
            const source = this._findSeedSourceAt(pixel)
            if (source?.kind !== 'conveyor' || source.packetId !== packetId) return false
            if (!this._canPickUpSeedSource(source)) return false

            this._mousePixel = pixel
            this._hasCursorPointer = true
            this._resetMobilePlantPress()
            this._selectSeedSource(source)
            if (GameDebugSettings.isMobileMode()) this._beginMobilePlantPress(pixel, source.rect)
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
            if (this._session.selectedTool) {
                event.propagationStopped = true
                const pixel = eventToBoardPixel(this.node, event)
                this._mousePixel = pixel
                this._hasCursorPointer = true
                this._beginMobileToolPress(pixel, null)
                this._updateCursorPreview()
                return
            }
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

    protected _syncProgressMeter() {
        this._syncLevelLabel()

        if (!this._progressMeterNode?.isValid) return

        const visible = this._gameStarted &&
            !this._gameOverActive &&
            !this._usesMinimalHud() &&
            this._session.progressMeterWidth > 0
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

    protected _syncProgressMeterFlags() {
        for (const view of this._progressFlagViews) {
            let height = 0
            if (view.totalWavesAtFlag < this._session.currentWave) {
                height = PROGRESS_METER_FLAG_RAISE_HEIGHT
            } else if (view.totalWavesAtFlag === this._session.currentWave) {
                height = Math.round(linearFloat(
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

    protected _progressMeterWavesPerFlag() {
        return this._session.numWaves < 10 ? this._session.numWaves : 10
    }

    protected _progressMeterFlagCount(wavesPerFlag: number) {
        if (this._session.level.adventureLevel === 1) return 0
        return Math.floor(this._session.numWaves / wavesPerFlag)
    }

    protected _syncLevelLabel() {
        if (!this._levelLabel?.node?.isValid) return

        const visible = this._gameStarted && !this._gameOverActive && !this._usesMinimalHud()
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

    protected _levelLabelText() {
        const level = this._session.level.adventureLevel
        const area = Math.max(1, Math.floor((level - 1) / 10) + 1)
        const subLevel = ((level - 1) % 10) + 1
        return `${this._lawnString('LEVEL', 'Level')} ${area}-${subLevel}`
    }

    protected _syncShovelState() {
        if (this._shovelNode?.isValid) {
            this._shovelNode.active = this._gameStarted && !this._gameOverActive && this._levelHasShovel() && this._session.selectedTool !== 'shovel'
        }
        if (this._shovelBankNode?.isValid) {
            this._shovelBankNode.active = this._gameStarted && !this._gameOverActive && this._levelHasShovel()
        }
    }

    protected _syncCrazyDaveState() {
        if (!this._crazyDave?.isValid) return

        const visible = this._gameStarted &&
            !this._gameOverActive &&
            !this._levelCompleteActive &&
            this._session.level.showCrazyDave === true &&
            !this._crazyDaveHidden
        this._crazyDave.setVisible(
            visible,
            visible && !this._session.paused && this._isGameplaySceneAnimationEnabled(),
        )
        if (this._crazyDaveDialogPhase === 'off') {
            this._crazyDave.hideBubble()
        }
    }

    protected _syncTutorialLawnFlash() {
        if (!this._tutorialLawnFlashNode?.isValid) return

        if (!this._shouldShowFirstPlantLawnGuide()) {
            this._tutorialLawnFlashNode.active = false
            return
        }

        const sprite = this._tutorialLawnFlashNode.getComponent(Sprite)
        if (sprite) sprite.color = this._getTutorialFlashingColor()
        this._tutorialLawnFlashNode.active = true
    }

    protected _shouldShowFirstPlantLawnGuide() {
        return this._gameStarted && this._session.shouldShowTutorialLawnGuide()
    }

    protected _shouldShowFirstPlantSeedGuide(packet: SeedPacketState) {
        return this._gameStarted &&
            !this._gameOverActive &&
            this._session.shouldShowTutorialSeedGuide(packet.seedType) &&
            packet.active &&
            packet.cooldownRemaining <= 0
    }

    protected _getTutorialFlashingColor() {
        const age = this._session.tick % TUTORIAL_FLASH_TIME
        const midpoint = Math.floor(TUTORIAL_FLASH_TIME / 2)
        const gray = Math.max(55, Math.min(255, Math.round(55 + 200 * Math.abs(midpoint - age) / midpoint)))
        return new Color(gray, gray, gray, 255)
    }

    protected _levelHasShovel() {
        return this._session.level.adventureLevel >= 5
    }

    protected _setGameplayAnimationsPaused(paused: boolean) {
        const animators = this.node.getComponentsInChildren(Animator)
        for (const animator of animators) {
            if (animator.isValid) animator.enabled = !paused
        }
        const particleSystems = this.node.getComponentsInChildren(TodParticleSystem)
        for (const particleSystem of particleSystems) {
            if (particleSystem.isValid) particleSystem.enabled = !paused
        }
        this._syncSceneAnimationState()
    }

    protected _syncSceneAnimationState() {
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
        this._syncCrazyDaveState()
    }

    protected _setNodeAnimatorsEnabled(node: Node | null, enabled: boolean) {
        if (!node?.isValid) return

        const animators = node.getComponentsInChildren(Animator)
        for (const animator of animators) {
            if (animator.isValid) animator.enabled = enabled
        }
    }

    protected _isGameplaySceneAnimationEnabled() {
        return !this._session.paused && !this._gameOverActive
    }

    protected _isZombieSceneAnimationEnabled(zombieId: number) {
        if (this._session.paused) return false
        return !this._gameOverActive || zombieId === this._gameOverWinnerZombieId
    }

    protected async _preloadPlantAnimationTextures() {
        const textureNames = new Set<string>()
        for (const animation of this._plantAnimations.values()) {
            this._collectAnimationImages(animation.json as Record<string, any>, textureNames)
        }
        textureNames.add('plantshadow')
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    protected async _preloadZombieAnimationTextures(extraAnimation: JsonAsset | null) {
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

    protected async _preloadSunAnimationTextures() {
        if (!this._sunAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._sunAnimation.json as Record<string, any>, textureNames)
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    protected async _preloadCoinAnimationTextures() {
        const textureNames = new Set<string>()
        for (const animation of [this._silverCoinAnimation, this._goldCoinAnimation, this._diamondAnimation]) {
            if (animation?.json) this._collectAnimationImages(animation.json as Record<string, any>, textureNames)
        }
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    protected async _preloadCrazyDaveAnimationTextures() {
        if (!this._crazyDaveAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._crazyDaveAnimation.json as Record<string, any>, textureNames)
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    protected async _preloadFinalWaveAnimationTextures() {
        if (!this._finalWaveAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._finalWaveAnimation.json as Record<string, any>, textureNames)
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    protected async _preloadReadySetPlantAnimationTextures() {
        if (!this._readySetPlantAnimation?.json) return

        const textureNames = new Set<string>()
        this._collectAnimationImages(this._readySetPlantAnimation.json as Record<string, any>, textureNames)
        await Promise.all([...textureNames].map((name) => SpriteLoader.load(name)))
    }

    protected _collectAnimationImages(json: Record<string, any>, output: Set<string>) {
        for (const nodeName in json) {
            const tracks = json[nodeName]?.tracks
            for (const trackName in tracks ?? {}) {
                for (const frame of tracks[trackName]?.frames ?? []) {
                    if (frame?.image) output.add(frame.image)
                }
            }
        }
    }

    protected _updateCursorPreview() {
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
            const mobileToolPressReady = !GameDebugSettings.isMobileMode() || this._isMobileCursorPressReady()
            if (this._canShowCursorObjectPreview() && mobileToolPressReady) {
                this._updateShovelCursor()
                if (GameDebugSettings.isMobileMode()) {
                    this._syncShovelGridGuide()
                } else {
                    this._hideMobileGridGuide()
                }
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
        const showCursorPreview = !GameDebugSettings.isMobileMode() || mobilePlantPressReady
        if (showCursorPreview && !this._cursorPreview?.isValid) {
            this._cursorPreview = this._createPlantPreviewNode('CursorPreview', CURSOR_PLANT_PREVIEW_OPACITY)
        } else if (!showCursorPreview) {
            if (this._cursorPreview?.isValid) this._cursorPreview.destroy()
            this._cursorPreview = null
        }
        const showGridPreview = !GameDebugSettings.isMobileMode()
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
            GameDebugSettings.isMobileMode() &&
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

    protected _canShowCursorObjectPreview() {
        return this._hasCursorPointer &&
            !UIHoverManager.isModalBlocked &&
            !this._session.paused &&
            !this._gameOverActive
    }

    protected _hideCursorObjectPreview() {
        if (this._cursorPreview?.isValid) this._cursorPreview.active = false
        if (this._gridPreview?.isValid) this._gridPreview.active = false
        this._hideMobileGridGuide()
        if (this._shovelCursor?.isValid) this._shovelCursor.active = false
    }

    protected _updateShovelCursor() {
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

    protected _destroyShovelCursor() {
        if (this._shovelCursor?.isValid) this._shovelCursor.destroy()
        this._shovelCursor = null
    }

    protected _syncShovelGridGuide() {
        const grid = this._session.geometry.pixelToGrid(this._mousePixel.x, this._mousePixel.y)
        if (!grid) {
            this._hideMobileGridGuide()
            return
        }

        this._updateMobileGridGuide(grid.col, grid.row)
    }

    protected _createPlantPreviewNode(name: string, opacity: number, parent: Node = this._uiLayer) {
        const seedType = this._session.selectedSeed!
        const plantType = SEED_DEFINITIONS[seedType].plantType
        return this._createCachedPlantPreviewNode(name, plantType, opacity, parent)
    }

    protected _createCachedPlantPreviewNode(name: string, plantType: PlantType, opacity: number, parent: Node = this._uiLayer) {
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
        if (sprite) {
            sprite.color = plantType === 'explodenut'
                ? new Color(255, 64, 64, opacity)
                : new Color(255, 255, 255, opacity)
        }
        return node
    }

    protected _updateMobileGridGuide(col: number, row: number) {
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

    protected _hideMobileGridGuide() {
        if (this._mobileGridGuide?.isValid) this._mobileGridGuide.active = false
        this._mobileGridGuideCol = -1
        this._mobileGridGuideRow = -1
    }

    protected _placeMobileGridGuideBehindForeground() {
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

    protected _orderPreviewNodes() {
        if (!this._gridPreview?.isValid || !this._cursorPreview?.isValid) return

        this._gridPreview.setSiblingIndex(0)
        this._cursorPreview.setSiblingIndex(this._uiLayer.children.length - 1)
    }

    protected _findSeedSourceAt(pixel: { x: number, y: number }, includeSelectedConveyor = false): SeedSourceHit | null {
        const seedHit = this._findSeedPacketAt(pixel)
        if (seedHit) {
            return {
                kind: 'seed',
                packet: seedHit.packet,
                rect: seedHit.rect,
                seedType: seedHit.packet.seedType,
            }
        }

        const conveyorHit = this._findConveyorPacketAt(pixel, includeSelectedConveyor)
        if (!conveyorHit) return null
        return {
            kind: 'conveyor',
            packet: conveyorHit.packet,
            rect: conveyorHit.rect,
            seedType: conveyorHit.packet.seedType,
            packetId: conveyorHit.packet.id,
        }
    }

    protected _selectSeedSource(source: SeedSourceHit) {
        if (source.kind === 'seed') {
            this._session.dispatch({ type: 'selectSeed', seedType: source.seedType })
        } else {
            this._session.dispatch({ type: 'selectConveyorPacket', packetId: source.packetId })
        }
    }

    protected _canPickUpSeedSource(source: SeedSourceHit) {
        return source.kind === 'seed'
            ? this._canPickUpSeedPacket(source.packet)
            : source.packet.active && !source.packet.selected
    }

    protected _findSeedPacketAt(pixel: { x: number, y: number }) {
        for (let i = this._session.seedPackets.length - 1; i >= 0; i--) {
            const packet = this._session.seedPackets[i]
            const rect = this._seedPacketViews.get(packet.seedType)?.rect() ?? null
            if (!rect) continue
            if (pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height) {
                return { packet, rect }
            }
        }
        return null
    }

    protected _hitTool(pixel: { x: number, y: number }): ToolType | null {
        const rect = this._getToolBoardPixelRect('shovel')
        if (!rect) return null
        return pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height
            ? 'shovel'
            : null
    }

    protected _getToolBoardPixelRect(toolType: ToolType): BoardPixelRect | null {
        switch (toolType) {
            case 'shovel':
                return this._getShovelBoardPixelRect()
        }
        return null
    }

    protected _findConveyorPacketAt(pixel: { x: number, y: number }, includeSelected = false) {
        if (!this._isConveyorVisible()) return null
        if (this._conveyorPacketClipNode?.activeInHierarchy) {
            const clipSize = this._conveyorPacketClipNode.getComponent(UITransform)?.contentSize
            const clipRect = getNodeBoardPixelRect(
                this._conveyorPacketClipNode,
                clipSize?.width ?? 501,
                clipSize?.height ?? this._seedBankHeight,
            )
            if (!isPixelInRect(pixel, clipRect)) return null
        }

        for (let i = this._session.conveyorPackets.length - 1; i >= 0; i--) {
            const packet = this._session.conveyorPackets[i]
            if (packet.selected && !includeSelected) continue

            const view = this._conveyorPacketViews.get(packet.id)
            if (!view?.node.activeInHierarchy) continue
            const rect = view.rect()
            if (!rect) continue
            if (pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height) {
                return { packet, rect }
            }
        }
        return null
    }

    protected _refreshBoardHoverFromPointer(pointer: UIHoverPointer | null, activeModalRoot: Node | null) {
        if (this._levelAwardScreenShown) return false
        if (this._levelCompleteActive) {
            this._clearBoardHoverState()
            return false
        }
        if (activeModalRoot || !pointer?.canHover) {
            this._clearBoardHoverState()
            return false
        }

        this._mousePixel = uiLocationToBoardPixel(this.node, pointer.uiLocation)
        this._hasCursorPointer = true
        this._updateCursorPreview()
        return this._updateHoverItemAndSeedPacketState()
    }

    protected _clearBoardHoverState() {
        this._mousePixel = { x: -1, y: -1 }
        this._hasCursorPointer = false
        this._hideCursorObjectPreview()
        this._hideTooltips()
        if (!this._levelAwardScreenShown && !this._levelCompleteActive && !this._gameOverActive) {
            this._setCanvasCursor('default')
        }
    }

    protected _updateHoverItemAndSeedPacketState() {
        if (GameDebugSettings.isMobileMode()) return false
        if (this._levelAwardScreenShown) return false
        if (this._gameOverActive || this._levelCompleteActive) {
            this._hideTooltips()
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

        const seedSource = this._findSeedSourceAt(this._mousePixel)
        if (seedSource?.kind === 'seed') {
            this._showSeedTooltip(seedSource.packet, seedSource.rect)
        } else if (seedSource?.kind === 'conveyor') {
            this._showConveyorSeedTooltip(seedSource.packet, seedSource.rect)
        } else {
            this._hideSeedTooltip()
        }

        const shovelHit = this._hitTool(this._mousePixel) === 'shovel'
        const shovelHoverEnabled = !this._gameplayUpdatesPaused || this._canUseShovelTutorialInput()
        if (shovelHit && !this._gameplayUpdatesPaused) {
            this._showShovelTooltip()
        } else {
            this._hideShovelTooltip()
        }

        const overCollectableItem = this._session.hasItemAt(this._mousePixel.x, this._mousePixel.y)
        const overPickableSeed = seedSource ? this._canPickUpSeedSource(seedSource) : false
        const overMenuButton = this._isMenuButtonPixel(this._mousePixel)
        const hovering = overCollectableItem || overPickableSeed || (shovelHit && shovelHoverEnabled) || overMenuButton
        this._setCanvasCursor(hovering ? 'pointer' : 'default')
        return hovering
    }

    protected _showSeedTooltip(
        packet: SeedPacketState,
        rect: { x: number, y: number, width: number, height: number },
    ) {
        const label = this._seedTooltipName(packet.seedType)
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

    protected _hideSeedTooltip() {
        this._seedTooltipKey = ''
        if (this._seedTooltipNode?.isValid) this._seedTooltipNode.destroy()
        this._seedTooltipNode = null
    }

    protected _lawnString(key: string, fallback = key) {
        const text = LawnStringLoader.translateOptional(`[${key}]`, this._lawnStrings)
        return text || fallback
    }

    protected _formatLawnString(key: string, fallback: string, replacements: Record<string, string | number>) {
        let text = this._lawnString(key, fallback)
        for (const [name, value] of Object.entries(replacements)) {
            text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
        }
        return text
    }

    protected _localizedAdviceMessage(message: string) {
        const directKey = message.length >= 3 && message[0] === '[' && message[message.length - 1] === ']'
            ? message.slice(1, -1).trim()
            : ''
        const key = directKey || ADVICE_LAWN_STRING_KEYS[message]
        return key ? this._lawnString(key, message) : message
    }

    protected _seedTooltipName(seedType: SeedType) {
        const key = SEED_TOOLTIP_KEYS[seedType]
        return key
            ? this._lawnString(key, SEED_TOOLTIP_FALLBACK_NAMES[seedType] ?? seedType)
            : SEED_TOOLTIP_FALLBACK_NAMES[seedType] ?? seedType
    }

    protected _showConveyorSeedTooltip(
        packet: ConveyorPacketState,
        rect: { x: number, y: number, width: number, height: number },
    ) {
        const label = this._seedTooltipName(packet.seedType)
        const x = Math.round(rect.x + SEED_PACKET_WIDTH / 2)
        const y = -Math.round(rect.y + SEED_TOOLTIP_OFFSET_Y)
        const key = `conveyor|${packet.seedType}|${x}|${y}`
        if (this._seedTooltipNode?.isValid && this._seedTooltipKey === key) {
            this._seedTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
            return
        }

        this._hideSeedTooltip()
        this._seedTooltipKey = key
        this._seedTooltipNode = createTooltipNode({
            name: 'ConveyorSeedTooltip',
            text: label,
            font: this._packetCostFont,
            parent: this._uiLayer,
            layer: this.node.layer,
            x,
            y,
            z: CURSOR_PREVIEW_Z - 1,
            centerX: true,
        })
        this._seedTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
    }

    protected _showShovelTooltip() {
        const rect = this._getShovelBoardPixelRect()
        if (!rect) return
        if (this._shovelTooltipNode?.isValid) {
            this._shovelTooltipNode.setSiblingIndex(this._uiLayer.children.length - 1)
            return
        }

        this._shovelTooltipNode = createTooltipNode({
            name: 'ShovelTooltip',
            text: this._lawnString('SHOVEL_TOOLTIP', 'remove a plant'),
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

    protected _hideShovelTooltip() {
        if (this._shovelTooltipNode?.isValid) this._shovelTooltipNode.destroy()
        this._shovelTooltipNode = null
    }

    protected _hideTooltips() {
        this._hideSeedTooltip()
        this._hideShovelTooltip()
    }

    protected _getSeedTooltipWarning(packet: SeedPacketState) {
        if (!packet.active || packet.cooldownRemaining > 0) {
            return this._lawnString('WAITING_FOR_SEED', SEED_TOOLTIP_WAITING)
        }
        if (!this._session.canAffordSeed(packet.seedType)) {
            return this._lawnString('NOT_ENOUGH_SUN', SEED_TOOLTIP_NOT_ENOUGH_SUN)
        }
        return ''
    }

    protected _canPickUpSeedPacket(packet: SeedPacketState) {
        return packet.active &&
            packet.cooldownRemaining <= 0 &&
            this._session.canAffordSeed(packet.seedType)
    }

    protected _isMenuButtonPixel(pixel: { x: number, y: number }) {
        if (!this._menuButtonNode?.activeInHierarchy) return false
        const rect = this._session.geometry.menuButtonRect
        return pixel.x >= rect.x && pixel.x <= rect.x + rect.width && pixel.y >= rect.y && pixel.y <= rect.y + rect.height
    }

    protected _setCanvasCursor(style: string) {
        CursorManager.set(style)
    }

    protected _getShovelBoardPixelRect() {
        if (!this._shovelBankNode?.activeInHierarchy) return null
        const bank = SpriteLoader.get('shovelbank')
        return getNodeBoardPixelRect(
            this._shovelBankNode,
            bank?.originalSize.width ?? 70,
            bank?.originalSize.height ?? 72,
        )
    }

    protected _createSeedBankExtension(seedBankFrame: SpriteFrame) {
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

    protected _getSeedPacketPositionX(index: number) {
        const packetCount = this._session.seedPackets.length
        if (packetCount <= 7) return index * 59 + 85
        if (packetCount === 8) return index * 54 + 81
        if (packetCount === 9) return index * 52 + 80
        return index * 51 + 79
    }

    protected _getSeedBankExtraWidth() {
        const packetCount = this._session.level.seedBankPacketSlots ?? this._session.seedPackets.length
        if (packetCount <= 6) return 0
        if (packetCount === 7) return 60
        if (packetCount === 8) return 76
        if (packetCount === 9) return 112
        return 153
    }

    protected _getShovelButtonX() {
        return this._getSeedBankExtraWidth() + SHOVEL_BUTTON_BASE_X
    }

    protected _entityZ(entity: GameEntity) {
        if (entity.kind === 'item') return ITEM_Z
        return this._session.geometry.rowZ(this._entityRenderRow(entity))
    }

    protected _entityLayerOrder(entity: GameEntity) {
        const rowOrder = this._entityRenderRow(entity) * 10
        const typeOrder =
            entity.kind === 'lawnmower' ? 3 :
                entity.kind === 'projectile' ? 2 :
                    entity.kind === 'plant' && entity.isBowling ? 2 :
                        entity.kind === 'zombie' ? 1 : 0
        const horizontalOffset = entity.kind === 'plant'
            ? (this._session.geometry.width - entity.x) /
                (entity.isBowling ? 10000 : 1000)
            : 0
        return rowOrder + typeOrder + horizontalOffset
    }

    protected _entityRenderRow(entity: GameEntity) {
        if (entity.kind === 'item') return 0
        if (entity.kind === 'plant' && entity.isBowling && entity.state === 'bowling-down') {
            return Math.max(0, entity.row - 1)
        }
        return entity.row
    }

    protected _removeEntityNode(entityId: number) {
        const node = this._entityNodes.get(entityId)
        if (node?.isValid) node.destroy()
        const zombieShadow = this._zombieViews.get(entityId)?.shadowClipNode ?? this._zombieViews.get(entityId)?.shadowNode
        if (zombieShadow?.isValid && zombieShadow.parent === this._entityLayer) zombieShadow.destroy()
        this._entityNodes.delete(entityId)
        this._plantViews.delete(entityId)
        this._zombieViews.delete(entityId)
        this._lawnMowerViews.delete(entityId)
        this._moneyItemViews.delete(entityId)
        this._previousEntitySnapshots.delete(entityId)
    }

    protected _createLabel(
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

    protected _createBitmapText(args: {
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

    protected _syncSunAmount() {
        if (this._session.level.conveyor?.enabled === true) {
            this._sunLabel.node.active = false
            return
        }

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

    protected _showMoneyCounter() {
        this._coinBankFadeTicks = COIN_BANK_DISPLAY_TICKS
        this._syncMoneyCounter()
    }

    protected _syncMoneyCounter() {
        if (!this._moneyCounter?.node.isValid) return

        this._moneyCounter.setAmount(this._session.money)
        this._moneyCounter.node.active = this._coinBankFadeTicks > 0
        if (this._coinBankFadeTicks <= 0) return

        const opacity = Math.min(255, 255 * this._coinBankFadeTicks / COIN_BANK_FADE_TICKS)
        this._moneyCounter.setOpacity(opacity)
    }

    protected _sunAmountColor() {
        if (this._sunFlashTicks > 0 && this._sunFlashTicks % SUN_FLASH_PERIOD_TICKS < SUN_FLASH_PERIOD_TICKS / 2) {
            return new Color(255, 0, 0, 255)
        }
        return Color.BLACK
    }

    protected _setSeedBankContentsVisible(visible: boolean) {
        if (!this._seedBankNode) return
        for (const child of this._seedBankNode.children) {
            child.active = visible
        }
    }

    protected _addSpriteIfLoaded(parent: Node, spriteName: string, x: number, y: number, scale: number) {
        const spriteFrame: SpriteFrame | undefined = SpriteLoader.get(spriteName)
        if (!spriteFrame) return null
        const node = createSpriteNode({ spriteFrame, parent, x, y })
        node.setScale(scale, scale, 1)
        return node
    }
}
