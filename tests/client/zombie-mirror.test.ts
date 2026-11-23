import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

test('the pole vaulter’s facing-right corrections follow from the original’s numbers', () => {
    const presentation = read('mods/pvz-base/presentation/definitions/zombies.json')
    const gameplay = read('mods/pvz-base/gameplay/definitions/zombies.json')
    const pole = presentation['pvz:pole_vaulter'], plain = presentation['pvz:normal']
    // The original's clips: the plain zombie's offset, the pole vaulter's moved by its GetDrawPos (-6, -11).
    assert.deepEqual([pole.clips.run.x, pole.clips.run.y], [plain.clips.walk.x - 6, plain.clips.walk.y + 11])
    // Its packet stands 5 left of the plain zombie's at 0.35: its body 14.29 further right in its frame.
    const inFrame = (plain.packet.x - pole.packet.x) / pole.packet.scale
    assert.ok(Math.abs(gameplay['pvz:pole_vaulter'].facingRightOffsetX - (6 + inFrame)) < 0.01, 'put down, its GetDrawPos too')
    // The football zombie's packet has its own scale: its body and the plain zombie's line up in the packet's middle
    // (x = 25 of its 50), which for one scale is the pole vaulter's reckoning. Its GetDrawPos moves it only up.
    const football = presentation['pvz:football'], middle = 25
    const footballInFrame = (middle - football.packet.x) / football.packet.scale - (middle - plain.packet.x) / plain.packet.scale
    assert.ok(Math.abs(gameplay['pvz:football'].facingRightOffsetX - footballInFrame) < 0.01, `${footballInFrame}`)
    assert.deepEqual([football.clips.walk.x, football.clips.walk.y], [plain.clips.walk.x, plain.clips.walk.y + 16])
    // The dancers, by the same reckoning, take back the 6 they turn round further left than the others (turnedOffsetX).
    for (const id of ['pvz:dancer', 'pvz:backup_dancer']) {
        const dancer = presentation[id], inFrame = (middle - dancer.packet.x) / dancer.packet.scale - (middle - plain.packet.x) / plain.packet.scale
        assert.ok(Math.abs(gameplay[id].facingRightOffsetX - (inFrame - dancer.turnedOffsetX)) < 0.01, `${id}: ${inFrame - dancer.turnedOffsetX}`)
    }
})

test('the dirt of a zombie coming up lies under its feet, where its shadow is, turned round with it on the plants side', async () => {
    const { riseDirt } = await import('@/client/zombies/zombieParts')
    const presentation = read('mods/pvz-base/presentation/definitions/zombies.json')
    for (const id of ['pvz:normal', 'pvz:backup_dancer']) {
        const { shadow } = presentation[id], at = { x: 100, y: 200 }
        assert.deepEqual(riseDirt(at, shadow), { x: 160, y: 310, mirrored: false }, `${id}: where the original puts it`)
        // Zombie::DrawShadow: walking right, its shadow lies 12 further left (backwardsX), and so does its dirt.
        assert.deepEqual(riseDirt({ ...at, team: 'plants' }, shadow), { x: 160 + shadow.backwardsX - shadow.x, y: 310, mirrored: true }, id)
        assert.equal(shadow.backwardsX - shadow.x, -12, id)
    }
})
