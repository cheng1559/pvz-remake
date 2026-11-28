import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { plantAttack, plantRectAt, risen, vaultAttack, zombieRectAt, zombieRise } from '@/shared/content/hitRects'
import { shooterFront } from '@/shared/content/teams'
import { readGameplaySource } from '../../tools/mod/content'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
const board = definitions.boards['pvz:frontyard'], normal = definitions.zombies['pvz:normal']

test("a plant's rects as it faces, from where it stands (GetPlantRect, GetPlantAttackRect)", () => {
    const { chomper, potatomine, puffshroom, peashooter } = Object.fromEntries(['chomper', 'potatomine', 'puffshroom', 'peashooter']
        .map(id => [id, definitions.plants[`pvz:${id}`]]))
    assert.deepEqual(plantRectAt(peashooter.body, 'plants', 100.5, 200), { x: 110.5, y: 200, width: 60, height: 80 }, 'where it is drawn, for a view')
    // Its attack rect, as high as its body: a chomper's bite, a potato mine's, a bowled nut's, a puff-shroom's 230 from
    // its body's width in; none for one that reaches the whole row.
    assert.deepEqual(plantAttack(chomper), { x: 80, y: 0, width: 40, height: 80 })
    assert.deepEqual(plantAttack(potatomine), { x: 0, y: 0, width: 55, height: 80 })
    assert.deepEqual(plantAttack(definitions.plants['pvz:bowling-wallnut']), { x: 0, y: 0, width: 60, height: 80 })
    assert.deepEqual(plantAttack(puffshroom), { x: 60, y: 0, width: 230, height: 80 })
    assert.equal(plantAttack(peashooter), undefined)
    // On the zombies' side mirrored across its cell: a chomper bites behind, a puff-shroom reaches left from where the
    // shooter's reach begins.
    assert.deepEqual(plantRectAt(plantAttack(chomper)!, 'zombies', 300, 200), { x: 260, y: 200, width: 40, height: 80 })
    const reach = plantRectAt(plantAttack(puffshroom)!, 'zombies', 300, 200)
    assert.deepEqual([reach, reach.x + reach.width], [{ x: 90, y: 200, width: 230, height: 80 }, 300 + shooterFront(puffshroom.body, 'zombies')])
})

test('a zombie rising from a grave sits as far down and as hidden as Zombie::GetDrawPos has it', () => {
    // UpdateZombieRiseFromGrave: 200 below until its last 50 ticks; the ground hides as much, and up to 40 ticks more.
    assert.deepEqual(board.riseFromGrave, { depth: 200, riseTicks: 50, settleTicks: 40 })
    assert.deepEqual([150, 50, 40, 20, 10, 1].map(ticks => risen(board.riseFromGrave, ticks)), [
        { sunk: 200, hidden: 240 }, { sunk: 200, hidden: 240 }, { sunk: 160, hidden: 200 },
        { sunk: 80, hidden: 100 }, { sunk: 40, hidden: 50 }, { sunk: 4, hidden: 5 },
    ])
})

test("a rising zombie's rects come down with its body and are as much shorter, never below none (GetZombieRect)", () => {
    const at = (ticks: number) => zombieRectAt(normal.body, 'zombies', 300, 100, { rise: board.riseFromGrave, ticks })
    assert.deepEqual(at(20), { x: 336, y: 180, width: 42, height: 15 })
    assert.deepEqual(at(50), { x: 336, y: 300, width: 42, height: 0 }, 'all of it under the ground')
    assert.deepEqual(zombieRectAt(normal.body, 'zombies', 300, 100), { x: 336, y: 100, width: 42, height: 115 }, 'up, it stands where it is')
    // Called up into a troupe: 200 below over all of its 150 ticks, hidden as much and no more (PHASE_DANCER_RISING).
    const backup = definitions.zombies['pvz:backup_dancer']
    assert.equal(zombieRise(backup, board, true), backup.dance!.rise)
    assert.equal(zombieRise(backup, board, false), board.riseFromGrave, 'out of a grave like any other')
    assert.equal(zombieRise(normal, board, true), board.riseFromGrave)
    assert.deepEqual(zombieRectAt(backup.body, 'zombies', 400, 100, { rise: backup.dance!.rise!, ticks: 75 }), { x: 436, y: 200, width: 42, height: 15 })
})

test("a pole vaulter's attack rect goes by its vault: holding its pole, in the air, landed (GetZombieAttackRect)", () => {
    const vault = definitions.zombies['pvz:pole_vaulter'].vault!
    assert.deepEqual(vault.airborneAttack, { x: -40, y: 0, width: 100, height: 115 })
    assert.equal(vaultAttack(vault, 'walking', true), vault.attack)
    assert.equal(vaultAttack(vault, 'airborne', false), vault.airborneAttack)
    assert.equal(vaultAttack(vault, 'walking', false), vault.landedAttack)
    assert.equal(vaultAttack(vault, 'eating', false), vault.landedAttack)
})
