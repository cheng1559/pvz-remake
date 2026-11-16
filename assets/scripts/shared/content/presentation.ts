import {
    allFields, array, boolean, fields, type FieldParsers, finite, integer, integerInRange, named, nonEmptyString, nonEmptyStrings, nonNegativeFinite,
    nonNegativeInteger, oneOf, pair, point, positiveFinite, positiveInteger, range, record, trueFlag,
} from '@/shared/validate'
import { withFrom } from './from'
import type { MusicTuneId } from './music'
import { isQualifiedId } from '@/shared/mod'
import { isRenderLayer, type RenderLayer } from './renderOrder'
import { PLANT_ABILITY_STATES, type PlantAbilityState } from './plantAbilities'
import { type JsonObject, jsonRoundTrip } from '@/shared/protocol'

export interface ClientAnimationClip {
    readonly reanimId: string
    /** How much faster than its `fps` it plays; 1 when left out (ClientAnimationRegistry fills it in). */
    readonly rateScale?: number
    readonly x: number
    readonly y: number
    readonly attachmentTrackId?: string
    /** Another of its owner's clips, from whose first frame of that track it is attached whenever it is (Reanimation::mFrameBasePose). */
    readonly attachmentBase?: string
    /** The only tracks of it that are drawn (Reanimation::ShowOnlyTrack); its owner's other clips leave them to it. */
    readonly onlyTracks?: readonly string[]
    /** Seconds a layer blends into it from the pose it had (Reanimation::StartBlend), 0.2 by default. */
    readonly blend?: number
    /** The frames a second its Reanim was made for, 12 when left out. */
    readonly fps?: number
    /**
     * REANIM_*_FULL_LAST_FRAME (Plant::DoBlink's blink): its last picture keeps a frame's time, instead of the pictures
     * being spread over the clip's length (Reanimation::GetFrameTime).
     */
    readonly fullLastFrame?: true
}

export interface AnimationDefinition { readonly [slot: string]: ClientAnimationClip }

/** The parent track a head, blink or flag clip attaches to; the data must name it. */
export function attachmentTrack(clip: ClientAnimationClip): string {
    if (!clip.attachmentTrackId) throw new Error(`${clip.reanimId} needs an attachmentTrackId to attach`)
    return clip.attachmentTrackId
}

export interface PlantVisual {
    /** The plant its seed's packet shows, when not itself (a bowling nut's shows the plain nut). */
    readonly packetPlant?: string
    readonly nameKey: string
    /** Its chooser text; `{nameKey}_TOOLTIP` without. */
    readonly tooltipKey?: string
    readonly tint?: readonly [number, number, number]
}

/** Body tracks a plant view changes, by exact ID; the heads and blinks attach by their clips' attachmentTrackId. */
export interface PlantParts {
    /** Plant::DoBlink hides these while the blink plays (the original's anim_eye prefix). */
    readonly eyes?: readonly string[]
    /** Takes the cracked sprites as a nut is chewed (Plant::UpdateReanim). */
    readonly face?: string
    /** The chomper's tracks of the zombie it chews and swallows, hidden when it ate a hostile plant instead. */
    readonly prey?: readonly string[]
}

export interface PlantPresentationDefinition {
    /** A particle that follows its shot, `delayTicks` into it, at `x`, `y` from the plant (the Fume-shroom's cloud). */
    readonly fireParticle?: { readonly id: string; readonly x: number; readonly y: number; readonly delayTicks: number }
    /** The render layer it draws on (`renderOrder.ts`), `plant` by default; rolling bowling nuts use `projectile`. */
    readonly layer?: RenderLayer
    /**
     * Plant::DrawShadow: where its shadow lies, about its middle at `scale`; a plant without one (the grave buster) has
     * none. `states`: its scale while its ability is in one of them, `[from, to]` going from one to the other as its
     * first layer's clip plays (the sun-shroom's, small, then growing with its anim_grow).
     */
    readonly shadow?: {
        readonly x: number; readonly y: number; readonly scale?: number
        readonly states?: Readonly<Partial<Record<PlantAbilityState, number | readonly [number, number]>>>
    }
    readonly scale: number
    /** PlantDrawHeightOffset, in original Y-down pixels: the grid preview draws its cached image this far down. */
    readonly drawHeightOffset?: number
    /** Board::OffsetYForPlanting: the planted cell is picked this far below the pointer. */
    readonly pointerOffsetY?: number
    readonly visual: PlantVisual
    readonly parts?: PlantParts
    /** The view that draws it (PlantViewRegistry), where it has one of its own: every plant is drawn by its animation. */
    readonly view?: string
    /** Its view's own settings, which that view (a Mod's) reads and checks itself: kept as written. */
    readonly viewConfig?: Readonly<JsonObject>
    /**
     * The pictures of its clips, by the names of its gameplay animation's: the Reanim each is drawn with, where, and the
     * part it goes on. With `from`, another plant's, adding what it writes of its own (the explode-o-nut's are the wall-nut's).
     */
    readonly clips?: AnimationDefinition
    /**
     * A packet's picture of the plant, as it is off the board (PlantAnimationDefinition.offBoard). `placement`:
     * SeedPacket::DrawSeedPacket's place and size of the picture in the packet (seedPackets.defaultPlacement without).
     * The rest is Plant::DrawSeedType: where the plant goes from that place and at what size (the potato mine's), how
     * far towards its clips' last frame it is posed (`time`, the sunflower's), and the state of its ability it is
     * pictured in, in place of all it is off the board (`state`: the potato mine armed with its light lit, the
     * sun-shroom small).
     */
    readonly packet?: {
        readonly placement?: SeedPacketPlacement
        readonly x?: number; readonly y?: number; readonly scale?: number; readonly time?: number
        readonly state?: PlantAbilityState
    }
    /** AlmanacDialog: how far from a plant's usual place the almanac shows it, in original Y-down pixels (the grave buster's 55 down). */
    readonly almanacOffset?: readonly [number, number]
    readonly chewParticle?: string
    /** Plant::AnimateNuts: the face's sprites under two thirds and under a third of its health (a `wallnut` view). */
    readonly crackedFaces?: readonly [string, string]
    /** `layer`: the render layer of the effect, in the plant's row below `top` (the potato mine's `particle`). */
    readonly explosion?: { readonly effect: string; readonly x: number; readonly layer: RenderLayer }
    readonly plantedSounds?: readonly PresentationSound[]
    readonly explosionSounds?: readonly PresentationSound[]
    /** Played when an area shooter, like the Fume-shroom, fires. */
    readonly fireSounds?: readonly PresentationSound[]
}

