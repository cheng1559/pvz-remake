import { _decorator, AudioClip, Component } from 'cc'
import { ClientContentLoader, SoundRepository } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { SoundLoader } from '@/client/sound/LegacySoundSystem'

const { ccclass } = _decorator

@ccclass('SoundPlayer')
export class SoundPlayer extends Component {
    private clip: AudioClip | null = null

    async load(id: string, registry: ContentRegistry, loader = new ClientContentLoader()): Promise<void> {
        const clip = await new SoundRepository(registry, loader).load(id)
        if (!this.node.isValid) throw new Error('sound player was destroyed while loading')
        this.clip = clip
    }

    play(volume = 1): void {
        if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            throw new Error('sound volume must be finite and within 0..1')
        }
        void SoundLoader.playClip(this.requireClip(), volume)
    }

    private requireClip(): AudioClip {
        if (!this.clip) throw new Error('sound player is not loaded')
        return this.clip
    }
}
