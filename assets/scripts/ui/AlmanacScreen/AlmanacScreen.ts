import {
    _decorator,
    Color,
    EventMouse,
    EventTouch,
    gfx,
    Graphics,
    Input,
    Mask,
    Material,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
    input,
    sys,
} from 'cc'
import { Animator } from '@/core/Animator/Animator'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { LawnStringLoader } from '@/core/LawnStringLoader'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import {
    getAnimationRateSpeed,
    wirePlantAnimation,
    type PlantAnimationType,
    type PlantAnimationView,
} from '@/game/PlantAnimation'
import {
    attachFlagZombieAnimation,
    createZombieAnimationView,
    playZombieBodyAnimation,
    wireZombieAnimation,
    type ZombieAnimationType,
} from '@/game/ZombieAnimation'
import { UIButton } from '@/ui/Button'
import { TouchScrollGesture } from '@/ui/ScrollGesture'
import {
    getAtlasFrame,
    SeedPacketRenderer,
    SEED_PACKET_HEIGHT,
    SEED_PACKET_WIDTH,
} from '@/ui/SeedPacketRenderer'
import { buildThreeSliceRow, createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'
import {
    AlmanacScreenAssets,
    type AlmanacAnimationMap,
    type AlmanacPlantAnimationName,
    type AlmanacScreenFonts,
    type AlmanacScreenSprites,
    type AlmanacZombieAnimationName,
} from './AlmanacScreenAssets'
import { MenuScreenBase } from '../MenuScreenBase'

const { ccclass } = _decorator

const TITLE_COLOR = new Color(220, 220, 220)
const BUTTON_TEXT_COLOR = new Color(42, 42, 90)
const WHITE = new Color(255, 255, 255)
const BODY_TEXT_COLOR = new Color(40, 50, 90)
const FORMAT_ACCENT_TEXT_COLOR = new Color(143, 67, 27)
const FORMAT_STAT_TEXT_COLOR = new Color(204, 36, 29)
const SEED_PACKET_ROWS = 8
const SEED_PACKET_STRIDE_X = SEED_PACKET_WIDTH + 2
const SEED_PACKET_STRIDE_Y = SEED_PACKET_HEIGHT + 8
const SHORT_LINE_SPACING_OFFSET = -9
const ZOMBIE_WINDOW_SIZE = 76
const ZOMBIE_PREVIEW_CACHE_COLUMNS = 8
const ZOMBIE_PREVIEW_CACHE_CELL_WIDTH = 76
const ZOMBIE_PREVIEW_CACHE_CELL_HEIGHT = 76
const ZOMBIE_ROWS = 5
const ZOMBIE_STRIDE_X = 85
const ZOMBIE_STRIDE_Y = 80
const ZOMBIE_OFFSET_Y = 6
const ZOMBIE_NAME_COLOR = new Color(190, 255, 235)
const ALMANAC_DESCRIPTION_MIN_HEIGHT = 20
const DESCRIPTION_SCROLLBAR_WIDTH = 8
const DESCRIPTION_WHEEL_SCROLL_SCALE = 0.6
const DESCRIPTION_SCROLL_BOTTOM_PADDING_RATIO = 0.6
const DESCRIPTION_SCROLLBAR_THUMB_SCALE = 1.5
const PLANT_SCROLLBAR_COLOR = new Color(143, 67, 27)
const PLANT_SCROLLBAR_BACK_COLOR = new Color(143, 67, 27, 75)
const ZOMBIE_SCROLLBAR_COLOR = new Color(63, 63, 86)
const ZOMBIE_SCROLLBAR_BACK_COLOR = new Color(95, 97, 129, 75)
const ALMANAC_PLANT_POSITION_X = 578
const ALMANAC_PLANT_POSITION_Y = 140
const ALMANAC_INDEX_PLANT_POSITION_X = 167
const ALMANAC_INDEX_PLANT_POSITION_Y = 225
const ALMANAC_ZOMBIE_POSITION_X = 559
const ALMANAC_ZOMBIE_POSITION_Y = 175
const ALMANAC_INDEX_ZOMBIE_POSITION_X = 535
const ALMANAC_INDEX_ZOMBIE_POSITION_Y = 215
const ALMANAC_ZOMBIE_REANIM_OFFSET_X = 15
const ALMANAC_ZOMBIE_REANIM_OFFSET_Y = 8
const ALMANAC_ZOMBIE_SCALE_PIVOT_X = 30
const ALMANAC_ZOMBIE_SCALE_PIVOT_Y = 120
const ALMANAC_ZOMBIE_SHADOW_OFFSET_X = 23
const ALMANAC_ZOMBIE_SHADOW_OFFSET_Y = 92
const ALMANAC_ZOMBIE_IDLE2_CHANCE = 0.75
const ALMANAC_ZOMBIE_IDLE_RATE_MIN = 12
const ALMANAC_ZOMBIE_IDLE_RATE_MAX = 18
const ALMANAC_ZOMBIE_IDLE2_RATE_MIN = 12
const ALMANAC_ZOMBIE_IDLE2_RATE_MAX = 24
const ALMANAC_ZOMBIE_UPDATE_TICKS_PER_SECOND = 100
const POGO_BOUNCE_TIME = 80
const POGO_BOUNCE_REANIM_RESTART_COUNTER = 7
const POGO_BOUNCE_MIN_ALTITUDE = 9
const POGO_BOUNCE_MAX_ALTITUDE = 49
const POGO_BOUNCE_REANIM_RATE = 40
const BUNGEE_CUTSCENE_TIME = 200
const BUNGEE_CUTSCENE_ALTITUDE = 40
const BUNGEE_DROP_REANIM_RATE = 24

let additiveSpriteMaterial: Material | null = null

type AlmanacPage = 'index' | 'plants' | 'zombies'
type LawnStringMap = Record<string, string>
type AlmanacZombieMotionType = 'pogo' | 'bungee'

interface AlmanacTextRun {
    text: string
    color: Color
}

interface AlmanacTextLine {
    runs: AlmanacTextRun[]
    spacingOffset: number
}

interface AlmanacPlantDefinition {
    id: number
    key: string
    name: string
    cost: number
    refreshTime: number
    upgrade?: boolean
}

interface AlmanacZombieDefinition {
    id: number
    key: string
    iceGround?: boolean
}

interface AlmanacPlantPreviewDefinition {
    plantType: PlantAnimationType
    animationName: AlmanacPlantAnimationName
}

interface AlmanacZombiePreviewDefinition {
    zombieType: ZombieAnimationType
    animationName: AlmanacZombieAnimationName
    bodyAnimations: readonly string[]
    animationRates?: Partial<Record<string, number>>
    flag?: boolean
    previewOffsetX?: number
    previewOffsetY?: number
    drawOffsetX?: number
    drawOffsetY?: number
    visualOffsetX?: number
    visualOffsetY?: number
    scale?: number
    shadowOffsetX?: number
    shadowOffsetY?: number
    shadowScale?: number
    hideShadow?: boolean
    motion?: AlmanacZombieMotionType
}

interface AlmanacZombiePreviewMotion {
    type: AlmanacZombieMotionType
    animatorNode: Node
    animatorBaseY: number
    shadowNode: Node | null
    shadowBaseY: number
    phaseCounter: number
    previousPhaseCounter: number
    view: ReturnType<typeof createZombieAnimationView>
}

const ALMANAC_PLANT_PREVIEW_BY_KEY: Partial<Record<string, AlmanacPlantPreviewDefinition>> = {
    PEASHOOTER: { plantType: 'peashooter', animationName: 'peashootersingle' },
    SUNFLOWER: { plantType: 'sunflower', animationName: 'sunflower' },
    CHERRY_BOMB: { plantType: 'cherrybomb', animationName: 'cherrybomb' },
    WALL_NUT: { plantType: 'wallnut', animationName: 'wallnut' },
    POTATO_MINE: { plantType: 'potatomine', animationName: 'potatomine' },
    SNOW_PEA: { plantType: 'snowpea', animationName: 'snowpea' },
    CHOMPER: { plantType: 'chomper', animationName: 'chomper' },
    REPEATER: { plantType: 'repeater', animationName: 'peashooter' },
    PUFF_SHROOM: { plantType: 'puffshroom', animationName: 'puffshroom' },
    SUN_SHROOM: { plantType: 'sunshroom', animationName: 'sunshroom' },
    FUME_SHROOM: { plantType: 'fumeshroom', animationName: 'fumeshroom' },
    GRAVE_BUSTER: { plantType: 'gravebuster', animationName: 'gravebuster' },
    HYPNO_SHROOM: { plantType: 'hypnoshroom', animationName: 'hypnoshroom' },
    SCAREDY_SHROOM: { plantType: 'scaredyshroom', animationName: 'scaredyshroom' },
    ICE_SHROOM: { plantType: 'iceshroom', animationName: 'iceshroom' },
    DOOM_SHROOM: { plantType: 'doomshroom', animationName: 'doomshroom' },
}

const ALMANAC_PLANT_VISUAL_ADJUSTMENTS: Partial<
    Record<PlantAnimationType, { offsetX?: number; offsetY?: number; scale?: number }>
> = {
    potatomine: { offsetX: 12, offsetY: 12, scale: 0.8 },
    puffshroom: { offsetY: 5 },
    scaredyshroom: { offsetY: -14 },
    gravebuster: { offsetY: 15 },
}

const ALMANAC_PLANT_SHADOW_ADJUSTMENTS: Partial<
    Record<PlantAnimationType, { offsetX: number; offsetY: number; scale?: number; hide?: boolean }>
> = {
    chomper: { offsetX: -21, offsetY: 57 },
    puffshroom: { offsetX: -3, offsetY: 42, scale: 0.5 },
    sunshroom: { offsetX: -3, offsetY: 42, scale: 0.5 },
    fumeshroom: { offsetX: -3, offsetY: 47, scale: 1.3 },
    gravebuster: { offsetX: 0, offsetY: 0, hide: true },
    scaredyshroom: { offsetX: -9, offsetY: 55 },
}

const ALMANAC_NIGHT_GROUND_PLANT_KEYS = new Set([
    'PUFF_SHROOM',
    'SUN_SHROOM',
    'FUME_SHROOM',
    'GRAVE_BUSTER',
    'HYPNO_SHROOM',
    'SCAREDY_SHROOM',
    'ICE_SHROOM',
    'DOOM_SHROOM',
    'PLANTERN',
])

const ALMANAC_ZOMBIE_PREVIEW_BY_KEY: Partial<Record<string, AlmanacZombiePreviewDefinition>> = {
    ZOMBIE: {
        zombieType: 'normal',
        animationName: 'zombie',
        bodyAnimations: ['anim_idle2', 'anim_idle'],
    },
    FLAG_ZOMBIE: {
        zombieType: 'flag',
        animationName: 'zombie',
        bodyAnimations: ['anim_idle2', 'anim_idle'],
        flag: true,
    },
    CONEHEAD_ZOMBIE: {
        zombieType: 'traffic-cone',
        animationName: 'zombie',
        bodyAnimations: ['anim_idle2', 'anim_idle'],
    },
    POLE_VAULTING_ZOMBIE: {
        zombieType: 'pole-vaulter',
        animationName: 'zombie_polevaulter',
        bodyAnimations: ['anim_idle'],
        drawOffsetX: -6,
        drawOffsetY: -11,
        shadowOffsetX: 36,
        shadowOffsetY: 103,
    },
    BUCKETHEAD_ZOMBIE: {
        zombieType: 'bucket',
        animationName: 'zombie',
        bodyAnimations: ['anim_idle2', 'anim_idle'],
    },
    SCREEN_DOOR_ZOMBIE: {
        zombieType: 'screen-door',
        animationName: 'zombie',
        bodyAnimations: ['anim_idle2', 'anim_idle'],
    },
    NEWSPAPER_ZOMBIE: {
        zombieType: 'newspaper',
        animationName: 'zombie_paper',
        bodyAnimations: ['anim_idle'],
        shadowOffsetX: 29,
        shadowOffsetY: 96,
    },
    FOOTBALL_ZOMBIE: {
        zombieType: 'football',
        animationName: 'zombie_football',
        bodyAnimations: ['anim_idle'],
        previewOffsetX: -12,
        previewOffsetY: 0,
        drawOffsetY: -16,
        shadowOffsetX: 43,
        shadowOffsetY: 108,
    },
    DANCING_ZOMBIE: {
        zombieType: 'dancing',
        animationName: 'zombie_disco',
        bodyAnimations: ['anim_armraise'],
        animationRates: { anim_armraise: 12 },
        scale: 0.8,
    },
    BACKUP_DANCER: {
        zombieType: 'backup-dancer',
        animationName: 'zombie_backup',
        bodyAnimations: ['anim_armraise'],
        animationRates: { anim_armraise: 12 },
        scale: 0.8,
    },
    DUCKY_TUBE_ZOMBIE: {
        zombieType: 'ducky-tube',
        animationName: 'zombie',
        bodyAnimations: ['anim_idle2', 'anim_idle'],
    },
    SNORKEL_ZOMBIE: {
        zombieType: 'snorkel',
        animationName: 'zombie_snorkle',
        bodyAnimations: ['anim_idle'],
        shadowOffsetX: 35,
        shadowOffsetY: 97,
    },
    ZOMBONI: {
        zombieType: 'zamboni',
        animationName: 'zombie_zamboni',
        bodyAnimations: ['anim_drive'],
        previewOffsetX: 38,
        previewOffsetY: -18,
        hideShadow: true,
    },
    ZOMBIE_BOBSLED_TEAM: {
        zombieType: 'bobsled',
        animationName: 'zombie_bobsled',
        bodyAnimations: ['anim_idle'],
        drawOffsetY: -12,
        shadowOffsetX: 20,
        shadowOffsetY: 105,
    },
    DOLPHIN_RIDER_ZOMBIE: {
        zombieType: 'dolphin-rider',
        animationName: 'zombie_dolphinrider',
        bodyAnimations: ['anim_idle'],
        shadowOffsetX: 19,
        shadowOffsetY: 103,
    },
    JACK_IN_THE_BOX_ZOMBIE: {
        zombieType: 'jack-in-the-box',
        animationName: 'zombie_jackbox',
        bodyAnimations: ['anim_idle'],
    },
    BALLOON_ZOMBIE: {
        zombieType: 'balloon',
        animationName: 'zombie_balloon',
        bodyAnimations: ['anim_idle'],
        animationRates: { anim_idle: 9 },
        previewOffsetY: -3,
        shadowOffsetY: 105,
    },
    DIGGER_ZOMBIE: {
        zombieType: 'digger',
        animationName: 'zombie_digger',
        bodyAnimations: ['anim_idle'],
        shadowOffsetX: 17,
        shadowOffsetY: 97,
    },
    POGO_ZOMBIE: {
        zombieType: 'pogo',
        animationName: 'zombie_pogo',
        bodyAnimations: ['anim_pogo'],
        animationRates: { anim_pogo: POGO_BOUNCE_REANIM_RATE },
        drawOffsetY: 16,
        shadowOffsetY: 92,
        motion: 'pogo',
    },
    ZOMBIE_YETI: {
        zombieType: 'yeti',
        animationName: 'zombie_yeti',
        bodyAnimations: ['anim_idle'],
        drawOffsetY: -20,
        shadowOffsetX: 3,
        shadowOffsetY: 112,
    },
    BUNGEE_ZOMBIE: {
        zombieType: 'bungee',
        animationName: 'zombie_bungi',
        bodyAnimations: ['anim_drop'],
        animationRates: { anim_drop: BUNGEE_DROP_REANIM_RATE },
        previewOffsetX: -3,
        hideShadow: true,
        motion: 'bungee',
    },
    LADDER_ZOMBIE: {
        zombieType: 'ladder',
        animationName: 'zombie_ladder',
        bodyAnimations: ['anim_idle'],
    },
    CATAPULT_ZOMBIE: {
        zombieType: 'catapult',
        animationName: 'zombie_catapult',
        bodyAnimations: ['anim_idle'],
        previewOffsetX: -35,
        previewOffsetY: -18,
        hideShadow: true,
    },
    GARGANTUAR: {
        zombieType: 'gargantuar',
        animationName: 'zombie_gargantuar',
        bodyAnimations: ['anim_idle'],
        previewOffsetY: 22,
        shadowOffsetX: 27,
        shadowOffsetY: 89,
        shadowScale: 1.5,
    },
    IMP: {
        zombieType: 'imp',
        animationName: 'zombie_imp',
        bodyAnimations: ['anim_walk'],
        shadowOffsetX: 41,
        shadowOffsetY: 106,
        shadowScale: 0.6,
    },
}

const ALMANAC_PLANTS: AlmanacPlantDefinition[] = [
    { id: 0, key: 'PEASHOOTER', name: 'Peashooter', cost: 100, refreshTime: 750 },
    { id: 1, key: 'SUNFLOWER', name: 'Sunflower', cost: 50, refreshTime: 750 },
    { id: 2, key: 'CHERRY_BOMB', name: 'Cherry Bomb', cost: 150, refreshTime: 5000 },
    { id: 3, key: 'WALL_NUT', name: 'Wall-nut', cost: 50, refreshTime: 3000 },
    { id: 4, key: 'POTATO_MINE', name: 'Potato Mine', cost: 25, refreshTime: 3000 },
    { id: 5, key: 'SNOW_PEA', name: 'Snow Pea', cost: 175, refreshTime: 750 },
    { id: 6, key: 'CHOMPER', name: 'Chomper', cost: 150, refreshTime: 750 },
    { id: 7, key: 'REPEATER', name: 'Repeater', cost: 200, refreshTime: 750 },
    { id: 8, key: 'PUFF_SHROOM', name: 'Puff-shroom', cost: 0, refreshTime: 750 },
    { id: 9, key: 'SUN_SHROOM', name: 'Sun-shroom', cost: 25, refreshTime: 750 },
    { id: 10, key: 'FUME_SHROOM', name: 'Fume-shroom', cost: 75, refreshTime: 750 },
    { id: 11, key: 'GRAVE_BUSTER', name: 'Grave Buster', cost: 75, refreshTime: 750 },
    { id: 12, key: 'HYPNO_SHROOM', name: 'Hypno-shroom', cost: 75, refreshTime: 3000 },
    { id: 13, key: 'SCAREDY_SHROOM', name: 'Scaredy-shroom', cost: 25, refreshTime: 750 },
    { id: 14, key: 'ICE_SHROOM', name: 'Ice-shroom', cost: 75, refreshTime: 5000 },
    { id: 15, key: 'DOOM_SHROOM', name: 'Doom-shroom', cost: 125, refreshTime: 5000 },
    { id: 16, key: 'LILY_PAD', name: 'Lily Pad', cost: 25, refreshTime: 750 },
    { id: 17, key: 'SQUASH', name: 'Squash', cost: 50, refreshTime: 3000 },
    { id: 18, key: 'THREEPEATER', name: 'Threepeater', cost: 325, refreshTime: 750 },
    { id: 19, key: 'TANGLE_KELP', name: 'Tangle Kelp', cost: 25, refreshTime: 3000 },
    { id: 20, key: 'JALAPENO', name: 'Jalapeno', cost: 125, refreshTime: 5000 },
    { id: 21, key: 'SPIKEWEED', name: 'Spikeweed', cost: 100, refreshTime: 750 },
    { id: 22, key: 'TORCHWOOD', name: 'Torchwood', cost: 175, refreshTime: 750 },
    { id: 23, key: 'TALL_NUT', name: 'Tall-nut', cost: 125, refreshTime: 3000 },
    { id: 24, key: 'SEA_SHROOM', name: 'Sea-shroom', cost: 0, refreshTime: 3000 },
    { id: 25, key: 'PLANTERN', name: 'Plantern', cost: 25, refreshTime: 3000 },
    { id: 26, key: 'CACTUS', name: 'Cactus', cost: 125, refreshTime: 750 },
    { id: 27, key: 'BLOVER', name: 'Blover', cost: 100, refreshTime: 750 },
    { id: 28, key: 'SPLIT_PEA', name: 'Split Pea', cost: 125, refreshTime: 750 },
    { id: 29, key: 'STARFRUIT', name: 'Starfruit', cost: 125, refreshTime: 750 },
    { id: 30, key: 'PUMPKIN', name: 'Pumpkin', cost: 125, refreshTime: 3000 },
    { id: 31, key: 'MAGNET_SHROOM', name: 'Magnet-shroom', cost: 100, refreshTime: 750 },
    { id: 32, key: 'CABBAGE_PULT', name: 'Cabbage-pult', cost: 100, refreshTime: 750 },
    { id: 33, key: 'FLOWER_POT', name: 'Flower Pot', cost: 25, refreshTime: 750 },
    { id: 34, key: 'KERNEL_PULT', name: 'Kernel-pult', cost: 100, refreshTime: 750 },
    { id: 35, key: 'COFFEE_BEAN', name: 'Coffee Bean', cost: 75, refreshTime: 750 },
    { id: 36, key: 'GARLIC', name: 'Garlic', cost: 50, refreshTime: 750 },
    { id: 37, key: 'UMBRELLA_LEAF', name: 'Umbrella Leaf', cost: 100, refreshTime: 750 },
    { id: 38, key: 'MARIGOLD', name: 'Marigold', cost: 50, refreshTime: 3000 },
    { id: 39, key: 'MELON_PULT', name: 'Melon-pult', cost: 300, refreshTime: 750 },
    {
        id: 40,
        key: 'GATLING_PEA',
        name: 'Gatling Pea',
        cost: 250,
        refreshTime: 5000,
        upgrade: true,
    },
    {
        id: 41,
        key: 'TWIN_SUNFLOWER',
        name: 'Twin Sunflower',
        cost: 150,
        refreshTime: 5000,
        upgrade: true,
    },
    {
        id: 42,
        key: 'GLOOM_SHROOM',
        name: 'Gloom-shroom',
        cost: 150,
        refreshTime: 5000,
        upgrade: true,
    },
    { id: 43, key: 'CATTAIL', name: 'Cattail', cost: 225, refreshTime: 5000, upgrade: true },
    {
        id: 44,
        key: 'WINTER_MELON',
        name: 'Winter Melon',
        cost: 200,
        refreshTime: 5000,
        upgrade: true,
    },
    { id: 45, key: 'GOLD_MAGNET', name: 'Gold Magnet', cost: 50, refreshTime: 5000, upgrade: true },
    { id: 46, key: 'SPIKEROCK', name: 'Spikerock', cost: 125, refreshTime: 5000, upgrade: true },
    { id: 47, key: 'COB_CANNON', name: 'Cob Cannon', cost: 500, refreshTime: 5000, upgrade: true },
    { id: 48, key: 'IMITATER', name: 'Imitater', cost: 0, refreshTime: 750 },
]

const ALMANAC_ZOMBIES: AlmanacZombieDefinition[] = [
    { id: 0, key: 'ZOMBIE' },
    { id: 1, key: 'FLAG_ZOMBIE' },
    { id: 2, key: 'CONEHEAD_ZOMBIE' },
    { id: 3, key: 'POLE_VAULTING_ZOMBIE' },
    { id: 4, key: 'BUCKETHEAD_ZOMBIE' },
    { id: 5, key: 'NEWSPAPER_ZOMBIE' },
    { id: 6, key: 'SCREEN_DOOR_ZOMBIE' },
    { id: 7, key: 'FOOTBALL_ZOMBIE' },
    { id: 8, key: 'DANCING_ZOMBIE' },
    { id: 9, key: 'BACKUP_DANCER' },
    { id: 10, key: 'DUCKY_TUBE_ZOMBIE' },
    { id: 11, key: 'SNORKEL_ZOMBIE' },
    { id: 12, key: 'ZOMBONI', iceGround: true },
    { id: 13, key: 'ZOMBIE_BOBSLED_TEAM', iceGround: true },
    { id: 14, key: 'DOLPHIN_RIDER_ZOMBIE' },
    { id: 15, key: 'JACK_IN_THE_BOX_ZOMBIE' },
    { id: 16, key: 'BALLOON_ZOMBIE' },
    { id: 17, key: 'DIGGER_ZOMBIE' },
    { id: 18, key: 'POGO_ZOMBIE' },
    { id: 19, key: 'ZOMBIE_YETI' },
    { id: 20, key: 'BUNGEE_ZOMBIE' },
    { id: 21, key: 'LADDER_ZOMBIE' },
    { id: 22, key: 'CATAPULT_ZOMBIE' },
    { id: 23, key: 'GARGANTUAR' },
    { id: 24, key: 'IMP' },
    { id: 25, key: 'BOSS' },
]

@ccclass('AlmanacScreen')
export class AlmanacScreen extends MenuScreenBase {
    private _almanacPage: AlmanacPage = 'index'
    private _selectedPlantId = 0
    private _selectedZombieId = 0
    private _hoveredPlantId: number | null = null
    private _hoveredZombieId: number | null = null
    private _preserveHoveredPlantDuringRender = false
    private _preserveHoveredZombieDuringRender = false
    private _descriptionScroll = 0
    private _descriptionLineSpacing = 0
    private _descriptionMaxScroll = 0
    private _descriptionSliderDragging = false
    private _descriptionDragOffsetY = 0
    private _descriptionDragRectHeight = 0
    private _descriptionThumbHeight = 0
    private _descriptionThumbRange = 0
    private _descriptionScrollbarGraphics: Graphics | null = null
    private _descriptionScrollbarNode: Node | null = null
    private _descriptionScrollbarColor = Color.WHITE.clone()
    private _descriptionScrollbarBackColor = Color.WHITE.clone()
    private _descriptionContentNode: Node | null = null
    private _zombiePreviewMotions: AlmanacZombiePreviewMotion[] = []
    private readonly _descriptionTouchScrollGesture = new TouchScrollGesture()

    onEnable() {
        input.on(Input.EventType.MOUSE_MOVE, this._onGlobalMouseMove, this)
        input.on(Input.EventType.MOUSE_UP, this._onGlobalMouseUp, this)
    }

    onDisable() {
        input.off(Input.EventType.MOUSE_MOVE, this._onGlobalMouseMove, this)
        input.off(Input.EventType.MOUSE_UP, this._onGlobalMouseUp, this)
        this._descriptionSliderDragging = false
        this._descriptionTouchScrollGesture.cancel()
        this._zombiePreviewMotions = []
    }

    protected update(dt: number) {
        this._updateZombiePreviewMotions(dt)
    }

    async render(): Promise<void> {
        const [sprites, fonts, animations] = await Promise.all([
            AlmanacScreenAssets.loadSprites(),
            AlmanacScreenAssets.loadFonts(),
            AlmanacScreenAssets.loadAnimations(),
        ])
        if (!sprites) return
        const lawnStrings = await LawnStringLoader.load()

        this._resetRoot('AlmanacScreenRoot')
        this._zombiePreviewMotions = []
        this._renderAlmanac(sprites, fonts, animations, lawnStrings)
        this._preserveHoveredPlantDuringRender = false
        this._preserveHoveredZombieDuringRender = false
        UIButton.refreshHoverStates()
    }

    private _renderAlmanac(
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        animations: AlmanacAnimationMap,
        lawnStrings: LawnStringMap,
    ) {
        if (this._almanacPage === 'plants') {
            this._createBackground(sprites.almanacPlantBack)
            this._createText({
                name: 'Title',
                text: 'Suburban Almanac - Plants',
                baselineX: 400,
                baselineY: 48,
                font: fonts.plantTitle,
                color: new Color(213, 159, 43),
                align: 'center',
            })
            this._renderPlantAlmanac(sprites, fonts, animations, lawnStrings)
        } else if (this._almanacPage === 'zombies') {
            this._createBackground(sprites.almanacZombieBack)
            this._createText({
                name: 'Title',
                text: 'Suburban Almanac - Zombies',
                baselineX: 400,
                baselineY: 54,
                font: fonts.zombieTitle,
                color: new Color(0, 196, 0),
                align: 'center',
            })
            this._renderZombieAlmanac(sprites, fonts, animations, lawnStrings)
        } else {
            this._createBackground(sprites.almanacIndexBack)
            this._createText({
                name: 'Title',
                text: 'Suburban Almanac - Index',
                baselineX: 400,
                baselineY: 60,
                font: fonts.indexTitle,
                color: TITLE_COLOR,
                align: 'center',
            })
            this._createAlmanacPlantPreview(
                'IndexSunflowerPreview',
                'SUNFLOWER',
                animations,
                sprites,
                ALMANAC_INDEX_PLANT_POSITION_X,
                ALMANAC_INDEX_PLANT_POSITION_Y,
            )
            this._createAlmanacZombiePreview({
                name: 'IndexZombiePreview',
                zombieKey: 'ZOMBIE',
                animations,
                sprites,
                x: ALMANAC_INDEX_ZOMBIE_POSITION_X,
                y: ALMANAC_INDEX_ZOMBIE_POSITION_Y,
            })
        }

        if (this._almanacPage !== 'index') {
            this._createAlmanacFooterButton({
                name: 'IndexButton',
                label: 'ALMANAC INDEX',
                x: 32,
                y: 567,
                normal: sprites.almanacIndexButton,
                hover: sprites.almanacIndexButtonHighlight,
                font: fonts.footer,
                onClick: () => {
                    this._almanacPage = 'index'
                    void this.render()
                },
            })
        }
        this._createAlmanacFooterButton({
            name: 'CloseButton',
            label: 'CLOSE',
            x: 676,
            y: 567,
            normal: sprites.almanacCloseButton,
            hover: sprites.almanacCloseButtonHighlight,
            font: fonts.footer,
            onClick: () => this.onBackToMenu?.(),
        })

        if (this._almanacPage !== 'index') return

        this._createSeedChooserButton('View Plants', 130, 345, 156, 42, sprites, fonts, () => {
            this._almanacPage = 'plants'
            void this.render()
        })
        this._createStoneButton('View Zombies', 487, 345, 210, 48, sprites, fonts, () => {
            this._almanacPage = 'zombies'
            void this.render()
        })
    }

    private _renderPlantAlmanac(
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        animations: AlmanacAnimationMap,
        lawnStrings: LawnStringMap,
    ) {
        for (const plant of ALMANAC_PLANTS) {
            this._createPlantSeedPacket(plant, sprites, fonts)
        }
        this._createPlantInfoPanel(
            this._getSelectedPlant(),
            sprites,
            fonts,
            animations,
            lawnStrings,
        )
    }

    private _createPlantSeedPacket(
        plant: AlmanacPlantDefinition,
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
    ) {
        const { x, y } = this._getPlantSeedPosition(plant.id)
        let highlightNode: Node | null = null

        if (plant.id === 48) {
            createSpriteNode({
                name: `${plant.name}Icon`,
                spriteFrame: sprites.almanacImitater,
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(x),
                y: this._cppY(y),
                anchorX: 0,
                anchorY: 1,
            })
            highlightNode = createUINode(`${plant.name}Highlight`, {
                parent: this._root!,
                layer: this.node.layer,
                active: false,
            })
            createSpriteNode({
                name: `${plant.name}HoverIcon`,
                spriteFrame: sprites.almanacImitater,
                parent: highlightNode,
                layer: this.node.layer,
                x: this._cppX(x),
                y: this._cppY(y),
                anchorX: 0,
                anchorY: 1,
            })
        } else {
            SeedPacketRenderer.drawSeedPacket({
                name: `${plant.name}Packet`,
                parent: this._root!,
                layer: this.node.layer,
                seedType: plant.id,
                cost: plant.cost,
                upgrade: plant.upgrade,
                seeds: sprites.seeds,
                packetPlants: sprites.packetPlants,
                cachedPacketPlants: sprites.packetPlantsCached,
                costFont: fonts.packetCost,
                x: this._cppX(x),
                y: this._cppY(y),
            })
            highlightNode = createUINode(`${plant.name}Highlight`, {
                parent: this._root!,
                layer: this.node.layer,
                active: false,
            })
            createSpriteNode({
                name: `${plant.name}PacketFlash`,
                spriteFrame: sprites.seedPacketFlash,
                parent: highlightNode,
                layer: this.node.layer,
                x: this._cppX(x),
                y: this._cppY(y),
                anchorX: 0,
                anchorY: 1,
            })
        }

        const hitNode = createUINode(`${plant.name}PacketButton`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: plant.id === 48 ? sprites.almanacImitater.originalSize.width : SEED_PACKET_WIDTH,
            height:
                plant.id === 48 ? sprites.almanacImitater.originalSize.height : SEED_PACKET_HEIGHT,
            x: this._cppX(x),
            y: this._cppY(y),
        })
        const button = hitNode.addComponent(UIButton)
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        button.onStateChange = (state) => {
            const highlighted = state === 'hover' || state === 'pressed'
            if (highlightNode?.isValid) {
                highlightNode.active = highlighted
            }
            if (highlighted) {
                this._hoveredPlantId = plant.id
            } else if (
                !this._preserveHoveredPlantDuringRender &&
                this._hoveredPlantId === plant.id
            ) {
                this._hoveredPlantId = null
            }
        }
        button.onClick = () => {
            if (this._selectedPlantId === plant.id) return
            this._selectedPlantId = plant.id
            this._hoveredPlantId = plant.id
            this._preserveHoveredPlantDuringRender = true
            this._descriptionSliderDragging = false
            this._descriptionTouchScrollGesture.cancel()
            this._descriptionScroll = 0
            void SoundLoader.play(SoundEffect.Tap)
            void this.render()
        }
    }

    private _createPlantInfoPanel(
        plant: AlmanacPlantDefinition,
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        animations: AlmanacAnimationMap,
        lawnStrings: LawnStringMap,
    ) {
        createSpriteNode({
            name: 'PlantGroundPreview',
            spriteFrame: this._getAlmanacPlantGround(plant, sprites),
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(521),
            y: this._cppY(107),
            anchorX: 0,
            anchorY: 1,
        })
        this._createAlmanacPlantPreview(
            'SelectedPlantPreview',
            plant.key,
            animations,
            sprites,
            ALMANAC_PLANT_POSITION_X,
            ALMANAC_PLANT_POSITION_Y,
        )
        createSpriteNode({
            name: 'PlantCard',
            spriteFrame: sprites.almanacPlantCard,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(459),
            y: this._cppY(86),
            anchorX: 0,
            anchorY: 1,
        })

        this._createText({
            name: 'PlantName',
            text: LawnStringLoader.translate(`[${plant.key}]`, lawnStrings),
            baselineX: 617,
            baselineY: 288,
            font: fonts.plantButton,
            color: WHITE,
            align: 'center',
        })

        const infoHeight = this._createAlmanacText({
            name: 'PlantDescriptionHeader',
            text: LawnStringLoader.translateOptional(
                `[${plant.key}_DESCRIPTION_HEADER]`,
                lawnStrings,
            ),
            x: 485,
            y: 309,
            width: 258,
            font: fonts.footer,
        })
        this._createScrollableAlmanacText({
            name: 'PlantDescription',
            text: LawnStringLoader.translate(`[${plant.key}_DESCRIPTION]`, lawnStrings),
            x: 485,
            y: 309 + infoHeight,
            width: 258,
            height: 210 - infoHeight,
            font: fonts.footer,
            scrollbarColor: PLANT_SCROLLBAR_COLOR,
            scrollbarBackColor: PLANT_SCROLLBAR_BACK_COLOR,
        })

        if (plant.id === 48) return

        this._createAlmanacText({
            name: 'PlantCost',
            text: `{KEYWORD}${LawnStringLoader.translate('[COST]', lawnStrings)}:{STAT} ${plant.cost}`,
            x: 485,
            y: 520,
            width: 134,
            font: fonts.footer,
        })
        this._createAlmanacText({
            name: 'PlantRecharge',
            text: `{KEYWORD}${LawnStringLoader.translate('[WAIT_TIME]', lawnStrings)}:{STAT} ${this._getRechargeLabel(plant.refreshTime, lawnStrings)}`,
            x: 600,
            y: 520,
            width: 139,
            font: fonts.footer,
            align: 1,
        })
    }

    private _createAlmanacPlantPreview(
        name: string,
        plantKey: string,
        animations: AlmanacAnimationMap,
        sprites: AlmanacScreenSprites,
        x: number,
        y: number,
    ) {
        const preview = ALMANAC_PLANT_PREVIEW_BY_KEY[plantKey]
        if (!preview) return

        const animation = animations[preview.animationName]
        if (!animation?.json) return

        const root = createUINode(name, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
            x: this._cppX(x),
            y: this._cppY(y),
        })

        const shadowAdjust = ALMANAC_PLANT_SHADOW_ADJUSTMENTS[preview.plantType] ?? {
            offsetX: -3,
            offsetY: 51,
            hide: false,
        }
        if (!shadowAdjust.hide) {
            const shadowNode = createSpriteNode({
                name: 'PlantShadow',
                spriteFrame: sprites.plantShadow,
                parent: root,
                layer: this.node.layer,
                x: shadowAdjust.offsetX,
                y: -shadowAdjust.offsetY,
            })
            const shadowScale = shadowAdjust.scale ?? 1
            shadowNode.setScale(shadowScale, shadowScale, 1)
        }

        const animatorNode = createUINode('Animator', {
            parent: root,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const visualAdjust = ALMANAC_PLANT_VISUAL_ADJUSTMENTS[preview.plantType]
        animatorNode.setPosition(visualAdjust?.offsetX ?? 0, -(visualAdjust?.offsetY ?? 0), 0)
        const visualScale = visualAdjust?.scale ?? 1
        animatorNode.setScale(visualScale, visualScale, 1)

        const animator = animatorNode.addComponent(Animator)
        const animationJson = animation.json as Record<string, any>
        void animator.parseJson(animationJson).then(() => {
            if (!animatorNode.isValid) return
            const view: PlantAnimationView = {
                plantType: preview.plantType,
                body: null,
                head: null,
                face: null,
                face2: null,
                glow: null,
                idleSpeed: 1,
            }
            wirePlantAnimation(animator, view, preview.plantType, {
                animated: true,
                staticAnimTime: 0,
                includePotatoGlow: false,
                potatoInitialState: preview.plantType === 'potatomine' ? 'armed' : 'idle',
                cherryBombInitialState: 'idle',
                sunShroomInitialState: 'big',
                shakeNode: animatorNode,
            })
        })
    }

    private _getAlmanacPlantGround(
        plant: AlmanacPlantDefinition,
        sprites: AlmanacScreenSprites,
    ) {
        if (ALMANAC_NIGHT_GROUND_PLANT_KEYS.has(plant.key)) return sprites.almanacGroundNight
        return sprites.almanacGroundDay
    }

    private _createAlmanacZombiePreview(args: {
        name: string
        zombieKey: string
        animations: AlmanacAnimationMap
        sprites: AlmanacScreenSprites
        x: number
        y: number
        includeShadow?: boolean
    }) {
        const preview = ALMANAC_ZOMBIE_PREVIEW_BY_KEY[args.zombieKey]
        if (!preview) return

        const animation = args.animations[preview.animationName]
        if (!animation?.json) return
        const previewOffsetX = (preview.previewOffsetX ?? 0) + (preview.drawOffsetX ?? 0)
        const previewOffsetY = (preview.previewOffsetY ?? 0) + (preview.drawOffsetY ?? 0)

        const root = createUINode(args.name, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: 120,
            height: 120,
            x: this._cppX(args.x + previewOffsetX),
            y: this._cppY(args.y + previewOffsetY),
        })

        let shadowNode: Node | null = null
        let shadowBaseY = 0
        if (args.includeShadow && !preview.hideShadow) {
            shadowNode = createSpriteNode({
                name: 'ZombieShadow',
                spriteFrame: args.sprites.plantShadow,
                parent: root,
                layer: this.node.layer,
                x: preview.shadowOffsetX ?? ALMANAC_ZOMBIE_SHADOW_OFFSET_X,
                y: -(preview.shadowOffsetY ?? ALMANAC_ZOMBIE_SHADOW_OFFSET_Y),
            })
            shadowBaseY = shadowNode.position.y
            const shadowScale = preview.shadowScale ?? 1
            shadowNode.setScale(shadowScale, shadowScale, 1)
        }

        const visualScale = preview.scale ?? 1
        const animatorOffsetX =
            ALMANAC_ZOMBIE_REANIM_OFFSET_X +
            (preview.visualOffsetX ?? 0) +
            ALMANAC_ZOMBIE_SCALE_PIVOT_X * (1 - visualScale)
        const animatorOffsetY =
            ALMANAC_ZOMBIE_REANIM_OFFSET_Y -
            (preview.visualOffsetY ?? 0) -
            ALMANAC_ZOMBIE_SCALE_PIVOT_Y * (1 - visualScale)
        const animatorNode = createUINode('Animator', {
            parent: root,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: animatorOffsetX,
            y: animatorOffsetY,
        })
        animatorNode.setScale(visualScale, visualScale, 1)
        const animatorBaseY = animatorNode.position.y
        const animator = animatorNode.addComponent(Animator)
        const animationJson = animation.json as Record<string, any>
        void animator.parseJson(animationJson).then(() => {
            if (!animatorNode.isValid) return
            const view = createZombieAnimationView(animator)
            wireZombieAnimation(animator, view, preview.zombieType)
            this._playAlmanacZombiePreview(
                view,
                preview,
                animatorNode,
                animatorBaseY,
                shadowNode,
                shadowBaseY,
            )
            if (preview.flag) {
                const flagAnimation = args.animations.zombie_flagpole
                if (flagAnimation?.json) {
                    void attachFlagZombieAnimation(
                        animatorNode,
                        view,
                        flagAnimation.json as Record<string, any>,
                        {
                            sortHost: animator,
                        },
                    )
                }
            }
        })
    }

    private _pickAlmanacZombiePlayback(
        view: ReturnType<typeof createZombieAnimationView>,
        preview: AlmanacZombiePreviewDefinition,
    ) {
        const animations = preview.bodyAnimations
        if (
            animations.includes('anim_idle2') &&
            view.body?.hasAnimation('anim_idle2') &&
            Math.random() < ALMANAC_ZOMBIE_IDLE2_CHANCE
        ) {
            const rate = this._randomRange(
                ALMANAC_ZOMBIE_IDLE2_RATE_MIN,
                ALMANAC_ZOMBIE_IDLE2_RATE_MAX,
            )
            return {
                animation: 'anim_idle2',
                speed: getAnimationRateSpeed(view.body, 'anim_idle2', rate),
            }
        }

        const fallbackAnimations = animations.filter((animation) => animation !== 'anim_idle2')
        for (const animation of fallbackAnimations) {
            if (view.body?.hasAnimation(animation)) {
                const rate = this._getAlmanacZombieAnimationRate(animation, preview)
                return {
                    animation,
                    speed: getAnimationRateSpeed(view.body, animation, rate),
                }
            }
        }

        const fallback = fallbackAnimations[0] ?? animations[0] ?? 'anim_idle'
        const fallbackRate = this._getAlmanacZombieAnimationRate(fallback, preview)
        return {
            animation: fallback,
            speed: getAnimationRateSpeed(view.body, fallback, fallbackRate),
        }
    }

    private _playAlmanacZombiePreview(
        view: ReturnType<typeof createZombieAnimationView>,
        preview: AlmanacZombiePreviewDefinition,
        animatorNode: Node,
        animatorBaseY: number,
        shadowNode: Node | null,
        shadowBaseY: number,
    ) {
        if (preview.motion === 'pogo' && view.body?.hasAnimation('anim_pogo')) {
            const phaseCounter = this._randomInteger(1, POGO_BOUNCE_TIME)
            view.body.play({
                name: 'anim_pogo',
                loop: false,
                speed: 0,
                time: Math.max(0, (view.body.getAnimationDuration('anim_pogo') ?? 1) - 1),
                keepLastFrame: true,
            })
            this._zombiePreviewMotions.push({
                type: 'pogo',
                animatorNode,
                animatorBaseY,
                shadowNode,
                shadowBaseY,
                phaseCounter,
                previousPhaseCounter: phaseCounter,
                view,
            })
            return
        }

        if (preview.motion === 'bungee' && view.body?.hasAnimation('anim_drop')) {
            const phaseCounter = this._randomInteger(0, BUNGEE_CUTSCENE_TIME)
            view.body.play({
                name: 'anim_drop',
                loop: true,
                speed: getAnimationRateSpeed(view.body, 'anim_drop', BUNGEE_DROP_REANIM_RATE),
                truncateDisappearingFrames: false,
            })
            this._zombiePreviewMotions.push({
                type: 'bungee',
                animatorNode,
                animatorBaseY,
                shadowNode,
                shadowBaseY,
                phaseCounter,
                previousPhaseCounter: phaseCounter,
                view,
            })
            return
        }

        const playback = this._pickAlmanacZombiePlayback(view, preview)
        playZombieBodyAnimation(view, playback.animation, {
            speed: playback.speed,
            manualTime: false,
            loop: true,
        })
    }

    private _updateZombiePreviewMotions(dt: number) {
        if (this._zombiePreviewMotions.length === 0) return

        const tickDelta = dt * ALMANAC_ZOMBIE_UPDATE_TICKS_PER_SECOND
        this._zombiePreviewMotions = this._zombiePreviewMotions.filter((motion) => {
            if (!motion.animatorNode.isValid) return false
            motion.previousPhaseCounter = motion.phaseCounter

            if (motion.type === 'pogo') {
                this._updatePogoZombiePreviewMotion(motion, tickDelta)
            } else {
                this._updateBungeeZombiePreviewMotion(motion, tickDelta)
            }

            return true
        })
    }

    private _updatePogoZombiePreviewMotion(motion: AlmanacZombiePreviewMotion, tickDelta: number) {
        this._advanceZombiePhaseCounter(motion, tickDelta)

        if (
            motion.previousPhaseCounter > POGO_BOUNCE_REANIM_RESTART_COUNTER &&
            motion.phaseCounter <= POGO_BOUNCE_REANIM_RESTART_COUNTER
        ) {
            motion.view.body?.play({
                name: 'anim_pogo',
                loop: false,
                speed: getAnimationRateSpeed(
                    motion.view.body,
                    'anim_pogo',
                    POGO_BOUNCE_REANIM_RATE,
                ),
                time: 0,
                keepLastFrame: true,
            })
        }

        const altitude = this._animateBounceSlowMiddle(
            POGO_BOUNCE_TIME,
            0,
            motion.phaseCounter,
            POGO_BOUNCE_MIN_ALTITUDE,
            POGO_BOUNCE_MAX_ALTITUDE,
        )
        this._applyZombiePreviewAltitude(motion, altitude)

        if (motion.phaseCounter <= 0) {
            motion.phaseCounter = POGO_BOUNCE_TIME
        }
    }

    private _updateBungeeZombiePreviewMotion(
        motion: AlmanacZombiePreviewMotion,
        tickDelta: number,
    ) {
        this._advanceZombiePhaseCounter(motion, tickDelta)
        const altitude = this._animateSinWave(
            BUNGEE_CUTSCENE_TIME,
            0,
            motion.phaseCounter,
            BUNGEE_CUTSCENE_ALTITUDE,
            0,
        )
        if (motion.phaseCounter <= 0) {
            motion.phaseCounter = BUNGEE_CUTSCENE_TIME
        }
        this._applyZombiePreviewAltitude(motion, altitude)
    }

    private _advanceZombiePhaseCounter(motion: AlmanacZombiePreviewMotion, tickDelta: number) {
        if (motion.phaseCounter > 0) {
            motion.phaseCounter = Math.max(0, motion.phaseCounter - tickDelta)
        }
    }

    private _applyZombiePreviewAltitude(motion: AlmanacZombiePreviewMotion, altitude: number) {
        motion.animatorNode.setPosition(
            motion.animatorNode.position.x,
            motion.animatorBaseY + altitude,
            motion.animatorNode.position.z,
        )
        if (motion.type !== 'pogo' && motion.shadowNode?.isValid) {
            motion.shadowNode.setPosition(
                motion.shadowNode.position.x,
                motion.shadowBaseY - altitude,
                motion.shadowNode.position.z,
            )
        }
    }

    private _getAlmanacZombieAnimationRate(
        animation: string,
        preview?: AlmanacZombiePreviewDefinition,
    ) {
        const configuredRate = preview?.animationRates?.[animation]
        if (configuredRate != null) return configuredRate

        if (animation === 'anim_idle') {
            return this._randomRange(ALMANAC_ZOMBIE_IDLE_RATE_MIN, ALMANAC_ZOMBIE_IDLE_RATE_MAX)
        }
        if (animation === 'anim_idle2') {
            return this._randomRange(ALMANAC_ZOMBIE_IDLE2_RATE_MIN, ALMANAC_ZOMBIE_IDLE2_RATE_MAX)
        }
        return ALMANAC_ZOMBIE_IDLE_RATE_MIN
    }

    private _randomRange(min: number, max: number) {
        return min + Math.random() * (max - min)
    }

    private _randomInteger(min: number, max: number) {
        return Math.floor(this._randomRange(min, max + 1))
    }

    private _animateBounceSlowMiddle(
        start: number,
        end: number,
        age: number,
        from: number,
        to: number,
    ) {
        const t = this._clamp01((age - start) / (end - start))
        const bounce = 1 - Math.abs(2 * t - 1)
        const warped = 2 * bounce - bounce * bounce
        return from + (to - from) * warped
    }

    private _animateSinWave(start: number, end: number, age: number, from: number, to: number) {
        const t = (age - start) / (end - start)
        const warped = Math.sin(2 * Math.PI * t)
        return from + (to - from) * warped
    }

    private _clamp01(value: number) {
        return Math.max(0, Math.min(1, value))
    }

    private _renderZombieAlmanac(
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        animations: AlmanacAnimationMap,
        lawnStrings: LawnStringMap,
    ) {
        for (const zombie of ALMANAC_ZOMBIES) {
            this._createZombieWindow(zombie, sprites)
        }
        this._createZombieInfoPanel(
            this._getSelectedZombie(),
            sprites,
            fonts,
            animations,
            lawnStrings,
        )
    }

    private _createZombieWindow(zombie: AlmanacZombieDefinition, sprites: AlmanacScreenSprites) {
        const { x, y } = this._getZombiePosition(zombie.id)
        createSpriteNode({
            name: `${zombie.key}Window`,
            spriteFrame: sprites.almanacZombieWindow,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(x),
            y: this._cppY(y),
            anchorX: 0,
            anchorY: 1,
        })
        const hoverUnderlay = this._createZombieHoverLayer(
            `${zombie.key}HoverUnderlay`,
            sprites.almanacZombieWindow,
            x,
            y,
            this._root!,
        )
        hoverUnderlay.active = false
        if (zombie.id < 25) {
            createSpriteNode({
                name: `${zombie.key}Preview`,
                spriteFrame: getAtlasFrame(
                    sprites.zombiePreviewsCached,
                    zombie.id,
                    ZOMBIE_PREVIEW_CACHE_CELL_WIDTH,
                    ZOMBIE_PREVIEW_CACHE_CELL_HEIGHT,
                    ZOMBIE_PREVIEW_CACHE_COLUMNS,
                ),
                parent: this._root!,
                layer: this.node.layer,
                x: this._cppX(x),
                y: this._cppY(y),
                anchorX: 0,
                anchorY: 1,
                width: ZOMBIE_PREVIEW_CACHE_CELL_WIDTH,
                height: ZOMBIE_PREVIEW_CACHE_CELL_HEIGHT,
            })
        }
        createSpriteNode({
            name: `${zombie.key}WindowOverlay`,
            spriteFrame: sprites.almanacZombieWindowOverlay,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(x),
            y: this._cppY(y),
            anchorX: 0,
            anchorY: 1,
        })
        const hoverOverlay = this._createZombieHoverLayer(
            `${zombie.key}HoverOverlay`,
            sprites.almanacZombieWindowOverlay,
            x,
            y,
            this._root!,
        )
        hoverOverlay.active = false

        const hitNode = createUINode(`${zombie.key}Button`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: ZOMBIE_WINDOW_SIZE,
            height: ZOMBIE_WINDOW_SIZE,
            x: this._cppX(x),
            y: this._cppY(y),
        })
        const button = hitNode.addComponent(UIButton)
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        button.onStateChange = (state) => {
            const highlighted = state === 'hover' || state === 'pressed'
            if (hoverUnderlay.isValid) {
                hoverUnderlay.active = highlighted
            }
            if (hoverOverlay.isValid) {
                hoverOverlay.active = highlighted
            }
            if (highlighted) {
                this._hoveredZombieId = zombie.id
            } else if (
                !this._preserveHoveredZombieDuringRender &&
                this._hoveredZombieId === zombie.id
            ) {
                this._hoveredZombieId = null
            }
        }
        button.onClick = () => {
            if (this._selectedZombieId === zombie.id) return
            this._selectedZombieId = zombie.id
            this._hoveredZombieId = zombie.id
            this._preserveHoveredZombieDuringRender = true
            this._descriptionSliderDragging = false
            this._descriptionTouchScrollGesture.cancel()
            this._descriptionScroll = 0
            void SoundLoader.play(SoundEffect.Tap)
            void this.render()
        }
    }

    private _createZombieHoverLayer(
        name: string,
        spriteFrame: SpriteFrame,
        x: number,
        y: number,
        parent: Node,
    ) {
        const node = createSpriteNode({
            name,
            spriteFrame,
            parent,
            layer: this.node.layer,
            x: this._cppX(x),
            y: this._cppY(y),
            anchorX: 0,
            anchorY: 1,
        })
        const sprite = node.getComponent(Sprite)
        if (sprite) {
            sprite.color = new Color(255, 255, 255, 48)
            sprite.customMaterial = this._getAdditiveSpriteMaterial()
        }
        return node
    }

    private _getAdditiveSpriteMaterial() {
        if (additiveSpriteMaterial) return additiveSpriteMaterial

        additiveSpriteMaterial = new Material()
        additiveSpriteMaterial.initialize({
            effectName: 'for2d/builtin-sprite',
            defines: {
                USE_TEXTURE: true,
            },
            states: {
                blendState: {
                    targets: [
                        {
                            blend: true,
                            blendSrc: gfx.BlendFactor.SRC_ALPHA,
                            blendDst: gfx.BlendFactor.ONE,
                            blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
                            blendDstAlpha: gfx.BlendFactor.ONE,
                        },
                    ],
                },
            },
        })
        return additiveSpriteMaterial
    }

    private _createZombieInfoPanel(
        zombie: AlmanacZombieDefinition,
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        animations: AlmanacAnimationMap,
        lawnStrings: LawnStringMap,
    ) {
        createSpriteNode({
            name: 'ZombieGroundPreview',
            spriteFrame: zombie.iceGround ? sprites.almanacGroundIce : sprites.almanacGroundDay,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(518),
            y: this._cppY(110),
            anchorX: 0,
            anchorY: 1,
        })
        this._createAlmanacZombiePreview({
            name: 'SelectedZombiePreview',
            zombieKey: zombie.key,
            animations,
            sprites,
            x: ALMANAC_ZOMBIE_POSITION_X,
            y: ALMANAC_ZOMBIE_POSITION_Y,
            includeShadow: true,
        })
        createSpriteNode({
            name: 'ZombieCard',
            spriteFrame: sprites.almanacZombieCard,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(455),
            y: this._cppY(78),
            anchorX: 0,
            anchorY: 1,
        })

        this._createText({
            name: 'ZombieName',
            text: LawnStringLoader.translate(`[${zombie.key}]`, lawnStrings),
            baselineX: 613,
            baselineY: 362,
            font: fonts.zombieButton,
            color: ZOMBIE_NAME_COLOR,
            align: 'center',
        })

        const headerHeight = this._createAlmanacText({
            name: 'ZombieDescriptionHeader',
            text: LawnStringLoader.translateOptional(
                `[${zombie.key}_DESCRIPTION_HEADER]`,
                lawnStrings,
            ),
            x: 485,
            y: 377,
            width: 258,
            font: fonts.footer,
        })
        this._createScrollableAlmanacText({
            name: 'ZombieDescription',
            text: LawnStringLoader.translate(`[${zombie.key}_DESCRIPTION]`, lawnStrings),
            x: 485,
            y: 377 + headerHeight,
            width: 257,
            height: 160 - headerHeight,
            font: fonts.footer,
            scrollbarColor: ZOMBIE_SCROLLBAR_COLOR,
            scrollbarBackColor: ZOMBIE_SCROLLBAR_BACK_COLOR,
        })
    }

    private _getPlantSeedPosition(plantId: number) {
        if (plantId === 48) return { x: 20, y: 23 }

        return {
            x: (plantId % SEED_PACKET_ROWS) * SEED_PACKET_STRIDE_X + SEED_PACKET_STRIDE_X / 2,
            y:
                Math.floor(plantId / SEED_PACKET_ROWS) * SEED_PACKET_STRIDE_Y +
                SEED_PACKET_STRIDE_Y +
                14,
        }
    }

    private _getSelectedPlant() {
        return (
            ALMANAC_PLANTS.find((plant) => plant.id === this._selectedPlantId) ?? ALMANAC_PLANTS[0]
        )
    }

    private _getZombiePosition(zombieId: number) {
        const zombieIndex = zombieId === 25 ? zombieId + 2 : zombieId
        return {
            x: (zombieIndex % ZOMBIE_ROWS) * ZOMBIE_STRIDE_X + 22,
            y:
                Math.floor(zombieIndex / ZOMBIE_ROWS) * ZOMBIE_STRIDE_Y +
                ZOMBIE_STRIDE_Y +
                ZOMBIE_OFFSET_Y,
        }
    }

    private _getSelectedZombie() {
        return (
            ALMANAC_ZOMBIES.find((zombie) => zombie.id === this._selectedZombieId) ??
            ALMANAC_ZOMBIES[0]
        )
    }

    private _getRechargeLabel(refreshTime: number, lawnStrings: LawnStringMap) {
        if (refreshTime === 750) return LawnStringLoader.translate('[WAIT_TIME_SHORT]', lawnStrings)
        if (refreshTime === 3000) return LawnStringLoader.translate('[WAIT_TIME_LONG]', lawnStrings)
        return LawnStringLoader.translate('[WAIT_TIME_VERY_LONG]', lawnStrings)
    }

    private _createWrappedText(args: {
        name: string
        text: string
        x: number
        y: number
        width: number
        font: BitmapFontAssets | null
        color: Color
        align?: number
        parent?: Node
    }) {
        const node = createUINode(args.name, {
            parent: args.parent ?? this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (args.font) renderer.setFontAssets(args.font)
        renderer.fontColor = args.color
        renderer.maxWidth = args.width
        renderer.textAlign = args.align ?? 0
        renderer.string = args.text
        renderer.forceRebuild()
        if (args.parent) {
            node.setPosition(args.x, args.y, 0)
        } else {
            node.setPosition(this._cppX(args.x), this._cppY(args.y), 0)
        }
        return renderer.contentHeight
    }

    private _createAlmanacText(args: {
        name: string
        text: string
        x: number
        y: number
        width: number
        font: BitmapFontAssets | null
        align?: number
    }) {
        if (args.text.length === 0) return 0

        const lines = this._wrapAlmanacText(args.text, args.font, args.width)
        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        let y = args.y
        let totalHeight = 0

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            this._createAlmanacTextLine({
                name: `${args.name}Line${index}`,
                line,
                x: args.x,
                y,
                width: args.width,
                font: args.font,
                align: args.align,
            })
            const advance = metrics.lineSpacing + line.spacingOffset
            y += advance
            totalHeight += advance
        }

        return Math.max(0, totalHeight)
    }

    private _createScrollableAlmanacText(args: {
        name: string
        text: string
        x: number
        y: number
        width: number
        height: number
        font: BitmapFontAssets | null
        scrollbarColor: Color
        scrollbarBackColor: Color
    }) {
        const fullWidthLines = this._wrapAlmanacText(args.text, args.font, args.width)
        const fullWidthContentHeight = this._measureAlmanacTextLines(fullWidthLines, args.font)

        if (fullWidthContentHeight <= args.height) {
            this._descriptionScroll = 0
            this._descriptionMaxScroll = 0
            this._descriptionLineSpacing = 0
            this._descriptionSliderDragging = false
            this._descriptionTouchScrollGesture.cancel()
            this._descriptionContentNode = null
            this._descriptionScrollbarNode = null
            this._descriptionScrollbarGraphics = null
            this._createAlmanacText({
                name: args.name,
                text: args.text,
                x: args.x,
                y: args.y,
                width: args.width,
                font: args.font,
            })
            return fullWidthContentHeight
        }

        const contentWidth = args.width - DESCRIPTION_SCROLLBAR_WIDTH
        const lines = this._wrapAlmanacText(args.text, args.font, contentWidth)
        const contentHeight = this._measureAlmanacTextLines(lines, args.font)
        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        const visualMaxScroll = Math.max(0, contentHeight - args.height)
        const maxScroll =
            visualMaxScroll + metrics.lineSpacing * DESCRIPTION_SCROLL_BOTTOM_PADDING_RATIO
        const scroll = Math.min(this._descriptionScroll, maxScroll)
        this._descriptionContentNode = null
        this._descriptionScrollbarGraphics = null
        this._descriptionScrollbarNode = null
        this._descriptionScroll = scroll
        this._descriptionMaxScroll = maxScroll
        this._descriptionLineSpacing = metrics.lineSpacing

        const clipNode = createUINode(`${args.name}Clip`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: contentWidth,
            height: args.height,
            x: this._cppX(args.x),
            y: this._cppY(args.y),
        })
        const mask = clipNode.addComponent(Mask)
        mask.type = Mask.Type.RECT

        const contentNode = createUINode(`${args.name}Content`, {
            parent: clipNode,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            x: 0,
            y: scroll,
        })
        this._descriptionContentNode = contentNode

        let localY = 0
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            this._createAlmanacTextLine({
                name: `${args.name}Line${index}`,
                line,
                x: 0,
                y: -localY,
                width: contentWidth,
                font: args.font,
                parent: contentNode,
            })
            localY += metrics.lineSpacing + line.spacingOffset
        }

        clipNode.on(Node.EventType.MOUSE_WHEEL, (event: EventMouse) => {
            event.propagationStopped = true
            this._scrollDescriptionByWheel(event)
        })
        if (sys.isMobile) {
            clipNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
                if (this._descriptionSliderDragging) return
                event.propagationStopped = true
                this._descriptionTouchScrollGesture.begin()
            })
            clipNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
                if (
                    !this._descriptionTouchScrollGesture.dragging ||
                    this._descriptionSliderDragging
                )
                    return
                event.propagationStopped = true
                this._setDescriptionScroll(
                    this._descriptionScroll + this._descriptionTouchScrollGesture.getDeltaY(event),
                    this._descriptionMaxScroll,
                )
            })
            clipNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                if (!this._descriptionTouchScrollGesture.end()) return
                event.propagationStopped = true
            })
            clipNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
                if (!this._descriptionTouchScrollGesture.end()) return
                event.propagationStopped = true
            })
        }
        this._createDescriptionScrollbar(args, visualMaxScroll, maxScroll)
        return args.height
    }

    private _createAlmanacTextLine(args: {
        name: string
        line: AlmanacTextLine
        x: number
        y: number
        width: number
        font: BitmapFontAssets | null
        align?: number
        parent?: Node
    }) {
        const lineTextWidth = args.line.runs.reduce(
            (sum, run) =>
                sum + FontMetricsUtil.measureTextWidth(args.font?.config ?? null, run.text),
            0,
        )
        const lineX = args.x + (args.align === 1 ? args.width - lineTextWidth : 0)
        let x = lineX
        for (const run of args.line.runs) {
            const width = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, run.text)
            this._createWrappedText({
                name: args.name,
                text: run.text,
                x,
                y: args.y,
                width: args.width,
                font: args.font,
                color: run.color,
                parent: args.parent,
            })
            x += width
        }
    }

    private _measureAlmanacTextLines(lines: AlmanacTextLine[], font: BitmapFontAssets | null) {
        const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        return lines.reduce((height, line) => height + metrics.lineSpacing + line.spacingOffset, 0)
    }

    private _createDescriptionScrollbar(
        args: {
            name: string
            x: number
            y: number
            width: number
            height: number
            scrollbarColor: Color
            scrollbarBackColor: Color
        },
        scrollbarMaxScroll: number,
        maxScroll: number,
    ) {
        const barX = args.x + args.width - DESCRIPTION_SCROLLBAR_WIDTH / 2
        const trackHeight = args.height
        const rawThumbHeight = trackHeight - scrollbarMaxScroll
        const originalThumbHeight = Math.max(ALMANAC_DESCRIPTION_MIN_HEIGHT, rawThumbHeight)
        const thumbHeight = Math.min(
            trackHeight,
            originalThumbHeight * DESCRIPTION_SCROLLBAR_THUMB_SCALE,
        )
        const thumbRange = Math.max(1, trackHeight - thumbHeight)
        this._descriptionDragRectHeight = trackHeight
        this._descriptionThumbHeight = thumbHeight
        this._descriptionThumbRange = thumbRange
        this._descriptionScrollbarColor.set(args.scrollbarColor)
        this._descriptionScrollbarBackColor.set(args.scrollbarBackColor)

        const trackNode = createUINode(`${args.name}Scrollbar`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: DESCRIPTION_SCROLLBAR_WIDTH,
            height: trackHeight,
            x: this._cppX(barX),
            y: this._cppY(args.y),
        })
        const graphics = trackNode.addComponent(Graphics)
        this._descriptionScrollbarNode = trackNode
        this._descriptionScrollbarGraphics = graphics
        this._redrawDescriptionScrollbar()

        trackNode.on(Node.EventType.MOUSE_WHEEL, (event: EventMouse) => {
            event.propagationStopped = true
            this._scrollDescriptionByWheel(event)
        })
        trackNode.on(Node.EventType.TOUCH_START, (event: EventTouch) => {
            const localY = this._getLocalScrollY(trackNode, event)
            if (!this._beginDescriptionSliderDrag(localY)) return
            event.propagationStopped = true
        })
        trackNode.on(Node.EventType.TOUCH_MOVE, (event: EventTouch) => {
            if (!this._descriptionSliderDragging) return
            event.propagationStopped = true
            this._dragDescriptionSlider(this._getLocalScrollY(trackNode, event))
        })
        trackNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (!this._descriptionSliderDragging) return
            event.propagationStopped = true
            this._descriptionSliderDragging = false
        })
        trackNode.on(Node.EventType.TOUCH_CANCEL, (event: EventTouch) => {
            if (!this._descriptionSliderDragging) return
            event.propagationStopped = true
            this._descriptionSliderDragging = false
        })
        trackNode.on(Node.EventType.MOUSE_DOWN, (event: EventMouse) => {
            const localY = this._getLocalScrollYFromLocation(
                trackNode,
                this._getMouseUILocation(event),
            )
            if (!this._beginDescriptionSliderDrag(localY)) return
            event.propagationStopped = true
        })
    }

    private _scrollDescriptionByWheel(event: EventMouse) {
        if (this._descriptionSliderDragging) return
        const delta = Math.sign(event.getScrollY())
        if (delta === 0) return
        this._setDescriptionScroll(
            this._descriptionScroll -
                this._descriptionLineSpacing * DESCRIPTION_WHEEL_SCROLL_SCALE * delta,
            this._descriptionMaxScroll,
        )
    }

    private _getLocalScrollY(node: Node, event: EventTouch) {
        return this._getLocalScrollYFromLocation(node, event.getUILocation())
    }

    private _getLocalScrollYFromLocation(node: Node, location: Vec2) {
        const transform = node.getComponent(UITransform)
        if (!transform) return 0
        const local = new Vec3()
        transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0), local)
        return -local.y
    }

    private _getMouseUILocation(event: EventMouse) {
        const maybeEvent = event as EventMouse & { getUILocation?: () => Vec2 }
        return maybeEvent.getUILocation?.() ?? event.getLocation()
    }

    private _beginDescriptionSliderDrag(localY: number) {
        const thumbY = this._getDescriptionThumbY()
        if (localY < thumbY || localY >= thumbY + this._descriptionThumbHeight) return false
        this._descriptionDragOffsetY = localY - thumbY
        this._descriptionSliderDragging = true
        this._descriptionTouchScrollGesture.cancel()
        return true
    }

    private _dragDescriptionSlider(localY: number) {
        const thumbY = localY - this._descriptionDragOffsetY
        this._setDescriptionScroll(
            (thumbY / this._descriptionThumbRange) * this._descriptionMaxScroll,
            this._descriptionMaxScroll,
        )
    }

    private _onGlobalMouseMove(event: EventMouse) {
        if (!this._descriptionSliderDragging) return
        const scrollbarNode = this._descriptionScrollbarNode
        if (!scrollbarNode?.isValid) return
        event.propagationStopped = true
        this._dragDescriptionSlider(
            this._getLocalScrollYFromLocation(scrollbarNode, this._getMouseUILocation(event)),
        )
    }

    private _onGlobalMouseUp(event: EventMouse) {
        if (!this._descriptionSliderDragging) return
        event.propagationStopped = true
        this._descriptionSliderDragging = false
    }

    private _setDescriptionScroll(scroll: number, maxScroll: number) {
        this._descriptionScroll = Math.max(0, Math.min(maxScroll, scroll))
        this._updateDescriptionScrollView()
    }

    private _updateDescriptionScrollView() {
        if (this._descriptionContentNode?.isValid) {
            this._descriptionContentNode.setPosition(0, this._descriptionScroll, 0)
        }
        this._redrawDescriptionScrollbar()
    }

    private _redrawDescriptionScrollbar() {
        const graphics = this._descriptionScrollbarGraphics
        if (!graphics?.isValid) return

        graphics.clear()
        graphics.fillColor = this._descriptionScrollbarBackColor
        graphics.fillRect(
            0,
            -this._descriptionDragRectHeight,
            DESCRIPTION_SCROLLBAR_WIDTH,
            this._descriptionDragRectHeight,
        )
        graphics.fillColor = this._descriptionScrollbarColor
        const thumbY = this._getDescriptionThumbY()
        graphics.fillRect(
            0,
            -(thumbY + this._descriptionThumbHeight),
            DESCRIPTION_SCROLLBAR_WIDTH,
            this._descriptionThumbHeight,
        )
    }

    private _getDescriptionThumbY() {
        if (this._descriptionMaxScroll <= 0) return 0
        const ratio = this._descriptionScroll / this._descriptionMaxScroll
        return Math.max(
            0,
            Math.min(this._descriptionThumbRange, ratio * this._descriptionThumbRange),
        )
    }

    private _wrapAlmanacText(
        text: string,
        font: BitmapFontAssets | null,
        width: number,
    ): AlmanacTextLine[] {
        const sourceLines = this._parseAlmanacTextLines(text)
        const wrapped: AlmanacTextLine[] = []
        for (const line of sourceLines) {
            if (line.runs.length === 0) {
                wrapped.push(line)
                continue
            }

            let currentLine: AlmanacTextLine = { runs: [], spacingOffset: line.spacingOffset }
            let currentWidth = 0
            for (const run of line.runs) {
                const parts = run.text.split(/(\s+)/)
                for (const part of parts) {
                    if (!part) continue
                    const partWidth = FontMetricsUtil.measureTextWidth(font?.config ?? null, part)
                    if (
                        currentWidth > 0 &&
                        currentWidth + partWidth > width &&
                        part.trim().length > 0
                    ) {
                        wrapped.push(currentLine)
                        currentLine = { runs: [], spacingOffset: 0 }
                        currentWidth = 0
                    }
                    if (currentWidth === 0 && part.trim().length === 0) continue
                    this._appendAlmanacRun(currentLine, part, run.color)
                    currentWidth += partWidth
                }
            }
            wrapped.push(currentLine)
        }
        return wrapped
    }

    private _parseAlmanacTextLines(text: string): AlmanacTextLine[] {
        const lines: AlmanacTextLine[] = []
        let currentLine: AlmanacTextLine = { runs: [], spacingOffset: 0 }
        let currentColor = BODY_TEXT_COLOR
        let ignoreNewlines = false
        let buffer = ''
        let skipNextLineBreak = false

        const flushBuffer = () => {
            if (!buffer) return
            this._appendAlmanacRun(currentLine, buffer, currentColor)
            buffer = ''
        }
        const finishLine = (spacingOffset = 0) => {
            flushBuffer()
            currentLine.spacingOffset = spacingOffset
            lines.push(currentLine)
            currentLine = { runs: [], spacingOffset: 0 }
        }

        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            if (char === '{') {
                const end = text.indexOf('}', i + 1)
                if (end !== -1) {
                    flushBuffer()
                    const tag = text.slice(i + 1, end)
                    if (tag === 'KEYWORD' || tag === 'FLAVOR') {
                        currentColor = FORMAT_ACCENT_TEXT_COLOR
                        ignoreNewlines = tag === 'FLAVOR'
                    } else if (tag === 'STAT') {
                        currentColor = FORMAT_STAT_TEXT_COLOR
                        ignoreNewlines = false
                    } else if (tag === 'METAL') {
                        currentColor = FORMAT_STAT_TEXT_COLOR
                        ignoreNewlines = false
                    } else if (tag === 'KEYMETAL') {
                        currentColor = FORMAT_ACCENT_TEXT_COLOR
                        ignoreNewlines = false
                    } else if (tag === 'NOCTURNAL') {
                        currentColor = new Color(136, 50, 170)
                        ignoreNewlines = false
                    } else if (tag === 'AQUATIC') {
                        currentColor = new Color(11, 161, 219)
                        ignoreNewlines = false
                    } else if (tag === 'SHORTLINE') {
                        finishLine(SHORT_LINE_SPACING_OFFSET)
                        skipNextLineBreak = true
                        ignoreNewlines = false
                    } else if (tag === 'EXTRASHORTLINE') {
                        finishLine(-14)
                        skipNextLineBreak = true
                        ignoreNewlines = false
                    } else if (tag === 'NORMAL') {
                        currentColor = BODY_TEXT_COLOR
                        ignoreNewlines = false
                    }
                    i = end
                    continue
                }
            }
            if (char === '\r') continue
            if (char === '\n') {
                if (skipNextLineBreak) {
                    skipNextLineBreak = false
                    continue
                }
                if (ignoreNewlines) {
                    buffer += ' '
                    continue
                }
                finishLine()
                continue
            }
            skipNextLineBreak = false
            buffer += char
        }
        flushBuffer()
        if (currentLine.runs.length > 0 || lines.length === 0) lines.push(currentLine)
        return lines
    }

    private _appendAlmanacRun(line: AlmanacTextLine, text: string, color: Color) {
        const previous = line.runs[line.runs.length - 1]
        if (
            previous &&
            previous.color.r === color.r &&
            previous.color.g === color.g &&
            previous.color.b === color.b
        ) {
            previous.text += text
            return
        }
        line.runs.push({ text, color })
    }

    private _createAlmanacFooterButton(args: {
        name: string
        label: string
        x: number
        y: number
        normal: SpriteFrame
        hover: SpriteFrame
        font: BitmapFontAssets | null
        onClick: () => void
    }) {
        const buttonNode = this._createImageButton({
            name: args.name,
            x: args.x,
            y: args.y,
            normal: args.normal,
            hover: args.hover,
            pressed: args.hover,
            pressOffset: new Vec3(1, -1, 0),
            releaseToNormalOnPressOut: true,
            pressSound: SoundEffect.Tap,
            onClick: args.onClick,
        })
        this._createTextInNode(
            buttonNode,
            args.label,
            args.font,
            BUTTON_TEXT_COLOR,
            args.normal.originalSize.width / 2 - (args.name === 'CloseButton' ? 8 : -7),
            12,
            BUTTON_TEXT_COLOR,
        )
    }

    private _createSeedChooserButton(
        label: string,
        x: number,
        y: number,
        width: number,
        height: number,
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        onClick: () => void,
    ) {
        const buttonNode = this._createImageButton({
            name: `${label}Button`,
            x,
            y,
            normal: sprites.seedChooserButton,
            hover: sprites.seedChooserButton,
            pressed: sprites.seedChooserButton,
            pressOffset: new Vec3(1, -1, 0),
            releaseToNormalOnPressOut: true,
            pressSound: SoundEffect.Tap,
            onClick,
        })
        setUISize(buttonNode, width, height, 0, 1)
        const glowNode = createSpriteNode({
            name: 'HoverGlow',
            spriteFrame: sprites.seedChooserButtonHighlight,
            parent: buttonNode,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
        })
        glowNode.active = false
        this._createButtonLabel(buttonNode, label, width, fonts.plantButton, 19)

        const button = buttonNode.getComponent(UIButton)
        button!.onStateChange = (state) => {
            glowNode.active = state === 'hover' || state === 'pressed'
        }
    }

    private _createStoneButton(
        label: string,
        x: number,
        y: number,
        width: number,
        height: number,
        sprites: AlmanacScreenSprites,
        fonts: AlmanacScreenFonts,
        onClick: () => void,
    ) {
        const buttonNode = createUINode(`${label}Button`, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width,
            height,
        })
        buttonNode.setPosition(this._cppX(x), this._cppY(y), 0)

        const normalRow = buildThreeSliceRow({
            name: 'Normal',
            width,
            left: sprites.buttonLeft,
            middle: sprites.buttonMiddle,
            right: sprites.buttonRight,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        normalRow.setParent(buttonNode)

        const pressedRow = buildThreeSliceRow({
            name: 'Pressed',
            width,
            left: sprites.buttonDownLeft,
            middle: sprites.buttonDownMiddle,
            right: sprites.buttonDownRight,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        pressedRow.setParent(buttonNode)
        pressedRow.setPosition(1, 0, 0)
        pressedRow.active = false

        const button = buttonNode.addComponent(UIButton)
        button.pressOffset = new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = true
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.GraveButton)
        }
        button.onClick = () => {
            onClick()
            if (button.isValid) {
                button.refreshHoverFromPointer()
            }
        }
        const { normalLabel, highlightLabel, normalPos, highlightPos } =
            this._createStoneButtonLabels(
                buttonNode,
                label,
                width,
                height,
                fonts.zombieButton,
                fonts.zombieButtonHover,
            )
        button.onStateChange = (state) => {
            const pressed = state === 'pressed'
            const highlighted = state === 'hover' || pressed
            normalRow.active = !pressed
            pressedRow.active = pressed
            normalLabel.active = !highlighted
            highlightLabel.active = highlighted
            normalLabel.setPosition(normalPos.x, normalPos.y, 0)
            highlightLabel.setPosition(
                highlightPos.x + (pressed ? 1 : 0),
                highlightPos.y - (pressed ? 1 : 0),
                0,
            )
        }
    }

    private _createButtonLabel(
        parent: Node,
        text: string,
        width: number,
        font: BitmapFontAssets | null,
        centerY: number,
    ) {
        const node = createUINode('Label', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (font) renderer.setFontAssets(font)
        renderer.fontColor = WHITE
        renderer.string = text
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        const textWidth =
            FontMetricsUtil.measureTextWidth(font?.config ?? null, text) || renderer.contentWidth
        node.setPosition((width - textWidth) / 2, -(centerY - metrics.ascent / 2), 0)
        return node
    }

    private _createStoneButtonLabels(
        parent: Node,
        text: string,
        width: number,
        height: number,
        normalFont: BitmapFontAssets | null,
        highlightFont: BitmapFontAssets | null,
    ) {
        const normalLabel = createUINode('Label', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const normalRenderer = normalLabel.addComponent(FontRenderer)
        if (normalFont) normalRenderer.setFontAssets(normalFont)
        normalRenderer.string = text
        normalRenderer.forceRebuild()

        const highlightLabel = createUINode('LabelHighlight', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const highlightRenderer = highlightLabel.addComponent(FontRenderer)
        if (highlightFont) highlightRenderer.setFontAssets(highlightFont)
        highlightRenderer.string = text
        highlightRenderer.forceRebuild()

        const normalMetrics = FontMetricsUtil.getMetrics(normalFont?.config ?? null)
        const highlightMetrics = FontMetricsUtil.getMetrics(
            highlightFont?.config ?? normalFont?.config ?? null,
        )
        const normalWidth =
            FontMetricsUtil.measureTextWidth(normalFont?.config ?? null, text) ||
            normalRenderer.contentWidth
        const highlightWidth =
            FontMetricsUtil.measureTextWidth(highlightFont?.config ?? null, text) ||
            highlightRenderer.contentWidth

        const normalBaselineY =
            (height - normalMetrics.ascent / 6 - 1 + normalMetrics.ascent) / 2 - 4
        const highlightBaselineY =
            (height - highlightMetrics.ascent / 6 - 1 + highlightMetrics.ascent) / 2 - 4
        const normalPos = new Vec3(
            (width - normalWidth) / 2 + 1,
            -(normalBaselineY - normalMetrics.ascent),
            0,
        )
        const highlightPos = new Vec3(
            (width - highlightWidth) / 2 + 1,
            -(highlightBaselineY - highlightMetrics.ascent),
            0,
        )

        normalLabel.setPosition(normalPos)
        highlightLabel.setPosition(highlightPos)
        normalLabel.active = true
        highlightLabel.active = false

        return { normalLabel, highlightLabel, normalPos, highlightPos }
    }
}
