import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import test from 'node:test'

const root = join(process.cwd(), 'assets', 'scripts')

test('runtime imports preserve client-server architecture boundaries', () => {
    const violations: string[] = []
    check('app', /(?:@\/(?:core|ui|game)|(?:\.\.\/)+(?:core|ui|game))(?:\/|['"])/, 'app -> legacy runtime', violations)
    check('client', /(?:@\/(?:server|ui|game)|(?:\.\.\/)+(?:server|ui|game))(?:\/|['"])/, 'client -> server/legacy ui/game', violations)
    check('server', /(?:(?:@\/(?:client|platform|core|ui|game)|(?:\.\.\/)+(?:client|platform|core|ui|game))(?:\/|['"])|from ['"]cc(?:\/|['"]))/, 'server -> client/platform/runtime/cc', violations)
    check('shared', /(?:(?:@\/(?:client|server|platform)|(?:\.\.\/)+(?:client|server|platform))(?:\/|['"])|from ['"]cc(?:\/|['"]))/, 'shared -> client/server/platform/cc', violations)
    check('ecs', /(?:(?:@\/(?:shared|server|client|platform)|(?:\.\.\/)+(?:shared|server|client|platform))(?:\/|['"])|from ['"]cc(?:\/|['"]))/, 'ecs -> shared/server/client/platform/cc', violations)
    assert.deepEqual(violations, [])
})

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
