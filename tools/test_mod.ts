import { readGameplaySource } from './content_source'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseModManifest } from '@/shared/mod'
import { ModAssets } from '@/shared/mod/ModAssets'
import { contentJson, parseModContent } from '@/shared/mod/content'
import { DefinitionSources, buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { createServerModHost } from '@/server/createModHost'

const root = process.argv[2]
const files: Record<string, Uint8Array> = {}
async function collect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await collect(path)
        else files[relative(root, path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path))
    }
}
async function main() {
    await collect(root)
    const manifest = parseModManifest(JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')))
    const definitions = new DefinitionSources(), registry = new GameplayRegistry()
    const host = createServerModHost(manifest.id, registry, definitions)
    try {
        const packagedContent = parseModContent(contentJson(files, 'content.json'), files)
        if (packagedContent.gameplay) definitions.register(manifest.id, contentJson(files, packagedContent.gameplay))
        if (manifest.gameplay) {
            const module = await import(pathToFileURL(join(root, manifest.gameplay.nodeModule)).href)
            if (typeof module.register !== 'function') throw new Error('Mod must export register({ host, assets })')
            await module.register({ host, assets: new ModAssets(manifest, files) })
        }
        const base = ['definitions', 'levels', 'strings', 'seed-catalog'].map(name => readGameplaySource(name))
        const content = buildGameplayContent(base[0], base[1], base[2], base[3], definitions.sources)
        registry.freeze(content.definitions)
        console.info(`[mod] Validated ${manifest.id} with the server host`)
    } finally { host.dispose() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
