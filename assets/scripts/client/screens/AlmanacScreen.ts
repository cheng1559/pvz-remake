import { Color, Mask, type Node } from 'cc'
import { getAtlasFrame, SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { PlantPreview } from '@/client/hud/PlantPreview'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { UI } from '@/client/ui/UI'
import { uiNode } from '@/client/view/uiNode'
import { SpriteLoader } from '@/core/SpriteLoader'
import { menuApi } from '@/client/api/MenuApi'
import type { AlmanacPlantDefinition, AlmanacZombieDefinition } from '@/shared/menu'
import { drawAlmanacText } from './AlmanacText'
import type { MenuAction } from './MenuPages'
import { AlmanacEntityView } from './AlmanacEntityView'
import { AlmanacZombiePortrait } from './AlmanacZombiePortrait'

export interface AlmanacSelection { plant: number, zombie: number }

export async function showAlmanacScreen(parent: Node, ui: UI, page: 'almanac' | 'plants' | 'zombies', navigate: (action: MenuAction) => void, selection: AlmanacSelection = { plant: 0, zombie: 0 }): Promise<void> {
    if (page === 'almanac') {
        AlmanacEntityView.create(parent, 'plants', 1, 167, 255)
        AlmanacEntityView.create(parent, 'zombies', 0, 535, 215)
        ui.button(parent, { skin: 'seed', text: ui.text('VIEW_PLANTS'), x: 130, y: 345, width: 156, height: 42, font: 'yellow', color: Color.WHITE, onClick: () => navigate('plants') })
        ui.button(parent, { text: ui.text('VIEW_ZOMBIES'), x: 487, y: 345, width: 210, height: 48, imageBox: { height: ui.assets.sprites.button_left.originalSize.height }, clickSound: null, onClick: () => navigate('zombies') })
    } else {
        const { plants, zombies } = await menuApi.getAlmanac()
        const names = page === 'plants'
            ? ['almanac_imitater', 'particles/seedpacketflash', 'almanac_plantcard', 'almanac_groundday', 'almanac_groundnight', 'almanac_groundpool', 'almanac_groundnightpool', 'almanac_groundroof']
            : ['almanac_zombiewindow', 'almanac_zombiewindow2', 'almanac_zombiecard', 'almanac_groundday', 'almanac_groundice']
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
                ui.image(details, sprites[`almanac_ground${plant.ground}`], { x: 521, y: 107 })
                AlmanacEntityView.create(details, 'plants', plant.id, 578, 140)
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
                AlmanacEntityView.create(details, 'zombies', zombie.id, 559, 175, { x: 517, y: 124, width: 197, height: 187 })
                ui.image(details, sprites.almanac_zombiecard, { x: 455, y: 78 })
                ui.label(details, { text: ui.text(zombie.key), font: 'button', color: new Color(190, 255, 235), x: 613, y: 362, baseline: true, align: 'center' })
                const header = drawAlmanacText(details, ui, ui.text(`${zombie.key}_DESCRIPTION_HEADER`, ''), { x: 485, y: 377, width: 258 })
                drawAlmanacText(details, ui, ui.text(`${zombie.key}_DESCRIPTION`, ''), { x: 485, y: 377 + header, width: 257, height: Math.max(20, 160 - header) })
            }
        }
        const choose = (entry: AlmanacPlantDefinition | AlmanacZombieDefinition) => {
            const key = page === 'plants' ? 'plant' : 'zombie'
            if (selection[key] === entry.id) return
            selection[key] = entry.id
            select(entry)
            void SoundLoader.play(SoundEffect.Tap)
        }
        if (page === 'plants') {
            // Draw rows top to bottom, right to left: plants may overflow upwards and rightwards.
            const drawOrder = [...plants].sort((a, b) => Math.floor(a.id / 8) - Math.floor(b.id / 8) || b.id - a.id)
            for (const plant of drawOrder) {
                const x = plant.id === 48 ? 20 : plant.id % 8 * 52 + 26
                const y = plant.id === 48 ? 23 : Math.floor(plant.id / 8) * 78 + 92
                const button = ui.button(parent, {
                    images: { normal: plant.id === 48 ? sprites.almanac_imitater : sprites['particles/seedpacketflash'] },
                    x, y, width: plant.id === 48 ? 34 : 50, height: plant.id === 48 ? 46 : 70,
                    imageBox: plant.id === 48 ? { width: 34, height: sprites.almanac_imitater.originalSize.height } : undefined,
                    pressSound: null, clickSound: null, pressOnly: true, pressOffset: [0, 0],
                    onPress: () => choose(plant),
                })
                button.node.name = plant.key
                if (plant.id === 48) {
                    const overlay = ui.image(button.node, sprites.almanac_imitater).node
                    const update = button.onStateChange!
                    button.onStateChange = state => { update(state); overlay.active = state === 'hover' }
                    button.onStateChange(button.isHovering ? 'hover' : 'normal')
                } else {
                    const packet = SeedPacketRenderer.drawSeedPacket({ definitions: ui.assets.presentation, parent: button.node, x: 0, y: 0, seedType: plant.id, cost: plant.cost, upgrade: plant.upgrade, costFont: ui.assets.fonts.packetCost })
                    packet.setSiblingIndex(0)
                    const visual = button.node.getChildByName('Visual')!
                    const update = button.onStateChange!
                    button.onStateChange = state => { update(state); visual.active = state === 'hover' || state === 'pressed' }
                    button.onStateChange(button.isHovering ? 'hover' : 'normal')
                }
            }
            select(plants.find(plant => plant.id === selection.plant) ?? plants[0])
        } else {
            for (const zombie of zombies) {
                const index = zombie.id === 25 ? 27 : zombie.id
                const button = ui.button(parent, { images: { normal: sprites.almanac_zombiewindow }, x: index % 5 * 85 + 22, y: Math.floor(index / 5) * 80 + 86, width: 76, height: 76, pressOffset: [0, 0], pressSound: null, clickSound: null, pressOnly: true, onPress: () => choose(zombie) })
                button.node.name = zombie.key
                const underlay = ui.additiveImage(button.node, sprites.almanac_zombiewindow, {}, 48)
                const clip = uiNode({
                    name: 'PortraitClip', parent: button.node, position: { x: 2, y: -2 },
                    anchor: { x: 0, y: 1 }, size: { width: 72, height: 72 }, mask: Mask.Type.GRAPHICS_RECT,
                }).node
                clip.addComponent(AlmanacZombiePortrait).initialize(zombie.id, async root => {
                    const atlas = await SpriteLoader.load('zombie_previews_cached')
                    if (!atlas) throw new Error('Missing zombie portrait atlas')
                    if (root.isValid) ui.image(root, getAtlasFrame(atlas, zombie.id, 76, 76, 8), { x: -2, y: -2 })
                })
                ui.image(button.node, sprites.almanac_zombiewindow2)
                const glow = ui.additiveImage(button.node, sprites.almanac_zombiewindow2, {}, 48)
                const update = button.onStateChange!
                button.onStateChange = state => { update(state); underlay.node.active = glow.node.active = state === 'hover' || state === 'pressed' }
                button.onStateChange(button.isHovering ? 'hover' : 'normal')
            }
            select(zombies.find(zombie => zombie.id === selection.zombie) ?? zombies[0])
        }
        ui.button(parent, { skin: 'almanacIndex', text: ui.text('ALMANAC_INDEX'), x: 32, y: 567, rightClickPressesVisual: true, onClick: () => navigate('almanac') })
    }
    ui.button(parent, { skin: 'almanacClose', text: ui.text('CLOSE_BUTTON'), x: 676, y: 567, rightClickPressesVisual: true, onClick: () => navigate('main') })
    await Promise.all([
        ...parent.getComponentsInChildren(PlantPreview).map(view => view.ready),
        ...parent.getComponentsInChildren(AlmanacEntityView).map(view => view.ready),
        ...parent.getComponentsInChildren(AlmanacZombiePortrait).map(view => view.ready),
    ])
}
