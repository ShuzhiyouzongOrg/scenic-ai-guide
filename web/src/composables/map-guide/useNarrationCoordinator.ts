/**
 * @fileoverview 将地图讲解协调器接入 Vue 组件生命周期。
 * @description 组合数字人及回退驱动，暴露响应式快照和统一播放控制方法。
 */

import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { NarrationContent, NarrationSnapshot } from '@/types/map-guide'
import { AvatarNarrationAdapter, type AvatarNarrationHandle } from './avatar-narration-adapter'
import { NarrationCoordinator, type NarrationPlayOptions } from './narration-coordinator'
import {
  BrowserSpeechNarrationDriver,
  HtmlAudioNarrationDriver,
  TextNarrationDriver
} from './narration-drivers'

/**
 * @description 创建地图讲解协调器并将其状态同步为 Vue 响应式快照。
 * @param {Ref<AvatarNarrationHandle | undefined>} avatar 当前数字人控制句柄引用。
 * @returns {object} 讲解状态快照及播放、暂停、恢复、停止和销毁方法。
 * @example
 * const narration = useNarrationCoordinator(avatarHandle)
 * await narration.play(content, { preferOfficialAudio: true })
 */
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
