import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

test('the pole vaulter’s facing-right corrections follow from the original’s numbers', () => {
    const presentation = read('mods/pvz-base/presentation/definitions/zombies.json')
    const gameplay = read('mods/pvz-base/gameplay/definitions/zombies.json')
    const pole = presentation['pvz:pole_vaulter'], plain = presentation['pvz:normal']
    // The original's clips: the plain zombie's offset, the pole vaulter's moved by its GetDrawPos (-6, -11).
    assert.deepEqual([pole.animations.run.x, pole.animations.run.y], [plain.animations.walk.x - 6, plain.animations.walk.y + 11])
    // Its packet stands 5 left of the plain zombie's at 0.35: its body 14.29 further right in its frame.
    const inFrame = (plain.packet.x - pole.packet.x) / pole.packet.scale
    assert.ok(Math.abs(pole.packet.facingRightOffsetX - 2 * inFrame) < 0.01, 'a packet turns it back twice that')
    assert.ok(Math.abs(gameplay['pvz:pole_vaulter'].facingRightOffsetX - (6 + inFrame)) < 0.01, 'put down, its GetDrawPos too')
})
