import type { Color, Node, SpriteFrame } from 'cc'
import type { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { LevelEntitySnapshot } from '@/client/level/LevelPresentationSnapshot'
import type { EntityAttachments } from '@/client/view/EntityAttachments'

export type PlantViewSnapshot = Extract<LevelEntitySnapshot, { kind: 'plant' }>
/** Requests a particle in board coordinates, matching Board::AddPvzpParticle. */
export type PlantParticle = (effect: string, x: number, y: number, tint?: Color) => void
export interface PlantViewContext {
    node: Node
    /** The plant's attachment list for effects that belong to it, such as Mod-added marks. */
    attachments: EntityAttachments
    content: Awaited<ReturnType<typeof loadIntegratedGameContent>>
    animations: ClientAnimationRegistry
    assets: { shadow: SpriteFrame; wallnutCracked: [SpriteFrame, SpriteFrame] }
    plant: PlantSnapshot
    tick: number
}

export interface PlantView {
    sync(plant: PlantSnapshot, world: WorldSnapshot, particle: PlantParticle, upgradeTarget: boolean): void
    snapshot(entityId: number): PlantViewSnapshot
    restore(snapshot: PlantViewSnapshot): void | Promise<void>
    fire?(): void
    renderRow?(plant: PlantSnapshot): number
    destroy?(): void
}
