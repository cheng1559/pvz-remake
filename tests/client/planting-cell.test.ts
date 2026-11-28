import assert from 'node:assert/strict'
import test from 'node:test'
import { plantingCell } from '@/client/level/LevelGeometry'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { readGameplaySource } from '../../tools/mod/content'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))

test("a seed goes down in the last column past the lawn's right edge only as far as the original's screen", () => {
    // The front yard's lawn: nine columns of 80 from x 40, so it ends at 760, and the original's screen at 800.
    const board = definitions.boards['pvz:frontyard']
    assert.deepEqual(plantingCell(board, 700, 300), { row: 2, column: 8 })
    assert.deepEqual(plantingCell(board, 799, 300), { row: 2, column: 8 }, "Board::PixelToGridX: the 40 past the lawn, to the screen's edge")
    assert.equal(plantingCell(board, 800, 300), undefined, 'a wider screen shows more of the yard past it, where no seed goes down')
    assert.equal(plantingCell(board, 1000, 300), undefined)
    assert.equal(plantingCell(board, 39, 300), undefined, 'left of the lawn')
    assert.deepEqual(plantingCell(board, 300, 599), { row: 4, column: 3 }, 'the last row past its bottom edge')
})
