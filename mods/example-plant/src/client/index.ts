interface ClientApi { host: { get(id: string): any }, assets: { id: string, json(path: string): unknown } }

export function register({ host, assets }: ClientApi): void {
    host.get('content/definitions').register(assets.id, assets.json('assets/presentation.json'))
}
