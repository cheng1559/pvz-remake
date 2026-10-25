import { readPresentationSource } from '../../tools/content_source'
import { parsePresentationDefinitions } from '@/shared/content/presentation'

export const presentationFixture = parsePresentationDefinitions(readPresentationSource())
