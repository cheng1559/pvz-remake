import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as validate from '../assets/scripts/shared/validate'
import * as modHost from '../assets/scripts/shared/mod/ModHost'

const transpiled = new Map<string, string>()

/**
 * Runs a TypeScript file as a CommonJS module in a context of its own and returns its exports:
 * `require` answers its imports, and `globals` join `module`, `exports` and `require` in the context.
 * Each run starts from fresh module state; the file is only transpiled once. The checks of outside data
 * (shared/validate) have no imports of their own, so every file gets the real ones.
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
    const resolve = (id: string) => id === '@/shared/validate' ? validate : id === '@/shared/mod/ModHost' ? modHost : require(id)
    runInNewContext(code, { module, exports: module.exports, require: resolve, ...globals })
    return module.exports
}
