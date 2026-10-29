import { SpriteFrame, type Node } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { SoundEffect } from '@/client/sound/SoundSystem'
import type { UI } from '@/client/ui/UI'
import type { MenuAction, MenuPageId } from './MenuPages'
import { uiAreaEdge } from '@/client/view/ClientViewport'

const GARDENS: readonly MenuPageId[] = ['garden', 'mushroom', 'aquarium', 'tree']

/** Returns false for pages that still use the basic navigation controls. */
export async function showMenuPageControls(
    parent: Node, ui: UI, id: MenuPageId, navigate: (action: MenuAction) => void,
): Promise<boolean> {
    const gardenIndex = GARDENS.indexOf(id)
    const names = gardenIndex >= 0 ? ['zen_nextgarden', 'zenshopbutton', 'zenshopbutton_highlight']
        : id === 'achievements' ? ['acheesements_back_highlight'] : []
    if (!names.length) return false
    const frames = await Promise.all(names.map(async name => {
        const frame = await modResources.asset(name, SpriteFrame)
        if (!frame) throw new Error(`Missing page control: ${name}`)
        return frame
    }))
    if (!parent.isValid) throw new Error('Menu page was destroyed while loading controls')
    if (gardenIndex >= 0) {
        const [next, shop, shopHighlight] = frames
        // The top-right buttons keep their margin from the UI area's right edge.
        const right = uiAreaEdge(parent, 'right')
        ui.button(right, {
            text: ui.text('MAIN_MENU_BUTTON'), x: 628, y: -10, width: 163, height: 46,
            rightClickTriggers: false, onClick: () => navigate('main'),
        })
        ui.button(right, {
            images: { normal: next }, x: 566, y: 0, pressSound: SoundEffect.Tap,
            releaseToNormalOnPressOut: true,
            // Previous garden tooltip: center x=599, top y=52 for the 60×60 button at (566, 0).
            tooltip: { text: ui.text('NEXT_GARDEN_TOOLTIP'), offset: [3, -12] },
            onPress: () => navigate(GARDENS[(gardenIndex + 1) % GARDENS.length]),
        })
        ui.button(right, {
            images: { normal: shop, hover: shopHighlight }, x: 678, y: 33, height: 40,
            imageBox: { height: shop.originalSize.height }, rightClickTriggers: false,
            releaseToNormalOnPressOut: true, pressSound: SoundEffect.Tap, onClick: () => navigate('store'),
        })
    } else {
        const button = ui.button(parent, {
            // AchievementsWidget's back rect is (120, 35, 130, 80); its highlight draws at (128, 55).
            images: { normal: frames[0] }, x: 120, y: 35, width: 130, height: 80,
            imageBox: { x: 8, y: 20, width: frames[0].originalSize.width, height: frames[0].originalSize.height },
            releaseToNormalOnPressOut: true, pressSound: SoundEffect.GraveButton, onClick: () => navigate('main'),
        })
        button.changeCursor = false
        const visual = button.node.getChildByName('Visual')!
        const updateState = button.onStateChange!
        button.onStateChange = state => {
            updateState(state)
            visual.active = state === 'hover' || state === 'pressed'
        }
        visual.active = false
    }
    return true
}
