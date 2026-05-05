import { _decorator, Color, Node, Vec3 } from 'cc'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { Animator } from '@/core/Animator'
import { AnimNode } from '@/core/Animator/AnimNode'
import { UIButton } from '@/ui/Button'
import { createTooltipNode } from '@/ui/Tooltip'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'
import { createStoneButton } from '@/ui/StoneButton'
import {
    ZenGardenScreenAssets,
    type ZenGardenScreenAnimations,
    type ZenGardenScreenFonts,
    type ZenGardenScreenSprites,
} from './ZenGardenScreenAssets'
import { MenuScreenBase } from '../MenuScreenBase'

const { ccclass } = _decorator

type ZenGardenScene = 'greenhouse' | 'mushroom' | 'aquarium' | 'tree'

const MAIN_MENU_WIDTH = 163
const MAIN_MENU_HEIGHT = 46
const SCENE_LABEL_COLOR = new Color(224, 187, 98)
const SCENES: ZenGardenScene[] = ['greenhouse', 'mushroom', 'aquarium', 'tree']
const TREE_OF_WISDOM_SIZE = 50
const TREE_OF_WISDOM_RATE = 18
const TREE_CLOUD_RATE = 0.2
const NEXT_GARDEN_TOOLTIP = 'visit other garden'

@ccclass('ZenGardenScreen')
export class ZenGardenScreen extends MenuScreenBase {
    public onStoreRequest: (() => void) | null = null

    private _scene: ZenGardenScene = 'greenhouse'
    private _sprites: ZenGardenScreenSprites | null = null
    private _fonts: ZenGardenScreenFonts | null = null
    private _animations: ZenGardenScreenAnimations | null = null
    private _backdrop: Node | null = null

    async render(): Promise<void> {
        const [sprites, fonts, animations] = await Promise.all([
            ZenGardenScreenAssets.loadSprites(),
            ZenGardenScreenAssets.loadFonts(),
            ZenGardenScreenAssets.loadAnimations(),
        ])
        if (!sprites || !animations) return

        this._sprites = sprites
        this._fonts = fonts
        this._animations = animations
        this._resetRoot('ZenGardenScreenRoot')
        await this._replaceSceneBackdrop()

        this._createMainMenuButton(sprites, fonts)

        this._createShopButton(sprites)

        const nextGardenButtonNode = this._createImageButton({
            name: 'NextGardenButton',
            x: 566,
            y: 0,
            normal: sprites.zenNextGarden,
            hover: sprites.zenNextGarden,
            pressed: sprites.zenNextGarden,
            pressSound: SoundEffect.Tap,
            releaseToNormalOnPressOut: true,
            onClick: () => this._gotoNextGarden(),
        })
        const tooltip = createTooltipNode({
            name: 'NextGardenTooltip',
            text: NEXT_GARDEN_TOOLTIP,
            font: fonts.tooltip,
            parent: this._root!,
            layer: this.node.layer,
            x: this._cppX(599),
            y: this._cppY(52),
            centerX: true,
            active: false,
        })
        const nextGardenButton = nextGardenButtonNode.getComponent(UIButton)
        if (nextGardenButton) {
            nextGardenButton.onStateChange = (state) => {
                tooltip.active = state === 'hover' || state === 'pressed'
            }
            nextGardenButton.refreshHoverFromPointer()
        }
    }

    private _gotoNextGarden() {
        const sceneIndex = SCENES.indexOf(this._scene)
        this._scene = SCENES[(sceneIndex + 1) % SCENES.length]

        if (!this._sprites) return

        void this._replaceSceneBackdrop()
    }

    private async _replaceSceneBackdrop() {
        if (!this._sprites) return

        if (this._backdrop?.isValid) {
            this._backdrop.removeFromParent()
            this._backdrop.destroy()
        }
        this._backdrop = await this._renderSceneBackdrop(this._sprites)
        this._backdrop.setSiblingIndex(0)
    }

    private async _renderSceneBackdrop(sprites: ZenGardenScreenSprites) {
        const backdrop = createUINode('Backdrop', {
            parent: this._root!,
            layer: this.node.layer,
        })

        if (this._scene !== 'tree') {
            createSpriteNode({
                name: 'Background',
                spriteFrame: this._getBackgroundSprite(sprites),
                parent: backdrop,
                layer: this.node.layer,
                x: -400,
                y: 300,
                anchorX: 0,
                anchorY: 1,
            })
            this._createSceneLabel(backdrop)
            return backdrop
        }

        await this._createTreeOfWisdomReanim(backdrop)
        this._createSceneLabel(backdrop)
        return backdrop
    }

    private _getBackgroundSprite(sprites: ZenGardenScreenSprites) {
        if (this._scene === 'mushroom') return sprites.mushroomBackground
        if (this._scene === 'aquarium') return sprites.aquariumBackground
        return sprites.zenBackground
    }

