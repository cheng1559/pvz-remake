import { screen, sys } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { SoundSystem } from '@/client/sound/SoundSystem'

const FULLSCREEN_CHANGE = 'fullscreen-change' as never

export const OptionsSettings = {
    generation: 0,
    get fullScreenForced(): boolean { return sys.isNative && sys.isMobile },

    async start(): Promise<void> {
        const generation = ++this.generation
        const settings = await menuApi.getSettings()
        if (generation !== this.generation) return
        SoundSystem.setMusicVolume(settings.musicVolume)
        SoundSystem.setSfxVolume(settings.sfxVolume)
        screen.on(FULLSCREEN_CHANGE, this.syncFullScreen, this)
        if (this.fullScreenForced) await menuApi.updateSettings({ fullScreen: true })
        else if (settings.fullScreen && screen.supportsFullScreen) {
            void this.setFullScreen(true).catch(error => console.warn('[Options] Full screen unavailable', error))
        }
    },

    stop(): void { this.generation++; screen.off(FULLSCREEN_CHANGE, this.syncFullScreen, this) },

    async setFullScreen(value: boolean): Promise<void> {
        if (this.fullScreenForced) value = true
        else if (value !== screen.fullScreen()) {
            if (value) await screen.requestFullScreen()
            else await screen.exitFullScreen()
        }
        await menuApi.updateSettings({ fullScreen: value })
    },

    syncFullScreen(): void {
        void menuApi.updateSettings({ fullScreen: this.fullScreenForced || screen.fullScreen() })
            .catch(error => console.warn('[Options] Could not save full screen preference', error))
    },
}
