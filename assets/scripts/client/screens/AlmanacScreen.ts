import { modResources } from '@/client/content/ModResources'
import { Color, Mask, type Node, SpriteFrame } from 'cc'
import { getAtlasFrame, SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { PlantPreview } from '@/client/hud/PlantPreview'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { UI } from '@/client/ui/UI'
import { PLANT_SCROLLBAR_COLORS } from '@/client/ui/UIScroll'
import { uiNode } from '@/client/view/uiNode'
import { menuApi } from '@/client/api/MenuApi'
import type { AlmanacPlantDefinition, AlmanacZombieView } from '@/shared/menu'
import { almanacTextHeight, drawAlmanacText } from './AlmanacText'
import type { MenuAction } from './MenuPages'
import { AlmanacEntityView } from './AlmanacEntityView'
import { AlmanacZombiePortrait } from './AlmanacZombiePortrait'
import { Haptics } from '@/platform/Haptics'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { uiAreaEdge } from '@/client/view/ClientViewport'

export interface AlmanacSelection { plant: number, zombie: number }

export async function showAlmanacScreen(parent: Node, ui: UI, page: 'almanac' | 'plants' | 'zombies', navigate: (action: MenuAction) => void, selection: AlmanacSelection = { plant: 0, zombie: 0 }): Promise<void> {
    if (page === 'almanac') {
        // AlmanacDialog::SetupLayoutIndex places the sunflower at (167, 225) in 1.2.0.1073 (PvZ-Portable has 255).
        AlmanacEntityView.create(parent, 'plants', 1, 167, 225)
        AlmanacEntityView.create(parent, 'zombies', 0, 535, 215)
        ui.button(parent, { skin: 'seed', text: ui.text('VIEW_PLANTS'), x: 130, y: 345, width: 156, height: 42, font: 'yellow', color: Color.WHITE, onClick: () => navigate('plants') })
        ui.button(parent, { text: ui.text('VIEW_ZOMBIES'), x: 487, y: 345, width: 210, height: 48, imageBox: { height: ui.assets.sprites.button_left.originalSize.height }, clickSound: null, onClick: () => navigate('zombies') })
    } else {
        const { plants, zombies } = await menuApi.getAlmanac()
        const names = page === 'plants'
            ? ['almanac_imitater', 'particles/seedpacketflash', 'almanac_plantcard', 'almanac_groundday', 'almanac_groundnight', 'almanac_groundpool', 'almanac_groundnightpool', 'almanac_groundroof']
            : ['almanac_zombiewindow', 'almanac_zombiewindow2', 'almanac_zombieblank', 'almanac_zombiecard', 'almanac_groundday', 'almanac_groundice']
        const frames = await Promise.all(names.map(async name => {
            const frame = await modResources.asset(name, SpriteFrame)
            if (!frame) throw new Error(`Missing almanac image: ${name}`)
            return [name, frame] as const
        }))
        if (!parent.isValid) throw new Error('Almanac was destroyed while loading')
        const sprites = Object.fromEntries(frames)
        let details: Node | null = null
        // AlmanacDialog draws the selected entry itself; its buttons are widgets drawn above it. The holder, made at the
        // first selection (after the list, before the footer buttons), keeps a re-selected entry in that place.
        let detailsLayer: Node | null = null
        const plantPosition = (id: number) => ({ x: id === 48 ? 20 : id % 8 * 52 + 26, y: id === 48 ? 23 : Math.floor(id / 8) * 78 + 92 })
        const select = (entry: AlmanacPlantDefinition | AlmanacZombieView) => {
            if (details) { details.active = false; details.destroy() }
            detailsLayer ??= uiNode({ name: 'Details', parent, anchor: { x: 0, y: 1 } }).node
            details = uiNode({ name: `${entry.key}Details`, parent: detailsLayer, anchor: { x: 0, y: 1 } }).node
            if (page === 'plants') {
                const plant = entry as AlmanacPlantDefinition
                ui.image(details, sprites[`almanac_ground${plant.ground}`], { x: 521, y: 107 })
                AlmanacEntityView.create(details, 'plants', plant.id, 578, 140)
                ui.image(details, sprites.almanac_plantcard, { x: 459, y: 86 })
                ui.label(details, { text: ui.text(plant.key), font: 'yellow', x: 617, y: 288, baseline: true, align: 'center' })
                const header = drawAlmanacText(details, ui, ui.text(`${plant.key}_DESCRIPTION_HEADER`), { x: 485, y: 309, width: 258 })
                drawAlmanacText(details, ui, ui.text(`${plant.key}_DESCRIPTION`), {
                    x: 485, y: 309 + header, width: 258, height: Math.max(20, 210 - header), scrollColors: PLANT_SCROLLBAR_COLORS,
                })
                if (plant.id !== 48) {
                    drawAlmanacText(details, ui, `{KEYWORD}${ui.text('COST')}:{STAT} ${plant.cost}`, { x: 485, y: 520, width: 134 })
                    const wait = ui.text(plant.refreshTime === 750 ? 'WAIT_TIME_SHORT' : plant.refreshTime === 3000 ? 'WAIT_TIME_LONG' : 'WAIT_TIME_VERY_LONG')
                    drawAlmanacText(details, ui, `{KEYWORD}${ui.text('WAIT_TIME')}: {STAT}${wait}`, { x: 600, y: 520, width: 139, align: 'right' })
                }
            } else {
                const zombie = entry as AlmanacZombieView
                ui.image(details, sprites[zombie.iceGround ? 'almanac_groundice' : 'almanac_groundday'], { x: 518, y: 110 })
                AlmanacEntityView.create(details, 'zombies', zombie.id, 559, 175, { x: 517, y: 124, width: 197, height: 187 })
                ui.image(details, sprites.almanac_zombiecard, { x: 455, y: 78 })
                ui.label(details, { text: ui.text(zombie.key), font: 'button', color: new Color(190, 255, 235), x: 613, y: 362, baseline: true, align: 'center' })
                if (zombie.described) {
                    const header = drawAlmanacText(details, ui, ui.text(`${zombie.key}_DESCRIPTION_HEADER`), { x: 485, y: 377, width: 258 })
                    drawAlmanacText(details, ui, ui.text(`${zombie.key}_DESCRIPTION`), { x: 485, y: 377 + header, width: 257, height: Math.max(20, 160 - header) })
                } else {
                    // AlmanacDialog::DrawZombies: [NOT_ENCOUNTERED_YET] in the middle of the 258x170 description box.
                    const text = ui.text('NOT_ENCOUNTERED_YET')
                    drawAlmanacText(details, ui, text, { x: 484, y: 377 + (170 - almanacTextHeight(ui, text, 258)) / 2, width: 258, align: 'center' })
                }
            }
        }
        const choose = (entry: AlmanacPlantDefinition | AlmanacZombieView) => {
            const key = page === 'plants' ? 'plant' : 'zombie'
            if (selection[key] === entry.id) return
            selection[key] = entry.id
            select(entry)
            Haptics.play()
            void SoundSystem.play(SoundEffect.Tap)
        }
        if (page === 'plants') {
            // Draw rows top to bottom, right to left: plants may overflow upwards and rightwards.
            const drawOrder = [...plants].sort((a, b) => Math.floor(a.id / 8) - Math.floor(b.id / 8) || b.id - a.id)
            for (const plant of drawOrder) {
                const { x, y } = plantPosition(plant.id)
                const button = ui.button(parent, {
                    images: { normal: plant.id === 48 ? sprites.almanac_imitater : sprites['particles/seedpacketflash'] },
                    x, y, width: plant.id === 48 ? 34 : 50, height: plant.id === 48 ? 46 : 70,
                    imageBox: plant.id === 48 ? { width: 34, height: sprites.almanac_imitater.originalSize.height } : undefined,
                    pressSound: null, clickSound: null, clickOnPress: !GameDebugSettings.isMobileMode(), pressOffset: [0, 0],
                    onClick: () => choose(plant),
                })
                button.hapticsEnabled = false
                button.node.name = plant.key
                if (plant.id === 48) {
                    const overlay = ui.image(button.node, sprites.almanac_imitater).node
                    const update = button.onStateChange!
                    button.onStateChange = state => { update(state); overlay.active = state === 'hover' || state === 'pressed' }
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
                const x = index % 5 * 85 + 22, y = Math.floor(index / 5) * 80 + 86
                if (!zombie.shown) { ui.image(parent, sprites.almanac_zombieblank, { x, y }); continue }
                // AlmanacDialog::DrawZombies draws the window image at its own size over the 76x76 button.
                const windowSize = sprites.almanac_zombiewindow.originalSize
                const button = ui.button(parent, { images: { normal: sprites.almanac_zombiewindow }, x, y, width: 76, height: 76,
                    imageBox: { width: windowSize.width, height: windowSize.height }, pressOffset: [0, 0], pressSound: null, clickSound: null, clickOnPress: !GameDebugSettings.isMobileMode(), onClick: () => choose(zombie) })
                button.hapticsEnabled = false
                button.node.name = zombie.key
                const underlay = ui.additiveImage(button.node, sprites.almanac_zombiewindow, {}, 48)
                const clip = uiNode({
                    name: 'PortraitClip', parent: button.node, position: { x: 2, y: -2 },
                    anchor: { x: 0, y: 1 }, size: { width: 72, height: 72 }, mask: Mask.Type.GRAPHICS_RECT,
                }).node
                clip.addComponent(AlmanacZombiePortrait).initialize(zombie.id, async root => {
                    const atlas = await modResources.asset('zombie_previews_cached', SpriteFrame)
                    if (!atlas) throw new Error('Missing zombie portrait atlas')
                    if (root.isValid) ui.image(root, getAtlasFrame(atlas, zombie.id, 76, 76, 8), { x: -2, y: -2 })
                })
                ui.image(button.node, sprites.almanac_zombiewindow2)
                const glow = ui.additiveImage(button.node, sprites.almanac_zombiewindow2, {}, 48)
                const update = button.onStateChange!
                button.onStateChange = state => { update(state); underlay.node.active = glow.node.active = state === 'hover' || state === 'pressed' }
                button.onStateChange(button.isHovering ? 'hover' : 'normal')
            }
            select(zombies.find(zombie => zombie.shown && zombie.id === selection.zombie) ?? zombies[0])
        }
        // Footer buttons keep their margins from the UI area's edges.
        ui.button(uiAreaEdge(parent, 'left'), { skin: 'almanacIndex', text: ui.text('ALMANAC_INDEX'), x: 32, y: 567, rightClickPressesVisual: true, onClick: () => navigate('almanac') })
    }
    ui.button(uiAreaEdge(parent, 'right'), { skin: 'almanacClose', text: ui.text('CLOSE_BUTTON'), x: 676, y: 567, rightClickPressesVisual: true, onClick: () => navigate('back') })
    await Promise.all([
        ...parent.getComponentsInChildren(PlantPreview).map(view => view.ready),
        ...parent.getComponentsInChildren(AlmanacEntityView).map(view => view.ready),
        ...parent.getComponentsInChildren(AlmanacZombiePortrait).map(view => view.ready),
    ])
}
