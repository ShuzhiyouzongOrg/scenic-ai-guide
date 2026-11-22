# 组件动效配方与审查

每个效果对应一次用户意图和一个可验证的终态。先走一遍无动画的流程，再决定注意力应该落到哪里。导航、地图相机、音频时钟、键盘均由对应宿主管理。以下配方为本项目原创适配；统一参数和来源见[时长、缓动与减少动态](motion-tokens.md)和[来源记录 MOT-01 至 MOT-07](../references/source-index.md)。

| ID 与场景 | 何时反馈，怎样进入与退出 | 连续交互、减少动态与验收 | 原始出处 |
| --- | --- | --- | --- |
| FX-01 按钮 / 卡片 | 按下立即变背景或压低局部透明度；松开 fast，提交成功由业务回调确认。导航卡片不缩放可读正文 | 移出或取消恢复原态；双击提交只发一次请求。减少动态时可直接换底色 | [EM Button press](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md#button-press) |
| FX-02 标签 / 页面 | 底栏保留系统选中态；下钻走系统栈，返回恢复滚动与选择。自定义转场确有空间关系时才评估 page 上限 | 快速切两次不叠加进入动画。开启系统减少动态后页面不二次位移 | [EM Tab indicator](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md#tab-indicator-with-a-color-transition) |
| FX-03 底卡 / 对话框 | 地图卡原位展开以看见选点对应信息；一般弹层用系统模态。自定义面板可从近端 8px 内 normal/medium 缓出，退出减一档 | 快速开关最终只保留最后一个状态；地图手势不误传给底卡，关闭把焦点还给触发项。减少动态时一步显示 | [EM Drawer](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md#drawer--sheet) |
| FX-04 下拉 / 折叠 | 选项靠近触发器，箭头或选中标记和内容同步；选中时立即收起。固定短列表最多使用 normal 透明度变化 | 不为每个选项加错峰延迟。多次反转按当前状态收敛，长内容直接展开由内部滚动承载 | [EM Accordion](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md#accordion--collapse) |
| FX-05 地图点位 / 路线 | 点击更新稳定 ID、描边、序号与卡片；改变路线时同时更换线段和站序。原生相机独立接收定位与缩放 | 禁止沿线自动飞行和地图全量 marker 同时弹跳。快速切区丢弃旧响应，缺坐标处断开。减少动态与默认模式保持相同路线 | [HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) |
| FX-06 手势 / 拖动排序 | 只让被用户拖动的目标跟手，越过目标站点才更新顺序；可用上下移动完成相同操作 | 连点、拖动取消、跨过多站后检查节点只出现一次，行程顺序与地图一致 | [HIG Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) |
| FX-07 加载 / 成功 / Toast | 可以预知布局时显示静态骨架或状态文本；必要的忙碌指示放在请求旁。操作结果持久反映在列表中 | 错误与重试不能随着 toast 一起消失。减少动态时同样可识别工作中与失败 | [EM Toast](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/RECIPES.md#toast) |
| FX-08 AI 消息 | 气泡随实际服务响应加入，不逐字模拟网络流式返回。来源与回答同步显示；对话列表保留阅读顺序 | 连发、等待中切页、慢合成时静音均不重复播报。长回答的排版一次完成 | [DMP Performance](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/performance.md) |
| FX-09 语音波形 / 形象 | 录音器和音频引擎分别确认收音与播报状态。当前录音接口没有实际响度输出，显示录音文字和结束/取消按钮；本地形象的口型仅在说话时活动 | 暂停停止口型，减少动态使用静态形象和文字。切形象应停止旧引擎；固定光圈/虚构音量均无法证明播放 | [DMP Accessibility](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/accessibility.md) |

## 状态与中断

| 状态规则与进入证据 | 转换 | 取消或中断后的检查 | 原始出处 |
| --- | --- | --- | --- | --- |
| VOC-01 开始请求收音权限 | 空闲 → 等待授权；start 回调后进入录音 | 取消、隐藏页面时丢弃最终临时文件；浏览器关闭媒体轨道 | [平台与工程依据](https://doc.dcloud.net.cn/uni-app-x/api/get-recorder-manager.html) |
| VOC-02 停止录音并选择发送 | 录音 → 处理；服务返回后显示回答 | 录音取消走独立路径；不发送未授权的音频 | [平台与工程依据](../../../visitor-app/services/web-recording.js) |
| VOC-03 自动播报开启或主动朗读 | 回答 → 准备音频；音频 onPlay 或数字人 speaking 后进入播放 | 先作废旧请求所有权，再停止相应引擎；即使旧合成晚到也不能出声 | [平台与工程依据](../../../visitor-app/pages/ai-guide/index.uvue) |
| VOC-04 宿主音频 onPause / onPlay | 播放 ↔ 暂停 | 保留同一实例、src 和队列索引；声音和界面须同时恢复 | [平台与工程依据](https://doc.dcloud.net.cn/uni-app-x/api/create-inner-audio-context.html) |
| VOC-05 最后一段结束 / 主动停止 / 失败 | 播放 → 空闲或错误 | 清理队列及计时器，保留答案与重新朗读入口。远端桥仅支持中断时提供停止；每条答案还有宿主朗读入口 | [平台与工程依据](../../../visitor-app/pages/ai-guide/index.uvue) |

VOC-01/02 的原始接口是 [DCloud RecorderManager](https://doc.dcloud.net.cn/uni-app-x/api/get-recorder-manager.html)，Web MediaRecorder 转接见[录音适配](../../../visitor-app/services/web-recording.js)。VOC-03/04/05 的播放与暂停来自 [InnerAudioContext](https://doc.dcloud.net.cn/uni-app-x/api/create-inner-audio-context.html) 和[项目引擎实现](../../../visitor-app/pages/ai-guide/index.uvue)。具体状态表见 [AI 导游规范](../pages/ai-guide.md)。地图手势误触、曲线来源及区域切换见[地图规范](../pages/map.md)。

## 提交前证据

1. **REV-01** 写明页面、输入、引擎、实测设备、触发前后状态及可重现步骤。先记录键盘、网络、SDK 状态，避免将请求延迟当作动效时长。 [DMP 审查流程](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/workflows/audit.md)
2. **REV-02** 对每一条动作执行正常、快速反向或重复、进行中返回、减少动态四次。比较终态和副作用，包括路由次数、保存次数、是否仍在录音或播报。 [EM interruption and exit](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/animate/SKILL.md#6-interruption-and-exit)
3. **REV-03** 以正常速度观察点击响应，再以慢放确认谁抢占注意力。地图与选择卡只能有一个主变化；所有层同时移动、等待动效结束才可取消或循环装饰应优先去掉。 [DMP 过度动效审查](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/anti-checklist.md)
4. **REV-04** 在目标设备上打开系统字体放大和减少动态，滚动同时触发地图选择或播放器操作。记录实际渲染、录屏及性能证据；没有帧数据时只记录观察到的现象。 [DMP 性能](https://github.com/kylezantos/design-motion-principles/blob/4a9ca879f24a361f4dca4174fe2da0f67b5ddee3/skills/design-motion-principles/references/performance.md)
