import { record, finite, positiveFinite } from '@/shared/validate'
import { withFrom } from './from'
import type { MusicTuneId } from './music'
import type { JsonObject } from '@/shared/protocol'
import { isQualifiedId } from '@/shared/mod'
import { isRenderLayer, type RenderLayer } from './renderOrder'

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

export type PlantViewKind = string
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
    readonly viewConfig?: Readonly<JsonObject>
    /** The render layer it draws on (`renderOrder.ts`), `plant` by default; rolling bowling nuts use `projectile`. */
    readonly layer?: RenderLayer
    /** Plant::DrawShadow: where its shadow lies; a plant without one (the grave buster) has none. */
    readonly shadow?: { readonly x: number; readonly y: number; readonly scale?: number }
    readonly scale: number
    /** PlantDrawHeightOffset, in original Y-down pixels: the grid preview draws its cached image this far down. */
    readonly drawHeightOffset?: number
    /** Board::OffsetYForPlanting: the planted cell is picked this far below the pointer. */
    readonly pointerOffsetY?: number
    readonly visual: PlantVisual
    readonly parts?: PlantParts
    /** The view that draws it (PlantViewRegistry), where it has one of its own: every plant is drawn by its animation. */
    readonly view?: PlantViewKind
    /**
     * The pictures of its clips, by the names of its gameplay animation's: the Reanim each is drawn with, where, and the
     * part it goes on. With `from`, another plant's, adding what it writes of its own (the explode-o-nut's are the wall-nut's).
     */
    readonly clips?: ClientAnimationDefinitions[ClientAnimationTarget]
    /**
     * Plant::PlantInitialize off the board (the almanac, a packet's picture): the clips its layers show there in place
     * of the ones they start with on it, `{layer: clip}`, going at those's pace (an armed potato mine, a grown sun-shroom).
     */
    readonly offBoard?: Readonly<Record<string, string>>
    /**
     * A packet's picture of the plant. `placement`: SeedPacket::DrawSeedPacket's place and size of the picture in the
     * packet (seedPackets.defaultPlacement without). The rest is Plant::DrawSeedType: where the plant goes from that
     * place and at what size (the potato mine's), how far towards its clips' last frame it is posed (`time`, the
     * sunflower's), and the clips its layers show on top of `offBoard` (`clips`: the potato mine's light lit, the
     * sun-shroom small).
     */
    readonly packet?: {
        readonly placement?: SeedPacketPlacement
        readonly x?: number; readonly y?: number; readonly scale?: number; readonly time?: number
        readonly clips?: Readonly<Record<string, string>>
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
    /** Its render layer and its offset on it: a grave's `graveStone` and 3 (Board::AddAGraveStone). */
    readonly layer: RenderLayer
    readonly offset?: number
}

