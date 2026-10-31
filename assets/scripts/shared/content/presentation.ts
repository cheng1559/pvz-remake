import type { MusicTuneId } from './music'
import type { JsonObject } from '@/shared/protocol'

export interface ClientAnimationClip {
    readonly reanimId: string
    readonly rateScale: number
    readonly x: number
    readonly y: number
    readonly attachmentTrackId?: string
    readonly fps?: number
}

export interface AnimationDefinition { readonly [slot: string]: ClientAnimationClip }

/** The parent track a head, blink or flag clip attaches to; the data must name it. */
export function attachmentTrack(clip: ClientAnimationClip): string {
    if (!clip.attachmentTrackId) throw new Error(`${clip.reanimId} needs an attachmentTrackId to attach`)
    return clip.attachmentTrackId
}

export interface ShooterAnimationDefinition extends AnimationDefinition {
    readonly body: ClientAnimationClip
    readonly idleHead: ClientAnimationClip
    readonly shootHead: ClientAnimationClip
    readonly blink: ClientAnimationClip
}

export interface ZombieAnimationDefinition extends AnimationDefinition {
    readonly idle: ClientAnimationClip
    readonly walk: ClientAnimationClip
    readonly walk2: ClientAnimationClip
    readonly eat: ClientAnimationClip
    readonly death: ClientAnimationClip
    readonly death2: ClientAnimationClip
    readonly mowered: ClientAnimationClip
}

export interface NormalZombieAnimationDefinition extends ZombieAnimationDefinition {
    readonly idle2: ClientAnimationClip
}

export interface SunflowerAnimationDefinition extends AnimationDefinition {
    readonly body: ClientAnimationClip
    readonly blink: ClientAnimationClip
}

export interface FlagZombieAnimationDefinition extends ZombieAnimationDefinition {
    readonly flag: ClientAnimationClip
}

export interface PoleVaulterAnimationDefinition extends ZombieAnimationDefinition {
    readonly run: ClientAnimationClip
    readonly jump: ClientAnimationClip
}

export interface CherryBombAnimationDefinition extends AnimationDefinition {
    readonly idle: ClientAnimationClip
    readonly explode: ClientAnimationClip
}

export interface WallNutAnimationDefinition extends AnimationDefinition {
    readonly body: ClientAnimationClip
    readonly blinkTwitch: ClientAnimationClip
    readonly blinkTwice: ClientAnimationClip
    readonly blinkThrice: ClientAnimationClip
}

export interface PotatoMineAnimationDefinition extends AnimationDefinition {
    readonly buried: ClientAnimationClip
    readonly rise: ClientAnimationClip
    readonly armed: ClientAnimationClip
    readonly blink: ClientAnimationClip
    readonly glow: ClientAnimationClip
}

export interface ChomperAnimationDefinition extends AnimationDefinition {
    readonly idle: ClientAnimationClip
    readonly bite: ClientAnimationClip
    readonly chew: ClientAnimationClip
    readonly swallow: ClientAnimationClip
}

export interface ClientAnimationDefinitions {
    readonly [id: string]: AnimationDefinition
    readonly 'pvz:peashooter': ShooterAnimationDefinition
    readonly 'pvz:repeater': ShooterAnimationDefinition
    readonly 'pvz:snowpea': ShooterAnimationDefinition
    readonly 'pvz:normal': NormalZombieAnimationDefinition
    readonly 'pvz:flag': FlagZombieAnimationDefinition
    readonly 'pvz:conehead': ZombieAnimationDefinition
    readonly 'pvz:buckethead': ZombieAnimationDefinition
    readonly 'pvz:pole_vaulter': PoleVaulterAnimationDefinition
    readonly 'pvz:sunflower': SunflowerAnimationDefinition
    readonly 'pvz:cherrybomb': CherryBombAnimationDefinition
    readonly 'pvz:wallnut': WallNutAnimationDefinition
    readonly 'pvz:potatomine': PotatoMineAnimationDefinition
    readonly 'pvz:chomper': ChomperAnimationDefinition
}

export type ClientAnimationTarget = string

export type SeedPacketSeedType = string | number
export type PlantViewKind = string
export interface PlantVisual {
    readonly seedType: SeedPacketSeedType
    readonly nameKey?: string
    readonly tooltipKey?: string
    readonly preview?: number
    readonly tint?: readonly [number, number, number]
}

/** Body tracks a plant view changes, by exact ID; the heads and blinks attach by their clips' attachmentTrackId. */
export interface PlantParts {
    /** Plant::DoBlink hides these while the blink plays (the original's anim_eye prefix). */
    readonly eyes?: readonly string[]
    /** Takes the cracked sprites as a nut is chewed (Plant::UpdateReanim). */
    readonly face?: string
    /** The potato mine's light: lit near zombies, hidden in the almanac, shown on the seed packet. */
    readonly glow?: readonly string[]
}

export interface PlantPresentationDefinition {
    readonly viewConfig?: Readonly<JsonObject>
    readonly rowOrder?: number
    readonly shadow: { readonly x: number; readonly y: number; readonly scale?: number }
    readonly scale: number
    /** PlantDrawHeightOffset, in original Y-down pixels: the grid preview draws its cached image this far down. */
    readonly drawHeightOffset?: number
    /** Board::OffsetYForPlanting: the planted cell is picked this far below the pointer. */
    readonly pointerOffsetY?: number
    /** Plant::SetSleeping: extra offset of the Z animation from (50, 40), in original Y-down pixels. */
    readonly sleepOffset?: readonly [number, number]
    readonly visual: PlantVisual
    readonly parts?: PlantParts
    readonly view?: PlantViewKind
    readonly animationTarget?: ClientAnimationTarget
    readonly animations?: ClientAnimationDefinitions[ClientAnimationTarget]
    readonly chewParticle?: string
    readonly explosion?: { readonly effect: string; readonly x: number; readonly rowOrder: boolean }
    readonly plantedSounds?: readonly PresentationSound[]
    readonly explosionSounds?: readonly PresentationSound[]
    /** Played when an area shooter, like the Fume-shroom, fires. */
    readonly fireSounds?: readonly PresentationSound[]
    readonly mine?: {
        readonly blinkTicks: readonly [number, number]
        readonly riseRate: number
        readonly armedRate: readonly [number, number]
        readonly blendSeconds: number
        readonly glow: { readonly distance: readonly [number, number]; readonly frames: readonly [number, number]; readonly rateOffset: number }
    }
}

