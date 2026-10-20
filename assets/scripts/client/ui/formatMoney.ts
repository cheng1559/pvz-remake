/** Original coin units display as ten dollars each. */
export const formatMoney = (coins: number): string => `$${(Math.max(0, Math.floor(coins)) * 10).toLocaleString('en-US')}`
