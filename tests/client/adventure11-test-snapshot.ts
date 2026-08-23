import type { Adventure11PresentationSnapshotV2 } from '@/client/showcase/Adventure11PresentationSnapshotV2'
import type { WorldSnapshot } from '@/shared/protocol/index'

function reanim(id: string) {
    return {
        id, timeSeconds: 0, playing: true, loop: true, rate: 1, visible: true,
        hideOnFinish: false, extraAdditive: false,
        extraAdditiveColor: { r: 0, g: 0, b: 0, a: 255 },
        blend: null, attachmentTrackId: null,
    }
}

export function adventure11Presentation(current: WorldSnapshot): Adventure11PresentationSnapshotV2 {
    const complete = current.phase === 'gameplay'
    return {
        schemaVersion: 2,
        flow: { introCompletionSent: complete, completionStarted: current.result === 'won' },
        intro: {
            ticks: complete ? 855 : 0,
            previews: complete ? [] : Array.from({ length: 5 }, (_, slot) => ({
                slot, x: 430 + slot * 10, y: 230, z: 100 + slot,
                reanim: reanim('pvz:zombie_idle2'),
            })),
        },
        end: { ticks: current.result === 'won' ? 600 : -1, finalWave: null },
        advice: { lastStatusMessage: '', lastSyncedTick: current.gameplayTick, widget: null },
        hud: {
            sunFlashTicks: 0, previousPacketCooldown: null,
            progressWave: current.wave.index, progressCountdownStart: current.wave.countdown,
            progressMeterWidth: 0, progressTick: current.gameplayTick,
        },
        audio: {
            music: null, ownsMusic: true, gameplayStarted: complete, firstWavePlayed: false,
        },
        entities: [],
        particles: [],
        extensions: {},
    }
}