export interface PresentationSound {
    readonly id: string
    readonly foley: boolean
    readonly pitchRange?: number
}

export interface ProjectilePresentationDefinition {
    readonly viewConfig?: Readonly<JsonObject>
    readonly sprite: string
    readonly shadow?: {
        readonly sprite: string; readonly columns: number; readonly cell: number
        readonly offset: { readonly x: number; readonly y: number }; readonly scale: number
    }
    readonly trail?: { readonly id: string; readonly x: number; readonly y: number }
    readonly impact?: {
        readonly id: string
        readonly offset: readonly [number, number]
        readonly yRange: readonly [number, number]
    }
    readonly fireSounds: readonly PresentationSound[]
    readonly impactSounds: readonly PresentationSound[]
}

export interface ScreenAnimationDefinition {
    readonly name: string
    readonly reanimId: string
    readonly x: number
    readonly y: number
    readonly rate: number
    readonly playback: 'loop' | 'last'
    readonly randomPhase?: boolean
    /** Exact tracks to show; the others are hidden. */
    readonly visibleTracks?: readonly string[]
}

export interface SeedPacketPlacement { readonly scale: number; readonly offsetX: number; readonly offsetY: number }
export interface DisplayCord { readonly sprite: string; readonly track: string; readonly x: number; readonly height: number }
export interface ZombieDrop {
    readonly track: string
    readonly effect: string
    readonly moweredEffect?: string
    readonly offset: readonly [number, number]
    readonly image?: string
    readonly sounds?: readonly PresentationSound[]
}

export interface ZombiePresentationDefinition {
    readonly nameKey?: string
    readonly view?: string
    readonly animationTarget: ClientAnimationTarget
    readonly animations: ClientAnimationDefinitions[ClientAnimationTarget]
    readonly shadowX: number
    /** Original Y-down coordinates; defaults to 92. */
    readonly shadowY?: number
    readonly parts: ZombieParts
    readonly damagedArm: 'damagedArm' | 'poleVaulterDamagedArm'
    readonly damagedArmSprite?: string
    /** Zombie::UpdateZombieNewspaper: the head track takes this sprite while enraged. */
    readonly enragedHead?: { readonly track: string; readonly sprite: string }
    /** Unavailable cells in the 5x5 street-preview grid. */
    readonly previewBlockedCells?: readonly { readonly column: number; readonly row: number }[]
    readonly flag?: boolean
    readonly vault?: boolean
    readonly drops: Readonly<Partial<Record<'head' | 'arm' | 'flag', ZombieDrop>>>
    readonly helm?: { readonly track: string; readonly damagedSprites: readonly [string, string]; readonly effect: string; readonly offset: readonly [number, number]; readonly impactSounds: readonly PresentationSound[]; readonly bowlingImpactSounds?: readonly PresentationSound[]
        /** Cones and buckets hide the hair until dropped; a newspaper does not. */
        readonly showsHair?: boolean
        /** Plays once on the zombie when the helm breaks, like the newspaper's surprise mark. */
        readonly dropReanim?: { readonly reanimId: string; readonly offset: readonly [number, number] } }
}

/**
 * Every track of each body part, by exact ID, across all of the zombie's clips; a clip without a track skips it.
 * The original shows and hides parts by track-name prefix, which can catch unrelated tracks (Zombie_paper_hands2).
 */
export interface ZombieParts {
    /** Zombie::DropHead. */
    readonly head: readonly string[]
    /** Hidden with the head, and under a helm unless helm.showsHair (Zombie::ZombieInitialize). */
    readonly hair: readonly string[]
    readonly tongue: readonly string[]
    /** Zombie::SetupReanimForLostArm hides these. */
    readonly arm: readonly string[]
    /** Takes the damaged arm sprite once the arm is lost. */
    readonly upperArm: string
    /** Every helm track in the clips; only the worn helm's track (helm.track) shows. */
    readonly helms: readonly string[]
    /** The walk's ground track: how far a cycle moves (the house-entry walk). */
    readonly ground: string
    /** Zombie::DropPole: dropped with the head. */
    readonly held?: readonly string[]
    /** The flag zombie's inner arm with and without the flag; the flag draws behind `front`, the arm gripping the pole. */
    readonly flagArm?: { readonly holding: readonly string[]; readonly free: readonly string[]; readonly front: string }
}

