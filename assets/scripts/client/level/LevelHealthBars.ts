import { Color, type Graphics, type Node } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { DEBUG_OVERLAY_ORDER } from '@/shared/content/renderOrder'
import type { WorldSnapshot } from '@/shared/protocol/index'
import { PlantView } from '@/client/plants/PlantView'
import { ZombieView } from '@/client/zombies/ZombieView'
import type { LevelEntityRenderer } from './LevelEntityRenderer'

const BAR_WIDTH = 50
const BAR_HEIGHT = 3
const BAR_GAP = 1
const BORDER = 1
const FRAME = new Color(0, 0, 0, 255)
const EMPTY = new Color(0, 0, 0, 160)
const PLANT = new Color(60, 220, 60, 255)
const ZOMBIE = new Color(230, 50, 50, 255)
const HELM = new Color(240, 200, 40, 255)
const SHIELD = new Color(80, 160, 255, 255)

type Rect = { x: number, y: number, width: number, height: number }
type Part = { health: number, color: Color }

/**
 * Over each plant and zombie on the lawn, over the lawn's particles (DEBUG_OVERLAY_ORDER): with `/hp` a bar of its
 * health, as wide for any in a black frame, centred over its body the way it faces (the hitbox `/hitboxes` outlines; of
 * a rising zombie, what is up out of the ground), and with `/id` its slot of its list (EntityList) in its body's bottom
 * left. A zombie's bar is its body's health, then its helm's, then its shield's, out of all three at their full: the
 * armor, which goes first, empties it from the right.
 */
export class LevelHealthBars {
    private node: Node | null = null
    private graphics: Graphics | null = null
    private readonly slots = new Map<number, UILabel>()

    constructor(private readonly stage: Pick<LevelEntityRenderer, 'layer' | 'addScenery' | 'view'>, private readonly definitions: GameplayDefinitions,
        private readonly ui: UI, private readonly font: BitmapFontAssets) {}

    sync(snapshot: WorldSnapshot): void {
        const bars = GameDebugSettings.hpVisible, numbered = GameDebugSettings.idVisible
        if (!bars && !numbered) {
            if (this.node) this.node.active = false
            return
        }
        const node = this.node ??= this.created()
        node.active = true
        const graphics = this.graphics ??= uiNode({ name: 'Bars', parent: node, graphics: true }).graphics!
        graphics.clear()
        const shown = new Set<number>()
        // Over `body`, the entity's body on the board.
        const show = (entity: { entityId: number, slot: number }, body: Rect, parts: Part[], full: number) => {
            // The board's y runs down from its top, the layer's up from its middle.
            const left = body.x + (body.width - BAR_WIDTH) / 2 - 400, top = 300 - body.y
            const bottom = top + BAR_GAP + BORDER
            if (bars) {
                graphics.fillColor = FRAME
                graphics.rect(left - BORDER, bottom - BORDER, BAR_WIDTH + 2 * BORDER, BORDER)
                graphics.rect(left - BORDER, bottom + BAR_HEIGHT, BAR_WIDTH + 2 * BORDER, BORDER)
                graphics.rect(left - BORDER, bottom, BORDER, BAR_HEIGHT)
                graphics.rect(left + BAR_WIDTH, bottom, BORDER, BAR_HEIGHT)
                graphics.fill()
                graphics.fillColor = EMPTY
                graphics.rect(left, bottom, BAR_WIDTH, BAR_HEIGHT)
                graphics.fill()
                let x = left
                for (const { health, color } of parts) {
                    const width = Math.min(left + BAR_WIDTH - x, BAR_WIDTH * Math.max(0, health) / full)
                    if (width <= 0) continue
                    graphics.fillColor = color
                    graphics.rect(x, bottom, width, BAR_HEIGHT)
                    graphics.fill()
                    x += width
                }
            }
            if (!numbered) return
            shown.add(entity.entityId)
            const label = this.slots.get(entity.entityId) ?? this.label(node, entity.entityId), slot = String(entity.slot)
            // Set again, a label is laid out again.
            if (label.text !== slot) label.text = slot
            // In the body's bottom left, a pixel clear of the `/hitboxes` outline (Graphics::DrawRect: its left column the
            // body's first, its bottom row under the body's last). A label's y runs down to its baseline.
            label.setPosition(body.x - 400 + BORDER + BAR_GAP, -(top - body.height + BAR_GAP))
        }
        // A plant's or zombie's body as its view has it (PlantView.hitRects, ZombieView.hitRects); none until the view is
        // made.
        for (const plant of snapshot.plants) {
            const body = this.stage.view(plant.entityId, PlantView)?.hitRects(plant).body
            if (body) show(plant, body, [{ health: plant.health, color: PLANT }], plant.maxHealth)
        }
        for (const zombie of snapshot.zombies) {
            const { helm, shield } = this.definitions.zombies[zombie.typeId]
            // Of one rising, what is up out of the ground; none while all of it is under.
            const body = this.stage.view(zombie.entityId, ZombieView)?.hitRects(zombie).body
            if (!body?.height) continue
            show(zombie, body, [
                { health: zombie.health, color: ZOMBIE }, { health: zombie.helmHealth, color: HELM }, { health: zombie.shieldHealth, color: SHIELD },
            ], zombie.maxHealth + (helm?.health ?? 0) + (shield?.health ?? 0))
        }
        for (const [entityId, label] of this.slots) {
            if (shown.has(entityId)) continue
            label.node.destroy()
            this.slots.delete(entityId)
        }
    }

    private created(): Node {
        const { node } = uiNode({ name: 'HealthBars', parent: this.stage.layer })
        this.stage.addScenery(node, DEBUG_OVERLAY_ORDER)
        return node
    }

    private label(parent: Node, entityId: number): UILabel {
        const label = this.ui.label(parent, { text: '', font: this.font, color: Color.WHITE, baseline: true })
        this.slots.set(entityId, label)
        return label
    }
}
