import type { ClientApi } from './index.js'

/** Ultimate's original cover animations, played once and held at rate 10 on zombie spawn. */
export function installBattleBushes(api: ClientApi): (slots: any, content: any) => Promise<void> {
    const { uiNode } = api.host.get('client/view/uiNode')
    const { ReanimPlayer } = api.host.get('client/reanim/ReanimPlayer')
    const { LevelEntityRenderer } = api.host.get('client/level/LevelEntityRenderer')
    const layers = new WeakMap<object, {
        entries: Array<{ node: any; order: number }>
        players: any[]
        starts: Array<number | undefined>
        tick: number
    }>()
    const resetClock = (state: NonNullable<ReturnType<typeof layers.get>>, tick: number) => {
        if (tick < state.tick) {
            state.starts.fill(undefined)
            for (const player of state.players) player.seek(0)
        }
        state.tick = tick
    }
    api.host.around(LevelEntityRenderer.prototype, 'sync', function (next, snapshot, changes, events) {
        const state = layers.get(this.entityLayer)
        if (state) {
            resetClock(state, snapshot.gameplayTick)
            // Board.AddZombieInRow replays the row's rustle, excluding bungees.
            for (const event of events) if (event.type === 'zombieSpawned' && event.data.typeId !== 'pvz:bungee') {
                const row = event.data.row
                if (Number.isInteger(row) && state.players[row]) state.starts[row] = snapshot.gameplayTick
            }
        }
        return next(snapshot, changes, events)
    })
    api.host.around(LevelEntityRenderer.prototype, 'collectLayerEntries', function (next, snapshot) {
        const entries = next(snapshot), state = layers.get(this.entityLayer)
        if (!state) return entries
        resetClock(state, snapshot.gameplayTick)
        state.players.forEach((player, row) => {
            const start = state.starts[row]
            if (start === undefined) return
            // Native clips are authored at 12fps and PlayReanim uses an absolute rate of 10.
            const time = (snapshot.gameplayTick - start) / 100 * (10 / 12)
            player.seek(Math.min(time, player.lastFrameTimeSeconds))
            if (time >= player.lastFrameTimeSeconds) state.starts[row] = undefined
        })
        entries.push(...state.entries)
        // The street previews share the entity layer; their z encodes the original grid row.
        for (const node of this.entityLayer.children) if (node.name.startsWith('IntroZombie-')) {
            entries.push({ node, order: Math.floor((node.position.z - 100) / 4) * 10 + 1 })
        }
        return entries
    })

    return async (slots, content) => {
        // GameConstants.gCoverInfos and Board.InitCoverLayer, expressed in this game's board coordinates.
        // Ultimate's BOARD_EXTRA_ROOM shifts its whole board; this game keeps the original grid origin.
        const placements = [[712, -18, 3], [724, 110, 5], [728, 198, 4], [734, 320, 3], [725, 401, 5]]
        const players = await Promise.all(placements.map(async ([x, y, variant], row) => {
            const node = uiNode({
                name: `Bush${row}`, parent: slots.entityLayer, position: { x: x - 400, y: 300 - y },
                anchor: { x: 0, y: 1 },
            }).node
            const player = node.addComponent(ReanimPlayer)
            await player.load(`local:widescreen/bushes${variant}`, content.registry, content.loader)
            player.play({ loop: false, rate: 10 / 12, timeSeconds: 0, hideOnFinish: false })
            player.pause()
            return player
        }))
        // Source cover order is 308000 + row*10000, while this game's plants start at row*10.
        const entries = players.map((player, row) => ({ node: player.node, order: row * 10 + 6 }))
        layers.set(slots.entityLayer, { entries, players, starts: [], tick: -1 })
    }
}
