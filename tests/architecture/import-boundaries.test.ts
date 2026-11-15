import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import test from 'node:test'

const root = join(process.cwd(), 'assets', 'scripts')

test('runtime imports preserve client-server architecture boundaries', () => {
    const violations: string[] = []
    // The client talks to the server through the protocol only and is handed what the application loads (app); the
    // clock and tweens (core) stand on the engine alone.
    check('client', imports(['server', 'app']), 'client -> server/app', violations)
    check('core', imports(['app', 'client', 'server', 'platform']), 'core -> app/client/server/platform', violations)
    // The server, what it shares with the client and the ECS run without the engine (headless tests, Node hosts).
    check('server', imports(['app', 'client', 'platform', 'core'], true), 'server -> app/client/platform/core/cc', violations)
    check('shared', imports(['app', 'client', 'server', 'platform', 'core'], true), 'shared -> app/client/server/platform/core/cc', violations)
    check('ecs', imports(['app', 'shared', 'server', 'client', 'platform', 'core'], true), 'ecs -> app/shared/server/client/platform/core/cc', violations)
    assert.deepEqual(violations, [])
})

/** An import of one of `directories` (by the `@/` alias or a relative path), or of the engine. */
function imports(directories: string[], engine = false): RegExp {
    const names = directories.join('|')
    return new RegExp(`(?:@\\/(?:${names})|(?:\\.\\.\\/)+(?:${names}))(?:\\/|['"])${engine ? `|from ['"]cc(?:\\/|['"])` : ''}`)
}

function check(directory: string, forbidden: RegExp, label: string, violations: string[]): void {
    for (const file of sourceFiles(join(root, directory))) {
        if (forbidden.test(readFileSync(file, 'utf8'))) {
            violations.push(`${label}: ${relative(process.cwd(), file).replaceAll('\\', '/')}`)
        }
    }
}

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name)
        return entry.isDirectory() ? sourceFiles(path) : extname(path) === '.ts' ? [path] : []
    })
}
