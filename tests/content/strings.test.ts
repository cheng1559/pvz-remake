import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeStringLayers } from '@/shared/content/strings'

test('text layers merge by key: Mods add only their own namespace and may translate any existing key', () => {
    const { strings, rejected } = mergeStringLayers([
        { owner: 'pvz', table: { MAIN_MENU_BUTTON: 'Main Menu', LEVEL: 'Level' } },
        // A translation listed before the Mod it translates still reaches that Mod's keys.
        { owner: 'zh-cn', table: { MAIN_MENU_BUTTON: '主菜单', 'example:menu': '模组实验室', NEW_KEY: 'x' } },
        { owner: 'example', table: { 'example:menu': 'Mod Lab', 'example:title': 'Example Mod Lab', 'other:key': 'y' } },
    ])
    assert.deepEqual(strings, { MAIN_MENU_BUTTON: '主菜单', LEVEL: 'Level', 'example:menu': 'Mod Lab', 'example:title': 'Example Mod Lab' },
        'later layers win')
    assert.deepEqual(rejected, ['zh-cn: NEW_KEY', 'example: other:key'])
    assert.deepEqual(mergeStringLayers([{ owner: 'pvz', table: { CREDITS_NAMES1: '' } }]).strings, { CREDITS_NAMES1: '' },
        'the original table keeps its empty entries')
    assert.throws(() => mergeStringLayers([{ owner: 'pvz', table: { NUMBER: 1 } }]), /must be a string/)
})
