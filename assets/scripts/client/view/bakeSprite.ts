import { Camera, Color, Director, director, EffectAsset, isValid, Material, Node, RenderRoot2D, RenderTexture, resources, Sprite, SpriteFrame, UITransform, view, gfx } from 'cc'
import { getSpriteDensity } from '@/client/content/SpriteDensity'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { KernelBatch } from '@/client/render/KernelBatch'
import { uiNode } from './uiNode'

const CAPTURE_LAYER = 1 << 19
let queue = Promise.resolve()
let material: Promise<Material> | undefined

function compositeMaterial(): Promise<Material> {
    return material ??= new Promise((resolve, reject) => resources.load('effects/preview-composite', EffectAsset, (error, effect) => {
        if (error) { reject(error); return }
        const result = new Material()
        result.initialize({ effectAsset: effect })
        resolve(result)
    }))
}

/** Flatten a static pose before applying opacity, so its own parts occlude each other. */
export function bakeSprite(source: Node): Promise<Sprite | undefined> {
    const task = queue.then(async () => {
        const shader = await compositeMaterial()
        if (!isValid(source, true)) return
        const parent = source.parent!, position = source.position.clone(), rotation = source.rotation.clone(), scale = source.scale.clone()
        const layers = new Map<Node, number>()
        const stage = uiNode({ name: 'PreviewCapture', parent: director.getScene()!, active: false }).node
        stage.addComponent(RenderRoot2D)
        const texture = new RenderTexture(), frame = new SpriteFrame()
        let completed = false
        try {
            source.parent = stage
            source.setPosition(0, 0, 0); source.setRotationFromEuler(0, 0, 0); source.setScale(1, 1, 1)
            const visit = (node: Node) => {
                layers.set(node, node.layer); node.layer = CAPTURE_LAYER
                for (const child of node.children) visit(child)
            }
            visit(source)
            source.active = stage.active = true
            for (const player of source.getComponentsInChildren(ReanimPlayer)) player.flushPose()
            const sprites = source.getComponentsInChildren(Sprite).filter(sprite => sprite.enabledInHierarchy && sprite.spriteFrame &&
                !(sprite instanceof KernelBatch && !sprite.count))
            if (!sprites.length) throw new Error('Cannot composite an empty plant pose')
            const rects = sprites.map(sprite => sprite instanceof KernelBatch ? sprite.getWorldBounds() : sprite.node.getComponent(UITransform)!.getBoundingBoxToWorld())
            const left = Math.floor(Math.min(...rects.map(rect => rect.x))) - 1
            const bottom = Math.floor(Math.min(...rects.map(rect => rect.y))) - 1
            const width = Math.ceil(Math.max(...rects.map(rect => rect.xMax))) + 1 - left
            const height = Math.ceil(Math.max(...rects.map(rect => rect.yMax))) + 1 - bottom
            const density = Math.ceil(Math.max(1, view.getScaleX(), view.getScaleY(), ...sprites.map(sprite => getSpriteDensity(sprite.spriteFrame!))))
            texture.reset({ width: Math.ceil(width * density), height: Math.ceil(height * density) })
            const cameraNode = new Node('PreviewCamera')
            stage.addChild(cameraNode)
            const camera = cameraNode.addComponent(Camera)
            camera.projection = Camera.ProjectionType.ORTHO
            camera.visibility = CAPTURE_LAYER
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR
            camera.clearColor = new Color(0, 0, 0, 0)
            camera.orthoHeight = height / 2
            camera.near = 0.1; camera.far = 2000
            camera.targetTexture = texture
            cameraNode.setPosition(left + width / 2, bottom + height / 2, 1000)
            await new Promise<void>(resolve => director.once(Director.EVENT_AFTER_DRAW, resolve))
            if (!isValid(source, true) || !isValid(parent, true)) return
            frame.texture = texture
            frame.packable = false
            const output = uiNode({ name: 'Composite', parent: source, layer: layers.get(source),
                position: { x: left, y: bottom }, size: { width, height }, anchor: { x: 0, y: 0 },
                sprite: { frame, sizeMode: Sprite.SizeMode.CUSTOM } }).sprite!
            Object.assign(output, { srcBlendFactor: gfx.BlendFactor.ONE })
            output.customMaterial = shader
            // The result owns these GPU assets; changing the plant or destroying the preview releases them.
            output.node.once(Node.EventType.NODE_DESTROYED, () => { frame.destroy(); texture.destroy() })
            completed = true
            return output
        } finally {
            if (isValid(source, true)) {
                source.active = false
                if (isValid(parent, true)) source.parent = parent
                else source.destroy()
                source.setPosition(position); source.setRotation(rotation); source.setScale(scale)
                for (const [node, layer] of layers) if (isValid(node, true)) node.layer = layer
            }
            stage.active = false
            stage.destroy()
            if (!completed) { frame.destroy(); texture.destroy() }
        }
    })
    queue = task.then(() => {}, () => {})
    return task
}
