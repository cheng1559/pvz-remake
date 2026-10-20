import { Color, type Node } from 'cc'
import type { AwardView } from '@/shared/menu'
import { menuApi } from '@/client/api/MenuApi'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import type { UI } from '@/client/ui/UI'
import { SpriteLoader } from '@/core/SpriteLoader'

export async function showAwardScreen(parent: Node, ui: UI): Promise<AwardView> {
    const [award, packet, plants] = await Promise.all([
        menuApi.getAward(), SpriteLoader.load('seedpacket_larger'), SpriteLoader.load('plant_previews_cached'),
    ])
    if (!packet || !plants) throw new Error('Missing award seed packet images')
    if (!parent.isValid) throw new Error('Award screen was destroyed while loading')
    SeedPacketRenderer.drawSeedPacket({
        name: 'AwardSeedPacket', parent, x: 350, y: -129, scale: 2,
        seedType: award.seed, cost: award.cost, seeds: null, seedPacketLarger: packet,
        plantPreviews: plants, costFont: ui.assets.fonts.packetCost,
    })
    ui.label(parent, {
        text: ui.text(award.nameKey, award.name), font: 'yellow', x: 400, y: 326,
        baseline: true, align: 'center',
    })
    const description = ui.label(parent, {
        text: ui.text(award.descriptionKey), font: 'profile', x: 285, y: 360, width: 230,
        align: 'center', color: new Color(40, 50, 90),
    })
    description.setPosition(285, 360 + Math.max(0, (90 - description.renderer.contentHeight) / 2))
    return award
}
