import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMoney } from '@/client/ui/formatMoney'

test('money shows ten dollars a coin with a comma between thousands, also where the script engine has no Intl', () => {
    // A native build's engine: toLocaleString is toString there.
    const toLocaleString = Number.prototype.toLocaleString
    Number.prototype.toLocaleString = function (this: number) { return String(this) }
    try {
        assert.deepEqual([0, 12, 123, 99999, 123456, -5, 7.9].map(formatMoney),
            ['$0', '$120', '$1,230', '$999,990', '$1,234,560', '$0', '$70'])
    } finally {
        Number.prototype.toLocaleString = toLocaleString
    }
})