/**
 * A sound to play: the `audio` resource (`pvz:splat`), as a foley (TodFoley: the sound's variants, a random pitch
 * within `pitchRange`, no repeat right after itself) or as the plain sample.
 */
export interface PresentationSound {
    readonly audio: string
    readonly foley: boolean
    readonly pitchRange?: number
}

/**
 * How a sound plays as foley (LawnApp's FoleyParams): up to `pitchRange` semitones higher (lower when negative), and as
 * one of its `variants` picked at random, itself among them as often as it is listed.
 */
export interface FoleyDefinition {
    readonly pitchRange?: number
    readonly variants?: readonly string[]
}

/** What stands in a cell without being a plant or a zombie (GridItemSnapshot): the view that draws it and where it is drawn among the rest. */
export interface GridItemPresentationDefinition {
    /** Its view (GridItemViewRegistry). */
    readonly view: string
    /** Its view's own settings, which that view (a Mod's) reads and checks itself: kept as written. */
    readonly viewConfig?: Readonly<JsonObject>
    /** Its render layer and its offset on it: a grave's `graveStone` and 3 (Board::AddAGraveStone). */
    readonly layer: RenderLayer
    readonly offset?: number
}

/** Exactly one of `sprite` and `reanim`. */
export interface ProjectilePresentationDefinition {
    /** Its view (ProjectileViewRegistry): `projectile` when omitted, a mower's `mower`. */
    readonly view?: string
    /** Its view's own settings, which that view (a Mod's) reads and checks itself: kept as written. */
    readonly viewConfig?: Readonly<JsonObject>
    readonly sprite?: string
    /** An animation it plays looping, like a running mower's: at `x`, `y` in its frame, at `scale` and `rate`. */
    readonly reanim?: { readonly id: string; readonly x: number; readonly y: number; readonly scale: number; readonly rate: number }
    /**
     * The board's plant shadow (the darker one at night) on the ground under it, a mower's: its middle this far from
     * the projectile's corner, down positive, and as far down again as the projectile flies above the ground.
     */
    readonly plantShadow?: { readonly x: number; readonly y: number }
    /** Its render layer; `projectile` when omitted, a mower's `lawnMower`. */
    readonly layer?: RenderLayer
    /** Its own shadow on the ground under it: its corner at `offset` from the projectile's, placed as `plantShadow` is. */
    readonly shadow?: {
        readonly sprite: string; readonly columns: number; readonly cell: number
        readonly offset: { readonly x: number; readonly y: number }; readonly scale: number
    }
    readonly trail?: { readonly id: string; readonly x: number; readonly y: number }
    readonly impact?: {
        readonly id: string
        /**
         * Where its splat is from its middle, forward and down, when it flies into what it hits (a shooter's, a
         * seeker's): ahead at its front, the pea's [35, -2] when omitted.
         */
        readonly shotOffset?: readonly [number, number]
        /** The same when it comes down on what it hits, or on the ground (a lobber's): where it is, [0, 0], when omitted. */
        readonly lobOffset?: readonly [number, number]
        /** On a zombie, the splat stays this far below its top, between the two. */
        readonly yRange?: readonly [number, number]
        /**
         * Projectile::DoImpact for a melon: its splat is the board's and not the zombie's it hit. It stays where it
         * was, over what flies in the row, so no zombie of the row covers it; `yRange` is not used. Without it a splat
         * is on the zombie: it goes with it, and a zombie drawn after that one covers it.
         */
        readonly free?: true
    }
    readonly fireSounds: readonly PresentationSound[]
    readonly impactSounds: readonly PresentationSound[]
    /** Its impact sounds are heard on armor that muffles (ZombieArmorPresentation.muffles), as a melon's. */
    readonly loud?: true
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
export interface ZombieDrop {
    readonly track: string
    readonly effect: string
    readonly moweredEffect?: string
    readonly offset: readonly [number, number]
    readonly image?: string
    readonly sounds?: readonly PresentationSound[]
}

export interface ZombiePresentationDefinition {
    readonly nameKey: string
    /** The view that draws it (ZombieViewRegistry), where it has one of its own. */
    readonly view?: string
    /** Its view's own settings, which that view (a Mod's) reads and checks itself: kept as written. */
    readonly viewConfig?: Readonly<JsonObject>
    /** The pictures of its clips, as a plant's: with `from`, another zombie's, adding what it writes of its own (a Mod zombie on the plain body). */
    readonly clips: AnimationDefinition
    /**
     * Zombie::DrawShadow: where its shadow lies from the zombie's place, as a plant's; `backwardsX` in place of `x`
     * for a zombie walking right (mind-controlled), `x` by default.
     */
    readonly shadow: { readonly x: number; readonly y: number; readonly backwardsX?: number }
    /**
     * Its zombie seed's packet (SeedPacket::DrawSeedPacket for SEED_ZOMBIE_*): where the original has the cached
     * zombie frame, posed at (40, 40), drawn at this offset and scale. `clip` names the animation whose first frame
     * it shows, `idle` unless the original's cache takes another (the pole vaulter's anim_walk,
     * ReanimatorCache::MakeCachedZombieFrame).
     */
    readonly packet?: { readonly x: number; readonly y: number; readonly scale: number; readonly clip?: string }
    /** The almanac's small picture of it: where its Reanim's origin goes in the frame, and at what size. */
    readonly portrait?: { readonly x: number; readonly y: number; readonly scale: number }
    readonly parts: ZombieParts
    /** Zombie::TakeDamage's bare arm: the upper arm's sprite once the arm has dropped. */
    readonly damagedArmSprite: string
    /** Zombie::UpdateZombieNewspaper: the head track takes this sprite while enraged. */
    readonly enragedHead?: { readonly track: string; readonly sprite: string }
    /** Zombie::UpdateZombieNewspaper: the roar on losing the paper, when the server allows it. */
    readonly enrageSounds?: readonly PresentationSound[]
    /** Unavailable cells in the 5x5 street-preview grid. */
    readonly previewBlockedCells?: readonly { readonly column: number; readonly row: number }[]
    readonly drops: Readonly<Partial<Record<'head' | 'arm' | 'flag', ZombieDrop>>>
    /** The gameplay `helm`, worn on the head. */
    readonly helm?: ZombieArmorPresentation & {
        /** A helm hides the hair until dropped (Zombie::ZombieInitialize) unless this is set. */
        readonly showsHair?: boolean
    }
    /** The gameplay `shield`, held in front; it flashes and recoils on its own track. */
    readonly shield?: ZombieArmorPresentation
}

/** How a helm or shield looks: its track, its dented sprites below 2/3 and 1/3 health, and its fall. */
export interface ZombieArmorPresentation {
    readonly track: string
    readonly damagedSprites: readonly [string, string]
    readonly effect: string
    readonly offset: readonly [number, number]
    /** Its own sound for a projectile hit while worn, with the projectile's; the shield's while both are worn. */
    readonly impactSounds: readonly PresentationSound[]
    /**
     * Projectile::PlayImpactSound for a pail: a projectile's own impact sound is not heard on it, unless the
     * projectile is `loud`.
     */
    readonly muffles?: true
    /** Played when a bowled nut strikes it: a shield, or a helm without a shield in front. */
    readonly bowlingImpactSounds?: readonly PresentationSound[]
    /** Plays once on the zombie when it breaks, like the newspaper's surprise mark. */
    readonly dropReanim?: { readonly reanimId: string; readonly offset: readonly [number, number] }
    /** Play with dropReanim, like the newspaper's rip; neither plays when the hit bypasses the shield (Zombie::DropShield). */
    readonly dropSounds?: readonly PresentationSound[]
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
    /** Every helm and shield track in the clips; only the worn ones (helm.track, shield.track) show. */
    readonly helms: readonly string[]
    /** The walk's ground track: how far a cycle moves (the house-entry walk). */
    readonly ground: string
    /** Zombie::DropPole: dropped with the head. */
    readonly held?: readonly string[]
    /** The flag zombie's inner arm with and without the flag; the flag draws behind `front`, the arm gripping the pole. */
    readonly flagArm?: { readonly holding: readonly string[]; readonly free: readonly string[]; readonly front: string }
    /**
     * Zombie::SetupDoorArms: the arms holding a shield replace the free arms while the shield is worn and the zombie
     * is not eating (StartEating and DetachShield bring the free arms back).
     */
    readonly shieldArms?: { readonly holding: readonly string[]; readonly free: readonly string[] }
}

export interface AdventureIntroLayout {
    readonly previewCapacity: number
    readonly stationary?: boolean
    /** CutScene: a level without a seed bank (IsChallengeWithoutSeedBank) leaves it above the screen. */
    readonly hiddenSeedBank?: boolean
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
    /** False when the seed guide only flashes the packets, without the pick arrow (Whack-a-Zombie). */
    readonly seedGuideArrow?: false
    /** The look of the level's `plantingLine`: shown in play and during Dave's lines `dialogs` (Wall-nut Bowling's stripe). */
    readonly plantingLine?: { readonly sprite: string; readonly offset: readonly [number, number]; readonly dialogs: readonly number[] }
}
/**
 * How a level rule (`rules.kind`) looks, by kind. The generic level view reads `graveRise` and `itemPadding`; the
 * rule's own view reads and checks the rest, as its server rule does the level's `rules` settings (WhackAZombieView).
 */
export interface LevelRulePresentation {
    /** Zombie::RiseFromGrave: replaces `graves.rise` (Whack-a-Zombie's dirt). */
    readonly graveRise?: { readonly particle: string; readonly sounds: readonly PresentationSound[] }
    /** Coin::MouseHitTest: items take clicks this much further around, and `height` more below. */
    readonly itemPadding?: { readonly size: number; readonly height: number }
    readonly [key: string]: unknown
}
/** Coin::CoinInitialize / Coin::Draw: how a sun or coin item looks; offsets are from the item's 60x60 top-left. */
export interface ItemPresentationDefinition {
    /** Its view (ItemViewRegistry): `item` when omitted. */
    readonly view?: string
    /** Its view's own settings, which that view (a Mod's) reads and checks itself: kept as written. */
    readonly viewConfig?: Readonly<JsonObject>
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

/**
 * One ChallengeScreen page: the button grid (the first button's corner, the step to the next column and row, and each
 * button's size), the
 * thumbnail sheet cut into `columns` x `rows` equal cels, and each challenge's cel (mChallengeIconIndex).
 */
export interface ChallengePagePresentationDefinition {
    readonly x: number
    readonly y: number
    readonly columnSpacing: number
    readonly rowSpacing: number
    /** The button's own size (GameButton::Resize), its hit area; the window image draws at its own size. */
    readonly buttonWidth: number
    readonly buttonHeight: number
    readonly thumbnails: { readonly sprite: string; readonly columns: number; readonly rows: number }
    readonly icons: Readonly<Record<string, number>>
}

export interface AwardPresentationDefinition {
    readonly sprite: string
    readonly scale: number
    readonly x: number
    readonly y: number
    readonly pageY: number
    readonly pageImages?: readonly { readonly sprite: string; readonly x: number; readonly y: number; readonly width?: number; readonly height?: number }[]
}
export interface MainMenuButtonDefinition {
    readonly name: string
    /** The menu page, action or dialog (players, options, quit) it opens; adventure and zombatar have their own handling. */
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

/**
 * A board tool in the bank beside the seeds (the shovel): its bank and picture, the tooltip, the hotkey (a letter) and
 * the tutorial step that points at it (`arrowStep`). `x`: the bank's place before Board::GetSeedBankExtraWidth;
 * `imageOffset`: the picture in its bank; `cursorOffset`: the held picture from the pointer; `arrowOffset`: the arrow
 * from the bank's lower centre.
 */
export interface ToolPresentation {
    readonly bank: string
    readonly sprite: string
    readonly tooltipKey: string
    readonly hotkey?: string
    readonly arrowStep?: string
    readonly x: number
    readonly imageOffset: readonly [number, number]
    readonly cursorOffset: readonly [number, number]
    readonly arrowOffset: readonly [number, number]
}

/** A store item's look by its ID (StoreScreen::DrawItemIcon); an item without a `sprite` shows the packet of the seed it sells. */
export interface StoreItemPresentation {
    readonly sprite?: string
    /** Where the sprite goes in the item's 50x70 box. */
    readonly offset?: readonly [number, number]
    /**
     * How it lights up under the pointer: the packet's flash, its sprite drawn additively at `opacity`, or not at all.
     * Without, a seed's packet flashes and a sprite lights at 96.
     */
    readonly highlight?: { readonly type: 'none' | 'seedPacket' } | { readonly type: 'additive'; readonly opacity: number }
    /** The count written over it, as `x5` (fertilizer, bug spray). */
    readonly quantity?: number
}

/**
 * StoreScreen's timing, in seconds: the items take clicks `readyDelay` in; a description stays `descriptionDuration`
 * after the pointer leaves; Dave's chatter starts `initialDelay` in, comes every `interval` and stays `duration`, a line
 * by weight (never the last again, StoreScreen::Update), the `completed` ones only once the adventure is finished.
 */
export interface StoreDialoguePresentation {
    readonly readyDelay: number
    readonly descriptionDuration: number
    readonly ambient: {
        readonly initialDelay: number; readonly interval: readonly [number, number]; readonly duration: number
        readonly messages: readonly { readonly message: number; readonly weight: number; readonly completed?: true }[]
    }
}

/** The almanac's backgrounds behind a plant or a zombie (IMAGE_ALMANAC_GROUND*). */
export const ALMANAC_GROUNDS = ['day', 'night', 'pool', 'nightpool', 'roof', 'ice'] as const
export type AlmanacGround = typeof ALMANAC_GROUNDS[number]

/** How the almanac shows a plant or a zombie, by its ID: its ground, and an upgrade plant's packet (SeedPacket::DrawSeedPacket). */
export interface AlmanacPresentation { readonly ground: AlmanacGround; readonly upgrade?: true }

/** The almanac's ground behind a plant or a zombie: its entry's, the day's without one. */
export function almanacGround(presentation: Pick<PresentationDefinitions, 'almanac'>, id: string): AlmanacGround {
    return presentation.almanac[id]?.ground ?? 'day'
}

export interface PresentationDefinitions {
    readonly mainMenu: MainMenuDefinition
    readonly conveyor: {
        readonly x: number; readonly backdropX: number; readonly clipX: number; readonly width: number; readonly height: number
        readonly packetX: number; readonly packetY: number; readonly beltY: number; readonly beltWidth: number; readonly beltHeight: number
        readonly frames: number; readonly frameTicks: number; readonly introStart: number; readonly introDuration: number
    }
    /** Foley by audio ID. */
    readonly foley: Readonly<Record<string, FoleyDefinition>>
    /** The board's tools by ID (the shovel), for those a game gives the player. */
    readonly tools: Readonly<Record<string, ToolPresentation>>
    /** The store's items' looks by item ID. */
    readonly store: Readonly<Record<string, StoreItemPresentation>>
    readonly storeDialogue: StoreDialoguePresentation
    /** By the plant (the seed of a card) or zombie shown. */
    readonly almanac: Readonly<Record<string, AlmanacPresentation>>
    /** Zombie::RiseFromGrave: the dirt and rumble of a zombie rising from a grave; a level may replace them (Whack-a-Zombie). */
    readonly graves: { readonly rise: { readonly particle: string; readonly sounds: readonly PresentationSound[] } }
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
    readonly rules?: Readonly<Record<string, LevelRulePresentation>>
    readonly screens?: Readonly<Record<string, readonly ScreenAnimationDefinition[]>>
    readonly levels?: Readonly<Record<string, LevelPresentationDefinition>>
    readonly awards?: Readonly<Record<string, AwardPresentationDefinition>>
    /** Keyed `pvz:<page>`. */
    readonly challenges?: Readonly<Record<string, ChallengePagePresentationDefinition>>
    readonly items: Readonly<Record<string, ItemPresentationDefinition>>
    readonly plants: Readonly<Record<string, PlantPresentationDefinition>>
    readonly zombies: Readonly<Record<string, ZombiePresentationDefinition>>
    readonly projectiles: Readonly<Record<string, ProjectilePresentationDefinition>>
    readonly gridItems: Readonly<Record<string, GridItemPresentationDefinition>>
    readonly seedPackets: {
        readonly flash: { readonly id: string }
        readonly selection: { readonly color: readonly [number, number, number] }
        /** A plant's picture in its packet, unless the plant has its own (`packet.placement`). */
        readonly defaultPlacement: SeedPacketPlacement
        /** A grave seed's packet: the grave at about a plant's size, centred, a little above the picture window's floor. */
        readonly grave: SeedPacketPlacement
    }
}

/**
 * Reading the presentation definitions, each checked as it is read, as the gameplay ones are (parseGameplay): a field
 * that is not one of its object's is not supported, and the result has only what was read.
 */
export function parsePresentationDefinitions(value: unknown): PresentationDefinitions {
    const definitions = fields<PresentationDefinitions>(value, 'presentation', [
        'mainMenu', 'conveyor', 'foley', 'tools', 'store', 'storeDialogue', 'almanac', 'graves', 'dave', 'items', 'plants', 'zombies', 'projectiles',
        'gridItems', 'seedPackets',
    ], {
        mainMenu: parseMainMenu,
        conveyor: (value, name) => allFields<PresentationDefinitions['conveyor']>(value, name, {
            x: finite, backdropX: finite, clipX: finite, width: positiveFinite, height: positiveFinite,
            packetX: finite, packetY: finite, beltY: finite, beltWidth: positiveFinite, beltHeight: positiveFinite,
            frames: positiveFinite, frameTicks: positiveFinite, introStart: finite, introDuration: positiveFinite,
        }),
        foley: table((value, name) => fields<FoleyDefinition>(value, name, [], { pitchRange: finite, variants: nonEmptyStrings })),
        tools: table(parseTool),
        store: table(parseStoreItem),
        storeDialogue: parseStoreDialogue,
        almanac: table((value, name) => fields<AlmanacPresentation>(value, name, ['ground'], {
            ground: (value, name) => oneOf(value, ALMANAC_GROUNDS, name), upgrade: trueFlag,
        })),
        graves: (value, name) => allFields<PresentationDefinitions['graves']>(value, name, { rise: graveRise }),
        dave: parseDave,
        boards: table(parseBoard),
        rules: table(parseRule),
        screens: table(parseScreen),
        levels: table(parseLevel),
        awards: table(parseAward),
        challenges: table(parseChallengePage),
        items: table(parseItem),
        // A plant's or a zombie's clips may start as another's (withFrom).
        plants: (value, name) => named(withFrom(record(value, name), 'clips', 'plants'), name, parsePlant),
        zombies: (value, name) => named(withFrom(record(value, name), 'clips', 'zombies'), name, parseZombie),
        projectiles: table(parseProjectile),
        gridItems: table((value, name) => fields<GridItemPresentationDefinition>(value, name, ['view', 'layer'], { view: nonEmptyString, viewConfig, layer, offset: finite })),
        seedPackets: (value, name) => allFields<PresentationDefinitions['seedPackets']>(value, name, {
            flash: (value, name) => allFields<PresentationDefinitions['seedPackets']['flash']>(value, name, { id: nonEmptyString }),
            selection: (value, name) => allFields<PresentationDefinitions['seedPackets']['selection']>(value, name, { color }),
            defaultPlacement: placement,
            grave: placement,
        }),
    })
    const { plants, zombies } = definitions
    if (!zombies['pvz:normal']) throw new TypeError('Missing normal zombie presentation')
    for (const id of Object.keys(plants)) if (Object.hasOwn(zombies, id)) throw new TypeError('Duplicate presentation target: ' + id)
    return definitions
}

/**
 * A list of sounds, as the presentation writes them; a level rule's view reads its own with it. A sound names its
 * owner like any other resource: pvz:splat, corn:shoop.
 */
export function presentationSounds(value: unknown, name: string): PresentationSound[] {
    return array(value, name).map((entry, index) => fields<PresentationSound>(entry, `${name}[${index}]`, ['audio', 'foley'], {
        audio(value, name) {
            if (!isQualifiedId(value)) throw new TypeError(`${name} must be a qualified ID`)
            return value
        },
        foley: boolean,
        // A negative range lowers the pitch, like FOLEY_NEWSPAPER_RIP's -2 (TodFoley).
        pitchRange: finite,
    }))
}

const sounds = presentationSounds

/** A table by ID, each entry read by `parse`. */
function table<T>(parse: (value: unknown, name: string) => T): (value: unknown, name: string) => Record<string, T> {
    return (value, name) => named(value, name, parse)
}

/** An object of exactly these fields, each a non-empty string. */
function strings<K extends string>(keys: readonly K[]): (value: unknown, name: string) => Record<K, string> {
    const parsers = Object.fromEntries(keys.map(key => [key, nonEmptyString])) as FieldParsers<Record<K, string>>
    return (value, name) => allFields(value, name, parsers)
}

function layer(value: unknown, name: string): RenderLayer {
    if (!isRenderLayer(value)) throw new TypeError(`${name} is not a render layer`)
    return value
}

/** `[r, g, b]`, each 0-255. */
function color(value: unknown, name: string): [number, number, number] {
    const channels = array(value, name).map((channel, index) => integerInRange(channel, 0, 255, `${name}[${index}]`))
    if (channels.length !== 3) throw new TypeError(`${name} must be [r, g, b]`)
    return channels as [number, number, number]
}

/** A part's two sprites under two thirds and under a third of its health (a nut's face, a helm's dents). */
function twoSprites(value: unknown, name: string): [string, string] {
    const sprites = nonEmptyStrings(value, name)
    if (sprites.length !== 2) throw new TypeError(`${name} must be two sprites`)
    return sprites as [string, string]
}

function placement(value: unknown, name: string): SeedPacketPlacement {
    return allFields<SeedPacketPlacement>(value, name, { scale: positiveFinite, offsetX: finite, offsetY: finite })
}

function graveRise(value: unknown, name: string): PresentationDefinitions['graves']['rise'] {
    return allFields<PresentationDefinitions['graves']['rise']>(value, name, { particle: nonEmptyString, sounds })
}

function music(value: unknown, name: string): BoardPresentation['music'] {
    const tune = (value: unknown, name: string) => nonEmptyString(value, name) as MusicTuneId
    return allFields<BoardPresentation['music']>(value, name, { choosing: tune, gameplay: tune })
}

/** A clip's picture; ClientAnimationRegistry fills in what it leaves out. */
function clip(value: unknown, name: string): ClientAnimationClip {
    return fields<ClientAnimationClip>(value, name, ['reanimId', 'x', 'y'], {
        reanimId: nonEmptyString, rateScale: positiveFinite, x: finite, y: finite, attachmentTrackId: nonEmptyString, attachmentBase: nonEmptyString,
        onlyTracks: nonEmptyStrings, blend: nonNegativeFinite, fps: positiveFinite, fullLastFrame: trueFlag,
    })
}

const clips = table(clip)

/** A view's own settings (`viewConfig`): any JSON object, copied as it is, for the view to read and check. */
function viewConfig(value: unknown, name: string): Readonly<JsonObject> {
    return jsonRoundTrip(record(value, name)) as JsonObject
}

function parseMainMenu(value: unknown, name: string): MainMenuDefinition {
    const menu = allFields<MainMenuDefinition>(value, name, {
        buttons: (value, name) => array(value, name).map((entry, index) => parseMainMenuButton(entry, `${name}[${index}]`)),
        images: nonEmptyStrings,
        clouds: nonEmptyStrings,
        flowers: (value, name) => array(value, name).map((entry, index) => point(entry, `${name}[${index}]`)),
        tracks: (value, name) => allFields<MainMenuDefinition['tracks']>(value, name, {
            sky: nonEmptyString, anchor: nonEmptyString, profileSign: nonEmptyString, replaced: nonEmptyStrings, handRocks: nonEmptyStrings,
        }),
        keyShadow: strings(['track', 'almanac', 'store']),
        trophy: strings(['track', 'image', 'particle']),
        startAdventure: strings(['track', 'image', 'highlight', 'shadow', 'adventureShadow']),
    })
    if (!menu.buttons.length) throw new TypeError(`${name}.buttons must not be empty`)
    const names = new Set<string>()
    for (const [index, button] of menu.buttons.entries()) {
        if (names.has(button.name)) throw new TypeError(`${name}.buttons[${index}].name is duplicated`)
        names.add(button.name)
    }
    return menu
}

function parseMainMenuButton(value: unknown, name: string): MainMenuButtonDefinition {
    return fields<MainMenuButtonDefinition>(value, name, ['name', 'track', 'image', 'highlight'], {
        name: nonEmptyString, target: nonEmptyString, track: nonEmptyString, image: nonEmptyString, highlight: nonEmptyString,
        replace: boolean, sign: boolean, mode: boolean,
        x: finite, y: finite, width: positiveFinite, height: positiveFinite, imageX: finite, imageY: finite,
        polygon(value, name) {
            const points = array(value, name).map((entry, index) => pair(entry, `${name}[${index}]`))
            if (points.length < 3) throw new TypeError(`${name} needs three points`)
            return points
        },
    })
}

function parseTool(value: unknown, name: string): ToolPresentation {
    return fields<ToolPresentation>(value, name, ['bank', 'sprite', 'tooltipKey', 'x', 'imageOffset', 'cursorOffset', 'arrowOffset'], {
        bank: nonEmptyString, sprite: nonEmptyString, tooltipKey: nonEmptyString,
        hotkey(value, name) {
            if (typeof value !== 'string' || !/^[A-Z]$/.test(value)) throw new TypeError(`${name} must be a letter A-Z`)
            return value
        },
        arrowStep: nonEmptyString, x: finite, imageOffset: pair, cursorOffset: pair, arrowOffset: pair,
    })
}

function parseStoreItem(value: unknown, name: string): StoreItemPresentation {
    type Highlight = NonNullable<StoreItemPresentation['highlight']>
    return fields<StoreItemPresentation>(value, name, [], {
        sprite: nonEmptyString, offset: pair, quantity: positiveInteger,
        highlight(value, name): Highlight {
            const { type } = record(value, name)
            if (type !== 'additive') return allFields<Highlight>(value, name, { type: (value, name) => oneOf(value, ['none', 'seedPacket'] as const, name) })
            return allFields<Highlight>(value, name, { type: (value, name) => oneOf(value, ['additive'] as const, name),
                opacity: (value, name) => integerInRange(value, 0, 255, name) })
        },
    })
}

function parseStoreDialogue(value: unknown, name: string): StoreDialoguePresentation {
    type Ambient = StoreDialoguePresentation['ambient']
    return allFields<StoreDialoguePresentation>(value, name, {
        readyDelay: positiveFinite, descriptionDuration: positiveFinite,
        ambient: (value, name) => {
            const ambient = allFields<Ambient>(value, name, {
                initialDelay: positiveFinite, duration: positiveFinite,
                interval(value, name) {
                    const interval = range(value, name, 0)
                    if (interval[0] <= 0) throw new TypeError(`${name} must be positive`)
                    return interval
                },
                // The chatter's weights are whole numbers, as PvzpPickFromWeightedArray's are.
                messages: (value, name) => array(value, name).map((entry, index) => fields<Ambient['messages'][number]>(entry, `${name}[${index}]`,
                    ['message', 'weight'], { message: nonNegativeInteger, weight: nonNegativeInteger, completed: trueFlag })),
            })
            if (!ambient.messages.length) throw new TypeError(`${name}.messages must not be empty`)
            return ambient
        },
    })
}

function parseDave(value: unknown, name: string): PresentationDefinitions['dave'] {
    type Dave = PresentationDefinitions['dave']
    return allFields<Dave>(value, name, {
        clips: strings(['enter', 'leave', 'idle', 'smalltalk', 'mediumtalk', 'blahblah', 'crazy', 'idle_handing', 'talk_handing', 'blink']),
        sourceFps: positiveFinite, transitionFps: positiveFinite, talkFps: positiveFinite, blinkFps: positiveFinite,
        idleBlend: positiveFinite, talkBlend: positiveFinite, delay: positiveFinite,
        blinkSeconds: pair, talkLengths: pair,
        bubble: (value, name) => allFields<Dave['bubble']>(value, name, {
            sprite: nonEmptyString, x: finite, y: finite, textX: finite, textY: finite, textWidth: positiveFinite, textHeight: positiveFinite,
            continueX: finite, continueY: finite, shake: finite,
        }),
        hand: (value, name) => allFields<Dave['hand']>(value, name, { reanim: nonEmptyString, x: finite, y: finite, scale: positiveFinite, track: nonEmptyString }),
        parts: (value, name) => allFields<Dave['parts']>(value, name, { mouth: nonEmptyString, eyes: nonEmptyStrings, head: nonEmptyString }),
        mouths: table(nonEmptyString),
    })
}

function parseBoard(value: unknown, name: string): BoardPresentation {
    return fields<BoardPresentation>(value, name, ['background', 'backgroundX', 'music', 'gameOver'], {
        background: nonEmptyString, backgroundX: finite, plantShadow: nonEmptyString, music,
        gameOver: (value, name) => allFields<BoardPresentation['gameOver']>(value, name, {
            images(value, name) {
                const images = nonEmptyStrings(value, name)
                if (images.length !== 3) throw new TypeError(`${name} must contain three images`)
                return images as [string, string, string]
            },
            interior: point, doorway: point, clipX: finite, winnerY: finite, panX: finite,
        }),
    })
}

/** Its own view reads the rest of a rule's presentation (LevelRulePresentation). */
function parseRule(value: unknown, name: string): LevelRulePresentation {
    const { graveRise: rise, itemPadding, ...own } = record(value, name)
    return {
        ...own,
        ...rise === undefined ? {} : { graveRise: graveRise(rise, `${name}.graveRise`) },
        ...itemPadding === undefined ? {} : { itemPadding: allFields<NonNullable<LevelRulePresentation['itemPadding']>>(itemPadding, `${name}.itemPadding`, { size: finite, height: finite }) },
    }
}

function parseScreen(value: unknown, name: string): ScreenAnimationDefinition[] {
    const names = new Set<string>()
    return array(value, name).map((entry, index) => {
        const entryName = `${name}[${index}]`
        const layer = fields<ScreenAnimationDefinition>(entry, entryName, ['name', 'reanimId', 'x', 'y', 'rate', 'playback'], {
            name: nonEmptyString, reanimId: nonEmptyString, x: finite, y: finite, rate: positiveFinite,
            playback: (value, name) => oneOf(value, ['loop', 'last'] as const, name), randomPhase: boolean, visibleTracks: nonEmptyStrings,
        })
        if (names.has(layer.name)) throw new TypeError(`${name} has duplicate animation names`)
        names.add(layer.name)
        if (layer.randomPhase !== undefined && layer.playback !== 'loop') throw new TypeError(`${entryName}.randomPhase requires loop playback`)
        return layer
    })
}

function parseLevel(value: unknown, name: string): LevelPresentationDefinition {
    type Line = NonNullable<LevelPresentationDefinition['plantingLine']>
    return fields<LevelPresentationDefinition>(value, name, ['intro', 'advice', 'seedGuideSteps', 'lawnGuideSteps'], {
        music,
        intro: parseIntro,
        // An empty advice shows nothing at its step.
        advice: table((value, name) => {
            if (typeof value !== 'string') throw new TypeError(`${name} must be a string`)
            return value
        }),
        adviceDuringIntro: boolean,
        adviceStyle: (value, name) => oneOf(value, ['hint-stay', 'tutorial-level1-stay'] as const, name),
        guideSeed: nonEmptyString,
        seedGuideSteps: nonEmptyStrings,
        lawnGuideSteps: nonEmptyStrings,
        seedGuideArrow(value, name) {
            if (value !== false) throw new TypeError(`${name} can only be false`)
            return false
        },
        plantingLine: (value, name) => allFields<Line>(value, name, {
            sprite: nonEmptyString, offset: pair, dialogs: (value, name) => array(value, name).map((dialog, index) => integer(dialog, `${name}[${index}]`)),
        }),
    })
}

function parseIntro(value: unknown, name: string): AdventureIntroLayout {
    type Sod = NonNullable<AdventureIntroLayout['existingSod']>
    return fields<AdventureIntroLayout>(value, name, ['previewCapacity', 'sod', 'x', 'y', 'width', 'rolls', 'readySetPlant'], {
        previewCapacity: positiveInteger, stationary: boolean, hiddenSeedBank: boolean,
        sod: nonEmptyString, x: finite, y: finite, width: positiveFinite, sourceX: finite,
        existingSod: (value, name) => allFields<Sod>(value, name, { sprite: nonEmptyString, x: finite, y: finite }),
        rolls: (value, name) => array(value, name).map((roll, index) =>
            allFields<AdventureIntroLayout['rolls'][number]>(roll, `${name}[${index}]`, { x: finite, y: finite, particleY: finite })),
        readySetPlant: boolean,
    })
}

function parseAward(value: unknown, name: string): AwardPresentationDefinition {
    type Image = NonNullable<AwardPresentationDefinition['pageImages']>[number]
    return fields<AwardPresentationDefinition>(value, name, ['sprite', 'scale', 'x', 'y', 'pageY'], {
        sprite: nonEmptyString, scale: positiveFinite, x: finite, y: finite, pageY: finite,
        pageImages(value, name) {
            const images = array(value, name).map((image, index) => fields<Image>(image, `${name}[${index}]`, ['sprite', 'x', 'y'], {
                sprite: nonEmptyString, x: finite, y: finite, width: positiveFinite, height: positiveFinite,
            }))
            if (!images.length) throw new TypeError(`${name} must not be empty`)
            return images
        },
    })
}

function parseChallengePage(value: unknown, name: string): ChallengePagePresentationDefinition {
    const page = allFields<ChallengePagePresentationDefinition>(value, name, {
        x: finite, y: finite, columnSpacing: positiveFinite, rowSpacing: positiveFinite, buttonWidth: positiveFinite, buttonHeight: positiveFinite,
        thumbnails: (value, name) => allFields<ChallengePagePresentationDefinition['thumbnails']>(value, name, {
            sprite: nonEmptyString, columns: positiveInteger, rows: positiveInteger,
        }),
        icons: table(nonNegativeInteger),
    })
    const cels = page.thumbnails.columns * page.thumbnails.rows
    for (const [key, icon] of Object.entries(page.icons)) if (icon >= cels) throw new TypeError(`${name}.icons.${key} is not a thumbnail cel`)
    return page
}

function parseItem(value: unknown, name: string): ItemPresentationDefinition {
    type Item = ItemPresentationDefinition
    return fields<Item>(value, name, ['reanim', 'offset', 'rate'], {
        view: nonEmptyString, viewConfig, reanim: nonEmptyString, offset: pair, rate: (value, name) => range(value, name, 0),
        flight: (value, name) => allFields<NonNullable<Item['flight']>>(value, name, { sprite: nonEmptyString, offset: pair }),
        glow: (value, name) => fields<NonNullable<Item['glow']>>(value, name, ['sprite', 'offset'], { sprite: nonEmptyString, offset: pair, inFlight: boolean }),
        arrow: (value, name) => allFields<NonNullable<Item['arrow']>>(value, name, { particle: nonEmptyString, offset: pair }),
        spawnSounds: sounds, landSounds: sounds, collectSounds: sounds,
    })
}

function parsePlant(value: unknown, name: string): PlantPresentationDefinition {
    type Plant = PlantPresentationDefinition
    return fields<Plant>(value, name, ['scale', 'visual'], {
        fireParticle: (value, name) => allFields<NonNullable<Plant['fireParticle']>>(value, name, {
            id: nonEmptyString, x: finite, y: finite, delayTicks: nonNegativeInteger,
        }),
        layer,
        shadow: (value, name) => fields<NonNullable<Plant['shadow']>>(value, name, ['x', 'y'], {
            x: finite, y: finite, scale: positiveFinite,
            states: (value, name) => {
                const states = table((value, name) => Array.isArray(value)
                    ? pair(value, name).map((scale, index) => positiveFinite(scale, `${name}[${index}]`)) as [number, number]
                    : positiveFinite(value, name))(value, name)
                for (const state of Object.keys(states)) oneOf(state, PLANT_ABILITY_STATES, `${name}.${state}`)
                return states
            },
        }),
        scale: positiveFinite,
        drawHeightOffset: finite,
        pointerOffsetY: finite,
        visual: (value, name) => fields<PlantVisual>(value, name, ['nameKey'], {
            packetPlant: nonEmptyString, nameKey: nonEmptyString, tooltipKey: nonEmptyString, tint: color,
        }),
        parts: (value, name) => fields<PlantParts>(value, name, [], { eyes: nonEmptyStrings, face: nonEmptyString, prey: nonEmptyStrings }),
        view: nonEmptyString,
        viewConfig,
        clips,
        packet: (value, name) => fields<NonNullable<Plant['packet']>>(value, name, [], {
            placement, x: finite, y: finite, scale: positiveFinite, time: finite,
            state: (value, name) => oneOf(value, PLANT_ABILITY_STATES, name),
        }),
        almanacOffset: pair,
        chewParticle: nonEmptyString,
        crackedFaces: twoSprites,
        explosion: (value, name) => allFields<NonNullable<Plant['explosion']>>(value, name, { effect: nonEmptyString, x: finite, layer }),
        plantedSounds: sounds, explosionSounds: sounds, fireSounds: sounds,
    })
}

const ARMOR_FIELDS: FieldParsers<ZombieArmorPresentation> = {
    track: nonEmptyString, damagedSprites: twoSprites, effect: nonEmptyString, offset: pair, impactSounds: sounds, muffles: trueFlag,
    bowlingImpactSounds: sounds,
    dropReanim: (value, name) => allFields<NonNullable<ZombieArmorPresentation['dropReanim']>>(value, name, { reanimId: nonEmptyString, offset: pair }),
    dropSounds: sounds,
}
const ARMOR_REQUIRED = ['track', 'damagedSprites', 'effect', 'offset', 'impactSounds'] as const

function parseZombie(value: unknown, name: string): ZombiePresentationDefinition {
    type Zombie = ZombiePresentationDefinition
    const cell = (value: unknown, name: string) => integerInRange(value, 0, 4, name)
    const drop = (value: unknown, name: string) => fields<ZombieDrop>(value, name, ['track', 'effect', 'offset'], {
        track: nonEmptyString, effect: nonEmptyString, moweredEffect: nonEmptyString, offset: pair, image: nonEmptyString, sounds,
    })
    const zombie = fields<Zombie>(value, name, ['nameKey', 'clips', 'shadow', 'parts', 'damagedArmSprite', 'drops'], {
        nameKey: nonEmptyString,
        view: nonEmptyString,
        viewConfig,
        clips,
        shadow: (value, name) => fields<Zombie['shadow']>(value, name, ['x', 'y'], { x: finite, y: finite, backwardsX: finite }),
        packet: (value, name) => fields<NonNullable<Zombie['packet']>>(value, name, ['x', 'y', 'scale'], {
            x: finite, y: finite, scale: positiveFinite, clip: nonEmptyString,
        }),
        portrait: (value, name) => allFields<NonNullable<Zombie['portrait']>>(value, name, { x: finite, y: finite, scale: positiveFinite }),
        parts: parseZombieParts,
        damagedArmSprite: nonEmptyString,
        enragedHead: (value, name) => allFields<NonNullable<Zombie['enragedHead']>>(value, name, { track: nonEmptyString, sprite: nonEmptyString }),
        enrageSounds: sounds,
        previewBlockedCells: (value, name) => array(value, name).map((entry, index) =>
            allFields<NonNullable<Zombie['previewBlockedCells']>[number]>(entry, `${name}[${index}]`, { column: cell, row: cell })),
        drops: (value, name) => fields<Zombie['drops']>(value, name, [], { head: drop, arm: drop, flag: drop }),
        helm: (value, name) => fields<NonNullable<Zombie['helm']>>(value, name, ARMOR_REQUIRED, { ...ARMOR_FIELDS, showsHair: boolean }),
        shield: (value, name) => fields<ZombieArmorPresentation>(value, name, ARMOR_REQUIRED, ARMOR_FIELDS),
    })
    if (zombie.parts.shieldArms && !zombie.shield) throw new TypeError(`${name}.parts.shieldArms requires a shield`)
    for (const slot of ['helm', 'shield'] as const) {
        const armor = zombie[slot]
        if (armor && !zombie.parts.helms.includes(armor.track)) throw new TypeError(`${name}.${slot}.track is missing from parts.helms`)
    }
    if (zombie.helm && zombie.shield && zombie.helm.track === zombie.shield.track) throw new TypeError(`${name} draws its helm and shield on one track`)
    return zombie
}

function parseZombieParts(value: unknown, name: string): ZombieParts {
    return fields<ZombieParts>(value, name, ['head', 'hair', 'tongue', 'arm', 'upperArm', 'helms', 'ground'], {
        head: nonEmptyStrings, hair: nonEmptyStrings, tongue: nonEmptyStrings, arm: nonEmptyStrings, upperArm: nonEmptyString,
        helms: nonEmptyStrings, ground: nonEmptyString, held: nonEmptyStrings,
        flagArm: (value, name) => allFields<NonNullable<ZombieParts['flagArm']>>(value, name, {
            holding: nonEmptyStrings, free: nonEmptyStrings, front: nonEmptyString,
        }),
        shieldArms: (value, name) => allFields<NonNullable<ZombieParts['shieldArms']>>(value, name, { holding: nonEmptyStrings, free: nonEmptyStrings }),
    })
}

function parseProjectile(value: unknown, name: string): ProjectilePresentationDefinition {
    type Projectile = ProjectilePresentationDefinition
    const projectile = fields<Projectile>(value, name, ['fireSounds', 'impactSounds'], {
        view: nonEmptyString,
        viewConfig,
        sprite: nonEmptyString,
        reanim: (value, name) => allFields<NonNullable<Projectile['reanim']>>(value, name, {
            id: nonEmptyString, x: finite, y: finite, scale: positiveFinite, rate: positiveFinite,
        }),
        plantShadow: point,
        layer,
        shadow(value, name) {
            const shadow = allFields<NonNullable<Projectile['shadow']>>(value, name, {
                sprite: nonEmptyString, columns: positiveInteger, cell: nonNegativeInteger, offset: point, scale: positiveFinite,
            })
            if (shadow.cell >= shadow.columns) throw new TypeError(`${name}.cell is not one of its columns`)
            return shadow
        },
        trail: (value, name) => allFields<NonNullable<Projectile['trail']>>(value, name, { id: nonEmptyString, x: finite, y: finite }),
        impact(value, name) {
            const impact = fields<NonNullable<Projectile['impact']>>(value, name, ['id'], {
                id: nonEmptyString, shotOffset: pair, lobOffset: pair, yRange: (value, name) => range(value, name, 0), free: trueFlag,
            })
            // A free splat stays where it was, with no zombie to stay on.
            if (!impact.free && !impact.yRange) throw new TypeError(`${name}.yRange is required`)
            return impact
        },
        fireSounds: sounds,
        impactSounds: sounds,
        loud: trueFlag,
    })
    if ((projectile.sprite === undefined) === (projectile.reanim === undefined)) throw new TypeError(`${name} needs exactly one of sprite and reanim`)
    return projectile
}

export interface BoardPresentation {
    readonly background: string
    readonly backgroundX: number
    /** The shadow under its plants and zombies (Board::DrawShadow: IMAGE_PLANTSHADOW, IMAGE_PLANTSHADOW2 at night); the day's when left out. */
    readonly plantShadow?: string
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
