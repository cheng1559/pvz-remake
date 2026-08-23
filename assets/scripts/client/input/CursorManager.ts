import { game, sys } from 'cc'

export type CursorStyle = '' | 'default' | 'pointer' | 'move' | 'text' | string

type NativeBindings = typeof globalThis & {
    jsb?: {
        setCursorStyle?: (style: string) => boolean
    }
}

export class CursorManager {
    private static _style = ''

    static set(style: CursorStyle) {
        const normalized = this._normalize(style)
        if (normalized === this._style) return

        this._style = normalized
        if (sys.isBrowser) {
            const canvas = game.canvas
            if (canvas) canvas.style.cursor = normalized
            return
        }

        if (sys.isNative) {
            ;(globalThis as NativeBindings).jsb?.setCursorStyle?.(normalized)
        }
    }

    private static _normalize(style: CursorStyle) {
        return style && style.length > 0 ? style : 'default'
    }
}
