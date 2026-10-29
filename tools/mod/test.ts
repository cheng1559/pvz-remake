import { readBaseContent } from './content'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ModAssets } from '@/shared/mod/ModAssets'
import { contentJson, parseContentArchive } from '@/shared/mod/content'
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
    const { manifest, content: packagedContent } = parseContentArchive(files)
    const definitions = new DefinitionSources(), registry = new GameplayRegistry()
    const host = createServerModHost(manifest.id, registry, definitions)
    try {
        const gameplay = packagedContent.gameplay ? contentJson(files, packagedContent.gameplay) : undefined
        const builtin = manifest.id === 'pvz'
        if (builtin && !gameplay) throw new Error('Base content does not define gameplay')
        if (gameplay && !builtin) definitions.register(manifest.id, gameplay)
        if (manifest.gameplay) {
            const module = await import(pathToFileURL(join(root, manifest.gameplay.nodeModule)).href)
            if (typeof module.register !== 'function') throw new Error('Mod must export register({ host, assets })')
            await module.register({ host, assets: new ModAssets(manifest, files) })
        }
        const content = buildGameplayContent(builtin ? gameplay : readBaseContent().gameplay, definitions.sources)
        registry.freeze(content.definitions)
        console.info(`[mod] Validated ${manifest.id} with the server host`)
    } finally { host.dispose() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
