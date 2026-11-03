import { modResources } from '@/client/content/ModResources'
import { isValid, JsonAsset, Sprite, type Node, type SpriteFrame } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { uiNode } from '@/client/view/uiNode'
import { ReanimPlayer } from './ReanimPlayer'
import { displayPartState, hiddenZombieParts } from '@/client/zombies/zombieParts'
import { type ClientAnimationClip, type ClientAnimationRegistry, type ClientAnimationTarget } from '@/client/content/ClientAnimationRegistry'

export type EntityKind = 'plants' | 'zombies'
export interface DisplayPart {
    name: string, id: string, fps: number, parent?: string, track?: string, behind?: string, blink?: boolean
    socket?: boolean, offset?: [number, number], scale?: number, rate?: number, packetId?: string, idle2Id?: string
    /** Exact track IDs. */
    hiddenTracks?: string[]
    packetVisibleTracks?: readonly string[]
    /** A blink part hides these exact tracks of its parent while it plays (Plant::DoBlink). */
    eyeTracks?: readonly string[]
    rateScale?: number, idle2RateScale?: number
}
export interface EntityDisplay {
    parts: DisplayPart[], offset: [number, number], rate: readonly [number, number], scale?: number, shadow: boolean
    drawOffset?: [number, number], shadowOffset?: [number, number], shadowScale?: number, motion?: 'pogo' | 'bungee'
    packetOffset?: [number, number], packetScale?: number
    packetTimeRatio?: number
    nutBlink?: boolean
    portrait?: { offset: [number, number], scale: number, parts?: DisplayPart[] }
}
export type EntityDisplayLayout = Omit<EntityDisplay, 'parts' | 'rate' | 'portrait'> & {
    /** The plant or zombie whose level clips the display plays. */
    animationsFrom?: ClientAnimationTarget, parts?: DisplayPart[], rate?: readonly [number, number]
    portrait?: { offset: [number, number], scale: number, parts?: Array<Partial<DisplayPart> & { name: string }> }
}
let assets: ReturnType<typeof loadAssets> | undefined

async function loadAssets() {
    const [content, data] = await Promise.all([
        loadIntegratedGameContent(), modResources.asset('pvz:almanac-animations', JsonAsset),
    ])
    if (!data) throw new Error('Missing entity display catalog; rebuild almanac assets')
    const catalog = data.json as Record<EntityKind, EntityDisplayLayout[]>
    return { content, catalog: {
        plants: catalog.plants.map((entry, id) => resolveEntityDisplay('plants', id, entry, content.animations)),
        zombies: catalog.zombies.map((entry, id) => resolveEntityDisplay('zombies', id, entry, content.animations)),
    } }
}

/** A display part playing one of the level's clips. */
function clipPart(name: string, clip: ClientAnimationClip, parent?: string, blink = false, eyeTracks?: readonly string[]): DisplayPart {
    return {
        name, id: clip.reanimId, fps: clip.fps ?? 12, rateScale: clip.rateScale, parent, blink,
        track: clip.attachmentTrackId, ...(blink && eyeTracks ? { eyeTracks } : {}),
    }
}

/**
 * A whole zombie at rest (the almanac, a zombie seed's packet and previews), with the level's part rules: its own helm
 * and shield worn, the flag held. `clip` is the body's pose, `idle` by default. `offset` is where the body goes from the
 * zombie's position, as ZombieView places its clip.
 */
export function zombieRestingParts(animations: ClientAnimationRegistry, typeId: string, clip = 'idle'): { parts: DisplayPart[], offset: [number, number] } {
    const clips = animations.resolve(typeId)
    const definition = animations.definitions.zombies[typeId]
    const pose = (clips as Record<string, ClientAnimationClip | undefined>)[clip]
    if (!pose) throw new Error(`Missing zombie ${clip}: ${typeId}`)
    const body: DisplayPart = { ...clipPart('body', pose), hiddenTracks: hiddenZombieParts(definition, displayPartState(definition, 'flag' in clips)) }
    if ('idle2' in clips && clip === 'idle') {
        body.idle2Id = clips.idle2.reanimId
        body.idle2RateScale = clips.idle2.rateScale
    }
    const parts = [body]
    if ('flag' in clips) parts.push({ ...clipPart('flag', clips.flag, 'body'), behind: definition.parts.flagArm!.front })
    return { parts, offset: [pose.x, pose.y] }
}

