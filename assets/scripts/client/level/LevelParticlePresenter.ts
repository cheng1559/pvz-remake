import { Node, tween, Vec3 } from 'cc'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { uiNode } from '@/client/view/uiNode'
import { startGameTween } from '@/core/GameTween'
import { TodParticleSystem } from '@/core/Particle'
import { PARTICLE_STEP_SECONDS } from '@/shared/content/particle'
import type { LevelParticleOwnerSnapshot, LevelParticleSnapshot } from './LevelPresentationSnapshot'
import { LevelEntityRenderer } from './LevelEntityRenderer'
import type { LevelIntro } from './LevelIntro'

type LoadedContent = Awaited<ReturnType<typeof loadIntegratedGameContent>>
type ScreenSlot = Extract<LevelParticleOwnerSnapshot, { kind: 'screen' }>['slot']

export class LevelParticlePresenter {
    constructor(
        private readonly content: LoadedContent,
        private readonly root: Node,
        private readonly screenParents: Map<ScreenSlot, Node>,
        private readonly entities: LevelEntityRenderer,
        private readonly intro: LevelIntro,
    ) {}

    async snapshot(): Promise<LevelParticleSnapshot[]> {
        const result: LevelParticleSnapshot[] = []
        let instanceId = 1
        const players = this.root.getComponentsInChildren(ParticlePlayer)
        await Promise.all(players.map(player => player.whenReady()))
        for (const player of players) {
            const owner = this.owner(player.node)
            if (owner) result.push({ instanceId: instanceId++, backend: 'particle', owner, playback: player.snapshot() })
        }
        for (const player of this.root.getComponentsInChildren(TodParticleSystem)) {
            const owner = this.owner(player.node)
            if (owner) result.push({ instanceId: instanceId++, backend: 'tod', owner, playback: player.snapshot() })
        }
        return result
    }

    async restore(snapshots: LevelParticleSnapshot[]): Promise<void> {
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
                startGameTween(node, tween(node).delay(Math.max(0, 0.21 - elapsed)).call(() => {
                    if (node.isValid) node.destroy()
                }))
            }
            if (snapshot.playback.id === 'pvz:seedpacketflash') {
                const elapsed = snapshot.playback.ageTicks * PARTICLE_STEP_SECONDS + snapshot.playback.accumulatorSeconds
                startGameTween(node, tween(node).delay(Math.max(0, 0.26 - elapsed)).call(() => {
                    if (node.isValid) node.destroy()
                }))
            }
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
