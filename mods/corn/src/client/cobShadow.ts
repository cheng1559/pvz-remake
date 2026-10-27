import type { Context } from './index.js'

interface ShadowConfig {
    sprite: string; columns: number; cell: number
    offset: { x: number, y: number }; stretch: number; maxHeight: number
}

/** Projectile::DrawShadow: a ground sprite, independent of the cob's rotation and altitude. */
export function registerCobShadow(host: Context['host'], content: () => Promise<any>, projectileId: string, config: ShadowConfig): () => Promise<void> {
    const { Sprite, SpriteFrame, isValid } = host.get('cc')
    const { uiNode } = host.get('client/view/uiNode')
    const { getAtlasFrame } = host.get('client/hud/SeedPacketRenderer')
    const { LevelEntityRenderer } = host.get('client/level/LevelEntityRenderer')
    const states = new WeakMap<object, { layer: any, nodes: Map<number, any>, loading?: Promise<void> }>()
    let frame: any, pending: Promise<void> | undefined
    const preload = () => pending ??= content().then(async (game: any) => {
        const atlas = await game.loader.load(game.registry.resolve('sprites', config.sprite), SpriteFrame)
        frame = getAtlasFrame(atlas, config.cell, atlas.originalSize.width / config.columns, atlas.originalSize.height, config.columns)
    })
    const sync = (renderer: any, snapshot: any) => {
        const poses = snapshot.extensions['corn:cob_flight'] ?? {}
        const projectiles = snapshot.projectiles.filter((projectile: any) => projectile.typeId === projectileId && poses[projectile.entityId])
        let state = states.get(renderer)
        if (!projectiles.length) {
            if (state) { state.layer.active = false; state.layer.destroy(); states.delete(renderer) }
            return
        }
        if (!state) {
            state = { layer: uiNode({ name: 'CobShadows', parent: renderer.entityLayer, active: false }).node, nodes: new Map() }
            states.set(renderer, state)
        }
        if (!frame) {
            state.loading ??= preload().then(() => {
                if (isValid(renderer.entityLayer, true)) sync(renderer, renderer.lastSnapshot ?? snapshot)
            }).catch((error: unknown) => console.error('[Corn] Failed to load cob shadow', error))
            return
        }
        const board = renderer.content.definitions.boards[renderer.content.levels.levels[snapshot.levelId].board]
        const live = new Set(projectiles.map((projectile: any) => projectile.entityId))
        for (const [id, node] of state.nodes) if (!live.has(id)) { node.active = false; node.destroy(); state.nodes.delete(id) }
        for (const projectile of projectiles) {
            let node = state.nodes.get(projectile.entityId)
            if (!node) {
                node = uiNode({ name: 'CobShadow', parent: state.layer, active: false, anchor: { x: 0, y: 1 },
                    sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
                state.nodes.set(projectile.entityId, node)
            }
            const height = Math.max(0, Math.min(config.maxHeight, -poses[projectile.entityId].z))
            const scale = config.maxHeight / (height + config.maxHeight)
            node.setPosition(projectile.x + config.offset.x - 400, 300 - (board.origin.y + projectile.row * board.cell.height + config.offset.y))
            node.setScale(scale * config.stretch, scale, 1)
            node.active = true
        }
        projectiles.sort((a: any, b: any) => a.row - b.row || a.entityId - b.entityId)
            .forEach((projectile: any, index: number) => state!.nodes.get(projectile.entityId).setSiblingIndex(index))
        state.layer.active = true
        // RENDER_LAYER_GROUND precedes plants/projectiles in every row.
        state.layer.setSiblingIndex(0)
    }
    host.around(LevelEntityRenderer.prototype, 'sync', function (next, snapshot, ...rest) {
        next(snapshot, ...rest)
        sync(this, snapshot)
    })
    return preload
}
