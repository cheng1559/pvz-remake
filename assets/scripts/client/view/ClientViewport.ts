import { Node, ResolutionPolicy, screen, sys, UITransform, view, type Size } from 'cc'

let restore: (() => void) | undefined

/** Constrain the OS window's content area on native desktop platforms. */
export function constrainNativeWindow(minimum: number, maximum: number): void {
    if (!sys.isNative || (sys.os !== sys.OS.OSX && sys.os !== sys.OS.WINDOWS)) return
    const host = globalThis as typeof globalThis & { jsb: {
        setWindowAspectRatio(minimum: number, maximum: number): boolean
    } }
    host.jsb.setWindowAspectRatio(minimum, maximum)
}

/** Expand the centered stage within the aspect range, letterboxing wider screens. */
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
            width / height > maxAspect ? ResolutionPolicy.SHOW_ALL : ResolutionPolicy.NO_BORDER)
    }
    restore = () => {
        view.off('canvas-resize', resize)
        view.setDesignResolutionSize(design.width, design.height, policy)
        constrainNativeWindow(design.width / design.height, design.width / design.height)
    }
    constrainNativeWindow(minAspect, maxAspect)
    view.on('canvas-resize', resize)
    resize()
}

export function resetViewport(): void {
    restore?.()
    restore = undefined
}

/** Only full-screen surfaces opt in; content and local clipping keep their own sizes. */
export function fitViewport(node: Node, onResize?: (size: Readonly<Size>) => void): void {
    const resize = () => {
        if (!node.isValid) return
        const transform = node.getComponent(UITransform)
        if (!transform) return
        const size = view.getVisibleSize()
        // Input and clipping follow visible content, excluding letterbox bars.
        size.width = Math.min(size.width, screen.windowSize.width / view.getScaleX())
        size.height = Math.min(size.height, screen.windowSize.height / view.getScaleY())
        transform.setContentSize(size)
        onResize?.(size)
    }
    view.on('design-resolution-changed', resize)
    node.once(Node.EventType.NODE_DESTROYED, () => view.off('design-resolution-changed', resize))
    resize()
}