/** Exactly one of `sprite` and `reanim`. */
export interface ProjectilePresentationDefinition {
    /** Its view (ProjectileViewRegistry): `projectile` when omitted, a mower's `mower`. */
    readonly view?: string
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
    /** The pictures of its clips, as a plant's: with `from`, another zombie's, adding what it writes of its own (a Mod zombie on the plain body). */
    readonly clips: ClientAnimationDefinitions[ClientAnimationTarget]
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
    readonly vault?: boolean
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
 * rule's own view reads the rest.
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

export function parsePresentationDefinitions(value: unknown): PresentationDefinitions {
    const source = record(value, 'presentation definitions')
    // A plant's or a zombie's clips may start as another's (withFrom).
    const data: Record<string, unknown> = { ...source, plants: withFrom(record(source.plants, 'presentation definitions.plants'), 'clips', 'plants'),
        zombies: withFrom(record(source.zombies, 'presentation definitions.zombies'), 'clips', 'zombies') }
    for (const [id, layers] of Object.entries(record(data.screens ?? {}, 'presentation screens'))) {
        if (!Array.isArray(layers)) throw new TypeError(id + ' screen animations must be an array')
        const names = new Set<string>()
        for (const entry of layers) {
            const layer = record(entry, id)
            text(layer.name, id + '.name'); text(layer.reanimId, id + '.reanimId')
            if (names.has(layer.name as string)) throw new TypeError(id + ' has duplicate animation names')
            names.add(layer.name as string)
            point(layer, id); positiveFinite(layer.rate, id + '.rate')
            if (layer.playback !== 'loop' && layer.playback !== 'last') throw new TypeError(id + '.playback is invalid')
            if (layer.randomPhase !== undefined && (typeof layer.randomPhase !== 'boolean' || layer.playback !== 'loop')) throw new TypeError(id + '.randomPhase requires loop playback')
            if (layer.visibleTracks !== undefined) texts(layer.visibleTracks, id + '.visibleTracks')
        }
    }
    for (const [id, entry] of Object.entries(record(data.challenges ?? {}, 'presentation challenges'))) {
        const page = record(entry, 'challenges.' + id)
        finite(page.x, `challenges.${id}.x`); finite(page.y, `challenges.${id}.y`)
        positiveFinite(page.columnSpacing, `challenges.${id}.columnSpacing`); positiveFinite(page.rowSpacing, `challenges.${id}.rowSpacing`)
        positiveFinite(page.buttonWidth, `challenges.${id}.buttonWidth`); positiveFinite(page.buttonHeight, `challenges.${id}.buttonHeight`)
        const thumbnails = record(page.thumbnails, `challenges.${id}.thumbnails`)
        text(thumbnails.sprite, `challenges.${id}.thumbnails.sprite`)
        for (const key of ['columns', 'rows']) {
            if (!Number.isInteger(thumbnails[key]) || (thumbnails[key] as number) < 1) throw new TypeError(`challenges.${id}.thumbnails.${key} must be a positive integer`)
        }
        const cels = (thumbnails.columns as number) * (thumbnails.rows as number)
        for (const [key, icon] of Object.entries(record(page.icons, `challenges.${id}.icons`))) {
            if (!Number.isInteger(icon) || (icon as number) < 0 || (icon as number) >= cels) throw new TypeError(`challenges.${id}.icons.${key} is not a thumbnail cel`)
        }
    }
    parseMainMenu(record(data.mainMenu, 'mainMenu'))
    const conveyor = record(data.conveyor, 'conveyor')
    for (const key of ['x', 'backdropX', 'clipX', 'packetX', 'packetY', 'beltY', 'introStart']) finite(conveyor[key], 'conveyor.' + key)
    for (const key of ['width', 'height', 'beltWidth', 'beltHeight', 'frames', 'frameTicks', 'introDuration']) positiveFinite(conveyor[key], 'conveyor.' + key)
    const graveRise = record(record(data.graves, 'graves').rise, 'graves.rise')
    text(graveRise.particle, 'graves.rise.particle'); sounds(graveRise.sounds, 'graves.rise.sounds', true)
    for (const [id, entry] of Object.entries(record(data.foley ?? {}, 'foley'))) {
        const sound = record(entry, 'foley.' + id)
        if (sound.pitchRange !== undefined) finite(sound.pitchRange, 'foley.' + id + '.pitchRange')
        if (sound.variants !== undefined) texts(sound.variants, 'foley.' + id + '.variants')
    }
    for (const [id, entry] of Object.entries(record(data.tools, 'tools'))) {
        const tool = record(entry, 'tools.' + id)
        for (const key of ['bank', 'sprite', 'tooltipKey']) text(tool[key], 'tools.' + id + '.' + key)
        if (tool.hotkey !== undefined && (typeof tool.hotkey !== 'string' || !/^[A-Z]$/.test(tool.hotkey))) throw new TypeError('tools.' + id + '.hotkey must be a letter A-Z')
        if (tool.arrowStep !== undefined) text(tool.arrowStep, 'tools.' + id + '.arrowStep')
        finite(tool.x, 'tools.' + id + '.x')
        for (const key of ['imageOffset', 'cursorOffset', 'arrowOffset']) pair(tool[key], 'tools.' + id + '.' + key)
    }
    const dave = record(data.dave, 'dave'), clips = record(dave.clips, 'dave.clips')
    for (const key of ['enter', 'leave', 'idle', 'smalltalk', 'mediumtalk', 'blahblah', 'crazy', 'idle_handing', 'talk_handing', 'blink']) text(clips[key], 'dave.clips.' + key)
    for (const key of ['sourceFps', 'transitionFps', 'talkFps', 'blinkFps', 'idleBlend', 'talkBlend', 'delay']) positiveFinite(dave[key], 'dave.' + key)
    pair(dave.blinkSeconds, 'dave.blinkSeconds'); pair(dave.talkLengths, 'dave.talkLengths')
    const bubble = record(dave.bubble, 'dave.bubble'), hand = record(dave.hand, 'dave.hand')
    text(bubble.sprite, 'dave.bubble.sprite')
    for (const key of ['x', 'y', 'textX', 'textY', 'continueX', 'continueY', 'shake']) finite(bubble[key], 'dave.bubble.' + key)
    positiveFinite(bubble.textWidth, 'dave.bubble.textWidth'); positiveFinite(bubble.textHeight, 'dave.bubble.textHeight')
    text(hand.reanim, 'dave.hand.reanim'); text(hand.track, 'dave.hand.track'); positiveFinite(hand.scale, 'dave.hand.scale')
    finite(hand.x, 'dave.hand.x'); finite(hand.y, 'dave.hand.y')
    const daveParts = record(dave.parts, 'dave.parts')
    text(daveParts.mouth, 'dave.parts.mouth'); texts(daveParts.eyes, 'dave.parts.eyes'); text(daveParts.head, 'dave.parts.head')
    for (const [key, value] of Object.entries(record(dave.mouths, 'dave.mouths'))) text(value, 'dave.mouths.' + key)
    for (const [id, entry] of Object.entries(record(data.boards ?? {}, 'presentation boards'))) {
        const board = record(entry, id), music = record(board.music, id + '.music'), over = record(board.gameOver, id + '.gameOver')
        text(board.background, id + '.background'); finite(board.backgroundX, id + '.backgroundX')
        if (board.plantShadow !== undefined) text(board.plantShadow, id + '.plantShadow')
        text(music.choosing, id + '.music.choosing'); text(music.gameplay, id + '.music.gameplay')
        texts(over.images, id + '.gameOver.images')
        if ((over.images as unknown[]).length !== 3) throw new TypeError(id + '.gameOver.images must contain three images')
        point(over.interior, id + '.gameOver.interior'); point(over.doorway, id + '.gameOver.doorway')
        for (const field of ['clipX', 'winnerY', 'panX']) finite(over[field], id + '.gameOver.' + field)
    }
    for (const [id, entry] of Object.entries(record(data.levels ?? {}, 'presentation levels'))) {
        const level = record(entry, id), intro = record(level.intro, id + '.intro')
        positiveFinite(intro.previewCapacity, id + '.intro.previewCapacity')
        if (!Number.isInteger(intro.previewCapacity)) throw new TypeError(id + '.intro.previewCapacity must be an integer')
        text(intro.sod, id + '.intro.sod')
        finite(intro.x, id + '.intro.x'); finite(intro.y, id + '.intro.y'); positiveFinite(intro.width, id + '.intro.width')
        if (intro.sourceX !== undefined) finite(intro.sourceX, id + '.intro.sourceX')
        if (typeof intro.readySetPlant !== 'boolean' || !Array.isArray(intro.rolls)) throw new TypeError(id + ' has invalid intro settings')
        for (const value of intro.rolls) {
            const roll = record(value, id + '.intro.rolls')
            for (const field of ['x', 'y', 'particleY']) finite(roll[field], id + '.intro.rolls.' + field)
        }
        if (intro.existingSod !== undefined) {
            const sod = record(intro.existingSod, id + '.intro.existingSod')
            text(sod.sprite, id + '.intro.existingSod.sprite'); point(sod, id + '.intro.existingSod')
        }
        record(level.advice, id + '.advice')
        if (level.adviceDuringIntro !== undefined && typeof level.adviceDuringIntro !== 'boolean') throw new TypeError(id + '.adviceDuringIntro must be boolean')
        if (level.adviceStyle !== undefined && level.adviceStyle !== 'hint-stay' && level.adviceStyle !== 'tutorial-level1-stay') throw new TypeError(id + '.adviceStyle is invalid')
        texts(level.seedGuideSteps, id + '.seedGuideSteps'); texts(level.lawnGuideSteps, id + '.lawnGuideSteps')
        if (level.seedGuideArrow !== undefined && level.seedGuideArrow !== false) throw new TypeError(id + '.seedGuideArrow can only be false')
        if (level.plantingLine !== undefined) {
            const line = record(level.plantingLine, id + '.plantingLine')
            text(line.sprite, id + '.plantingLine.sprite')
            if (!Array.isArray(line.offset) || line.offset.length !== 2) throw new TypeError(id + '.plantingLine.offset must be [x, y]')
            for (const value of line.offset) finite(value, id + '.plantingLine.offset')
            if (!Array.isArray(line.dialogs) || line.dialogs.some(dialog => !Number.isInteger(dialog))) throw new TypeError(id + '.plantingLine.dialogs must list dialog IDs')
        }
    }
    for (const [id, entry] of Object.entries(record(data.rules ?? {}, 'presentation rules'))) {
        const rule = record(entry, 'rules.' + id)
        if (rule.graveRise !== undefined) {
            const rise = record(rule.graveRise, 'rules.' + id + '.graveRise')
            text(rise.particle, 'rules.' + id + '.graveRise.particle'); sounds(rise.sounds, 'rules.' + id + '.graveRise.sounds', true)
        }
        if (rule.itemPadding !== undefined) {
            const padding = record(rule.itemPadding, 'rules.' + id + '.itemPadding')
            finite(padding.size, 'rules.' + id + '.itemPadding.size'); finite(padding.height, 'rules.' + id + '.itemPadding.height')
        }
    }
    for (const [id, entry] of Object.entries(record(data.awards ?? {}, 'presentation awards'))) {
        const award = record(entry, id)
        text(award.sprite, id + '.sprite'); positiveFinite(award.scale, id + '.scale')
        for (const field of ['x', 'y', 'pageY']) finite(award[field], id + '.' + field)
        if (award.pageImages !== undefined) {
            if (!Array.isArray(award.pageImages) || !award.pageImages.length) throw new TypeError(id + '.pageImages must not be empty')
            for (const value of award.pageImages) {
                const image = record(value, id + '.pageImages')
                text(image.sprite, id + '.pageImages.sprite'); point(image, id + '.pageImages')
                for (const field of ['width', 'height']) if (image[field] !== undefined) positiveFinite(image[field], id + '.pageImages.' + field)
            }
        }
    }
    for (const [id, entry] of Object.entries(record(data.items, 'presentation items'))) {
        const item = record(entry, id)
        if (item.view !== undefined) text(item.view, id + '.view')
        text(item.reanim, id + '.reanim'); pair(item.offset, id + '.offset'); range(item.rate, id + '.rate', true)
        if (item.flight !== undefined) { const flight = record(item.flight, id + '.flight'); text(flight.sprite, id + '.flight.sprite'); pair(flight.offset, id + '.flight.offset') }
        if (item.glow !== undefined) {
            const glow = record(item.glow, id + '.glow')
            text(glow.sprite, id + '.glow.sprite'); pair(glow.offset, id + '.glow.offset')
            if (glow.inFlight !== undefined && typeof glow.inFlight !== 'boolean') throw new TypeError(id + '.glow.inFlight must be boolean')
        }
        if (item.arrow !== undefined) { const arrow = record(item.arrow, id + '.arrow'); text(arrow.particle, id + '.arrow.particle'); pair(arrow.offset, id + '.arrow.offset') }
        for (const field of ['spawnSounds', 'landSounds', 'collectSounds']) sounds(item[field], id + '.' + field)
    }
    const plants = record(data.plants, 'presentation definitions.plants')
    const zombies = record(data.zombies, 'presentation definitions.zombies')
    for (const [id, entry] of Object.entries(plants)) {
        const plant = record(entry, id), visual = record(plant.visual, id + '.visual')
        if (plant.viewConfig !== undefined) record(plant.viewConfig, id + '.viewConfig')
        if (visual.packetPlant !== undefined) text(visual.packetPlant, id + '.visual.packetPlant')
        if (plant.shadow !== undefined) {
            point(plant.shadow, id + '.shadow')
            if ((plant.shadow as Record<string, unknown>).scale !== undefined) positiveFinite((plant.shadow as Record<string, unknown>).scale, id + '.shadow.scale')
        }
        positiveFinite(plant.scale, id + '.scale')
        if (plant.layer !== undefined && !isRenderLayer(plant.layer)) throw new TypeError(id + '.layer is not a render layer')
        if (plant.drawHeightOffset !== undefined) finite(plant.drawHeightOffset, id + '.drawHeightOffset')
        if (plant.pointerOffsetY !== undefined) finite(plant.pointerOffsetY, id + '.pointerOffsetY')
        if (plant.parts !== undefined) {
            const parts = record(plant.parts, id + '.parts')
            for (const key of Object.keys(parts)) if (!['eyes', 'face', 'prey'].includes(key)) throw new TypeError(id + '.parts.' + key + ' is not supported')
            if (parts.eyes !== undefined) texts(parts.eyes, id + '.parts.eyes')
            if (parts.face !== undefined) text(parts.face, id + '.parts.face')
            if (parts.prey !== undefined) texts(parts.prey, id + '.parts.prey')
        }
        text(visual.nameKey, id + '.visual.nameKey')
        if (visual.tooltipKey !== undefined) text(visual.tooltipKey, id + '.visual.tooltipKey')
        if (plant.view !== undefined) text(plant.view, id + '.view')
        const packet = plant.packet === undefined ? {} : record(plant.packet, id + '.packet')
        for (const [field, clips] of [['offBoard', plant.offBoard], ['packet.clips', packet.clips]] as const) {
            if (clips !== undefined) for (const [layer, clip] of Object.entries(record(clips, id + '.' + field))) text(clip, id + '.' + field + '.' + layer)
        }
        for (const key of ['x', 'y', 'time']) if (packet[key] !== undefined) finite(packet[key], id + '.packet.' + key)
        if (packet.scale !== undefined) positiveFinite(packet.scale, id + '.packet.scale')
        if (packet.placement !== undefined) placement(packet.placement, id + '.packet.placement')
        if (plant.almanacOffset !== undefined) pair(plant.almanacOffset, id + '.almanacOffset')
        if (plant.crackedFaces !== undefined) {
            if (!Array.isArray(plant.crackedFaces) || plant.crackedFaces.length !== 2) throw new TypeError(id + '.crackedFaces must be two sprites')
            texts(plant.crackedFaces, id + '.crackedFaces')
        }
        sounds(plant.plantedSounds, id + '.plantedSounds')
        sounds(plant.explosionSounds, id + '.explosionSounds')
        sounds(plant.fireSounds, id + '.fireSounds')
        if (plant.explosion !== undefined) {
            const explosion = record(plant.explosion, id + '.explosion')
            text(explosion.effect, id + '.explosion.effect'); finite(explosion.x, id + '.explosion.x')
            if (!isRenderLayer(explosion.layer)) throw new TypeError(id + '.explosion.layer is not a render layer')
        }
    }
    for (const [id, entry] of Object.entries(zombies)) {
        const zombie = record(entry, id), parts = record(zombie.parts, id + '.parts')
        text(zombie.nameKey, id + '.nameKey')
        text(zombie.damagedArmSprite, id + '.damagedArmSprite')
        if (zombie.enragedHead !== undefined) {
            const head = record(zombie.enragedHead, id + '.enragedHead')
            text(head.track, id + '.enragedHead.track')
            text(head.sprite, id + '.enragedHead.sprite')
        }
        sounds(zombie.enrageSounds, id + '.enrageSounds')
        if (zombie.view !== undefined) text(zombie.view, id + '.view')
        if (zombie.previewBlockedCells !== undefined) {
            if (!Array.isArray(zombie.previewBlockedCells)) throw new TypeError(id + '.previewBlockedCells must be an array')
            for (const value of zombie.previewBlockedCells) {
                const cell = record(value, id + '.previewBlockedCells[]')
                for (const key of ['column', 'row']) {
                    if (!Number.isInteger(cell[key]) || (cell[key] as number) < 0 || (cell[key] as number) > 4) {
                        throw new TypeError(id + '.previewBlockedCells[].' + key + ' must be an integer between 0 and 4')
                    }
                }
            }
        }
        point(zombie.shadow, id + '.shadow')
        if ((zombie.shadow as Record<string, unknown>).backwardsX !== undefined) finite((zombie.shadow as Record<string, unknown>).backwardsX, id + '.shadow.backwardsX')
        if (zombie.packet !== undefined) {
            const packet = record(zombie.packet, id + '.packet')
            finite(packet.x, id + '.packet.x'); finite(packet.y, id + '.packet.y'); positiveFinite(packet.scale, id + '.packet.scale')
            if (packet.clip !== undefined) text(packet.clip, id + '.packet.clip')
        }
        if (zombie.portrait !== undefined) {
            const portrait = record(zombie.portrait, id + '.portrait')
            finite(portrait.x, id + '.portrait.x'); finite(portrait.y, id + '.portrait.y'); positiveFinite(portrait.scale, id + '.portrait.scale')
        }
        for (const part of ['head', 'hair', 'tongue', 'arm', 'helms']) texts(parts[part], id + '.parts.' + part)
        text(parts.upperArm, id + '.parts.upperArm')
        text(parts.ground, id + '.parts.ground')
        if (parts.held !== undefined) texts(parts.held, id + '.parts.held')
        if (parts.flagArm !== undefined) {
            const flagArm = record(parts.flagArm, id + '.parts.flagArm')
            texts(flagArm.holding, id + '.parts.flagArm.holding')
            texts(flagArm.free, id + '.parts.flagArm.free')
            text(flagArm.front, id + '.parts.flagArm.front')
        }
        if (parts.shieldArms !== undefined) {
            const shieldArms = record(parts.shieldArms, id + '.parts.shieldArms')
            texts(shieldArms.holding, id + '.parts.shieldArms.holding')
            texts(shieldArms.free, id + '.parts.shieldArms.free')
            if (zombie.shield === undefined) throw new TypeError(id + '.parts.shieldArms requires a shield')
        }
        record(zombie.clips, id + '.clips')
        for (const [part, value] of Object.entries(record(zombie.drops, id + '.drops'))) {
            const drop = record(value, id + '.drops.' + part)
            text(drop.track, id + '.drops.' + part + '.track')
            text(drop.effect, id + '.drops.' + part + '.effect')
            pair(drop.offset, id + '.drops.' + part + '.offset')
            sounds(drop.sounds, id + '.drops.' + part + '.sounds')
        }
        for (const slot of ['helm', 'shield'] as const) {
            if (zombie[slot] === undefined) continue
            const name = `${id}.${slot}`
            const armor = record(zombie[slot], name)
            text(armor.track, name + '.track')
            text(armor.effect, name + '.effect')
            texts(armor.damagedSprites, name + '.damagedSprites')
            if ((armor.damagedSprites as string[]).length !== 2) throw new TypeError(name + '.damagedSprites must have two entries')
            if (!(parts.helms as string[]).includes(armor.track as string)) throw new TypeError(name + '.track is missing from parts.helms')
            pair(armor.offset, name + '.offset')
            if (slot === 'shield' && armor.showsHair !== undefined) throw new TypeError(name + '.showsHair is only for a helm')
            if (armor.showsHair !== undefined && typeof armor.showsHair !== 'boolean') throw new TypeError(name + '.showsHair must be boolean')
            if (armor.dropReanim !== undefined) {
                const reanim = record(armor.dropReanim, name + '.dropReanim')
                text(reanim.reanimId, name + '.dropReanim.reanimId')
                pair(reanim.offset, name + '.dropReanim.offset')
            }
            sounds(armor.impactSounds, name + '.impactSounds', true)
            if (armor.muffles !== undefined && armor.muffles !== true) throw new TypeError(name + '.muffles must be true')
            sounds(armor.bowlingImpactSounds, name + '.bowlingImpactSounds')
            sounds(armor.dropSounds, name + '.dropSounds')
        }
        if (zombie.helm !== undefined && zombie.shield !== undefined &&
            (zombie.helm as { track?: unknown }).track === (zombie.shield as { track?: unknown }).track) throw new TypeError(id + ' draws its helm and shield on one track')
    }
    if (!zombies['pvz:normal']) throw new TypeError('Missing normal zombie presentation')
    for (const id of Object.keys(plants)) if (Object.hasOwn(zombies, id)) throw new TypeError('Duplicate presentation target: ' + id)
    for (const [id, value] of Object.entries(record(data.gridItems, 'gridItems'))) {
        const item = record(value, id)
        text(item.view, id + '.view')
        if (!isRenderLayer(item.layer)) throw new TypeError(id + '.layer is not a render layer')
        if (item.offset !== undefined) finite(item.offset, id + '.offset')
    }
    for (const [id, value] of Object.entries(record(data.projectiles, 'projectiles'))) {
        const projectile = record(value, id)
        if (projectile.view !== undefined) text(projectile.view, id + '.view')
        if (projectile.viewConfig !== undefined) record(projectile.viewConfig, id + '.viewConfig')
        if ((projectile.sprite === undefined) === (projectile.reanim === undefined)) throw new TypeError(id + ' needs exactly one of sprite and reanim')
        if (projectile.sprite !== undefined) text(projectile.sprite, id + '.sprite')
        if (projectile.reanim !== undefined) {
            const reanim = record(projectile.reanim, id + '.reanim')
            text(reanim.id, id + '.reanim.id'); point(reanim, id + '.reanim')
            positiveFinite(reanim.scale, id + '.reanim.scale'); positiveFinite(reanim.rate, id + '.reanim.rate')
        }
        if (projectile.plantShadow !== undefined) point(projectile.plantShadow, id + '.plantShadow')
        if (projectile.layer !== undefined && !isRenderLayer(projectile.layer)) throw new TypeError(id + '.layer is not a render layer')
        if (projectile.shadow !== undefined) {
            const shadow = record(projectile.shadow, id + '.shadow')
            text(shadow.sprite, id + '.shadow.sprite'); point(shadow.offset, id + '.shadow.offset')
            positiveFinite(shadow.scale, id + '.shadow.scale')
            if (!Number.isInteger(shadow.columns) || (shadow.columns as number) < 1 || !Number.isInteger(shadow.cell)
                || (shadow.cell as number) < 0 || (shadow.cell as number) >= (shadow.columns as number)) throw new TypeError(id + '.shadow has invalid atlas cells')
        }
        if (projectile.impact !== undefined) {
            const impact = record(projectile.impact, id + '.impact')
            text(impact.id, id + '.impact.id')
            if (impact.shotOffset !== undefined) pair(impact.shotOffset, id + '.impact.shotOffset')
            if (impact.lobOffset !== undefined) pair(impact.lobOffset, id + '.impact.lobOffset')
            if (impact.free !== undefined && impact.free !== true) throw new TypeError(id + '.impact.free must be true')
            if (!impact.free || impact.yRange !== undefined) range(impact.yRange, id + '.impact.yRange', true)
        }
        if (projectile.trail !== undefined) {
            const trail = record(projectile.trail, id + '.trail')
            text(trail.id, id + '.trail.id')
            point(trail, id + '.trail')
        }
        sounds(projectile.fireSounds, id + '.fireSounds', true)
        sounds(projectile.impactSounds, id + '.impactSounds', true)
        if (projectile.loud !== undefined && projectile.loud !== true) throw new TypeError(id + '.loud must be true')
    }
    const packets = record(data.seedPackets, 'seedPackets')
    const flash = record(packets.flash, 'seedPackets.flash')
    text(flash.id, 'seedPackets.flash.id')
    const selection = record(packets.selection, 'seedPackets.selection')
    if (!Array.isArray(selection.color) || selection.color.length !== 3 || selection.color.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new TypeError('Invalid seedPackets.selection.color')
    placement(packets.defaultPlacement, 'seedPackets.defaultPlacement')
    placement(packets.grave, 'seedPackets.grave')
    return data as unknown as PresentationDefinitions
}

function text(value: unknown, name: string): void {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(name + ' must be a non-empty string')
}

function parseMainMenu(menu: Record<string, unknown>): void {
    if (!Array.isArray(menu.buttons) || menu.buttons.length === 0) throw new TypeError('mainMenu.buttons must be a non-empty array')
    const names = new Set<string>()
    for (const [index, entry] of menu.buttons.entries()) {
        const name = 'mainMenu.buttons[' + index + ']', button = record(entry, name)
        for (const key of ['name', 'track', 'image', 'highlight']) text(button[key], name + '.' + key)
        if (names.has(button.name as string)) throw new TypeError(name + '.name is duplicated')
        names.add(button.name as string)
        if (button.target !== undefined) text(button.target, name + '.target')
        for (const key of ['replace', 'sign', 'mode']) if (button[key] !== undefined && typeof button[key] !== 'boolean') throw new TypeError(name + '.' + key + ' must be a boolean')
        for (const key of ['x', 'y', 'imageX', 'imageY']) if (button[key] !== undefined) finite(button[key], name + '.' + key)
        for (const key of ['width', 'height']) if (button[key] !== undefined) positiveFinite(button[key], name + '.' + key)
        if (button.polygon !== undefined) {
            if (!Array.isArray(button.polygon) || button.polygon.length < 3) throw new TypeError(name + '.polygon needs three points')
            button.polygon.forEach(point => pair(point, name + '.polygon[]'))
        }
    }
    texts(menu.images, 'mainMenu.images'); texts(menu.clouds, 'mainMenu.clouds')
    if (!Array.isArray(menu.flowers)) throw new TypeError('mainMenu.flowers must be an array')
    menu.flowers.forEach(flower => point(record(flower, 'mainMenu.flowers[]'), 'mainMenu.flowers[]'))
    const tracks = record(menu.tracks, 'mainMenu.tracks')
    for (const key of ['sky', 'anchor', 'profileSign']) text(tracks[key], 'mainMenu.tracks.' + key)
    texts(tracks.replaced, 'mainMenu.tracks.replaced'); texts(tracks.handRocks, 'mainMenu.tracks.handRocks')
    const keyShadow = record(menu.keyShadow, 'mainMenu.keyShadow')
    for (const key of ['track', 'almanac', 'store']) text(keyShadow[key], 'mainMenu.keyShadow.' + key)
    const trophy = record(menu.trophy, 'mainMenu.trophy')
    for (const key of ['track', 'image', 'particle']) text(trophy[key], 'mainMenu.trophy.' + key)
    const start = record(menu.startAdventure, 'mainMenu.startAdventure')
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

function placement(value: unknown, name: string): void {
    const source = record(value, name)
    positiveFinite(source.scale, name + '.scale')
    finite(source.offsetX, name + '.offsetX')
    finite(source.offsetY, name + '.offsetY')
}

function sounds(value: unknown, name: string, required = false): void {
    if (value === undefined && !required) return
    if (!Array.isArray(value)) throw new TypeError(name + ' must be an array')
    for (const entry of value) {
        const sound = record(entry, name)
        // A sound names its owner like any other resource: pvz:splat, corn:shoop.
        if (!isQualifiedId(sound.audio)) throw new TypeError(name + '.audio must be a qualified ID')
        if (typeof sound.foley !== 'boolean') throw new TypeError(name + '.foley must be boolean')
        // A negative range lowers the pitch, like FOLEY_NEWSPAPER_RIP's -2 (TodFoley).
        if (sound.pitchRange !== undefined) finite(sound.pitchRange, name + '.pitchRange')
    }
}

function range(value: unknown, name: string, fractional = false): void {
    if (!Array.isArray(value) || value.length !== 2 || value.some(v => !Number.isFinite(v) || v < 0 || (!fractional && !Number.isInteger(v))) || value[0] > value[1]) {
        throw new TypeError(name + ' must be an ordered range')
    }
}

function point(value: unknown, name: string): void {
    const point = record(value, name)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError(name + ' must be a finite point')
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
