export type DeterministicRngState = {
    algorithm: 'xorshift32-v1'
    state: number
}

const ZERO_SEED_STATE = 0x6d2b79f5
const UINT32_RANGE = 0x100000000

export class DeterministicRng {
    private state: number

    constructor(seed: number) {
        assertUint32(seed, 'seed')
        this.state = seed === 0 ? ZERO_SEED_STATE : seed
    }

    static restore(snapshot: DeterministicRngState): DeterministicRng {
        if (snapshot.algorithm !== 'xorshift32-v1') {
            throw new Error(`Unsupported RNG algorithm: ${snapshot.algorithm}`)
        }
        assertUint32(snapshot.state, 'RNG state')
        if (snapshot.state === 0) throw new Error('RNG state must be non-zero')
        return new DeterministicRng(snapshot.state)
    }

    nextUint32(): number {
        let value = this.state
        value ^= value << 13
        value ^= value >>> 17
        value ^= value << 5
        this.state = value >>> 0
        return this.state
    }

    nextFloat(): number {
        return this.nextUint32() / UINT32_RANGE
    }

    integer(minInclusive: number, maxInclusive: number): number {
        if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxInclusive)) {
            throw new RangeError('RNG integer bounds must be safe integers')
        }
        const size = maxInclusive - minInclusive + 1
        if (size <= 0 || size > UINT32_RANGE) {
            throw new RangeError('RNG integer range must contain between 1 and 2^32 values')
        }
        return minInclusive + Math.floor(this.nextFloat() * size)
    }

    snapshot(): DeterministicRngState {
        return { algorithm: 'xorshift32-v1', state: this.state }
    }
}

function assertUint32(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new RangeError(`${name} must be a uint32`)
    }
}
