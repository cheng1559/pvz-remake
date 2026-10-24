import { installMenuAnimation } from './menu.js'

export interface ClientApi {
    host: { get(id: string): any; around(target: any, key: string, handler: (this: any, next: (...args: any[]) => any, ...args: any[]) => any): void }
    assets: { sprite(path: string): Promise<any> }
}

export async function register(context: ClientApi): Promise<void> {
    await installMenuAnimation(context)
    context.host.get('client/view/ClientViewport').expandViewport({ minAspect: 4 / 3, maxAspect: 32 / 9 })
}
