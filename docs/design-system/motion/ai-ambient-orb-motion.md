# 语音状态球的节律与测幅

收音和播报是仅有的两个可使用实时音量的状态。有合法样本时，振幅调制球体内部的尺度与层间明暗；布局与数字人保持稳定。下表定义的是视觉行为和停止条件。完整的触发证据见[交互表](../interaction/ai-ambient-orb-interaction.md)。

| 状态 | 视觉行为 | 恢复与静态表达 |
| --- | --- | --- |
| IDLE | 保持安静，允许低强度待机起伏 | 文字提示开始讲话，静态偏好下保持静止 |
| LISTENING | 真实电平驱动收音层；无样本时按收音状态轻缓变化 | 显示录音身份、时长、发送与取消。真实零值对应安静 |
| THINKING | 采用同形状的蓝紫色思考材质，内部相位平缓变化 | 等待处理的文字持续到业务完成 |
| SPEAKING | 当前唯一播放源可提供电平时驱动，切段先清旧值 | 同步显示当前段字幕及停播操作 |
| PAUSED | 冻结持续运动 | 保留当前段、暂停文字与可用的继续操作 |
| ERROR | 冻结并弱化球体，外部文字显示错误原因 | 显示可恢复的动作，不持续闪烁 |
| DISABLED | 静止、降低强调程度 | 说明不可用原因，保留文字入口 |
| CANCELLED | 明确结束上一段活动，无持续动画 | 确认取消的短提示后回到可操作状态 |
| RECONNECTING（额外提示） | 使用同一蓝紫材质，节律弱于 THINKING | 文字说明正在重新连接；恢复或失败后离开 |

| 规则 | 决策、应用方法与验收 |
| --- | --- |
| ORB-MOT-01 | 对输入先验有限区间。-1 表示无采样，0 是实测静音，1 为归一化上限。对正向变化快速追随、负向缓慢释放，限幅后再影响渲染。向同一输入送入静音、脉冲、持续大声、无采样四类序列，观察无突跳、无越界、无数据与静音可区分。[Web Audio analyser](https://www.w3.org/TR/webaudio/#AnalyserNode) |
| ORB-MOT-02 | 同一球的循环由单一调度器控制。避免每个图层创建独立计时器，按可见性限频；优先 transform 和 opacity，避免动态 blur、宽高和逐帧贴图解码。切页、切到非语音模式和卸载后采集回调应停止或失去本轮资格。[工程能力比较](../engineering/ai-ambient-orb-feasibility.md) · [项目动效来源](../references/source-index.md) |
| ORB-MOT-03 | 输入减少动态、暂停、禁止或错误立即终止运动，语音业务可以继续。恢复后从当前状态和最新合法样本开始，冻结期间不补播旧帧。重放前后台、偏好开关及连续按键，核对结束后定时器数且无装饰变换。[Apple Motion](https://developer.apple.com/design/human-interface-guidelines/motion) · [减动入口](../../../visitor-app/design/motion.uts) |
| ORB-MOT-04 | 合成的呼吸、转动等只表达“正在录音/等待/播放”，从不标注为声音强弱或波形；实际振幅与合成节奏分开举证。幅度、采样频率与帧率分别记录。没有遍历真机的场景保留设备与功耗待测项。[Web Audio 音频图](https://www.w3.org/TR/webaudio/) · [核对表](../quality/ai-ambient-orb-checklist.md) |

当前生成参数为调度间隔 80 ms，包络攻击时间常数 105 ms、释放时间常数 310 ms。用实际相邻时刻之差计算系数 `1 - exp(-dt / τ)`，限制恢复后的过长 dt。80 ms 为视觉输入更新间隔；宿主补间和显示器刷新独立。静态偏好和后台无须维持这只调度器。更改数值时从 Token 生成并在同一输入、设备上比较跟随性与 CPU 占用。[Token 源](../../../visitor-app/design/tokens.json) · [生成参数](../../../visitor-app/design/orb-tokens.uts) · [平滑实现](../../../visitor-app/components/sg-ai-ambient-orb/sg-ai-ambient-orb.uvue)

实测电平提示环只在活动收音/播报有实时读数且平滑包络超过 0.025 时显现；无样本、静音、减动以及暂停均无此环。换状态立即清除上一 owner 的包络。独立组件截图以相同背景对比待机、思考、测得电平 1 三种输入，端到端音源另行验收。[状态图](../quality/evidence/ai-orb-render.webp) · [独立测试结果](../quality/evidence/ai-orb-render.json)

小尺寸可见度按真实 RMS 的感知映射调整。输入保持线性且可追溯，渲染包络目标为 min(1, 1.65 × √RMS)，例如原始 RMS 0.02／0.08／0.25 对应约 0.23／0.47／0.83。收音周期 2.05 s，播报 1.60 s；缺少电平时状态节律放慢 22%，避开真实扩散环。球体采用不等轴缩放、内部高光位移和单个向外扩散的环，固定页面布局。实测静音保留极弱状态呼吸，环熄灭；系统或项目减动关闭全部装饰变化。[当前 Token](../../../visitor-app/design/orb-tokens.uts) · [渲染实现](../../../visitor-app/components/sg-ai-ambient-orb/sg-ai-ambient-orb.uvue)
