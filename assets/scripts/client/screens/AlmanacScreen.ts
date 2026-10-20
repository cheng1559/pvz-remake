import { Color, Mask, type Node } from 'cc'
import { getAtlasFrame, SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { SoundEffect } from '@/client/sound/LegacySoundSystem'
import type { UI } from '@/client/ui/UI'
import { uiNode } from '@/client/view/uiNode'
import { SpriteLoader } from '@/core/SpriteLoader'
import { menuApi } from '@/client/api/MenuApi'
import type { AlmanacPlantDefinition, AlmanacZombieDefinition } from '@/shared/menu'
import { drawAlmanacText } from './AlmanacText'
import type { MenuAction } from './MenuPages'

export async function showAlmanacScreen(parent: Node, ui: UI, page: 'almanac' | 'plants' | 'zombies', navigate: (action: MenuAction) => void): Promise<void> {
    if (page === 'almanac') {
        ui.button(parent, { skin: 'seed', text: ui.text('VIEW_PLANTS'), x: 130, y: 345, width: 156, height: 42, font: 'yellow', color: Color.WHITE, rightClickPressesVisual: false, onClick: () => navigate('plants') })
        ui.button(parent, { text: ui.text('VIEW_ZOMBIES'), x: 487, y: 345, width: 210, height: 48, imageBox: { height: ui.assets.sprites.button_left.originalSize.height }, rightClickPressesVisual: false, clickSound: null, onClick: () => navigate('zombies') })
    } else {
        const { plants, zombies } = await menuApi.getAlmanac()
        const names = page === 'plants'
            ? ['seeds', 'packet_plants', 'packet_plants_cached', 'almanac_imitater', 'particles/seedpacketflash', 'almanac_plantcard', 'almanac_groundday', 'almanac_groundnight', 'almanac_groundpool', 'almanac_groundnightpool', 'almanac_groundroof']
            : ['almanac_zombiewindow', 'almanac_zombiewindow2', 'zombie_previews_cached', 'almanac_zombiecard', 'almanac_groundday', 'almanac_groundice']
        const frames = await Promise.all(names.map(async name => {
            const frame = await SpriteLoader.load(name)
            if (!frame) throw new Error(`Missing almanac image: ${name}`)
            return [name, frame] as const
        }))
        if (!parent.isValid) throw new Error('Almanac was destroyed while loading')
        const sprites = Object.fromEntries(frames)
        let details: Node | null = null
        const select = (entry: AlmanacPlantDefinition | AlmanacZombieDefinition) => {
            if (details) { details.active = false; details.destroy() }
            details = uiNode({ name: `${entry.key}Details`, parent, anchor: { x: 0, y: 1 } }).node
            if (page === 'plants') {
                const plant = entry as AlmanacPlantDefinition
                const ground = [16, 19, 43].includes(plant.id) ? 'pool' : plant.id === 24 ? 'nightpool'
                    : plant.id === 33 ? 'roof' : plant.id >= 8 && plant.id <= 15 || plant.id === 25 ? 'night' : 'day'
                ui.image(details, sprites[`almanac_ground${ground}`], { x: 521, y: 107 })
                ui.image(details, sprites.almanac_plantcard, { x: 459, y: 86 })
                ui.label(details, { text: ui.text(plant.key, plant.name), font: 'yellow', x: 617, y: 288, baseline: true, align: 'center' })
                const header = drawAlmanacText(details, ui, ui.text(`${plant.key}_DESCRIPTION_HEADER`, ''), { x: 485, y: 309, width: 258 })
                drawAlmanacText(details, ui, ui.text(`${plant.key}_DESCRIPTION`, ''), { x: 485, y: 309 + header, width: 258, height: Math.max(20, 210 - header) })
                if (plant.id !== 48) {
                    drawAlmanacText(details, ui, `{KEYWORD}${ui.text('COST')}:{STAT} ${plant.cost}`, { x: 485, y: 520, width: 134 })
                    const wait = ui.text(plant.refreshTime === 750 ? 'WAIT_TIME_SHORT' : plant.refreshTime === 3000 ? 'WAIT_TIME_LONG' : 'WAIT_TIME_VERY_LONG')
                    drawAlmanacText(details, ui, `{KEYWORD}${ui.text('WAIT_TIME')}: {STAT}${wait}`, { x: 600, y: 520, width: 139, align: 'right' })
                }
            } else {
                const zombie = entry as AlmanacZombieDefinition
                ui.image(details, sprites[zombie.iceGround ? 'almanac_groundice' : 'almanac_groundday'], { x: 518, y: 110 })
                ui.image(details, sprites.almanac_zombiecard, { x: 455, y: 78 })
                ui.label(details, { text: ui.text(zombie.key), font: 'button', color: new Color(190, 255, 235), x: 613, y: 362, baseline: true, align: 'center' })
                const header = drawAlmanacText(details, ui, ui.text(`${zombie.key}_DESCRIPTION_HEADER`, ''), { x: 485, y: 377, width: 258 })
                drawAlmanacText(details, ui, ui.text(`${zombie.key}_DESCRIPTION`, ''), { x: 485, y: 377 + header, width: 257, height: Math.max(20, 160 - header) })
            }
        }
        if (page === 'plants') {
            for (const plant of plants) {
                const x = plant.id === 48 ? 20 : plant.id % 8 * 52 + 26
                const y = plant.id === 48 ? 23 : Math.floor(plant.id / 8) * 78 + 92
                const button = ui.button(parent, {
                    images: { normal: plant.id === 48 ? sprites.almanac_imitater : getAtlasFrame(sprites.seeds, plant.upgrade ? 1 : 2, 50, 70, 9), hover: plant.id === 48 ? sprites.almanac_imitater : sprites['particles/seedpacketflash'] },
                    x, y, pressSound: null, clickSound: SoundEffect.Tap, pressOffset: [0, 0], releaseToNormalOnPressOut: true,
                    onClick: () => select(plant),
                })
                button.node.name = plant.key
                if (plant.id !== 48) {
                    const packet = SeedPacketRenderer.drawSeedPacket({ parent: button.node, x: 0, y: 0, seedType: plant.id, cost: plant.cost, upgrade: plant.upgrade, seeds: sprites.seeds, packetPlants: sprites.packet_plants, cachedPacketPlants: sprites.packet_plants_cached, costFont: ui.assets.fonts.packetCost })
                    packet.setSiblingIndex(0)
                    const visual = button.node.getChildByName('Visual')!
                    const update = button.onStateChange!
                    button.onStateChange = state => { update(state); visual.active = state === 'hover' || state === 'pressed' }
                    visual.active = false
                }
            }
            select(plants[0])
        } else {
            for (const zombie of zombies) {
                const index = zombie.id === 25 ? 27 : zombie.id
                const button = ui.button(parent, { images: { normal: sprites.almanac_zombiewindow }, x: index % 5 * 85 + 22, y: Math.floor(index / 5) * 80 + 86, pressOffset: [0, 0], pressSound: null, clickSound: SoundEffect.Tap, releaseToNormalOnPressOut: true, onClick: () => select(zombie) })
                button.node.name = zombie.key
                const underlay = ui.additiveImage(button.node, sprites.almanac_zombiewindow, {}, 48)
                const clip = uiNode({
                    name: 'PortraitClip', parent: button.node, position: { x: 2, y: -2 },
                    anchor: { x: 0, y: 1 }, size: { width: 72, height: 72 }, mask: Mask.Type.GRAPHICS_RECT,
                }).node
                ui.image(clip, getAtlasFrame(sprites.zombie_previews_cached, zombie.id, 76, 76, 8), { x: -2, y: -2 })
                ui.image(button.node, sprites.almanac_zombiewindow2)
                const glow = ui.additiveImage(button.node, sprites.almanac_zombiewindow2, {}, 48)
                const update = button.onStateChange!
                button.onStateChange = state => { update(state); underlay.node.active = glow.node.active = state === 'hover' || state === 'pressed' }
                underlay.node.active = glow.node.active = false
            }
            select(zombies[0])
        }
        ui.button(parent, { skin: 'almanacIndex', text: ui.text('ALMANAC_INDEX'), x: 32, y: 567, onClick: () => navigate('almanac') })
    }
    ui.button(parent, { skin: 'almanacClose', text: ui.text('CLOSE_BUTTON'), x: 676, y: 567, onClick: () => navigate('main') })
}
