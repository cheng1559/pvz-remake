import { Node, ResolutionPolicy, screen, sys, UITransform, view, type Size } from 'cc'

let restore: (() => void) | undefined

/** Apply the default window constraint after Mods have had a chance to expand the viewport. */
export function initializeViewport(): void {
    if (restore) return
    const { width, height } = view.getDesignResolutionSize()
    constrainNativeWindow(width / height, width / height)
}

/** Constrain the OS window's content area on native desktop platforms. */
export function constrainNativeWindow(minimum: number, maximum: number): void {
    if (!sys.isNative || (sys.os !== sys.OS.OSX && sys.os !== sys.OS.WINDOWS)) return
    const host = globalThis as typeof globalThis & { jsb: {
        setWindowAspectRatio(minimum: number, maximum: number): boolean
    } }
    host.jsb.setWindowAspectRatio(minimum, maximum)
}

/** Expand the centered stage within the aspect range, letterboxing outside it. */
export function expandViewport(options: { minAspect?: number, maxAspect?: number } = {}): void {
    if (restore) return
    const design = view.getDesignResolutionSize().clone()
    const policy = view.getResolutionPolicy()
    const minAspect = options.minAspect ?? design.width / design.height
    const maxAspect = options.maxAspect ?? 32 / 9
    const resize = () => {
        const { width, height } = screen.windowSize
        const aspect = Math.max(minAspect, Math.min(maxAspect, width / height))
        view.setDesignResolutionSize(design.height * aspect, design.height,
            width / height < minAspect || width / height > maxAspect ? ResolutionPolicy.SHOW_ALL : ResolutionPolicy.NO_BORDER)
    }
    restore = () => {
        view.off('canvas-resize', resize)
        view.setDesignResolutionSize(design.width, design.height, policy)
    }
    constrainNativeWindow(minAspect, maxAspect)
    view.on('canvas-resize', resize)
    resize()
}

export function resetViewport(): void {
    // VM teardown must not resize the native window; the next startup chooses its constraint.
    restore?.()
    restore = undefined
    setUiArea(DEFAULT_UI_AREA.width, DEFAULT_UI_AREA.height)
}

/** The visible content size, excluding letterbox bars. */
function visibleSize(): Size {
    const size = view.getVisibleSize()
    size.width = Math.min(size.width, screen.windowSize.width / view.getScaleX())
    size.height = Math.min(size.height, screen.windowSize.height / view.getScaleY())
    return size
}

const LAYOUT_WIDTH = 800
/** The default UI area is the original 4:3 layout, so edge-anchored controls keep their original places. */
const DEFAULT_UI_AREA = { width: 800, height: 600 }
/** The shared UI area, centered on screen; edge-anchored controls hug its edges. */
const uiArea = { ...DEFAULT_UI_AREA }
const uiAreaListeners = new Set<() => void>()

/** Resizes the shared UI area, e.g. to the full visible width; the default is the original 800×600. */
export function setUiArea(width: number, height: number): void {
    if (uiArea.width === width && uiArea.height === height) return
    Object.assign(uiArea, { width, height })
    for (const listener of [...uiAreaListeners]) listener()
}

/** The shared UI area, limited to the visible content. */
export function getUiArea(): { width: number, height: number } {
    const visible = visibleSize()
    return { width: Math.min(uiArea.width, visible.width), height: Math.min(uiArea.height, visible.height) }
}

/** How far the UI area's left/right edges sit outside the original 800-wide layout. */
export function uiAreaInset(): number {
    return (getUiArea().width - LAYOUT_WIDTH) / 2
}

function onViewportResize(node: Node, resize: () => void): void {
    view.on('design-resolution-changed', resize)
    uiAreaListeners.add(resize)
    node.once(Node.EventType.NODE_DESTROYED, () => {
        view.off('design-resolution-changed', resize)
        uiAreaListeners.delete(resize)
    })
    resize()
}

/** Only full-screen surfaces opt in; content and local clipping keep their own sizes. */
export function fitViewport(node: Node, onResize?: (size: Readonly<Size>) => void): void {
    onViewportResize(node, () => {
        if (!node.isValid) return
        const transform = node.getComponent(UITransform)
        if (!transform) return
        // Input and clipping follow visible content, excluding letterbox bars.
        const size = visibleSize()
        transform.setContentSize(size)
        onResize?.(size)
    })
}

/**
 * A container whose children keep their 800-wide layout distance from the UI area's left or right edge.
 * It sits at the parent's origin while the area is 800 wide, so the original layout is unchanged.
 */
export function uiAreaEdge(parent: Node, edge: 'left' | 'right'): Node {
    const node = new Node(edge === 'left' ? 'LeftEdge' : 'RightEdge')
    node.layer = parent.layer
    node.addComponent(UITransform).setContentSize(0, 0)
    parent.addChild(node)
    onViewportResize(node, () => {
        if (!node.isValid) return
        const inset = uiAreaInset()
        node.setPosition(edge === 'left' ? 0 - inset : inset, 0)
    })
    return node
}
