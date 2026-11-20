import { Node, Vec3 } from 'cc'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { LevelParticleOwnerSnapshot, LevelParticleSnapshot } from './LevelPresentationSnapshot'
import { LevelEntityRenderer } from './LevelEntityRenderer'
import type { LevelIntro } from './LevelIntro'

type ScreenSlot = Extract<LevelParticleOwnerSnapshot, { kind: 'screen' }>['slot']

export class LevelParticlePresenter {
    constructor(
        private readonly root: Node,
        private readonly screenParents: Map<ScreenSlot, Node>,
        private readonly entities: LevelEntityRenderer,
        private readonly intro: LevelIntro,
    ) {}

    async snapshot(): Promise<LevelParticleSnapshot[]> {
        const result: LevelParticleSnapshot[] = []
        const players = this.root.getComponentsInChildren(ParticlePlayer)
        await Promise.all(players.map(player => player.whenReady()))
        for (const player of players) {
            if (!player.node?.isValid || !player.live || player.unsaved) continue
            const owner = this.owner(player.node)
            if (owner) result.push({ instanceId: result.length + 1, owner, playback: player.snapshot() })
        }
        return result
    }

    async restore(snapshots: LevelParticleSnapshot[]): Promise<void> {
        for (const player of this.root.getComponentsInChildren(ParticlePlayer)) if (player.node.isValid) player.node.destroy()
        for (const snapshot of snapshots) {
            const { owner } = snapshot
            // One of the board's own goes back where the board draws it, among the entities at its order.
            const parent = owner.kind === 'entity'
                ? this.entities.particleParent(owner)
                : owner.kind === 'screen'
                    ? owner.slot === 'entity-layer' ? this.entities.particleLayer(snapshot.playback.renderOrder) : this.screenParents.get(owner.slot) ?? null
                    : this.intro.particleParent(owner.slot)
            if (!parent?.isValid) continue
            const player = ParticlePlayer.restore({ parent, snapshot: snapshot.playback, x: owner.x, y: owner.y, z: owner.z })
            await player.whenReady()
        }
    }

    private owner(node: Node): LevelParticleOwnerSnapshot | null {
        const preview = this.intro.particleOwner(node)
        if (preview) return preview
        const entity = this.entities.particleOwner(node)
        if (entity) return entity
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
            const match = [...this.screenParents].find(([, parent]) => parent === ancestor)
            if (!match) continue
            const [slot, parent] = match
            const position = parent.inverseTransformPoint(new Vec3(), node.worldPosition)
            return { kind: 'screen', slot, x: position.x, y: position.y, z: position.z }
        }
        return null
    }
}