/** Use level clips, attachments and shadows; keep the catalog's UI placement and display-only poses. */
export function resolveEntityDisplay(kind: EntityKind, id: number, display: EntityDisplayLayout, animations: ClientAnimationRegistry): EntityDisplay {
    const target = display.animationsFrom
    if (!target) {
        if (!display.parts || !display.rate) throw new Error(`Missing display animation: ${kind} ${id}`)
        return display as EntityDisplay
    }
    const clips = animations.resolve(target)
    const eyeTracks = kind === 'plants' ? animations.definitions.plants[target]?.parts?.eyes : undefined
    const part = (name: string, clip: ClientAnimationClip, parent?: string, blink = false) => clipPart(name, clip, parent, blink, eyeTracks)
    let parts: DisplayPart[]
    let rate: readonly [number, number]
    let drawOffset: [number, number]
    let scale = 1
    let shadowOffset: [number, number]
    let shadowScale = 1
    if (kind === 'plants') {
        const body = 'body' in clips ? clips.body : 'armed' in clips ? clips.armed : clips.idle
        const definition = animations.definitions.plants[target]
        const { shadow } = definition
        drawOffset = [body.x, -body.y]
        scale = definition.scale
        shadowOffset = [shadow.x, -shadow.y]
        shadowScale = shadow.scale ?? 1
        parts = [part('body', body)]
        rate = 'idleHead' in clips ? animations.rates.shooterIdle : animations.rates.plantIdle
        if ('idleHead' in clips) parts.push(part('head', clips.idleHead, 'body'), part('face', clips.blink, 'head', true))
        else if ('blinkTwitch' in clips) {
            for (const name of Object.keys(animations.nutBlinkWeights)) parts.push(part(name, clips[name as 'blinkTwitch' | 'blinkTwice' | 'blinkThrice'], 'body', true))
        } else if ('blink' in clips) parts.push(part('face', clips.blink, 'body', true))
        if ('armed' in clips) rate = [12, 12]
        // Plant::DrawSeedPacket shows the potato mine's light; the almanac draws it unlit.
        const glow = definition.parts?.glow
        if (glow) { parts[0].hiddenTracks = [...glow]; parts[0].packetVisibleTracks = glow }
        // The sun-shroom's packet shows the small one, while the almanac shows it grown.
        if ('small' in clips) parts[0].packetId = clips.small.reanimId
    } else {
        const definition = animations.definitions.zombies[target]
        shadowOffset = [definition.shadowX, definition.shadowY ?? 92]
        const [originX, originY] = animations.definitions.almanac.zombieOrigin.offset
        const resting = zombieRestingParts(animations, target)
        drawOffset = [resting.offset[0] - originX, originY - resting.offset[1]]
        parts = resting.parts
        rate = animations.rates.zombieIdle
    }
    // Portraits can have a different pose/order, but shared parts still resolve through the registry.
    const portrait = display.portrait?.parts ? { ...display.portrait, parts: display.portrait.parts.map(part => {
        const shared = parts.find(candidate => candidate.name === part.name)
        if (!shared) throw new Error(`Missing portrait part: ${target}.${part.name}`)
        return { ...shared, parent: undefined, track: undefined, behind: undefined, ...part }
    }) } : display.portrait
    return { ...display, parts, rate, drawOffset, scale, shadowOffset, shadowScale, portrait: portrait as EntityDisplay['portrait'], nutBlink: 'blinkTwitch' in clips }
}

export function loadEntityDisplayAssets() {
    return assets ??= loadAssets().catch(error => { assets = undefined; throw error })
}

export function drawBungeeCord(parent: Node, frame: SpriteFrame, x: number, y: number, height: number): Node {
    const node = uiNode({ name: 'BungeeCord', parent, position: { x, y } }).node
    node.setSiblingIndex(0)
    for (let offset = 0; offset < height; offset += frame.originalSize.height) uiNode({
        name: 'Cord', parent: node, position: { x: 0, y: offset }, anchor: { x: 0, y: 0 },
        sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false },
    })
    return node
}

/** Shared animation assembly for animated portraits and static seed packet poses. */
export async function loadDisplayParts(parent: Node, parts: DisplayPart[], content: Awaited<ReturnType<typeof loadIntegratedGameContent>>) {
    const players = new Map(parts.map(part => [part.name,
        uiNode({ name: part.name, parent }).node.addComponent(ReanimPlayer),
    ]))
    await Promise.all(parts.map(part => players.get(part.name)!.load(part.id, content.registry, content.loader)))
    if (!isValid(parent, true)) return null
    for (const part of parts) {
        const player = players.get(part.name)!
        if (!part.parent && part.offset) player.node.setPosition(part.offset[0], -part.offset[1])
        player.setTracksVisible(part.hiddenTracks ?? [], false)
        if (part.parent && part.track) {
            const body = players.get(part.parent)!
            if (part.socket) {
                player.node.setParent(body.getTrackNode(part.track)!)
                player.node.setPosition(...part.offset!, 0)
                player.node.setScale(part.scale ?? 1, part.scale ?? 1, 1)
            } else player.attachToTrack(body, part.track)
            if (part.behind) body.drawAfterTrack(player.node, part.behind)
        }
        if (part.blink) player.hide()
    }
    return players
}
