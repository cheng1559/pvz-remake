import type { LevelDefinition } from '@/shared/content/gameplay'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { baseQualified, Registry } from '@/shared/mod'

/**
 * What a view class has ready before a level starts, so its views draw at once: the pictures and animations they use.
 * `Content` is the game's content its views have in their context (LevelStage's Content).
 */
export type ViewPreload<Content> = (content: Content, level: LevelDefinition) => Promise<unknown>

/** The content in a view's context, which its class's preload gets. */
type ContextContent<Context> = Context extends { content: infer Content } ? Content : never

export class EntityViewRegistry<Context extends { content: { presentation: PresentationDefinitions } }, View> {
    private readonly views = new Registry<{ create: (context: Context) => View | Promise<View>, preload?: ViewPreload<ContextContent<Context>> }>()

    /**
     * `kindOf`: the kind of view a type of the entity is drawn by, by its presentation (its `view`, or the registry's own
     * kind without one); none for a type nothing draws. `typeOf`: the type of the entity a view is made for.
     */
    constructor(private readonly kindOf: (presentation: PresentationDefinitions, typeId: string) => string | undefined,
        private readonly typeOf: (context: Context) => string) {}

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

    /** A type of the entity is drawn: the view of its kind is installed (assertPresented). */
    draws(presentation: PresentationDefinitions, typeId: string): boolean {
        const kind = this.kindOf(presentation, typeId)
        return kind !== undefined && this.has(kind)
    }
    checkpoint(): () => void { return this.views.checkpoint() }
    freeze(): void { this.views.freeze() }

    async create(context: Context): Promise<View> {
        const typeId = this.typeOf(context), kind = this.kindOf(context.content.presentation, typeId)
        const entry = kind && this.views.get(this.qualify(kind))
        if (!entry) throw new Error(`Entity view is not installed: ${typeId}`)
        return entry.create(context)
    }

    private qualify(kind: string): string { return baseQualified(kind) }
}
