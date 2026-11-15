import { Camera, Canvas, Color, Director, director, Material, Node, RenderRoot2D, RenderTexture, screen, Sprite, SpriteFrame, UITransform, Vec4, view } from 'cc'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { compositeMaterial } from './bakeSprite'
import { uiNode } from './uiNode'

/** The enlarged picture's own layer: only the camera that presents it sees it. */
const PRESENT_LAYER = 1 << 18

interface State {
    /** The scene's camera, drawing into the small picture meanwhile. */
    main: Camera
    /** The small picture, its place over the window, and the camera that draws it there. */
    texture: RenderTexture
    root: Node
    picture: Sprite
    material: Material
    present: Camera
    width: number
    height: number
    /** What the scene's camera saw before. */
    visibility: number
    /** The sharpness the picture is enlarged with, as its material has it. */
    sharpness?: number
}

/**
 * The game drawn as the original draws it (unless `/highresolution`), at one pixel to a unit of its 800x600 layout (as wide as the
 * window makes it), and that picture enlarged over the window. The original composes every frame at that size, so
 * its parts are turned and scaled on that grid before the frame is enlarged; drawn straight to the window, as
 * otherwise here, they are sharper than it ever shows them.
 *
 * The picture is an even number of pixels each way. The layout is laid out from its middle, so an odd number would
 * put every pixel half a unit off the layout's grid: whatever sits on a whole unit, as most of the original does on
 * its 800x600, would be smeared over two pixels, and the edges where its parts meet would fall on pixel centers.
 * It is the next such number past the window, shown from its middle at the window's own scale: the window cuts off
 * under a unit of it each side. Fitted to the window instead, it would stretch and spring back by a unit at its edges
 * with every two units the window grew, and what is there would hop as the window was dragged.
 *
 * The scene's camera draws into the small picture in place of the window, and a second camera covers the window with
 * it. The picture is presented over the whole window, so the scene's camera goes on taking the window's pointer
 * (Camera.presentedOnWindow), to within the unit the window cuts off at its edges.
 *
 * Enlarged, a pixel of the picture keeps its edge as crisp as `/sharpness` asks: the original leaves the enlarging to
 * the display, which is crisper than plain LINEAR filtering on most.
 */
export class OriginalResolution {
    private static state?: State
    private static watching = false
    private static starting = false

    /** Takes up the setting: on, off, or the window's new size. */
    static refresh(): void {
        if (!this.watching) {
            this.watching = true
            director.on(Director.EVENT_BEFORE_DRAW, () => this.refresh())
        }
        const state = this.state
        if (GameDebugSettings.highResolutionEnabled) { this.stop(); return }
        const main = state?.main.isValid ? state.main : director.getScene()?.getComponentInChildren(Canvas)?.cameraComponent
        if (!main?.isValid) { this.stop(); return }
        // What the camera shows when it draws to the window: the whole window, in the layout's units. One pixel to each.
        const window = screen.windowSize, units = { width: window.width / view.getScaleX(), height: window.height / view.getScaleY() }
        const even = (length: number) => Math.max(2, Math.ceil(length / 2) * 2)
        const width = even(units.width), height = even(units.height)
        if (!state?.root.isValid) {
            this.stop()
            void this.start(main, width, height).catch(error => console.error('[OriginalResolution] Failed to start', error))
            return
        }
        // The same picture at its new size. Made anew it would miss a frame, which the camera would draw to the window.
        const resized = state.width !== width || state.height !== height
        if (resized) {
            state.texture.resize(width, height)
            state.picture.spriteFrame = this.frame(state.texture, state.picture.spriteFrame)
            state.picture.node.getComponent(UITransform)!.setContentSize(width, height)
            state.width = width
            state.height = height
        }
        // A canvas sizes a camera of a texture by the layout alone, which leaves out a letterboxed window's bars.
        main.orthoHeight = height / 2
        state.present.orthoHeight = units.height / 2
        if (resized || state.sharpness !== GameDebugSettings.sharpness) {
            state.sharpness = GameDebugSettings.sharpness
            state.material.setProperty('sharpen', new Vec4(width, height, state.sharpness, 0))
        }
    }

    /** The picture's frame, in place of `old`: a frame keeps the size its texture had when it took it. */
    private static frame(texture: RenderTexture, old?: SpriteFrame | null): SpriteFrame {
        const frame = new SpriteFrame()
        frame.texture = texture
        frame.packable = false
        old?.destroy()
        return frame
    }

    private static async start(main: Camera, width: number, height: number): Promise<void> {
        if (this.starting) return
        this.starting = true
        try {
            const composite = await compositeMaterial()
            if (this.state || !main.isValid || GameDebugSettings.highResolutionEnabled) return
            const texture = new RenderTexture()
            texture.reset({ width, height })
            const visibility = main.visibility
            main.visibility = visibility & ~PRESENT_LAYER
            main.targetTexture = texture
            main.presentedOnWindow = true
            const root = uiNode({ name: 'OriginalResolution', parent: director.getScene()!, layer: PRESENT_LAYER }).node
            root.addComponent(RenderRoot2D)
            // The picture's own colors as they are, the right way up (the material's, as for a baked preview).
            const picture = uiNode({ name: 'Picture', parent: root, layer: PRESENT_LAYER, size: { width, height },
                sprite: { frame: this.frame(texture), sizeMode: Sprite.SizeMode.CUSTOM } }).sprite!
            // The composite's effect, sharpening as it enlarges (SHARPENED): a material of the picture's own.
            const material = new Material()
            material.initialize({ effectAsset: composite.effectAsset, defines: { SHARPENED: true } })
            material.setProperty('sharpen', new Vec4(width, height, GameDebugSettings.sharpness, 0))
            picture.customMaterial = material
            root.once(Node.EventType.NODE_DESTROYED, () => { picture.spriteFrame?.destroy(); texture.destroy() })
            const cameraNode = new Node('Camera')
            root.addChild(cameraNode)
            cameraNode.setPosition(0, 0, 1000)
            const present = cameraNode.addComponent(Camera)
            present.projection = Camera.ProjectionType.ORTHO
            present.orthoHeight = height / 2
            present.near = 0.1
            present.far = 2000
            present.visibility = PRESENT_LAYER
            present.clearFlags = Camera.ClearFlag.SOLID_COLOR
            present.clearColor = Color.BLACK
            present.priority = main.priority + 1
            this.state = { main, texture, root, picture, material, present, width, height, visibility, sharpness: GameDebugSettings.sharpness }
        } finally {
            this.starting = false
        }
    }

    private static stop(): void {
        const state = this.state
        if (!state) return
        this.state = undefined
        // The scene's camera draws to the window again before its texture goes with the picture.
        if (state.main.isValid) {
            state.main.targetTexture = null
            state.main.presentedOnWindow = false
            state.main.visibility = state.visibility
        }
        if (state.root.isValid) { state.root.active = false; state.root.destroy() }
    }
}
