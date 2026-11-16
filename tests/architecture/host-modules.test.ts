import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { HOSTS, hostModulesSource } from '../../tools/mod/hosts'

test('the Mod hosts list every module of their directories, as `npm run mod:hosts` generates them', () => {
    for (const host of HOSTS) {
        assert.equal(readFileSync(`assets/scripts/${host.file}`, 'utf8'), hostModulesSource(host), `${host.file} is out of date: run npm run mod:hosts`)
    }
})
