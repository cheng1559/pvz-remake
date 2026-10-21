import { isValid, JsonAsset, Sprite, type Node, type SpriteFrame } from 'cc'
import { AssetLoader } from '@/client/content/LegacyAssetLoader'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { uiNode } from '@/client/view/uiNode'
import { ReanimPlayer } from './ReanimPlayer'

export type EntityKind = 'plants' | 'zombies'
export interface DisplayPart {
    name: string, id: string, fps: number, parent?: string, track?: string, behind?: string, blink?: boolean
    socket?: boolean, offset?: [number, number], scale?: number, rate?: number, packetId?: string, idle2Id?: string
    hiddenTracks?: string[]
}
export interface EntityDisplay {
    parts: DisplayPart[], offset: [number, number], rate: [number, number], scale?: number, shadow: boolean
    drawOffset?: [number, number], shadowOffset?: [number, number], shadowScale?: number, motion?: 'pogo' | 'bungee'
    packetOffset?: [number, number], packetScale?: number
    portrait?: { offset: [number, number], scale: number, parts?: DisplayPart[] }
}
let assets: ReturnType<typeof loadAssets> | undefined

async function loadAssets() {
    const [content, data] = await Promise.all([
        loadIntegratedGameContent(), AssetLoader.load<JsonAsset>('almanac-animations', JsonAsset),
    ])
    if (!data) throw new Error('Missing entity display catalog; rebuild almanac assets')
    return { content, catalog: data.json as Record<EntityKind, EntityDisplay[]> }
}

export function loadEntityDisplayAssets() {
    return assets ??= loadAssets().catch(error => { assets = undefined; throw error })
}

export function drawBungeeCord(parent: Node, frame: SpriteFrame, x: number, y = 0): Node {
    const node = uiNode({ name: 'BungeeCord', parent, position: { x, y } }).node
    node.setSiblingIndex(0)
    for (let offset = 0; offset < 600; offset += frame.originalSize.height) uiNode({
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
