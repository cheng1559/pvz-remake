import type { LevelDefinition } from '@/shared/content/gameplay'
import { baseQualified, Registry } from '@/shared/mod'

/**
 * What a view class has ready before a level starts, so its views draw at once: the pictures and animations they use.
 * `Content` is the game's content its views have in their context (LevelStage's Content).
 */
export type ViewPreload<Content> = (content: Content, level: LevelDefinition) => Promise<unknown>

/** The content in a view's context, which its class's preload gets. */
type ContextContent<Context> = Context extends { content: infer Content } ? Content : never

export class EntityViewRegistry<Context, View> {
    private readonly views = new Registry<{ create: (context: Context) => View | Promise<View>, preload?: ViewPreload<ContextContent<Context>> }>()

    constructor(private readonly selection: (context: Context) => { kind?: string, typeId: string }) {}

    register(kind: string, create: (context: Context) => View | Promise<View>, preload?: ViewPreload<ContextContent<Context>>): void {
        if (typeof create !== 'function' || preload !== undefined && typeof preload !== 'function') throw new Error(`Invalid entity view factory: ${kind}`)
        this.views.register(this.qualify(kind), { create, preload })
    }

    /** A view by its class: made with its context, then readied before it is used; its class's `preload`, if it has one. */
    registerView(kind: string, Type: (new (context: Context) => View & { initialize(): void | Promise<void> }) & { preload?: ViewPreload<ContextContent<Context>> }): void {
        this.register(kind, async context => {
            const view = new Type(context)
            await view.initialize()
            return view
        }, Type?.preload?.bind(Type))
    }

    /** Every registered view's preload, for the level about to start. */
    async preload(content: ContextContent<Context>, level: LevelDefinition): Promise<void> {
        await Promise.all([...this.views.entries()].flatMap(([, entry]) => entry.preload ? [entry.preload(content, level)] : []))
    }

    has(kind: string): boolean { return !!this.views.get(this.qualify(kind)) }
    checkpoint(): () => void { return this.views.checkpoint() }
    freeze(): void { this.views.freeze() }

    async create(context: Context): Promise<View> {
        const { kind, typeId } = this.selection(context)
        const entry = kind && this.views.get(this.qualify(kind))
        if (!entry) throw new Error(`Entity view is not installed: ${typeId}`)
        return entry.create(context)
    }

    private qualify(kind: string): string { return baseQualified(kind) }
}
