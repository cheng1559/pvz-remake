import { readPresentationSource } from '../../tools/mod/content'
import { parsePresentationDefinitions } from '@/shared/content/presentation'

export const presentationFixture = parsePresentationDefinitions(readPresentationSource())
