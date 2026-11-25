import { Color, type Graphics } from 'cc'
import { PlantView } from '@/client/plants/PlantView'
import { uiNode } from '@/client/view/uiNode'
import { ZombieView } from '@/client/zombies/ZombieView'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { DEBUG_OVERLAY_ORDER } from '@/shared/content/renderOrder'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import type { WorldSnapshot } from '@/shared/protocol/index'
import type { LevelEntityRenderer } from './LevelEntityRenderer'

const GREEN = new Color(0, 255, 0, 255)
const RED = new Color(255, 0, 0, 255)
/** Plant::GetPlantAttackRect of a plant that reaches the whole row is as wide as the board, which goes unoutlined. */
const BOARD_WIDTH = 800

type Rect = { x: number, y: number, width: number, height: number }

/**
 * `/hitboxes`: Board::DrawDebugObjectRects, the rects the server goes by, where the frame draws each one. Each plant's
 * body in green and in red the attack rect it reaches with, unless that spans the board; each zombie's body in green and
 * its attack rect in red, while it is not dead or dying: each as its view has them (PlantView.hitRects,
 * ZombieView.hitRects); each mower's and projectile's hitbox in red. Each as it faces, outlined as Graphics::DrawRect
 * outlines a rect, over the lawn's particles (DEBUG_OVERLAY_ORDER).
 */
export class LevelHitboxes {
    private graphics: Graphics | null = null

    constructor(private readonly stage: Pick<LevelEntityRenderer, 'layer' | 'addScenery' | 'view'>, private readonly definitions: GameplayDefinitions) {}

    sync(snapshot: WorldSnapshot): void {
        if (!GameDebugSettings.hitboxesVisible) { this.graphics?.clear(); return }
        const graphics = this.graphics ??= this.created()
        graphics.clear()
        // Graphics::DrawRect: a pixel wide round the rect, its right and bottom edges a pixel past it.
        const draw = ({ x, y, width, height }: Rect, color: Color) => {
            graphics.fillColor = color
            for (const [left, top, across, down] of [[x, y, width + 1, 1], [x, y + height, width + 1, 1], [x, y + 1, 1, height - 1], [x + width, y + 1, 1, height - 1]]) {
                // The board's y runs down from its top, the layer's up from its middle.
                graphics.rect(left - 400, 300 - top - down, across, down)
            }
            graphics.fill()
        }
        // A plant's or zombie's view knows what its kind goes by; none until the view is made.
        for (const plant of snapshot.plants) {
            const rects = this.stage.view(plant.entityId, PlantView)?.hitRects(plant)
            if (!rects) continue
            draw(rects.body, GREEN)
            if (rects.attack && rects.attack.width < BOARD_WIDTH) draw(rects.attack, RED)
        }
        for (const zombie of snapshot.zombies) {
            const rects = isDeadOrDying(zombie) ? undefined : this.stage.view(zombie.entityId, ZombieView)?.hitRects(zombie)
            if (!rects) continue
            draw(rects.body, GREEN)
            draw(rects.attack, RED)
        }
        // A waiting mower's is where a zombie sets it off (LawnMower::GetLawnMowerAttackRect).
        for (const projectile of [...snapshot.projectiles, ...snapshot.mowers]) {
            const { hitbox } = this.definitions.projectiles[projectile.typeId]
            draw({ ...hitbox, x: projectile.x + hitbox.x, y: projectile.y + hitbox.y }, RED)
        }
    }

    private created(): Graphics {
        const { node, graphics } = uiNode({ name: 'Hitboxes', parent: this.stage.layer, graphics: true })
        this.stage.addScenery(node, DEBUG_OVERLAY_ORDER)
        return graphics!
    }
}
