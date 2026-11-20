import { modResources } from '@/client/content/ModResources'
import { Color, type Node } from 'cc'
import type { AwardView } from '@/shared/menu'
import { menuApi } from '@/client/api/MenuApi'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { plantPacket } from '@/client/plants/definitions'
import type { UI } from '@/client/ui/UI'

export async function showAwardScreen(parent: Node, ui: UI): Promise<AwardView> {
    const award = await menuApi.getAward()
    if (!parent.isValid) throw new Error('Award screen was destroyed while loading')
    if (award.kind === 'note') {
        const images = ui.assets.presentation.awards?.[award.id]?.pageImages
        if (!images) throw new Error(`Note presentation is not installed: ${award.id}`)
        const frames = await Promise.all(images.map(image => modResources.sprite(image.sprite)))
        if (!parent.isValid) throw new Error('Award screen was destroyed while loading')
        images.forEach((image, index) => ui.image(parent, frames[index], image))
        ui.label(parent, { text: ui.text(award.titleKey), font: 'title', x: 400, y: 70,
            color: new Color(255, 200, 0), baseline: true, align: 'center' })
        return award
    }
    ui.label(parent, { text: ui.text(award.titleKey), font: 'title', x: 400, y: 58,
        color: new Color(213, 159, 43), baseline: true, align: 'center' })
    // A seed's packet, name and text are its plant's, as the level's award draws its packet (AwardView).
    const names = award.kind === 'seed' ? plantPacket(ui.assets.presentation, award.seed) : { nameKey: award.nameKey, tooltipKey: award.descriptionKey }
    if (award.kind === 'seed') SeedPacketRenderer.drawSeedPacket({
        definitions: ui.assets.presentation, name: 'AwardSeedPacket', parent, x: 350, y: -129, scale: 2,
        plant: plantPacket(ui.assets.presentation, award.seed).plant, cost: award.cost, costFont: ui.assets.fonts.packetCost,
    })
    else {
        const visual = ui.assets.presentation.awards?.[award.id]
        if (!visual) throw new Error(`Award presentation is not installed: ${award.id}`)
        const frame = await modResources.sprite(visual.sprite)
        if (!parent.isValid) throw new Error('Award screen was destroyed while loading')
        ui.image(parent, frame, { x: 400 - frame.originalSize.width / 2, y: visual.pageY })
    }
    ui.label(parent, {
        text: ui.text(names.nameKey), font: 'yellow', x: 400, y: 326,
        baseline: true, align: 'center',
    })
    const description = ui.label(parent, {
        text: ui.text(names.tooltipKey), font: 'profile', x: 285, y: 360, width: 230,
        align: 'center', color: new Color(40, 50, 90),
    })
    description.setPosition(285, 360 + Math.max(0, (90 - description.renderer.contentHeight) / 2))
    return award
}