export type NutBlinkSlot = 'blinkTwitch' | 'blinkTwice' | 'blinkThrice'
export interface AdventureIntroLayout {
    readonly previewCapacity: number
    readonly stationary?: boolean
    readonly sod: string
    readonly x: number
    readonly y: number
    readonly width: number
    readonly sourceX?: number
    readonly existingSod?: { readonly sprite: string; readonly x: number; readonly y: number }
    readonly rolls: readonly { readonly x: number; readonly y: number; readonly particleY: number }[]
    readonly readySetPlant: boolean
}
export interface LevelPresentationDefinition {
    readonly music?: BoardPresentation['music']
    readonly intro: AdventureIntroLayout
    readonly advice: Readonly<Record<string, string>>
    readonly adviceDuringIntro?: boolean
    readonly adviceStyle?: 'hint-stay' | 'tutorial-level1-stay'
    readonly guideSeed?: string
    readonly seedGuideSteps: readonly string[]
    readonly lawnGuideSteps: readonly string[]
}
/** Coin::CoinInitialize / Coin::Draw: how a sun or coin item looks; offsets are from the item's 60x60 top-left. */
export interface ItemPresentationDefinition {
    /** Looping animation; `rate` is a random speed range relative to the clip's fps. */
    readonly reanim: string
    readonly offset: readonly [number, number]
    readonly rate: readonly [number, number]
    /** Silver and gold coins show this flat image instead of the animation while in flight or being collected. */
    readonly flight?: { readonly sprite: string; readonly offset: readonly [number, number] }
    /** Drawn under the item at `offset` (the image's top-left); `inFlight` shows it only with the flat image. */
    readonly glow?: { readonly sprite: string; readonly offset: readonly [number, number]; readonly inFlight?: boolean }
    /** The arrow particle over an item that has a bouncy arrow, relative to the item's top-left. */
    readonly arrow?: { readonly particle: string; readonly offset: readonly [number, number] }
    readonly spawnSounds?: readonly PresentationSound[]
    readonly landSounds?: readonly PresentationSound[]
    readonly collectSounds?: readonly PresentationSound[]
}

export interface AwardPresentationDefinition {
    readonly sprite: string
    readonly scale: number
    readonly x: number
    readonly y: number
    readonly pageY: number
    readonly pageImages?: readonly { readonly sprite: string; readonly x: number; readonly y: number; readonly width?: number; readonly height?: number }[]
}
const VIEW_SLOTS: Readonly<Record<string, readonly string[]>> = {
    puffshroom: ['body', 'sleep', 'shoot', 'blink'],
    sunshroom: ['body', 'small', 'sleep', 'bigSleep', 'grow', 'blink'],
    gravebuster: ['body', 'land'],
    bowling: ['body', 'blinkTwitch', 'blinkTwice', 'blinkThrice'],
    shooter: ['body', 'idleHead', 'shootHead', 'blink'],
    sunflower: ['body', 'blink'],
    cherrybomb: ['idle', 'explode'],
    wallnut: ['body', 'blinkTwitch', 'blinkTwice', 'blinkThrice'],
    potatomine: ['buried', 'rise', 'armed', 'blink', 'glow'],
    chomper: ['idle', 'bite', 'chew', 'swallow'],
}
export interface MainMenuButtonDefinition {
    readonly name: string
    /** The menu action it opens; adventure and zombatar have their own handling. */
    readonly target?: string
    /** The selector track the button follows; `replace` hides that track's own drawing. */
    readonly track: string
    readonly image: string
    readonly highlight: string
    readonly replace?: boolean
    /** A wood sign hanging from the top: no press offset, drawn with the signs. */
    readonly sign?: boolean
    /** A game-mode button: the grave press sound. */
    readonly mode?: boolean
    readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number
    readonly imageX?: number; readonly imageY?: number
    readonly polygon?: readonly (readonly [number, number])[]
}

/** GameSelector: the selector animation's buttons and the exact tracks the menu changes. */
export interface MainMenuDefinition {
    readonly buttons: readonly MainMenuButtonDefinition[]
    /** Preloaded images besides the buttons'. */
    readonly images: readonly string[]
    readonly clouds: readonly string[]
    readonly flowers: readonly { readonly x: number; readonly y: number }[]
    readonly tracks: {
        /** Hidden: the game draws the sky behind the moving foreground. */
        readonly sky: string
        /** The grass, flowers and level numbers follow this track. */
        readonly anchor: string
        /** Carries the player's name. */
        readonly profileSign: string
        /** Drawn by the game's own leaf and flower animations instead. */
        readonly replaced: readonly string[]
        /** The rocks the rising zombie hand pushes aside, drawn outside the hand's clip. */
        readonly handRocks: readonly string[]
    }
    /** Drawn under the almanac and the store key; with only one of them, that one's own shadow, and none without either. */
    readonly keyShadow: { readonly track: string; readonly almanac: string; readonly store: string }
    /** The sunflower trophy (silver and gold cels) follows `track`; it and its sparkle appear once Adventure is finished. */
    readonly trophy: { readonly track: string; readonly image: string; readonly particle: string }
    /** Replaces the adventure button before the first level; each shows its own shadow track. */
    readonly startAdventure: { readonly track: string; readonly image: string; readonly highlight: string; readonly shadow: string; readonly adventureShadow: string }
}

