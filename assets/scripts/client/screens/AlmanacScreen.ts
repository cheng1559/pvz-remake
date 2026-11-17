import { modResources } from '@/client/content/ModResources'
import { Color, type EventMouse, Mask, Node } from 'cc'
import { SeedPacketRenderer } from '@/client/hud/SeedPacketRenderer'
import { SeedPacketView } from '@/client/hud/SeedPacketView'
import { WheelPageTurner } from '@/client/ui/WheelPageTurner'
import { PlantPreview } from '@/client/hud/PlantPreview'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { UI } from '@/client/ui/UI'
import { PLANT_SCROLLBAR_COLORS } from '@/client/ui/UIScroll'
import { uiNode } from '@/client/view/uiNode'
import { menuApi } from '@/client/api/MenuApi'
import { loadGameplayContent } from '@/client/game/loadIntegratedGameContent'
import { packetSubject, plantPacket } from '@/client/plants/definitions'
import { zombieDefinition } from '@/client/zombies/definitions'
import type { AlmanacCard, AlmanacZombieView } from '@/shared/menu'
import { ALMANAC_GROUNDS, almanacGround, gridItemCell } from '@/shared/content/presentation'
import { drawAlmanacText, drawMiddleAlmanacText } from './AlmanacText'
import type { MenuAction } from './MenuPages'
import { AlmanacEntityView } from './AlmanacEntityView'
import { AlmanacZombiePortrait } from './AlmanacZombiePortrait'
import { Haptics } from '@/platform/Haptics'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { uiAreaEdge } from '@/client/view/ClientViewport'

/** What the almanac has selected: the plant (its place on its page), the plant page it is on, and the zombie. */
export interface AlmanacSelection { plant: number, zombie: number, plantPage?: number }

/** A card of a plant page: the first page's are the chooser's grid (`grid`), the later pages' a group's seeds. */
type PlantCard = AlmanacCard & { grid?: true }

/** AlmanacDialog's ALMANAC_PLANT_POSITION: where the plants' page shows a plant (the corner of its cell). */
const ALMANAC_PLANT = { x: 578, y: 140 }
/** How much lower than one put down in that cell the plants' page shows a zombie. */
const ALMANAC_ZOMBIE_DROP = 10
/** The plants' page's card grid (AlmanacDialog's 8 columns from 26, 92, 52 x 78 apart), as `uiNode` places it. */
const CARD_AREA = { x: 22, y: -88, width: 424, height: 472 }

