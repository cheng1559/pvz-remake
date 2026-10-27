export interface Context {
    host: {
        get(id: string): any
        around(target: object, key: string, wrapper: (this: any, next: (...args: any[]) => any, ...args: any[]) => any): () => void
        replace(target: object, key: string, replacement: (...args: any[]) => any): () => void
    }
    assets: { json(path: string): any, bytes(path: string): Uint8Array, sprite(path: string): Promise<any> }
}
