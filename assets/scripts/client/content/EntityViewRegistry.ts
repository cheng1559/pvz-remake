import { Registry } from '@/shared/mod'

export class EntityViewRegistry<Context, View> {
    private readonly views = new Registry<(context: Context) => View | Promise<View>>()

    constructor(private readonly selection: (context: Context) => { kind?: string, typeId: string }) {}

    register(kind: string, create: (context: Context) => View | Promise<View>): void {
        if (typeof create !== 'function') throw new Error(`Invalid entity view factory: ${kind}`)
        this.views.register(this.qualify(kind), create)
    }

    has(kind: string): boolean { return !!this.views.get(this.qualify(kind)) }
    checkpoint(): () => void { return this.views.checkpoint() }
    freeze(): void { this.views.freeze() }

    async create(context: Context): Promise<View> {
        const { kind, typeId } = this.selection(context)
        const create = kind && this.views.get(this.qualify(kind))
        if (!create) throw new Error(`Entity view is not installed: ${typeId}`)
        return create(context)
    }

    private qualify(kind: string): string { return kind.includes(':') ? kind : `pvz:${kind}` }
}