export async function showAlmanacScreen(parent: Node, ui: UI, page: 'almanac' | 'plants' | 'zombies', navigate: (action: MenuAction) => void, selection: AlmanacSelection = { plant: 0, zombie: 0 }): Promise<void> {
    if (page === 'almanac') {
        // AlmanacDialog::SetupLayoutIndex places the sunflower at (167, 225) in 1.2.0.1073 (PvZ-Portable has 255).
        AlmanacEntityView.create(parent, 'plants', 'pvz:sunflower', 167, 225)
        AlmanacEntityView.create(parent, 'zombies', 'pvz:normal', 535, 215)
        ui.button(parent, { skin: 'seed', text: ui.text('VIEW_PLANTS'), x: 130, y: 345, width: 156, height: 42, font: 'yellow', color: Color.WHITE, onClick: () => navigate('plants') })
        ui.button(parent, { text: ui.text('VIEW_ZOMBIES'), x: 487, y: 345, width: 210, height: 48, imageBox: { height: ui.assets.sprites.button_left.originalSize.height }, clickSound: null, onClick: () => navigate('zombies') })
    } else {
        // `/cheatseed` opens the whole almanac, with the other seed groups' pages after the plants' (AlmanacView).
        const { plants, zombies, groupPages = [] } = await menuApi.getAlmanac(GameDebugSettings.cheatSeedsEnabled)
        // Either page may show any of the grounds (the presentation's `almanac`).
        const grounds = ALMANAC_GROUNDS.map(ground => `almanac_ground${ground}`)
        const names = page === 'plants'
            ? ['pvz:seedpacketflash', 'almanac_plantcard', ...grounds]
            : ['almanac_zombiewindow', 'almanac_zombiewindow2', 'almanac_zombieblank', 'almanac_zombiecard', ...grounds]
        const [frames, seeds] = await Promise.all([
            Promise.all(names.map(async name => [name, await modResources.sprite(name)] as const)),
            // A group's seed is drawn as the chooser draws its card, from its definition.
            groupPages.length ? loadGameplayContent().then(content => content.definitions.seeds) : undefined,
        ])
        if (!parent.isValid) throw new Error('Almanac was destroyed while loading')
        const sprites = Object.fromEntries(frames)
        let details: Node | null = null
        // AlmanacDialog draws the selected entry itself; its buttons are widgets drawn above it. The holder, made at the
        // first selection (after the list, before the footer buttons), keeps a re-selected entry in that place.
        let detailsLayer: Node | null = null
        const newDetails = (name: string): Node => {
            if (details) { details.active = false; details.destroy() }
            detailsLayer ??= uiNode({ name: 'Details', parent, anchor: { x: 0, y: 1 } }).node
            return details = uiNode({ name: `${name}Details`, parent: detailsLayer, anchor: { x: 0, y: 1 } }).node
        }
        const plantPosition = (id: number) => ({ x: id % 8 * 52 + 26, y: Math.floor(id / 8) * 78 + 92 })
        const describe = (node: Node, headerKey: string, bodyKey: string) => {
            const header = drawAlmanacText(node, ui, ui.text(headerKey), { x: 485, y: 309, width: 258 })
            drawAlmanacText(node, ui, ui.text(bodyKey), {
                x: 485, y: 309 + header, width: 258, height: Math.max(20, 210 - header), scrollColors: PLANT_SCROLLBAR_COLORS,
            })
        }
        const showPlant = (card: PlantCard) => {
            const node = newDetails(card.seed)
            if (card.grid) {
                const { nameKey } = plantPacket(ui.assets.presentation, card.seed)
                ui.image(node, sprites[`almanac_ground${almanacGround(ui.assets.presentation, card.seed)}`], { x: 521, y: 107 })
                AlmanacEntityView.create(node, 'plants', card.seed, ALMANAC_PLANT.x, ALMANAC_PLANT.y)
                ui.image(node, sprites.almanac_plantcard, { x: 459, y: 86 })
                ui.label(node, { text: ui.text(nameKey), font: 'yellow', x: 617, y: 288, baseline: true, align: 'center' })
                describe(node, `${nameKey}_DESCRIPTION_HEADER`, `${nameKey}_DESCRIPTION`)
            } else {
                // A group's card shows what it puts down where a plant stands, as it would stand in that cell: its
                // plant, its zombie (put down 30 left of and above the cell, Challenge::IZombiePlaceZombie, here 10
                // lower) or the thing of a cell (a grave, a crater, its corner its presentation's `cell` from the
                // cell's, where it lies from a plant in the level). The card's frame hides what stands out.
                const seed = seeds![card.seed], subject = packetSubject(ui.assets.presentation, seed)
                const { x, y } = ALMANAC_PLANT, ground = seed.kind === 'grave' || seed.kind === 'crater' ? 'day' : almanacGround(ui.assets.presentation, seed.id)
                ui.image(node, sprites[`almanac_ground${ground}`], { x: 521, y: 107 })
                if (seed.kind === 'plant') AlmanacEntityView.create(node, 'plants', seed.id, x, y)
                else if (seed.kind === 'zombie') AlmanacEntityView.create(node, 'zombies', seed.id, x - 30, y - 30 + ALMANAC_ZOMBIE_DROP)
                else {
                    const [cellX, cellY] = gridItemCell(ui.assets.presentation, subject.gridItem!)
                    SeedPacketRenderer.drawGridItem(node, undefined, subject.gridItem!, x + cellX, y + cellY, 1)
                }
                ui.image(node, sprites.almanac_plantcard, { x: 459, y: 86 })
                ui.label(node, { text: ui.text(subject.nameKey), font: 'yellow', x: 617, y: 288, baseline: true, align: 'center' })
                // The hidden cards share a placeholder, in the middle of the description's box as the zombies' page
                // has [NOT_ENCOUNTERED_YET]; a Mod's plant has its description when its text table does.
                const header = `${subject.nameKey}_DESCRIPTION_HEADER`, body = `${subject.nameKey}_DESCRIPTION`
                if (card.hidden) drawMiddleAlmanacText(node, ui, ui.text('ALMANAC_HIDDEN_DESCRIPTION'), { x: 485, y: 309, width: 258, height: 210 })
                else if (ui.hasText(header) && ui.hasText(body)) describe(node, header, body)
            }
            drawAlmanacText(node, ui, `{KEYWORD}${ui.text('COST')}:{STAT} ${card.cost}`, { x: 485, y: 520, width: 134 })
            // A seed with no cooldown (a zombie's, the grave's, a bowling nut's) has none.
            const wait = ui.text(card.refreshTime === 0 ? 'WAIT_TIME_NONE' : card.refreshTime === 750 ? 'WAIT_TIME_SHORT'
                : card.refreshTime === 3000 ? 'WAIT_TIME_LONG' : 'WAIT_TIME_VERY_LONG')
            drawAlmanacText(node, ui, `{KEYWORD}${ui.text('WAIT_TIME')}: {STAT}${wait}`, { x: 600, y: 520, width: 139, align: 'right' })
        }
        const showZombie = (zombie: AlmanacZombieView) => {
            const { nameKey } = zombieDefinition(ui.assets.presentation, zombie.zombie)
            const node = newDetails(zombie.zombie)
            ui.image(node, sprites[`almanac_ground${almanacGround(ui.assets.presentation, zombie.zombie)}`], { x: 518, y: 110 })
            AlmanacEntityView.create(node, 'zombies', zombie.zombie, 559, 175, { x: 517, y: 124, width: 197, height: 187 })
            ui.image(node, sprites.almanac_zombiecard, { x: 455, y: 78 })
            ui.label(node, { text: ui.text(nameKey), font: 'button', color: new Color(190, 255, 235), x: 613, y: 362, baseline: true, align: 'center' })
            if (zombie.described) {
                const header = drawAlmanacText(node, ui, ui.text(`${nameKey}_DESCRIPTION_HEADER`), { x: 485, y: 377, width: 258 })
                // Steam 1096 AlmanacDialog: the description's box is 485, 377, 258 x 160, the header's width.
                drawAlmanacText(node, ui, ui.text(`${nameKey}_DESCRIPTION`), { x: 485, y: 377 + header, width: 258, height: Math.max(20, 160 - header) })
            } else {
                // AlmanacDialog::DrawZombies: [NOT_ENCOUNTERED_YET] in the middle of the 258x170 description box.
                drawMiddleAlmanacText(node, ui, ui.text('NOT_ENCOUNTERED_YET'), { x: 484, y: 377, width: 258, height: 170 })
            }
        }
        const tap = () => {
            Haptics.play()
            void SoundSystem.play(SoundEffect.Tap)
        }
        // More than a plant page turns them with the footer's Previous Page and Next Page.
        let turn: ((step: number) => void) | undefined
        if (page === 'plants') {
            const pages: PlantCard[][] = [
                plants.map(card => ({ ...card, grid: true as const })),
                ...groupPages,
            ]
            // The cards of the page shown, under the selected entry, layered as the chooser's (SeedPacketView's
            // iconLayer): every picture and cost over every packet, so a tilted picture shows over its neighbours
            // whichever way it leans, and the buttons' flash over both.
            // The mouse wheel over them turns the pages too, as the chooser's; over the description it scrolls that.
            const cardArea = uiNode({ name: 'CardArea', parent, anchor: { x: 0, y: 1 }, position: CARD_AREA, size: CARD_AREA }).node
            const [cards, cardIcons, cardButtons] = ['Cards', 'CardIcons', 'CardButtons'].map(name =>
                uiNode({ name, parent: cardArea, anchor: { x: 0, y: 1 }, position: { x: -CARD_AREA.x, y: -CARD_AREA.y } }).node)
            const pageWheel = new WheelPageTurner(step => turn?.(step))
            cardArea.on(Node.EventType.MOUSE_WHEEL, (event: EventMouse) => pageWheel.wheel(event, !!turn), undefined, true)
            let shownPage = 0
            const choose = (card: PlantCard) => {
                if (selection.plant === card.place && (selection.plantPage ?? 0) === shownPage) return
                selection.plant = card.place
                selection.plantPage = shownPage
                showPlant(card)
                tap()
            }
            const showPage = (index: number) => {
                shownPage = index
                for (const layer of [cards, cardIcons, cardButtons]) for (const child of [...layer.children]) child.destroy()
                for (const card of [...pages[index]].sort((a, b) => a.place - b.place)) {
                    const { x, y } = plantPosition(card.place)
                    const button = ui.button(cardButtons, {
                        images: { normal: sprites['pvz:seedpacketflash'] }, x, y, width: 50, height: 70,
                        pressSound: null, clickSound: null, clickOnPress: !GameDebugSettings.isMobileMode(), pressOffset: [0, 0],
                        onClick: () => choose(card),
                    })
                    button.hapticsEnabled = false
                    button.node.name = card.seed
                    const subject = card.grid ? undefined : packetSubject(ui.assets.presentation, seeds![card.seed])
                    const look = card.grid ? { plant: plantPacket(ui.assets.presentation, card.seed).plant, upgrade: ui.assets.presentation.almanac[card.seed]?.upgrade }
                        : { plant: subject!.plant, zombie: subject!.zombie, gridItem: subject!.gridItem }
                    new SeedPacketView({ definitions: ui.assets.presentation, name: `Card-${button.node.name}`, parent: cards, layer: parent.layer,
                        x: button.node.position.x, y: button.node.position.y, ...look, cost: card.cost, costFont: ui.assets.fonts.packetCost,
                        iconLayer: cardIcons, shade: false })
                    const visual = button.node.getChildByName('Visual')!
                    const update = button.onStateChange!
                    button.onStateChange = state => { update(state); visual.active = state === 'hover' || state === 'pressed' }
                    button.onStateChange(button.isHovering ? 'hover' : 'normal')
                }
                const remembered = (selection.plantPage ?? 0) === index ? pages[index].find(card => card.place === selection.plant) : undefined
                const shown = remembered ?? pages[index][0]
                if (!shown) return
                selection.plant = shown.place
                selection.plantPage = index
                showPlant(shown)
            }
            showPage(pages[selection.plantPage ?? 0] ? selection.plantPage ?? 0 : 0)
            if (pages.length > 1) turn = step => showPage((shownPage + step + pages.length) % pages.length)
        } else {
            for (const zombie of zombies) {
                const x = zombie.place % 5 * 85 + 22, y = Math.floor(zombie.place / 5) * 80 + 86
                if (!zombie.shown) { ui.image(parent, sprites.almanac_zombieblank, { x, y }); continue }
                // AlmanacDialog::DrawZombies draws the window image at its own size over the 76x76 button.
                const windowSize = sprites.almanac_zombiewindow.originalSize
                const button = ui.button(parent, { images: { normal: sprites.almanac_zombiewindow }, x, y, width: 76, height: 76,
                    imageBox: { width: windowSize.width, height: windowSize.height }, pressOffset: [0, 0], pressSound: null, clickSound: null, clickOnPress: !GameDebugSettings.isMobileMode(), onClick: () => {
                        if (selection.zombie === zombie.place) return
                        selection.zombie = zombie.place
                        showZombie(zombie)
                        tap()
                    } })
                button.hapticsEnabled = false
                button.node.name = zombie.zombie
                const underlay = ui.additiveImage(button.node, sprites.almanac_zombiewindow, {}, 48)
                const clip = uiNode({
                    name: 'PortraitClip', parent: button.node, position: { x: 2, y: -2 },
                    anchor: { x: 0, y: 1 }, size: { width: 72, height: 72 }, mask: Mask.Type.GRAPHICS_RECT,
                }).node
                clip.addComponent(AlmanacZombiePortrait).initialize(zombie.zombie)
                ui.image(button.node, sprites.almanac_zombiewindow2)
                const glow = ui.additiveImage(button.node, sprites.almanac_zombiewindow2, {}, 48)
                const update = button.onStateChange!
                button.onStateChange = state => { update(state); underlay.node.active = glow.node.active = state === 'hover' || state === 'pressed' }
                button.onStateChange(button.isHovering ? 'hover' : 'normal')
            }
            showZombie(zombies.find(zombie => zombie.shown && zombie.place === selection.zombie) ?? zombies[0])
        }
        // Footer buttons keep their margins from the UI area's edges.
        ui.button(uiAreaEdge(parent, 'left'), { skin: 'almanacIndex', text: ui.text('ALMANAC_INDEX'), x: 32, y: 567, rightClickPressesVisual: true, onClick: () => navigate('almanac') })
        // Previous Page and Next Page beside Close, Next's image mirrored; they go round.
        if (turn) {
            const right = uiAreaEdge(parent, 'right'), pageTurn = turn
            ui.button(right, { skin: 'almanacIndex', text: ui.text('ALMANAC_PREVIOUS_PAGE'), x: 336, y: 567, rightClickPressesVisual: true, onClick: () => pageTurn(-1) })
            ui.button(right, { skin: 'almanacIndex', mirrored: true, text: ui.text('ALMANAC_NEXT_PAGE'), x: 506, y: 567, rightClickPressesVisual: true, onClick: () => pageTurn(1) })
        }
    }
    ui.button(uiAreaEdge(parent, 'right'), { skin: 'almanacClose', text: ui.text('CLOSE_BUTTON'), x: 676, y: 567, rightClickPressesVisual: true, onClick: () => navigate('back') })
    await Promise.all([
        ...parent.getComponentsInChildren(PlantPreview).map(view => view.ready),
        ...parent.getComponentsInChildren(AlmanacEntityView).map(view => view.ready),
        ...parent.getComponentsInChildren(AlmanacZombiePortrait).map(view => view.ready),
    ])
}
