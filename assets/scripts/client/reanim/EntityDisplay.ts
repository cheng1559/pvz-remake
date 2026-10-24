import { isValid, JsonAsset, Sprite, type Node, type SpriteFrame } from 'cc'
import { AssetLoader } from '@/client/content/LegacyAssetLoader'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { uiNode } from '@/client/view/uiNode'
import { ReanimPlayer } from './ReanimPlayer'
import { type ClientAnimationClip, type ClientAnimationRegistry, type ClientAnimationTarget } from '@/client/content/ClientAnimationRegistry'

export type EntityKind = 'plants' | 'zombies'
export interface DisplayPart {
    name: string, id: string, fps: number, parent?: string, track?: string, behind?: string, blink?: boolean
    socket?: boolean, offset?: [number, number], scale?: number, rate?: number, packetId?: string, idle2Id?: string
    hiddenTracks?: string[]
    packetVisibleTracks?: readonly string[]
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
    animationTarget?: ClientAnimationTarget, parts?: DisplayPart[], rate?: readonly [number, number]
    portrait?: { offset: [number, number], scale: number, parts?: Array<Partial<DisplayPart> & { name: string }> }
}
let assets: ReturnType<typeof loadAssets> | undefined

async function loadAssets() {
    const [content, data] = await Promise.all([
        loadIntegratedGameContent(), AssetLoader.load<JsonAsset>('almanac-animations', JsonAsset),
    ])
    if (!data) throw new Error('Missing entity display catalog; rebuild almanac assets')
    const catalog = data.json as Record<EntityKind, EntityDisplayLayout[]>
    return { content, catalog: {
        plants: catalog.plants.map((entry, id) => resolveEntityDisplay('plants', id, entry, content.animations)),
        zombies: catalog.zombies.map((entry, id) => resolveEntityDisplay('zombies', id, entry, content.animations)),
    } }
}

/** Use level clips and attachments; keep the catalog's UI placement and display-only poses. */
export function resolveEntityDisplay(kind: EntityKind, id: number, display: EntityDisplayLayout, animations: ClientAnimationRegistry): EntityDisplay {
    const target = display.animationTarget
    if (!target) {
        if (!display.parts || !display.rate) throw new Error(`Missing display animation: ${kind} ${id}`)
        return display as EntityDisplay
    }
    const clips = animations.resolve(target)
    const part = (name: string, clip: ClientAnimationClip, parent?: string, blink = false): DisplayPart => ({
        name, id: clip.reanimId, fps: clip.fps ?? 12, rateScale: clip.rateScale, parent, blink,
        track: clip.attachmentTrackId,
    })
    let parts: DisplayPart[]
    let rate: readonly [number, number]
    if (kind === 'plants') {
        const body = 'body' in clips ? clips.body : 'armed' in clips ? clips.armed : clips.idle
        parts = [part('body', body)]
        rate = 'idleHead' in clips ? animations.rates.shooterIdle : animations.rates.plantIdle
        if ('idleHead' in clips) parts.push(part('head', clips.idleHead, 'body'), part('face', clips.blink, 'head', true))
        else if ('blinkTwitch' in clips) {
            for (const name of Object.keys(animations.nutBlinkWeights)) parts.push(part(name, clips[name as 'blinkTwitch' | 'blinkTwice' | 'blinkThrice'], 'body', true))
        } else if ('blink' in clips) parts.push(part('face', clips.blink, 'body', true))
        if ('armed' in clips) { parts[0].hiddenTracks = ['anim_glow']; rate = [12, 12] }
        parts[0].packetVisibleTracks = animations.definitions.plants[target]?.packetVisibleTracks
    } else {
        if (!('idle' in clips)) throw new Error(`Missing zombie idle: ${target}`)
        parts = [part('body', clips.idle)]
        rate = animations.rates.zombieIdle
        parts[0].hiddenTracks = ['anim_tongue']
        if ('idle2' in clips) {
            parts[0].idle2Id = clips.idle2.reanimId
            parts[0].idle2RateScale = clips.idle2.rateScale
        }
        if ('flag' in clips) {
            parts.push({ ...part('flag', clips.flag, 'body'), behind: 'Zombie_innerarm_screendoor' })
        }
    }
    // Portraits can have a different pose/order, but shared parts still resolve through the registry.
    const portrait = display.portrait?.parts ? { ...display.portrait, parts: display.portrait.parts.map(part => {
        const shared = parts.find(candidate => candidate.name === part.name)
        if (!shared) throw new Error(`Missing portrait part: ${target}.${part.name}`)
        return { ...shared, parent: undefined, track: undefined, behind: undefined, ...part }
    }) } : display.portrait
    return { ...display, parts, rate, portrait: portrait as EntityDisplay['portrait'], nutBlink: 'blinkTwitch' in clips }
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
        for (const track of part.hiddenTracks ?? []) player.setTrackPrefixVisible(track, false)
        if (part.parent && part.track) {
            const body = players.get(part.parent)!
            if (part.socket) {
                player.node.setParent(body.getTrackNode(part.track)!)
                player.node.setPosition(...part.offset!, 0)
                player.node.setScale(part.scale ?? 1, part.scale ?? 1, 1)
            } else player.attachToTrack(body, part.track)
            if (part.behind) {
                player.node.setParent(body.node)
                const track = body.getTrackNode(part.behind)
                if (track) player.node.setSiblingIndex(track.getSiblingIndex() + 1)
            }
        }
        if (part.blink) player.hide()
    }
    return players
}
