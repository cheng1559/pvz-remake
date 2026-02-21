import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
    EventTouch,
    game,
    sys,
    Camera,
    Color,
} from 'cc'

const { ccclass, property } = _decorator

enum ButtonState {
    NORMAL,
    PRESSED,
    HOVER,
    DISABLED,
}

@ccclass('UIButton')
export class UIButton extends Component {
    private static _activeButton: UIButton | null = null

    @property(SpriteFrame)
    normalSprite: SpriteFrame | null = null

    @property(SpriteFrame)
    pressedSprite: SpriteFrame | null = null

    @property(SpriteFrame)
    hoverSprite: SpriteFrame | null = null

    @property(SpriteFrame)
    disabledSprite: SpriteFrame | null = null

    @property(Vec3)
    pressOffset = new Vec3(1, -1, 0)

    @property([Vec2])
    polygon: Vec2[] = []

    private _interactable: boolean = true

    @property
    public get interactable(): boolean {
        return this._interactable
    }

    public set interactable(value: boolean) {
        if (this._interactable === value) return
        this._interactable = value
        this._pressed = false
        this._hovering = false
        this._releaseOffset()
        this._applyState(ButtonState.NORMAL)
        if (!value) {
            this._setCursor('default')
        }
    }

    private _locked: boolean = false

    @property
    public get locked(): boolean {
        return this._locked
    }

    public set locked(value: boolean) {
        if (this._locked === value) return
        this._locked = value
        this._pressed = false
        this._releaseOffset()
        this._applyState(ButtonState.NORMAL)
        if (value) {
            this._color.set(128, 128, 128)
            this._applyColor()
        }
    }

    @property
    changeCursor: boolean = true

    public onClick: ((event: EventTouch) => void) | null = null

    public onClickLocked: ((event: EventTouch) => void) | null = null

    private _color: Color = Color.WHITE.clone()

    public get color(): Color {
        return this._color
    }

    public set color(value: Color) {
        this._color.set(value)
        this._applyColor()
    }

    private _sprite: Sprite | null = null
    private _originPos = new Vec3()
    private _state: ButtonState = ButtonState.NORMAL
    private _pressed = false
    private _hovering = false

    onLoad() {
        this._sprite = this.node.getComponent(Sprite) ?? this.node.getComponentInChildren(Sprite)
        Vec3.copy(this._originPos, this.node.position)
        this._setupHitTest()
        this._applyState(ButtonState.NORMAL)
    }

    public updateOriginPos(pos: Vec3) {
        Vec3.copy(this._originPos, pos)
        if (this._state === ButtonState.PRESSED) {
            this._applyOffset()
        } else {
            this.node.setPosition(this._originPos)
        }
    }

