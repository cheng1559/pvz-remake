import assert from 'node:assert/strict'
import test from 'node:test'
import { plantRenderOffset, renderOrder, SHADOW_RENDER_OFFSET, ZOMBIE_RENDER_OFFSET } from '@/shared/content/renderOrder'

test('the board draws in Board::MakeRenderOrder order', () => {
    const plant = (row: number, x: number) => renderOrder('plant', row, plantRenderOffset(x))
    const zombie = (row: number) => renderOrder('zombie', row, ZOMBIE_RENDER_OFFSET)
    assert.equal(plant(2, 120), 2 * 10000 + 302000 + 5 - 120 + 800, 'the original value, so it compares with its code')
    assert.ok(plant(2, 120) > plant(2, 200), 'a plant further left covers the one to its right (the chomper\'s head)')
    assert.ok(zombie(2) > plant(2, 0), 'a row\'s zombies cover all its plants')
    assert.ok(plant(3, 700) > zombie(2), 'a front row covers the rows behind it')
    assert.ok(renderOrder('ground', 4, SHADOW_RENDER_OFFSET) < plant(0, 700), 'shadows lie under every row\'s plants')
    assert.equal(renderOrder('top', 4), renderOrder('top'), 'layers from top up are not per row')
    assert.ok(renderOrder('top') > renderOrder('particle', 4))
})