    private async _createTreeOfWisdomReanim(parent: Node) {
        if (!this._animations) return

        await this._createTreeOfWisdomLayer(parent, 'TreeOfWisdomBackgroundAnimator', ['bg'])

        const cloudAnimator = this._createAnimator(parent, 'TreeOfWisdomCloudsAnimator')
        await cloudAnimator.parseJson(this._animations.treeOfWisdomClouds.json)
        for (let i = 1; i <= 6; i++) {
            const animationName = `Cloud${i}`
            const cloudNode = cloudAnimator.addAnimNode(animationName)
            if (!cloudNode) continue

            cloudNode.play({
                name: animationName,
                loop: true,
                speed: this._speedForReanimRate(cloudNode, animationName, TREE_CLOUD_RATE),
            })
            const duration = cloudNode.getAnimationDuration(animationName)
            if (duration && duration > 1) {
                cloudNode.time = Math.random() * (duration - 1)
            }
        }

        await this._createTreeOfWisdomLayer(parent, 'TreeOfWisdomTreeAnimator', ['tree'])
        await this._createTreeOfWisdomLayer(parent, 'TreeOfWisdomGrassAnimator', ['grass'])
        await this._createTreeOfWisdomLayer(parent, 'TreeOfWisdomOverlayAnimator', [
            'overlay',
            'leaf',
            'bunch',
        ])
    }

    private async _createTreeOfWisdomLayer(parent: Node, name: string, visiblePrefixes: string[]) {
        if (!this._animations) return

        const animator = this._createAnimator(parent, name)
        await animator.parseJson(this._animations.treeOfWisdom.json)
        for (const trackName of Object.keys(this._animations.treeOfWisdom.json.tree?.tracks ?? {})) {
            if (!visiblePrefixes.some((prefix) => trackName.startsWith(prefix))) {
                animator.hideTrack(trackName)
            }
        }

        const treeNode = animator.addAnimNode('tree')
        if (!treeNode) return

        const animationName = `anim_grow${TREE_OF_WISDOM_SIZE}`
        treeNode.play({
            name: animationName,
            speed: this._speedForReanimRate(treeNode, animationName, TREE_OF_WISDOM_RATE),
            keepLastFrame: true,
        })
        const duration = treeNode.getAnimationDuration(animationName)
        if (duration && duration > 1) treeNode.time = duration - 1
    }

    private _createAnimator(parent: Node, name: string) {
        const animatorNode = createUINode(name, {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        animatorNode.setPosition(-400, 300, 0)
        return animatorNode.addComponent(Animator)
    }

    private _speedForReanimRate(node: AnimNode, animationName: string, rate: number) {
        const fps = node.getAnimationFps(animationName)
        if (!fps || fps <= 0) return 1
        return rate / fps
    }

    private _createSceneLabel(parent: Node) {
        this._createText({
            name: 'SceneLabel',
            text: this._scene === 'tree' ? 'Tree of Wisdom' : 'Zen Garden',
            baselineX: 780,
            baselineY: 595,
            font: this._fonts?.sceneLabel ?? null,
            color: SCENE_LABEL_COLOR,
            align: 'right',
            parent,
        })
    }

    private _createShopButton(sprites: ZenGardenScreenSprites) {
        const buttonNode = createUINode('ShopButton', {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: sprites.zenShopButton.originalSize.width,
            height: 40,
        })
        buttonNode.setPosition(this._cppX(678), this._cppY(33), 0)

        createSpriteNode({
            name: 'Sprite',
            spriteFrame: sprites.zenShopButton,
            parent: buttonNode,
            layer: this.node.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
        })

        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = sprites.zenShopButton
        button.hoverSprite = sprites.zenShopButtonHighlight
        button.pressedSprite = sprites.zenShopButtonHighlight
        button.releaseToNormalOnPressOut = true
        button.pressOffset = new Vec3(0, 0, 0)
        button.onPress = () => {
            void SoundLoader.play(SoundEffect.Tap)
        }
        button.onClick = () => {
            this.onStoreRequest?.()
            if (button.isValid) button.refreshHoverFromPointer()
        }
        button.refreshHoverFromPointer()
    }

    private _createMainMenuButton(sprites: ZenGardenScreenSprites, fonts: ZenGardenScreenFonts) {
        createStoneButton({
            name: 'MainMenuButton',
            parent: this._root!,
            layer: this.node.layer,
            label: 'Main Menu',
            x: this._cppX(628),
            y: this._cppY(-10),
            width: MAIN_MENU_WIDTH,
            height: MAIN_MENU_HEIGHT,
            sprites: {
                left: sprites.buttonLeft,
                middle: sprites.buttonMiddle,
                right: sprites.buttonRight,
                downLeft: sprites.buttonDownLeft,
                downMiddle: sprites.buttonDownMiddle,
                downRight: sprites.buttonDownRight,
            },
            fonts: {
                normal: fonts.button,
                highlight: fonts.buttonHighlight,
            },
            onClick: () => this.onBackToMenu?.(),
        })
    }
}
