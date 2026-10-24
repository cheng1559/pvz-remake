import type { MusicTuneId } from './music'

export interface ClientAnimationClip {
    readonly reanimId: string
    readonly rateScale: number
    readonly x: number
    readonly y: number
    readonly attachmentTrackId?: string
    readonly fps?: number
}

export interface AnimationDefinition { readonly [slot: string]: ClientAnimationClip }

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
    readonly preview?: number
    readonly tint?: readonly [number, number, number]
}

export interface PlantPresentationDefinition {
    readonly rowOrder?: number
    readonly shadow: { readonly x: number; readonly y: number }
    readonly scale: number
    readonly visual: PlantVisual
    readonly packetVisibleTracks?: readonly string[]
    readonly view?: PlantViewKind
    readonly animationTarget?: ClientAnimationTarget
    readonly animations?: ClientAnimationDefinitions[ClientAnimationTarget]
    readonly chewParticle?: string
    readonly explosion?: { readonly effect: string; readonly x: number; readonly rowOrder: boolean }
    readonly plantedSounds?: readonly PresentationSound[]
    readonly explosionSounds?: readonly PresentationSound[]
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
    readonly sprite: string
    readonly trail?: { readonly effect: string; readonly x: number; readonly y: number }
    readonly impact?: {
        readonly kind: 'particle' | 'tod'
        readonly id: string
        readonly offset: readonly [number, number]
        readonly yRange: readonly [number, number]
        readonly duration?: number
    }
    readonly fireSounds: readonly PresentationSound[]
    readonly impactSounds: readonly PresentationSound[]
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
    readonly view?: string
    readonly animationTarget: ClientAnimationTarget
    readonly animations: ClientAnimationDefinitions[ClientAnimationTarget]
    readonly shadowX: number
    readonly arm: { readonly lower: string; readonly hand: string; readonly upper: string }
    readonly damagedArm: 'damagedArm' | 'poleVaulterDamagedArm'
    readonly heldTracks?: readonly string[]
    readonly flag?: boolean
    readonly vault?: boolean
    readonly drops: Readonly<Partial<Record<'head' | 'arm' | 'flag', ZombieDrop>>>
    readonly helmTracks: readonly string[]
    readonly helm?: { readonly track: string; readonly damagedSprites: readonly [string, string]; readonly effect: string; readonly offset: readonly [number, number]; readonly impactSounds: readonly PresentationSound[]; readonly bowlingImpactSounds?: readonly PresentationSound[] }
}

export type NutBlinkSlot = 'blinkTwitch' | 'blinkTwice' | 'blinkThrice'
export interface AdventureIntroLayout {
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
export interface AwardPresentationDefinition {
    readonly sprite: string
    readonly scale: number
    readonly x: number
    readonly y: number
    readonly pageY: number
}
const VIEW_SLOTS: Readonly<Record<string, readonly string[]>> = {
    bowling: ['body', 'blinkTwitch', 'blinkTwice', 'blinkThrice'],
    shooter: ['body', 'idleHead', 'shootHead', 'blink'],
    sunflower: ['body', 'blink'],
    cherrybomb: ['idle', 'explode'],
    wallnut: ['body', 'blinkTwitch', 'blinkTwice', 'blinkThrice'],
    potatomine: ['buried', 'rise', 'armed', 'blink', 'glow'],
    chomper: ['idle', 'bite', 'chew', 'swallow'],
}
export interface PresentationDefinitions {
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
        readonly mouths: Readonly<Record<string, string>>
    }
    readonly boards?: Readonly<Record<string, BoardPresentation>>
    readonly levels?: Readonly<Record<string, LevelPresentationDefinition>>
    readonly awards?: Readonly<Record<string, AwardPresentationDefinition>>
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
        readonly flash: { readonly id: string; readonly duration: number }
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
        if (typeof visual.seedType !== 'string' && typeof visual.seedType !== 'number') throw new TypeError(id + '.seedType is invalid')
        if (visual.preview !== undefined && (!Number.isInteger(visual.preview) || (visual.preview as number) < 0)) throw new TypeError(id + '.preview is invalid')
        point(plant.shadow, id + '.shadow')
        positive(plant.scale, id + '.scale')
        if (plant.rowOrder !== undefined) finite(plant.rowOrder, id + '.rowOrder')
        if (plant.packetVisibleTracks !== undefined) texts(plant.packetVisibleTracks, id + '.packetVisibleTracks')
        if (visual.nameKey !== undefined) text(visual.nameKey, id + '.visual.nameKey')
        if (plant.view !== undefined) text(plant.view, id + '.view')
        if (plant.animationTarget !== undefined) text(plant.animationTarget, id + '.animationTarget')
        if (typeof plant.view === 'string' && VIEW_SLOTS[plant.view] && !plant.animationTarget) throw new TypeError(id + '.animationTarget is missing')
        sounds(plant.plantedSounds, id + '.plantedSounds')
        sounds(plant.explosionSounds, id + '.explosionSounds')
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
        const zombie = object(entry, id), arm = object(zombie.arm, id + '.arm')
        if (zombie.view !== undefined) text(zombie.view, id + '.view')
        if (typeof zombie.animationTarget !== 'string' || !Number.isFinite(zombie.shadowX)) throw new TypeError(id + ' has invalid presentation')
        for (const track of ['lower', 'upper', 'hand']) if (typeof arm[track] !== 'string') throw new TypeError(id + '.arm.' + track + ' is invalid')
        object(zombie.animations, id + '.animations')
        if (zombie.damagedArm !== 'damagedArm' && zombie.damagedArm !== 'poleVaulterDamagedArm') throw new TypeError(id + '.damagedArm is invalid')
        texts(zombie.helmTracks, id + '.helmTracks')
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
            if (!(zombie.helmTracks as string[]).includes(helm.track as string)) throw new TypeError(id + '.helm.track is missing from helmTracks')
            pair(helm.offset, id + '.helm.offset')
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
        text(projectile.sprite, id + '.sprite')
        if (projectile.impact !== undefined) {
            const impact = object(projectile.impact, id + '.impact')
            if (impact.kind !== 'particle' && impact.kind !== 'tod') throw new TypeError(id + '.impact.kind is invalid')
            text(impact.id, id + '.impact.id')
            pair(impact.offset, id + '.impact.offset')
            range(impact.yRange, id + '.impact.yRange', true)
            if (impact.kind === 'particle') positive(impact.duration, id + '.impact.duration')
        }
        if (projectile.trail !== undefined) {
            const trail = object(projectile.trail, id + '.trail')
            text(trail.effect, id + '.trail.effect')
            point(trail, id + '.trail')
        }
        sounds(projectile.fireSounds, id + '.fireSounds', true)
        sounds(projectile.impactSounds, id + '.impactSounds', true)
    }
    const packets = object(data.seedPackets, 'seedPackets')
    const flash = object(packets.flash, 'seedPackets.flash')
    text(flash.id, 'seedPackets.flash.id'); positive(flash.duration, 'seedPackets.flash.duration')
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
