import { game, sys } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

export type CursorStyle = '' | 'default' | 'pointer' | 'move' | 'text' | string

type NativeBindings = typeof globalThis & {
    jsb?: {
        setCursorStyle?: (style: string) => boolean
        setCursorImage?: (path: string, hotX: number, hotY: number) => boolean
    }
}

/**
 * The original cursors (LawnApp::EnforceCursor): the big arrow resource, and SexyAppFramework's finger and dragging
 * hands at their CreateCursor hotspots. Resource packs may replace the sprites; text and other styles stay system cursors.
 */
const ORIGINAL_CURSORS: Readonly<Record<string, { sprite: string, hotspot: [number, number] }>> = {
    default: { sprite: 'pvz:cursor_pointer', hotspot: [0, 0] },
    pointer: { sprite: 'pvz:cursor_hand', hotspot: [11, 4] },
    grabbing: { sprite: 'pvz:cursor_dragging', hotspot: [15, 10] },
}

type LoadedCursor = { url: string, x: number, y: number }

export class CursorManager {
    private static _style = ''
    private static _loading?: Promise<void>
    private static readonly _cursors = new Map<string, LoadedCursor>()

    static set(style: CursorStyle) {
        const normalized = this._normalize(style)
        if (normalized === this._style) return

        this._style = normalized
        this.refresh()
    }

    /** Shows the current style again, e.g. after the original cursors are turned on or off. */
    static refresh() {
        const style = this._normalize(this._style)
        const cursor = GameDebugSettings.originalCursorsEnabled ? this._original(style) : undefined
        if (sys.isBrowser) {
            const canvas = game.canvas
            if (canvas) canvas.style.cursor = cursor ? `url("${cursor.url}") ${cursor.x} ${cursor.y}, ${style}` : style
            return
        }

        if (sys.isNative) {
            const jsb = (globalThis as NativeBindings).jsb
            if (cursor && jsb?.setCursorImage?.(cursor.url, cursor.x, cursor.y)) return
            jsb?.setCursorStyle?.(style === 'grabbing' ? 'pointer' : style)
        }
    }

    private static _original(style: string): LoadedCursor | undefined {
        if (!ORIGINAL_CURSORS[style]) return undefined
        this._loading ??= this._load()
        return this._cursors.get(style)
    }

    /** Until the sprites load, or if they fail to, the system cursors stay in place. */
    private static async _load() {
        await Promise.all(Object.entries(ORIGINAL_CURSORS).map(async ([style, { sprite, hotspot }]) => {
            try {
                const image = await modResources.spriteUrl(sprite)
                // A higher-density replacement keeps the hotspot on the same part of the art.
                if (image) this._cursors.set(style, { url: image.url, x: Math.round(hotspot[0] * image.scale), y: Math.round(hotspot[1] * image.scale) })
            } catch (error) {
                console.warn(`[Cursor] Failed to load ${sprite}`, error)
            }
        }))
        this.refresh()
    }

    private static _normalize(style: CursorStyle) {
        return style && style.length > 0 ? style : 'default'
    }
}
