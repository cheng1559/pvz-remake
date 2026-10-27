import type { ClientApi } from './index.js'
import { installBattleBushes } from './bushes.js'

/** Remap the existing eased movement between endpoints constrained by the image edges. */
export function battlePanX(x: number, from: number, to: number, width: number, left: number, right: number): number {
    if (width >= right - left) return 0
    // The gameplay origin must stay fixed; only the house/street camera endpoints move.
    const limit = (value: number) => value === 0 ? 0 : Math.max(width / 2 - right, Math.min(-width / 2 - left, value))
    if (from === to) return limit(from)
    const progress = Math.max(0, Math.min(1, (x - from) / (to - from)))
    return limit(from) + (limit(to) - limit(from)) * progress
}

export async function installBattleBackgrounds(api: ClientApi): Promise<void> {
    const names = ['background1', 'background1unsodded', 'sod1row', 'sod3row',
        'background1_gameover_interior_overlay', 'background1_gameover_mask']
    const frames = new Map(await Promise.all(names.map(async name =>
        [name, await api.assets.sprite(`assets/images/${name}.png`)] as const)))
    const { Sprite, UITransform, Node, view: viewport } = api.host.get('cc')
    const { LevelView } = api.host.get('client/level/LevelView')
    const createBattleBushes = installBattleBushes(api)
    // TV115 adds 240px horizontally and 60px vertically around the original 1400x600 scene.
    const replace = (node: any, name: string) => {
        const frame = frames.get(name), sprite = node.getComponent(Sprite)
        sprite.sizeMode = Sprite.SizeMode.CUSTOM
        sprite.spriteFrame = frame
        const transform = node.getComponent(UITransform)
        transform.setAnchorPoint(0, 1)
        transform.setContentSize(frame.originalSize.width, frame.originalSize.height)
    }
    const place = (node: any, x: number, y: number) => node.setPosition(x, y, node.position.z)
    const gameOvers = new WeakSet<object>(), patched = new WeakSet<object>(), doors = new WeakSet<object>()
    const cameras = new WeakMap<object, { node: any; background: any; x: number; from: number; to: number }>()
    const lawns = new WeakMap<object, () => void>()
    const introPatched = new WeakSet<object>()
    const applyCamera = (camera: NonNullable<ReturnType<typeof cameras.get>>) => {
        const left = camera.background.position.x
        const right = left + camera.background.getComponent(UITransform).width
        place(camera.node, battlePanX(camera.x, camera.from, camera.to, viewport.getVisibleSize().width, left, right), camera.node.position.y)
    }
    api.host.around(LevelView, 'create', async function (next, root, content, levelId, playerName, initial, ...args) {
        const view = await next(root, content, levelId, playerName, initial, ...args)
        const board = content.presentation.boards[view.level.board]
        if (!root.isValid || board.background !== 'pvz:background1unsodded') return view
        const slots = root.getComponentInChildren('LevelSlots')
        const layout = content.presentation.levels[levelId].intro
        const sod = layout.sod.replace(/^pvz:/, '')
        if (!frames.has(sod)) return view
        replace(slots.background, 'background1unsodded')
        place(slots.background, board.backgroundX - 700 - 240, 300 + 60)
        await createBattleBushes(slots, content)
        view.entityRenderer.syncLayerOrder(initial)
        // Rolls and their later-created dust stay on the lawn, behind the foreground bushes.
        const orderSod = (node: any) => {
            if (node !== slots.sodRoll && node.name !== 'SodRoll' && node.name !== 'ParticleSystem_sodroll') return
            const index = slots.entityLayer.getSiblingIndex()
            node.setSiblingIndex(index - (node.getSiblingIndex() < index ? 1 : 0))
        }
        slots.board.on(Node.EventType.CHILD_ADDED, orderSod)
        slots.board.children.slice().forEach(orderSod)
        const intro = view.intro
        const camera = { node: slots.board, background: slots.background, x: slots.board.position.x,
            from: intro.elapsedTicks <= 450 ? 220 : -380, to: intro.elapsedTicks <= 450 ? -380 : 0 }
        cameras.set(intro, camera)
        cameras.set(view.gameOver, camera)
        const introPrototype = Object.getPrototypeOf(intro)
        if (!introPatched.has(introPrototype)) {
            introPatched.add(introPrototype)
            api.host.around(introPrototype, 'sync', function (next, ...args) {
                const result = next(...args), camera = cameras.get(this)
                lawns.get(this)?.()
                if (camera && !this.layout.stationary) {
                    Object.assign(camera, { x: camera.node.position.x,
                        from: this.elapsedTicks <= 450 ? 220 : -380, to: this.elapsedTicks <= 450 ? -380 : 0 })
                    applyCamera(camera)
                }
                return result
            })
        }
        const resizeCamera = () => { if (!layout.stationary || view.gameOver.active) applyCamera(camera) }
        viewport.on('design-resolution-changed', resizeCamera)
        root.once(Node.EventType.NODE_DESTROYED, () => viewport.off('design-resolution-changed', resizeCamera))
        resizeCamera()
        replace(slots.sodRow, sod)
        replace(slots.tutorialLawnFlash, sod)
        if (sod === 'background1') {
            // Preserve the reveal mask and sample past the TV background's added margins.
            place(slots.sodRow, -(layout.sourceX ?? 0) - 240, 60)
            place(slots.tutorialLawnFlash, layout.x - 400 - (layout.sourceX ?? 0) - 240, 300 - layout.y + 60)
        } else {
            place(slots.sodClip, layout.x - 400, 300 - layout.y)
            slots.sodClip.getComponent(UITransform).height = frames.get(sod).originalSize.height
            place(slots.sodRow, 0, 0)
            place(slots.tutorialLawnFlash, slots.sodClip.position.x, slots.sodClip.position.y)
        }
        if (layout.existingSod) {
            const existing = layout.existingSod, node = slots.board.getChildByName('ExistingSod')
            const name = existing.sprite.replace(/^pvz:/, '')
            if (frames.has(name)) {
                replace(node, name)
                place(node, existing.x - 400, 300 - existing.y)
            }
        }
        if (sod === 'background1') {
            const existing = slots.board.getChildByName('ExistingSod')
            const syncLawn = () => {
                const complete = !layout.rolls.length || slots.sodClip.getComponent(UITransform).width >= layout.width
                const sprite = slots.background.getComponent(Sprite)
                const frame = frames.get(complete ? 'background1' : 'background1unsodded')
                // The two full images also differ outside the 773px reveal strip.
                // Once revealed, draw one whole image instead of keeping that permanent seam.
                if (sprite.spriteFrame !== frame) sprite.spriteFrame = frame
                slots.sodRow.active = !complete
                if (existing) existing.active = !complete
            }
            lawns.set(intro, syncLawn)
            syncLawn()
        }
        gameOvers.add(view.gameOver)
        const prototype = Object.getPrototypeOf(view.gameOver)
        if (!patched.has(prototype)) {
            patched.add(prototype)
            api.host.around(prototype, 'draw', function (next, ...args) {
                const result = next(...args), camera = cameras.get(this)
                if (camera) {
                    Object.assign(camera, { x: camera.node.position.x, from: 0, to: this.presentation.panX })
                    applyCamera(camera)
                }
                return result
            })
            api.host.around(prototype, 'sync', function (next, ...args) {
                const result = next(...args)
                if (gameOvers.has(this)) for (const [nodeName, image] of [
                    ['GameOverDoorInterior', 'background1_gameover_interior_overlay'],
                    ['GameOverDoorMask', 'background1_gameover_mask'],
                ] as const) {
                    const node = this.board.getChildByName(nodeName)
                    if (node && !doors.has(node)) {
                        replace(node, image)
                        doors.add(node)
                    }
                }
                return result
            })
        }
        return view
    })
}
