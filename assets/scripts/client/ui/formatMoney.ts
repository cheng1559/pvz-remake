/**
 * Original coin units display as ten dollars each, with a comma between thousands. Not by toLocaleString: the native
 * builds' script engine has no Intl, and there it leaves the commas out.
 */
export const formatMoney = (coins: number): string =>
    `$${String(Math.max(0, Math.floor(coins)) * 10).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
