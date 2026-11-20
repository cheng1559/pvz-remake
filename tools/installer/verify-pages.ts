// Checks a Cloudflare Pages deployment of the folder `npm run package:pages` staged (see pages.ts).
// Usage: npm run verify:pages -- <deployment URL> [staged folder, dist/pages by default]
import { readFileSync } from 'node:fs'
import { type PagesStage, verifyPages } from './pages'

const [origin, target = 'dist/pages'] = process.argv.slice(2)
if (!origin) throw new Error('Usage: npm run verify:pages -- <deployment URL> [staged folder]')
const stage = JSON.parse(readFileSync(`${target}.json`, 'utf8')) as PagesStage
verifyPages(origin, target, stage).then(
    () => console.log(`${origin} serves ${target}, and joins the base archive from ${stage.parts.length} parts`),
    error => { console.error(error); process.exitCode = 1 })
