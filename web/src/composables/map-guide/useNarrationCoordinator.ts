import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { NarrationContent, NarrationSnapshot } from '@/types/map-guide'
import { AvatarNarrationAdapter, type AvatarNarrationHandle } from './avatar-narration-adapter'
import { NarrationCoordinator, type NarrationPlayOptions } from './narration-coordinator'
import {
  BrowserSpeechNarrationDriver,
  HtmlAudioNarrationDriver,
  TextNarrationDriver
} from './narration-drivers'

export function useNarrationCoordinator(avatar: Ref<AvatarNarrationHandle | undefined>) {
  const coordinator = new NarrationCoordinator([
    new AvatarNarrationAdapter(() => avatar.value),
    new HtmlAudioNarrationDriver(),
    new BrowserSpeechNarrationDriver(),
    new TextNarrationDriver()
  ])
  const snapshot = ref<NarrationSnapshot>(coordinator.state)
  const unsubscribe = coordinator.subscribe((next) => {
    snapshot.value = next
  })

  function play(content: NarrationContent, options?: NarrationPlayOptions) {
    return coordinator.play(content, options)
  }

  onBeforeUnmount(() => {
    unsubscribe()
    void coordinator.destroy()
  })

  return {
    snapshot,
    play,
    pause: () => coordinator.pause(),
    resume: () => coordinator.resume(),
    stop: () => coordinator.stop(),
    destroy: () => coordinator.destroy()
  }
}
