import { Color, type Graphics, type Node } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { WorldSnapshot } from '@/shared/protocol/index'

/** `/hitboxes`: the plants' bodies, the zombies' bodies and bites, and the projectiles' hitboxes, outlined on the lawn. */
export class LevelHitboxes {
    private graphics: Graphics | null = null

    constructor(private readonly lawn: Node, private readonly definitions: GameplayDefinitions) {}

    sync(snapshot: WorldSnapshot): void {
        if (!GameDebugSettings.hitboxesVisible) { this.graphics?.clear(); return }
        const graphics = this.graphics ??= uiNode({ name: 'Hitboxes', parent: this.lawn, graphics: true }).graphics!
        graphics.clear()
        graphics.lineWidth = 1
        const draw = (entity: { x: number, y: number }, rect: { x: number, y: number, width: number, height: number }, color: Color) => {
            graphics.strokeColor = color
            graphics.rect(entity.x - 400 + rect.x, 300 - entity.y - rect.y - rect.height, rect.width, rect.height)
            graphics.stroke()
        }
        for (const plant of snapshot.plants) draw(plant, this.definitions.plants[plant.typeId].body, Color.GREEN)
        for (const zombie of snapshot.zombies) {
            draw(zombie, this.definitions.zombies[zombie.typeId].body, Color.RED)
            draw(zombie, this.definitions.zombies[zombie.typeId].attack, Color.YELLOW)
        }
        for (const projectile of snapshot.projectiles) draw(projectile, this.definitions.projectiles[projectile.typeId].hitbox, Color.CYAN)
    }
}