export interface PresentationDefinitions {
    readonly mainMenu: MainMenuDefinition
    readonly conveyor: {
        readonly x: number; readonly backdropX: number; readonly clipX: number; readonly width: number; readonly height: number
        readonly packetX: number; readonly packetY: number; readonly beltY: number; readonly beltWidth: number; readonly beltHeight: number
        readonly frames: number; readonly frameTicks: number; readonly introStart: number; readonly introDuration: number
        readonly stripeOffset: readonly [number, number]; readonly stripeDialogs: readonly number[]
    }
    readonly shovel: { readonly x: number; readonly imageOffset: readonly [number, number]; readonly cursorOffset: readonly [number, number]; readonly arrowOffset: readonly [number, number] }
    readonly dave: {
        readonly clips: Readonly<Record<string, string>>
        readonly sourceFps: number; readonly transitionFps: number; readonly talkFps: number; readonly blinkFps: number
        readonly idleBlend: number; readonly talkBlend: number; readonly delay: number
        readonly blinkSeconds: readonly [number, number]; readonly talkLengths: readonly [number, number]
        readonly bubble: { readonly sprite: string; readonly x: number; readonly y: number; readonly textX: number; readonly textY: number; readonly textWidth: number; readonly textHeight: number; readonly continueX: number; readonly continueY: number; readonly shake: number }
        readonly hand: { readonly reanim: string; readonly x: number; readonly y: number; readonly scale: number; readonly track: string }
        /** Body tracks by exact ID: the mouth takes the mouth sprites, the eyes hide under the blink attached to the head. */
        readonly parts: { readonly mouth: string; readonly eyes: readonly string[]; readonly head: string }
        readonly mouths: Readonly<Record<string, string>>
    }
    readonly boards?: Readonly<Record<string, BoardPresentation>>
    readonly screens?: Readonly<Record<string, readonly ScreenAnimationDefinition[]>>
    readonly levels?: Readonly<Record<string, LevelPresentationDefinition>>
    readonly awards?: Readonly<Record<string, AwardPresentationDefinition>>
    readonly items: Readonly<Record<string, ItemPresentationDefinition>>
    readonly animation: {
        readonly rates: Readonly<Record<'plantIdle' | 'shooterIdle' | 'zombieIdle' | 'zombieIdle2', readonly [number, number]>>
        readonly zombieIdle2Chance: number
        readonly nutBlinkWeights: Readonly<Record<NutBlinkSlot, number>>
        readonly plantBlinkTicks: readonly [number, number]
        readonly nutBlinkTicks: readonly [number, number]
    }
    readonly plants: Readonly<Record<string, PlantPresentationDefinition>>
    readonly zombies: Readonly<Record<string, ZombiePresentationDefinition>>
    readonly projectiles: Readonly<Record<string, ProjectilePresentationDefinition>>
    readonly seedPackets: {
        readonly flash: { readonly id: string }
        readonly selection: { readonly color: readonly [number, number, number] }
        readonly defaultPlacement: SeedPacketPlacement
        readonly placements: Readonly<Record<string, SeedPacketPlacement>>
        readonly plantCels: Readonly<Record<string, number>>
    }
    readonly almanac: {
        readonly zombieOrigin: { readonly offset: readonly [number, number]; readonly scaleOffset: readonly [number, number] }
        readonly cords: Readonly<Record<string, DisplayCord>>
        readonly pogo: { readonly bounceTicks: number; readonly restartCounter: number; readonly rate: number; readonly offset: number; readonly height: number }
        readonly bungee: { readonly height: number; readonly periodSeconds: number }
    }
}

