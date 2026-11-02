/**
 * Checks the Cocos preview build for modules whose import map no longer matches their compiled code.
 *
 * The preview compiles each script to a SystemJS chunk that imports `__unresolved_N` placeholders, and the import map
 * resolves them per chunk. When the two fall out of step (seen after editing a widely imported file), imports silently
 * come from the wrong module and show up as `undefined` at run time. For every name a chunk imports, this checks that
 * the source file the import map points at exports it, then touches the importing source so the preview recompiles it.
 *
 * Usage: npm run check:preview [-- --dry-run]
 */
import { existsSync, readFileSync, utimesSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const target = join(root, 'temp', 'programming', 'packer-driver', 'targets', 'preview')
const dryRun = process.argv.includes('--dry-run')

if (!existsSync(join(target, 'import-map.json'))) {
    console.log('No preview build found; start the preview first.')
    process.exit(0)
}
const importMap: { imports: Record<string, string>, scopes: Record<string, Record<string, string>> } =
    JSON.parse(readFileSync(join(target, 'import-map.json'), 'utf8'))
const sourceOf = new Map(Object.entries(importMap.imports).map(([source, chunk]) => [chunk, source]))

/** The names a source file exports at run time; undefined when it re-exports a whole module. */
const exportCache = new Map<string, Set<string> | undefined>()
function exportsOf(file: string): Set<string> | undefined {
    if (exportCache.has(file)) return exportCache.get(file)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    let names: Set<string> | undefined = new Set<string>()
    for (const statement of source.statements) {
        const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
        if (ts.isExportDeclaration(statement)) {
            if (!statement.exportClause) { names = undefined; break }
            if (ts.isNamedExports(statement.exportClause)) for (const element of statement.exportClause.elements) names.add(element.name.text)
        } else if (ts.isExportAssignment(statement)) names.add('default')
        else if (exported && ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
        } else if (exported && (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) {
            names.add(statement.name.text)
        }
    }
    exportCache.set(file, names)
    return names
}

const stale: { importer: string, specifier: string, resolved: string, name: string }[] = []
for (const [chunk, scope] of Object.entries(importMap.scopes)) {
    const chunkFile = join(target, chunk)
    const importer = sourceOf.get(chunk)
    if (!importer?.startsWith('file://') || !existsSync(chunkFile)) continue
    const code = readFileSync(chunkFile, 'utf8')
    const specifiers = code.match(/System\.register\(\[(.*?)\]/)?.[1].split(',').map(entry => entry.trim().replace(/^"|"$/g, ''))
    const setters = code.match(/setters: \[([\s\S]*?)\],\s*execute/)?.[1].split(/\}, function/)
    if (!specifiers || !setters) continue
    specifiers.forEach((specifier, index) => {
        const resolved = sourceOf.get(scope[specifier] ?? importMap.imports[specifier] ?? '')
        if (!resolved?.startsWith('file://') || !resolved.endsWith('.ts')) return
        const exported = exportsOf(fileURLToPath(resolved))
        if (!exported) return
        const name = [...setters[index]?.matchAll(/= _[\w$]+\.([\w$]+);/g) ?? []].map(match => match[1]).find(name => !exported.has(name))
        if (name) stale.push({ importer: fileURLToPath(importer), specifier, resolved: fileURLToPath(resolved), name })
    })
}

if (!stale.length) {
    console.log('Preview imports match their modules.')
    process.exit(0)
}
for (const entry of stale) {
    console.log(`${relative(root, entry.importer)}: ${entry.specifier} -> ${relative(root, entry.resolved)}, which does not export ${entry.name}`)
}
if (dryRun) process.exit(1)
const now = new Date()
for (const file of new Set(stale.map(entry => entry.importer))) utimesSync(file, now, now)
console.log(`Touched ${new Set(stale.map(entry => entry.importer)).size} file(s); the preview recompiles them, then reload the page.`)
