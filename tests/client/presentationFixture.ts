import { readFileSync } from 'node:fs'
import { parsePresentationDefinitions } from '@/shared/content/presentation'

export const presentationFixture = parsePresentationDefinitions(JSON.parse(
    readFileSync('assets/bundles/pvz-base/presentation/definitions.json', 'utf8')))