export function parsePresentationDefinitions(value: unknown): PresentationDefinitions {
    const data = object(value, 'presentation definitions')
    for (const [id, layers] of Object.entries(object(data.screens ?? {}, 'presentation screens'))) {
        if (!Array.isArray(layers)) throw new TypeError(id + ' screen animations must be an array')
        const names = new Set<string>()
        for (const entry of layers) {
            const layer = object(entry, id)
            text(layer.name, id + '.name'); text(layer.reanimId, id + '.reanimId')
            if (names.has(layer.name as string)) throw new TypeError(id + ' has duplicate animation names')
            names.add(layer.name as string)
            point(layer, id); positive(layer.rate, id + '.rate')
            if (layer.playback !== 'loop' && layer.playback !== 'last') throw new TypeError(id + '.playback is invalid')
            if (layer.randomPhase !== undefined && (typeof layer.randomPhase !== 'boolean' || layer.playback !== 'loop')) throw new TypeError(id + '.randomPhase requires loop playback')
            if (layer.visibleTracks !== undefined) texts(layer.visibleTracks, id + '.visibleTracks')
        }
    }
    parseMainMenu(object(data.mainMenu, 'mainMenu'))
    const conveyor = object(data.conveyor, 'conveyor')
    for (const key of ['x', 'backdropX', 'clipX', 'packetX', 'packetY', 'beltY', 'introStart']) finite(conveyor[key], 'conveyor.' + key)
    for (const key of ['width', 'height', 'beltWidth', 'beltHeight', 'frames', 'frameTicks', 'introDuration']) positive(conveyor[key], 'conveyor.' + key)
    pair(conveyor.stripeOffset, 'conveyor.stripeOffset')
    if (!Array.isArray(conveyor.stripeDialogs) || conveyor.stripeDialogs.some(id => !Number.isInteger(id))) throw new TypeError('Invalid conveyor.stripeDialogs')
    const shovel = object(data.shovel, 'shovel')
    finite(shovel.x, 'shovel.x')
    for (const key of ['imageOffset', 'cursorOffset', 'arrowOffset']) pair(shovel[key], 'shovel.' + key)
    const dave = object(data.dave, 'dave'), clips = object(dave.clips, 'dave.clips')
    for (const key of ['enter', 'leave', 'idle', 'smalltalk', 'mediumtalk', 'blahblah', 'crazy', 'idle_handing', 'talk_handing', 'blink']) text(clips[key], 'dave.clips.' + key)
    for (const key of ['sourceFps', 'transitionFps', 'talkFps', 'blinkFps', 'idleBlend', 'talkBlend', 'delay']) positive(dave[key], 'dave.' + key)
    pair(dave.blinkSeconds, 'dave.blinkSeconds'); pair(dave.talkLengths, 'dave.talkLengths')
    const bubble = object(dave.bubble, 'dave.bubble'), hand = object(dave.hand, 'dave.hand')
    text(bubble.sprite, 'dave.bubble.sprite')
    for (const key of ['x', 'y', 'textX', 'textY', 'continueX', 'continueY', 'shake']) finite(bubble[key], 'dave.bubble.' + key)
    positive(bubble.textWidth, 'dave.bubble.textWidth'); positive(bubble.textHeight, 'dave.bubble.textHeight')
    text(hand.reanim, 'dave.hand.reanim'); text(hand.track, 'dave.hand.track'); positive(hand.scale, 'dave.hand.scale')
    finite(hand.x, 'dave.hand.x'); finite(hand.y, 'dave.hand.y')
    const daveParts = object(dave.parts, 'dave.parts')
    text(daveParts.mouth, 'dave.parts.mouth'); texts(daveParts.eyes, 'dave.parts.eyes'); text(daveParts.head, 'dave.parts.head')
    for (const [key, value] of Object.entries(object(dave.mouths, 'dave.mouths'))) text(value, 'dave.mouths.' + key)
    for (const [id, entry] of Object.entries(object(data.boards ?? {}, 'presentation boards'))) {
        const board = object(entry, id), music = object(board.music, id + '.music'), over = object(board.gameOver, id + '.gameOver')
        text(board.background, id + '.background'); finite(board.backgroundX, id + '.backgroundX')
        text(music.choosing, id + '.music.choosing'); text(music.gameplay, id + '.music.gameplay')
        texts(over.images, id + '.gameOver.images')
        if ((over.images as unknown[]).length !== 3) throw new TypeError(id + '.gameOver.images must contain three images')
        point(over.interior, id + '.gameOver.interior'); point(over.doorway, id + '.gameOver.doorway')
        for (const field of ['clipX', 'winnerY', 'panX']) finite(over[field], id + '.gameOver.' + field)
    }
    for (const [id, entry] of Object.entries(object(data.levels ?? {}, 'presentation levels'))) {
        const level = object(entry, id), intro = object(level.intro, id + '.intro')
        positive(intro.previewCapacity, id + '.intro.previewCapacity')
        if (!Number.isInteger(intro.previewCapacity)) throw new TypeError(id + '.intro.previewCapacity must be an integer')
        text(intro.sod, id + '.intro.sod')
        finite(intro.x, id + '.intro.x'); finite(intro.y, id + '.intro.y'); positive(intro.width, id + '.intro.width')
        if (intro.sourceX !== undefined) finite(intro.sourceX, id + '.intro.sourceX')
        if (typeof intro.readySetPlant !== 'boolean' || !Array.isArray(intro.rolls)) throw new TypeError(id + ' has invalid intro settings')
        for (const value of intro.rolls) {
            const roll = object(value, id + '.intro.rolls')
            for (const field of ['x', 'y', 'particleY']) finite(roll[field], id + '.intro.rolls.' + field)
        }
        if (intro.existingSod !== undefined) {
            const sod = object(intro.existingSod, id + '.intro.existingSod')
            text(sod.sprite, id + '.intro.existingSod.sprite'); point(sod, id + '.intro.existingSod')
        }
        object(level.advice, id + '.advice')
        if (level.adviceDuringIntro !== undefined && typeof level.adviceDuringIntro !== 'boolean') throw new TypeError(id + '.adviceDuringIntro must be boolean')
        if (level.adviceStyle !== undefined && level.adviceStyle !== 'hint-stay' && level.adviceStyle !== 'tutorial-level1-stay') throw new TypeError(id + '.adviceStyle is invalid')
        texts(level.seedGuideSteps, id + '.seedGuideSteps'); texts(level.lawnGuideSteps, id + '.lawnGuideSteps')
    }
    for (const [id, entry] of Object.entries(object(data.awards ?? {}, 'presentation awards'))) {
        const award = object(entry, id)
        text(award.sprite, id + '.sprite'); positive(award.scale, id + '.scale')
        for (const field of ['x', 'y', 'pageY']) finite(award[field], id + '.' + field)
        if (award.pageImages !== undefined) {
            if (!Array.isArray(award.pageImages) || !award.pageImages.length) throw new TypeError(id + '.pageImages must not be empty')
            for (const value of award.pageImages) {
                const image = object(value, id + '.pageImages')
                text(image.sprite, id + '.pageImages.sprite'); point(image, id + '.pageImages')
                for (const field of ['width', 'height']) if (image[field] !== undefined) positive(image[field], id + '.pageImages.' + field)
            }
        }
    }
    for (const [id, entry] of Object.entries(object(data.items, 'presentation items'))) {
        const item = object(entry, id)
        text(item.reanim, id + '.reanim'); pair(item.offset, id + '.offset'); range(item.rate, id + '.rate', true)
        if (item.flight !== undefined) { const flight = object(item.flight, id + '.flight'); text(flight.sprite, id + '.flight.sprite'); pair(flight.offset, id + '.flight.offset') }
        if (item.glow !== undefined) {
            const glow = object(item.glow, id + '.glow')
            text(glow.sprite, id + '.glow.sprite'); pair(glow.offset, id + '.glow.offset')
            if (glow.inFlight !== undefined && typeof glow.inFlight !== 'boolean') throw new TypeError(id + '.glow.inFlight must be boolean')
        }
        if (item.arrow !== undefined) { const arrow = object(item.arrow, id + '.arrow'); text(arrow.particle, id + '.arrow.particle'); pair(arrow.offset, id + '.arrow.offset') }
        for (const field of ['spawnSounds', 'landSounds', 'collectSounds']) sounds(item[field], id + '.' + field)
    }
    const animation = object(data.animation, 'presentation definitions.animation')
    const rates = object(animation.rates, 'animation.rates')
    for (const name of ['plantIdle', 'shooterIdle', 'zombieIdle', 'zombieIdle2']) range(rates[name], name, true)
    range(animation.plantBlinkTicks, 'plantBlinkTicks')
    range(animation.nutBlinkTicks, 'nutBlinkTicks')
    const chance = animation.zombieIdle2Chance
    if (typeof chance !== 'number' || !Number.isFinite(chance) || chance < 0 || chance > 1) throw new TypeError('Invalid zombieIdle2Chance')
    const weights = object(animation.nutBlinkWeights, 'nutBlinkWeights')
    for (const slot of ['blinkTwitch', 'blinkTwice', 'blinkThrice']) positive(weights[slot], slot)
    const plants = object(data.plants, 'presentation definitions.plants')
    const zombies = object(data.zombies, 'presentation definitions.zombies')
    for (const [id, entry] of Object.entries(plants)) {
        const plant = object(entry, id), visual = object(plant.visual, id + '.visual')
        if (plant.viewConfig !== undefined) object(plant.viewConfig, id + '.viewConfig')
        if (typeof visual.seedType !== 'string' && typeof visual.seedType !== 'number') throw new TypeError(id + '.seedType is invalid')
        if (visual.preview !== undefined && (!Number.isInteger(visual.preview) || (visual.preview as number) < 0)) throw new TypeError(id + '.preview is invalid')
        point(plant.shadow, id + '.shadow')
        if ((plant.shadow as Record<string, unknown>).scale !== undefined) positive((plant.shadow as Record<string, unknown>).scale, id + '.shadow.scale')
        positive(plant.scale, id + '.scale')
        if (plant.rowOrder !== undefined) finite(plant.rowOrder, id + '.rowOrder')
        if (plant.drawHeightOffset !== undefined) finite(plant.drawHeightOffset, id + '.drawHeightOffset')
        if (plant.pointerOffsetY !== undefined) finite(plant.pointerOffsetY, id + '.pointerOffsetY')
        if (plant.sleepOffset !== undefined) pair(plant.sleepOffset, id + '.sleepOffset')
        if (plant.parts !== undefined) {
            const parts = object(plant.parts, id + '.parts')
            for (const key of Object.keys(parts)) if (!['eyes', 'face', 'glow'].includes(key)) throw new TypeError(id + '.parts.' + key + ' is not supported')
            if (parts.eyes !== undefined) texts(parts.eyes, id + '.parts.eyes')
            if (parts.face !== undefined) text(parts.face, id + '.parts.face')
            if (parts.glow !== undefined) texts(parts.glow, id + '.parts.glow')
        }
        if (visual.nameKey !== undefined) text(visual.nameKey, id + '.visual.nameKey')
        if (visual.tooltipKey !== undefined) text(visual.tooltipKey, id + '.visual.tooltipKey')
        if (plant.view !== undefined) text(plant.view, id + '.view')
        if (plant.animationTarget !== undefined) text(plant.animationTarget, id + '.animationTarget')
        if (typeof plant.view === 'string' && VIEW_SLOTS[plant.view] && !plant.animationTarget) throw new TypeError(id + '.animationTarget is missing')
        sounds(plant.plantedSounds, id + '.plantedSounds')
        sounds(plant.explosionSounds, id + '.explosionSounds')
        sounds(plant.fireSounds, id + '.fireSounds')
        if (plant.explosion !== undefined) {
            const explosion = object(plant.explosion, id + '.explosion')
            text(explosion.effect, id + '.explosion.effect'); finite(explosion.x, id + '.explosion.x')
            if (typeof explosion.rowOrder !== 'boolean') throw new TypeError(id + '.explosion.rowOrder must be boolean')
        }
        if (plant.mine !== undefined) {
            const mine = object(plant.mine, id + '.mine'), glow = object(mine.glow, id + '.mine.glow')
            range(mine.blinkTicks, id + '.mine.blinkTicks')
            range(mine.armedRate, id + '.mine.armedRate', true)
            positive(mine.riseRate, id + '.mine.riseRate')
            positive(mine.blendSeconds, id + '.mine.blendSeconds')
            increasingRange(glow.distance, id + '.mine.glow.distance')
            increasingRange(glow.frames, id + '.mine.glow.frames')
            positive((glow.frames as number[])[0], id + '.mine.glow.frames[0]')
            finite(glow.rateOffset, id + '.mine.glow.rateOffset')
        }
    }
    for (const [id, entry] of Object.entries(zombies)) {
        const zombie = object(entry, id), parts = object(zombie.parts, id + '.parts')
        if (zombie.nameKey !== undefined) text(zombie.nameKey, id + '.nameKey')
        if (zombie.damagedArmSprite !== undefined) text(zombie.damagedArmSprite, id + '.damagedArmSprite')
        if (zombie.enragedHead !== undefined) {
            const head = object(zombie.enragedHead, id + '.enragedHead')
            text(head.track, id + '.enragedHead.track')
            text(head.sprite, id + '.enragedHead.sprite')
        }
        if (zombie.view !== undefined) text(zombie.view, id + '.view')
        if (zombie.previewBlockedCells !== undefined) {
            if (!Array.isArray(zombie.previewBlockedCells)) throw new TypeError(id + '.previewBlockedCells must be an array')
            for (const value of zombie.previewBlockedCells) {
                const cell = object(value, id + '.previewBlockedCells[]')
                for (const key of ['column', 'row']) {
                    if (!Number.isInteger(cell[key]) || (cell[key] as number) < 0 || (cell[key] as number) > 4) {
                        throw new TypeError(id + '.previewBlockedCells[].' + key + ' must be an integer between 0 and 4')
                    }
                }
            }
        }
        if (typeof zombie.animationTarget !== 'string' || !Number.isFinite(zombie.shadowX)) throw new TypeError(id + ' has invalid presentation')
        if (zombie.shadowY !== undefined) finite(zombie.shadowY, id + '.shadowY')
        for (const part of ['head', 'hair', 'tongue', 'arm', 'helms']) texts(parts[part], id + '.parts.' + part)
        text(parts.upperArm, id + '.parts.upperArm')
        text(parts.ground, id + '.parts.ground')
        if (parts.held !== undefined) texts(parts.held, id + '.parts.held')
        if (parts.flagArm !== undefined) {
            const flagArm = object(parts.flagArm, id + '.parts.flagArm')
            texts(flagArm.holding, id + '.parts.flagArm.holding')
            texts(flagArm.free, id + '.parts.flagArm.free')
            text(flagArm.front, id + '.parts.flagArm.front')
        }
        if (zombie.flag === true && parts.flagArm === undefined) throw new TypeError(id + '.parts.flagArm is required for a flag zombie')
        object(zombie.animations, id + '.animations')
        if (zombie.damagedArm !== 'damagedArm' && zombie.damagedArm !== 'poleVaulterDamagedArm') throw new TypeError(id + '.damagedArm is invalid')
        for (const [part, value] of Object.entries(object(zombie.drops, id + '.drops'))) {
            const drop = object(value, id + '.drops.' + part)
            text(drop.track, id + '.drops.' + part + '.track')
            text(drop.effect, id + '.drops.' + part + '.effect')
            pair(drop.offset, id + '.drops.' + part + '.offset')
            sounds(drop.sounds, id + '.drops.' + part + '.sounds')
        }
        if (zombie.helm !== undefined) {
            const helm = object(zombie.helm, id + '.helm')
            text(helm.track, id + '.helm.track')
            text(helm.effect, id + '.helm.effect')
            texts(helm.damagedSprites, id + '.helm.damagedSprites')
            if ((helm.damagedSprites as string[]).length !== 2) throw new TypeError(id + '.helm.damagedSprites must have two entries')
            if (!(parts.helms as string[]).includes(helm.track as string)) throw new TypeError(id + '.helm.track is missing from parts.helms')
            pair(helm.offset, id + '.helm.offset')
            if (helm.showsHair !== undefined && typeof helm.showsHair !== 'boolean') throw new TypeError(id + '.helm.showsHair must be boolean')
            if (helm.dropReanim !== undefined) {
                const reanim = object(helm.dropReanim, id + '.helm.dropReanim')
                text(reanim.reanimId, id + '.helm.dropReanim.reanimId')
                pair(reanim.offset, id + '.helm.dropReanim.offset')
            }
            sounds(helm.impactSounds, id + '.helm.impactSounds', true)
            sounds(helm.bowlingImpactSounds, id + '.helm.bowlingImpactSounds')
        }
    }
    if (!zombies['pvz:normal']) throw new TypeError('Missing normal zombie presentation')
    for (const id of Object.keys(plants)) if (Object.hasOwn(zombies, id)) throw new TypeError('Duplicate presentation target: ' + id)
    const targets = { ...plants, ...zombies }
    for (const [id, entry] of Object.entries(targets)) {
        const definition = entry as { animationTarget?: string }
        if (definition.animationTarget && !(targets[definition.animationTarget] as { animations?: unknown } | undefined)?.animations) {
            throw new TypeError(id + ' references missing animations: ' + definition.animationTarget)
        }
    }
    for (const [id, entry] of Object.entries(plants)) {
        const plant = entry as PlantPresentationDefinition
        const slots = plant.view && VIEW_SLOTS[plant.view]
        if (!slots) continue
        const target = targets[plant.animationTarget!] as { animations: AnimationDefinition }
        for (const slot of slots) if (!target.animations[slot]) throw new TypeError(`${id} is missing ${slot} animation`)
    }
    for (const [id, value] of Object.entries(object(data.projectiles, 'projectiles'))) {
        const projectile = object(value, id)
        if (projectile.viewConfig !== undefined) object(projectile.viewConfig, id + '.viewConfig')
        text(projectile.sprite, id + '.sprite')
        if (projectile.shadow !== undefined) {
            const shadow = object(projectile.shadow, id + '.shadow')
            text(shadow.sprite, id + '.shadow.sprite'); point(shadow.offset, id + '.shadow.offset')
            positive(shadow.scale, id + '.shadow.scale')
            if (!Number.isInteger(shadow.columns) || (shadow.columns as number) < 1 || !Number.isInteger(shadow.cell)
                || (shadow.cell as number) < 0 || (shadow.cell as number) >= (shadow.columns as number)) throw new TypeError(id + '.shadow has invalid atlas cells')
        }
        if (projectile.impact !== undefined) {
            const impact = object(projectile.impact, id + '.impact')
            text(impact.id, id + '.impact.id')
            pair(impact.offset, id + '.impact.offset')
            range(impact.yRange, id + '.impact.yRange', true)
        }
        if (projectile.trail !== undefined) {
            const trail = object(projectile.trail, id + '.trail')
            text(trail.id, id + '.trail.id')
            point(trail, id + '.trail')
        }
        sounds(projectile.fireSounds, id + '.fireSounds', true)
        sounds(projectile.impactSounds, id + '.impactSounds', true)
    }
    const packets = object(data.seedPackets, 'seedPackets')
    const flash = object(packets.flash, 'seedPackets.flash')
    text(flash.id, 'seedPackets.flash.id')
    const selection = object(packets.selection, 'seedPackets.selection')
    if (!Array.isArray(selection.color) || selection.color.length !== 3 || selection.color.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new TypeError('Invalid seedPackets.selection.color')
    placement(packets.defaultPlacement, 'seedPackets.defaultPlacement')
    for (const [id, value] of Object.entries(object(packets.placements, 'seedPackets.placements'))) placement(value, 'seedPackets.placements.' + id)
    for (const [id, value] of Object.entries(object(packets.plantCels, 'seedPackets.plantCels'))) {
        if (!Number.isInteger(value) || (value as number) < 0) throw new TypeError('Invalid packet cel: ' + id)
    }
    const almanac = object(data.almanac, 'almanac'), origin = object(almanac.zombieOrigin, 'almanac.zombieOrigin')
    pair(origin.offset, 'almanac.zombieOrigin.offset')
    pair(origin.scaleOffset, 'almanac.zombieOrigin.scaleOffset')
    for (const [id, value] of Object.entries(object(almanac.cords, 'almanac.cords'))) {
        const cord = object(value, 'almanac.cords.' + id)
        text(cord.sprite, 'cord.sprite'); text(cord.track, 'cord.track')
        finite(cord.x, 'cord.x'); positive(cord.height, 'cord.height')
    }
    const pogo = object(almanac.pogo, 'almanac.pogo'), bungee = object(almanac.bungee, 'almanac.bungee')
    for (const key of ['bounceTicks', 'restartCounter', 'rate', 'height']) positive(pogo[key], 'almanac.pogo.' + key)
    if (!Number.isInteger(pogo.bounceTicks) || !Number.isInteger(pogo.restartCounter) || (pogo.restartCounter as number) >= (pogo.bounceTicks as number)) throw new TypeError('Invalid pogo bounce counters')
    finite(pogo.offset, 'almanac.pogo.offset')
    positive(bungee.height, 'almanac.bungee.height')
    positive(bungee.periodSeconds, 'almanac.bungee.periodSeconds')
    return value as PresentationDefinitions
}

function finite(value: unknown, name: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(name + ' must be finite')
}

function text(value: unknown, name: string): void {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(name + ' must be a non-empty string')
}

function parseMainMenu(menu: Record<string, unknown>): void {
    if (!Array.isArray(menu.buttons) || menu.buttons.length === 0) throw new TypeError('mainMenu.buttons must be a non-empty array')
    const names = new Set<string>()
    for (const [index, entry] of menu.buttons.entries()) {
        const name = 'mainMenu.buttons[' + index + ']', button = object(entry, name)
        for (const key of ['name', 'track', 'image', 'highlight']) text(button[key], name + '.' + key)
        if (names.has(button.name as string)) throw new TypeError(name + '.name is duplicated')
        names.add(button.name as string)
        if (button.target !== undefined) text(button.target, name + '.target')
        for (const key of ['replace', 'sign', 'mode']) if (button[key] !== undefined && typeof button[key] !== 'boolean') throw new TypeError(name + '.' + key + ' must be a boolean')
        for (const key of ['x', 'y', 'imageX', 'imageY']) if (button[key] !== undefined) finite(button[key], name + '.' + key)
        for (const key of ['width', 'height']) if (button[key] !== undefined) positive(button[key], name + '.' + key)
        if (button.polygon !== undefined) {
            if (!Array.isArray(button.polygon) || button.polygon.length < 3) throw new TypeError(name + '.polygon needs three points')
            button.polygon.forEach(point => pair(point, name + '.polygon[]'))
        }
    }
    texts(menu.images, 'mainMenu.images'); texts(menu.clouds, 'mainMenu.clouds')
    if (!Array.isArray(menu.flowers)) throw new TypeError('mainMenu.flowers must be an array')
    menu.flowers.forEach(flower => point(object(flower, 'mainMenu.flowers[]'), 'mainMenu.flowers[]'))
    const tracks = object(menu.tracks, 'mainMenu.tracks')
    for (const key of ['sky', 'anchor', 'profileSign']) text(tracks[key], 'mainMenu.tracks.' + key)
    texts(tracks.replaced, 'mainMenu.tracks.replaced'); texts(tracks.handRocks, 'mainMenu.tracks.handRocks')
    const keyShadow = object(menu.keyShadow, 'mainMenu.keyShadow')
    for (const key of ['track', 'almanac', 'store']) text(keyShadow[key], 'mainMenu.keyShadow.' + key)
    const trophy = object(menu.trophy, 'mainMenu.trophy')
    for (const key of ['track', 'image', 'particle']) text(trophy[key], 'mainMenu.trophy.' + key)
    const start = object(menu.startAdventure, 'mainMenu.startAdventure')
    for (const key of ['track', 'image', 'highlight', 'shadow', 'adventureShadow']) text(start[key], 'mainMenu.startAdventure.' + key)
}

function texts(value: unknown, name: string): void {
    if (!Array.isArray(value)) throw new TypeError(name + ' must be an array')
    value.forEach(entry => text(entry, name))
}

function pair(value: unknown, name: string): void {
    if (!Array.isArray(value) || value.length !== 2) throw new TypeError(name + ' must be a pair')
    value.forEach(entry => finite(entry, name))
}

function increasingRange(value: unknown, name: string): void {
    range(value, name, true)
    const [min, max] = value as number[]
    if (min >= max) throw new TypeError(name + ' must be an increasing range')
}

function placement(value: unknown, name: string): void {
    const source = object(value, name)
    positive(source.scale, name + '.scale')
    finite(source.offsetX, name + '.offsetX')
    finite(source.offsetY, name + '.offsetY')
}

function sounds(value: unknown, name: string, required = false): void {
    if (value === undefined && !required) return
    if (!Array.isArray(value)) throw new TypeError(name + ' must be an array')
    for (const entry of value) {
        const sound = object(entry, name)
        text(sound.id, name + '.id')
        if (typeof sound.foley !== 'boolean') throw new TypeError(name + '.foley must be boolean')
        if (sound.pitchRange !== undefined) {
            finite(sound.pitchRange, name + '.pitchRange')
            if ((sound.pitchRange as number) < 0) throw new TypeError(name + '.pitchRange must be non-negative')
        }
    }
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(name + ' must be an object')
    return value as Record<string, unknown>
}

function positive(value: unknown, name: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TypeError(name + ' must be positive')
}

function range(value: unknown, name: string, fractional = false): void {
    if (!Array.isArray(value) || value.length !== 2 || value.some(v => !Number.isFinite(v) || v < 0 || (!fractional && !Number.isInteger(v))) || value[0] > value[1]) {
        throw new TypeError(name + ' must be an ordered range')
    }
}

function point(value: unknown, name: string): void {
    const point = object(value, name)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError(name + ' must be a finite point')
}

export interface BoardPresentation {
    readonly background: string
    readonly backgroundX: number
    readonly music: { readonly choosing: MusicTuneId; readonly gameplay: MusicTuneId }
    readonly gameOver: {
        readonly images: readonly [string, string, string]
        readonly interior: { readonly x: number; readonly y: number }
        readonly doorway: { readonly x: number; readonly y: number }
        readonly clipX: number
        readonly winnerY: number
        readonly panX: number
    }
}
