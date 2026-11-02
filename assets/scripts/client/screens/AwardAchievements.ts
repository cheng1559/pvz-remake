import { _decorator, Color, Component, SpriteFrame, type Node } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import type { UI } from '@/client/ui/UI'
import type { UIButton } from '@/client/ui/UIButton'
import { easeInOut } from '@/client/view/GameScreenMath'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import type { AchievementEntry } from '@/shared/menu'

const { ccclass } = _decorator
/** AwardScreen: each row slides from y 750 over 100 ticks, one every 100 ticks from tick 150; rows are 76px apart. */
const START_Y = 750
const FIRST_TICK = 150
const ROW_TICKS = 100
const ROW_HEIGHT = 76

/**
 * AwardScreen::DrawAchievements: the achievements earned since the last award list, shown before the award itself.
 * Continue appears once the last row has arrived; Space, Enter and Escape still go straight on (AwardScreen::KeyChar).
 */
@ccclass('PvZAwardAchievements')
export class AwardAchievements extends Component {
    private ticks = 0
    private readonly rows: { node: Node, destY: number }[] = []
    private continueButton!: UIButton

    static async create(parent: Node, ui: UI, entries: readonly AchievementEntry[], onContinue: () => void): Promise<AwardAchievements> {
        const [background, ...icons] = await Promise.all(['pvz:challenge_background', ...entries.map(entry => entry.icon.sprite)].map(async id => {
            const frame = await modResources.asset(id, SpriteFrame)
            if (!frame) throw new Error(`Award achievement image is not installed: ${id}`)
            return frame
        }))
        if (!parent.isValid) throw new Error('Award screen was destroyed while loading')
        const node = uiNode({ name: 'AwardAchievements', parent, position: { x: -400, y: 300 }, anchor: { x: 0, y: 1 } }).node
        const list = node.addComponent(AwardAchievements)
        ui.image(node, background)
        ui.label(node, {
            text: ui.text('ACHIEVEMENTS_TITLE'), font: 'pageTitle', x: 400, y: 58,
            color: new Color(220, 220, 220), baseline: true, align: 'center',
        })
        const top = 284 - Math.trunc(ROW_HEIGHT * entries.length / 2)
        entries.forEach((entry, index) => {
            const row = uiNode({ name: `Achievement-${entry.id}`, parent: node, position: { x: 0, y: -START_Y } }).node
            ui.image(row, getAtlasFrame(icons[index], entry.icon.index, 70, 70, 7), { x: 220, y: 10 })
            ui.label(row, {
                text: ui.text('ACHIEVEMENT_EARNED').replace('{ACHIEVEMENT}', ui.text(entry.titleKey)), font: 'body',
                x: 450, y: 25, color: new Color(224, 187, 98), baseline: true, align: 'center',
            })
            const description = ui.label(row, {
                text: ui.text(entry.descriptionKey), font: 'achievement', x: 300, y: 20, width: 300, align: 'center',
            })
            // Centred in its 300×60 box.
            description.setPosition(300, 20 + Math.max(0, (60 - description.renderer.contentHeight) / 2))
            list.rows.push({ node: row, destY: top + ROW_HEIGHT * index })
        })
        list.continueButton = ui.button(node, {
            skin: 'seed', text: ui.text('CONTINUE_BUTTON'), x: 324, y: 515, width: 156, height: 42,
            pressOffset: [0, 0], pressSound: null, rightClickTriggers: false, onClick: () => {
                node.destroy()
                onContinue()
            },
        })
        list.continueButton.node.active = false
        return list
    }

    protected update(dt: number): void {
        if (this.continueButton.node.active) return
        this.ticks += gameClock.delta(dt) * 100
        this.rows.forEach((row, index) => {
            const start = FIRST_TICK + ROW_TICKS * index
            if (this.ticks >= start) row.node.setPosition(0, -easeInOut(start, start + ROW_TICKS, this.ticks, START_Y, row.destY))
        })
        if (this.ticks >= FIRST_TICK + ROW_TICKS * this.rows.length) this.continueButton.node.active = true
    }
}