    onEnable() {
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this)
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this)
        this.node.on(Node.EventType.MOUSE_ENTER, this._onMouseEnter, this)
        this.node.on(Node.EventType.MOUSE_LEAVE, this._onMouseLeave, this)
    }

    onDisable() {
        this.node.off(Node.EventType.TOUCH_START, this._onTouchStart, this)
        this.node.off(Node.EventType.TOUCH_MOVE, this._onTouchMove, this)
        this.node.off(Node.EventType.TOUCH_END, this._onTouchEnd, this)
        this.node.off(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this)
        this.node.off(Node.EventType.MOUSE_ENTER, this._onMouseEnter, this)
        this.node.off(Node.EventType.MOUSE_LEAVE, this._onMouseLeave, this)
    }

    private _onTouchStart(event: EventTouch) {
        if (!this._interactable) return
        this._pressed = true
        event.propagationStopped = true
        UIButton._activeButton = this
        this._applyState(ButtonState.PRESSED)
        this._applyOffset()
    }

    private _onTouchMove(event: EventTouch) {
        if (!this._interactable) return
        if (!this._pressed) return
        event.propagationStopped = true
        const inside = this._isTouchInside(event)
        if (inside && this._state !== ButtonState.PRESSED) {
            this._applyState(ButtonState.PRESSED)
            this._applyOffset()
        } else if (!inside && this._state === ButtonState.PRESSED) {
            this._applyState(ButtonState.HOVER)
            this._releaseOffset()
        }
    }

    private _onTouchEnd(event: EventTouch) {
        if (!this._interactable) return
        if (!this._pressed) return
        event.propagationStopped = true
        this._pressed = false
        this._releaseOffset()

        const inside = this._isTouchInside(event)
        UIButton._activeButton = null
        this._applyState(this._hovering ? ButtonState.HOVER : ButtonState.NORMAL)
        this._setCursor(this._hovering ? 'pointer' : 'default')
        if (!this._locked) {
            if (inside) this.onClick?.(event)
        } else {
            if (inside) this.onClickLocked?.(event)
        }
    }

    private _onTouchCancel(event: EventTouch) {
        if (!this._interactable) return
        if (!this._pressed) return
        this._pressed = false
        this._releaseOffset()
        UIButton._activeButton = null
        this._applyState(this._hovering ? ButtonState.HOVER : ButtonState.NORMAL)
    }

    private _isTouchInside(event: EventTouch): boolean {
        const uiTransform = this.node.getComponent(UITransform)
        if (!uiTransform) return false
        const screenPoint = event.touch!.getLocation()
        return uiTransform.hitTest(screenPoint)
    }

    private _onMouseEnter() {
        if (!this._interactable) return
        this._hovering = true
        if (UIButton._activeButton && UIButton._activeButton !== this) return
        if (this._pressed) return
        this._applyState(ButtonState.HOVER)
        this._setCursor('pointer')
    }

    private _onMouseLeave() {
        if (!this._interactable) return
        this._hovering = false
        if (UIButton._activeButton && UIButton._activeButton !== this) return
        if (this._pressed) return
        this._applyState(ButtonState.NORMAL)
        this._setCursor('default')
    }

    private _applyState(state: ButtonState) {
        this._state = state
        if (!this._sprite) return

        let frame: SpriteFrame | null = null
        switch (state) {
            case ButtonState.NORMAL:
                frame = this.normalSprite
                break
            case ButtonState.PRESSED:
                frame = this.pressedSprite ?? this.normalSprite
                break
            case ButtonState.HOVER:
                frame = this.hoverSprite ?? this.normalSprite
                break
            case ButtonState.DISABLED:
                frame = this.disabledSprite ?? this.normalSprite
                break
        }
        if (frame) this._sprite.spriteFrame = frame
        this._applyColor()
    }

    private _applyColor() {
        if (!this._sprite) return
        const c = this._color
        const cur = this._sprite.color
        if (cur.r !== c.r || cur.g !== c.g || cur.b !== c.b || cur.a !== c.a) {
            this._sprite.color = new Color(c.r, c.g, c.b, c.a)
        }
    }

    private _applyOffset() {
        const pos = new Vec3()
        Vec3.add(pos, this._originPos, this.pressOffset)
        this.node.setPosition(pos)
    }

    private _releaseOffset() {
        this.node.setPosition(this._originPos)
    }

    private _setCursor(style: string) {
        if (!this.changeCursor) return
        if (sys.isBrowser) {
            const canvas = game.canvas
            if (canvas) canvas.style.cursor = style
        }
    }

    private _setupHitTest() {
        if (this.polygon.length < 3) return

        const uiTransform = this.node.getComponent(UITransform)
        if (!uiTransform) return

        const original = uiTransform.hitTest.bind(uiTransform)
        const self = this
        uiTransform.hitTest = (worldPoint: Vec2, windowId?: number) => {
            if (self.polygon.length < 3) return original(worldPoint, windowId)
            return self._pointInPolygon(worldPoint)
        }
    }

    private _pointInPolygon(worldPoint: Vec2): boolean {
        const uiTransform = this.node.getComponent(UITransform)
        if (!uiTransform) return false

        const localPos = new Vec3()
        const camera = this.node.scene.getComponentInChildren(Camera)
        if (camera) {
            const worldPos = new Vec3()
            camera.screenToWorld(new Vec3(worldPoint.x, worldPoint.y, 0), worldPos)
            uiTransform.convertToNodeSpaceAR(worldPos, localPos)
        } else {
            uiTransform.convertToNodeSpaceAR(new Vec3(worldPoint.x, worldPoint.y, 0), localPos)
        }

        const x = localPos.x
        const y = localPos.y
        const poly = this.polygon

        let inside = false
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x,
                yi = poly[i].y
            const xj = poly[j].x,
                yj = poly[j].y
            const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
            if (intersect) inside = !inside
        }
        return inside
    }
}
