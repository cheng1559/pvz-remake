import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'

const cc = { _decorator: { ccclass: () => (target: unknown) => target }, Component: class {} }
const { wrapTooltipText } = loadScript('assets/scripts/client/ui/UITooltip.ts', id => id === 'cc' ? cc : {})
// Ten pixels a character; the lines come back as this context's array.
const wrap = (text: string, width: number): string[] => [...wrapTooltipText(text, (part: string) => [...part].length * 10, width)]

test('a tooltip line breaks at its first space at or past the target width, and Chinese only at its newlines', () => {
    // ToolTipWidget::GetLines: the space past the width ends the line, and the spaces after it are dropped.
    assert.deepEqual(wrap('Shoots peas  at attacking zombies', 100), ['Shoots peas', 'at attacking', 'zombies'])
    // The official Chinese text is written with its own newlines, which are all it breaks at, however long the line.
    assert.deepEqual(wrap('点击发射火力强大的玉米导弹，需要点击确定导弹落点\n（需要2个处于同一行并且相邻的玉米投手）', 100),
        ['点击发射火力强大的玉米导弹，需要点击确定导弹落点', '（需要2个处于同一行并且相邻的玉米投手）'])
    assert.deepEqual(wrap('炸飞碰到它的敌人，但安放后需要一定时间启动', 50), ['炸飞碰到它的敌人，但安放后需要一定时间启动'])
})
