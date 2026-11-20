// Stages the web Release build for Cloudflare Pages in dist/pages, and what it staged in dist/pages.json (see pages.ts).
// Run `npm run build:web:release` first. Arguments: the build folder and the staged folder.
import { writeFileSync } from 'node:fs'
import { stagePages } from './pages'

const [source = 'build/web-mobile', target = 'dist/pages'] = process.argv.slice(2)
const stage = stagePages(source, target)
writeFileSync(`${target}.json`, `${JSON.stringify(stage, null, 4)}\n`)
console.log(`Staged ${source} in ${target}, with the base archive in ${stage.parts.length} parts`)
