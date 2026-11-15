import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

const transpiled = new Map<string, string>()

/**
 * Runs a TypeScript file as a CommonJS module in a context of its own and returns its exports:
 * `require` answers its imports, and `globals` join `module`, `exports` and `require` in the context.
 * Each run starts from fresh module state; the file is only transpiled once.
 */
export function loadScript(path: string, require: (id: string) => unknown, globals: Record<string, unknown> = {}): Record<string, any> {
    let code = transpiled.get(path)
    if (code === undefined) {
        code = transpileModule(readFileSync(path, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        }).outputText
        transpiled.set(path, code)
    }
    const module = { exports: {} as Record<string, any> }
    runInNewContext(code, { module, exports: module.exports, require, ...globals })
    return module.exports
}
