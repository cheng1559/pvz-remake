import { modResources } from '@/client/content/ModResources'
import { Color, type Node, SpriteFrame } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import type { ChallengePageId } from '@/shared/menu'
export type { ChallengePageId } from '@/shared/menu'
import { FontMetricsUtil } from '@/client/font'
import { getAtlasFrame } from '@/client/hud/SeedPacketRenderer'
import type { UI } from '@/client/ui/UI'
import { uiAreaEdge } from '@/client/view/ClientViewport'

export async function showChallengeScreen(
    parent: Node, ui: UI, page: ChallengePageId, onBack: () => void,
): Promise<void> {
    const data = await menuApi.getChallenges(page)
    const names = ['challenge_window', 'challenge_window_highlight', 'trophy', 'minigame_trophy',
        page === 'survival' ? 'survival_thumbnails' : 'challenge_thumbnails']
    const frames = await Promise.all(names.map(async name => {
        const frame = await modResources.asset(name, SpriteFrame)
        if (!frame) throw new Error(`Missing challenge image: ${name}`)
        return frame
    }))
    if (!parent.isValid) throw new Error('Challenge screen was destroyed while loading')
    const [window, highlight, trophy, miniTrophy, thumbnails] = frames
    ui.image(parent, trophy, { x: 718, y: 26, width: trophy.originalSize.width / 2, height: trophy.originalSize.height / 2 })
    ui.label(parent, {
        text: `${data.completed}/${data.total}`, font: 'body', x: 739, y: 73,
        align: 'center', baseline: true, color: new Color(255, 240, 0),
    })
    data.items.forEach((challenge, index) => {
        const row = page === 'survival' && challenge.endless ? 2 : Math.floor(index / 5)
        const col = page === 'survival' && challenge.endless ? 2 : index % 5
        const name = ui.text(challenge.key)
        const button = ui.button(parent, {
            images: { normal: window, hover: highlight },
            x: 38 + col * 155, y: (page === 'survival' ? 125 : 93) + row * (page === 'survival' ? 145 : 119),
            width: 104, height: 115,
            imageBox: { x: -6, y: -2, width: window.originalSize.width, height: window.originalSize.height },
            pressOffset: [1, 1], releaseToNormalOnPressOut: true,
            onClick: () => ui.dialog(parent, {
                title: ui.text('COMING_SOON'), message: `${name}\n${ui.text('CHALLENGE_UNAVAILABLE')}`,
                width: 430,
            }),
        })
        button.node.name = challenge.key
        const visual = button.node.getChildByName('Visual')!
        const thumbnail = getAtlasFrame(thumbnails, challenge.icon, 80, 65, thumbnails.originalSize.width / 80)
        ui.image(visual, thumbnail, { x: 13, y: 4 }).node.setSiblingIndex(0)
        const label = ui.label(visual, {
            text: name, font: 'small', x: 5, width: 94, align: 'center', color: new Color(42, 42, 90),
        })
        label.renderer.lineSpacing = 14
        label.renderer.forceRebuild()
        const height = label.renderer.contentHeight
        const singleLine = height <= FontMetricsUtil.getMetrics(ui.assets.fonts.small.config).height
        label.node.setPosition(5, -(73 + Math.max(0, 33 - height) / 2 + (singleLine ? 1 : 0)))
        const updateState = button.onStateChange!
        button.onStateChange = state => {
            updateState(state)
            label.renderer.fontColor = state === 'hover' || state === 'pressed' ? new Color(250, 40, 40) : new Color(42, 42, 90)
        }
        if (challenge.completed) ui.image(visual, miniTrophy, { x: -6, y: -2 })
    })
    // Keep the back button's margin from the UI area's left edge.
    ui.button(uiAreaEdge(parent, 'left'), {
        skin: 'seedSmall', text: ui.text('BACK_TO_MENU'),
        x: 18, y: 568, width: 111, height: 26, onClick: onBack,
    })
}
