import { Node, tween, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { uiNode } from '@/client/view/uiNode'
import { TodParticleSystem } from '@/core/Particle'
import { PARTICLE_STEP_SECONDS } from '@/shared/content/particle'
import type { Adventure11ParticleOwnerSnapshotV2, Adventure11ParticleSnapshotV2 } from './Adventure11PresentationSnapshotV2'
import { Adventure11EntityRenderer } from './Adventure11EntityRenderer'
import { Adventure11IntroPresenter } from './Adventure11IntroPresenter'

type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type ScreenSlot = Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'screen' }>['slot']

export class Adventure11ParticlePresenter {
    constructor(
        private readonly content: LoadedContent,
        private readonly root: Node,
        private readonly screenParents: Map<ScreenSlot, Node>,
        private readonly entities: Adventure11EntityRenderer,
        private readonly intro: Adventure11IntroPresenter,
    ) {}

    async snapshot(): Promise<Adventure11ParticleSnapshotV2[]> {
        const result: Adventure11ParticleSnapshotV2[] = []
        let instanceId = 1
        const v2Players = this.root.getComponentsInChildren(ParticlePlayer)
        await Promise.all(v2Players.map(player => player.whenReady()))
        for (const player of v2Players) {
            const owner = this.owner(player.node)
            if (owner) result.push({ instanceId: instanceId++, backend: 'v2', owner, playback: player.snapshot() })
        }
        for (const player of this.root.getComponentsInChildren(TodParticleSystem)) {
            const owner = this.owner(player.node)
            if (owner) result.push({ instanceId: instanceId++, backend: 'tod', owner, playback: player.snapshot() })
        }
        return result
    }

    async restore(snapshots: Adventure11ParticleSnapshotV2[]): Promise<void> {
        const nodes = new Set<Node>()
        for (const player of this.root.getComponentsInChildren(ParticlePlayer)) nodes.add(player.node)
        for (const player of this.root.getComponentsInChildren(TodParticleSystem)) nodes.add(player.node)
        for (const node of nodes) if (node.isValid) node.destroy()
        for (const snapshot of snapshots) {
            const parent = snapshot.owner.kind === 'entity'
                ? this.entities.particleParent(snapshot.owner)
                : snapshot.owner.kind === 'screen'
                    ? this.screenParents.get(snapshot.owner.slot) ?? null
                    : this.intro.particleParent(snapshot.owner.slot)
            if (!parent?.isValid) continue
            if (snapshot.backend === 'tod') {
                TodParticleSystem.restore({
                    parent, snapshot: snapshot.playback,
                    x: snapshot.owner.x, y: snapshot.owner.y, z: snapshot.owner.z,
                })
                continue
            }
            const node = uiNode({
                name: snapshot.playback.id === 'pvz:seedpacketflash'
                    ? 'ParticleSystem_seedpacketflash'
                    : `Particle-${snapshot.instanceId}`,
                parent,
                position: { x: snapshot.owner.x, y: snapshot.owner.y, z: snapshot.owner.z },
            }).node
            const player = node.addComponent(ParticlePlayer)
            await player.load(snapshot.playback.id, this.content.registry, this.content.loader)
            player.restore(snapshot.playback)
            if (snapshot.playback.id === 'pvz:peasplat') {
                const elapsed = snapshot.playback.ageTicks * PARTICLE_STEP_SECONDS + snapshot.playback.accumulatorSeconds
                tween(node).delay(Math.max(0, 0.21 - elapsed)).call(() => {
                    if (node.isValid) node.destroy()
                }).start()
            }
            if (snapshot.playback.id === 'pvz:seedpacketflash') {
                const elapsed = snapshot.playback.ageTicks * PARTICLE_STEP_SECONDS + snapshot.playback.accumulatorSeconds
                tween(node).delay(Math.max(0, 0.26 - elapsed)).call(() => {
                    if (node.isValid) node.destroy()
                }).start()
            }
        }
    }

    private owner(node: Node): Adventure11ParticleOwnerSnapshotV2 | null {
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
