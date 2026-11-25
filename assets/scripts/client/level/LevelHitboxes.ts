import { Color, type Graphics } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { DEBUG_OVERLAY_ORDER } from '@/shared/content/renderOrder'
import { plantFacingRect, plantTeam, shooterFront, type Team, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import type { WorldSnapshot } from '@/shared/protocol/index'
import type { LevelStage } from './LevelStage'

const GREEN = new Color(0, 255, 0, 255)
const RED = new Color(255, 0, 0, 255)
/** Plant::GetPlantAttackRect of a plant that reaches the whole row is as wide as the board, which goes unoutlined. */
const BOARD_WIDTH = 800

type Rect = { x: number, y: number, width: number, height: number }

/**
 * `/hitboxes`: Board::DrawDebugObjectRects. Each plant's body in green and in red the attack rect it reaches with, unless
 * that spans the board; each zombie's body in green and its bite in red, while it is not dead or dying; each mower's and
 * projectile's hitbox in red. Each as it faces and where it stands in whole pixels, outlined as Graphics::DrawRect
 * outlines a rect, over the lawn's particles (DEBUG_OVERLAY_ORDER).
 */
export class LevelHitboxes {
    private graphics: Graphics | null = null

    constructor(private readonly stage: Pick<LevelStage, 'layer' | 'addScenery'>, private readonly definitions: GameplayDefinitions) {}

    sync(snapshot: WorldSnapshot): void {
        if (!GameDebugSettings.hitboxesVisible) { this.graphics?.clear(); return }
        const graphics = this.graphics ??= this.created()
        graphics.clear()
        // Graphics::DrawRect: a pixel wide round the rect, its right and bottom edges a pixel past it.
        const draw = (entity: { x: number, y: number }, rect: Rect, color: Color) => {
            const x = Math.trunc(entity.x) + rect.x, y = Math.trunc(entity.y) + rect.y, { width, height } = rect
            graphics.fillColor = color
            for (const [left, top, across, down] of [[x, y, width + 1, 1], [x, y + height, width + 1, 1], [x, y + 1, 1, height - 1], [x + width, y + 1, 1, height - 1]]) {
                // The board's y runs down from its top, the layer's up from its middle.
                graphics.rect(left - 400, 300 - top - down, across, down)
            }
            graphics.fill()
        }
        for (const plant of snapshot.plants) {
            const definition = this.definitions.plants[plant.typeId], team = plantTeam(plant)
            draw(plant, plantFacingRect(definition.body, team), GREEN)
            const attack = attackRect(definition, team)
            if (attack && attack.width < BOARD_WIDTH) draw(plant, attack, RED)
        }
        for (const zombie of snapshot.zombies) {
            if (isDeadOrDying(zombie)) continue
            const { body, attack } = this.definitions.zombies[zombie.typeId], team = zombieTeam(zombie)
            draw(zombie, zombieFacingRect(body, team), GREEN)
            draw(zombie, zombieFacingRect(attack, team), RED)
        }
        // A waiting mower's is where a zombie sets it off (LawnMower::GetLawnMowerAttackRect).
        for (const projectile of [...snapshot.projectiles, ...snapshot.mowers]) draw(projectile, this.definitions.projectiles[projectile.typeId].hitbox, RED)
    }

    private created(): Graphics {
        const { node, graphics } = uiNode({ name: 'Hitboxes', parent: this.stage.layer, graphics: true })
        this.stage.addScenery(node, DEBUG_OVERLAY_ORDER)
        return graphics!
    }
}

/**
 * Plant::GetPlantAttackRect as the plant faces, as high as its body: its `chomper`, `mine` or `bowling` attack, or a
 * shooter's `range` on from where its reach begins (shooterFront). None for a plant without one.
 */
function attackRect(definition: PlantDefinition, team: Team): Rect | undefined {
    const { body } = definition, attack = definition.chomper?.attack ?? definition.mine?.attack ?? definition.bowling?.attack
    if (attack) return { ...plantFacingRect({ x: attack.x, width: attack.width }, team), y: body.y, height: body.height }
    const range = definition.shooter?.range
    if (range === undefined) return undefined
    const front = shooterFront(body, team)
    return { x: teamDirection(team) > 0 ? front : front - range, width: range, y: body.y, height: body.height }
}
