/**
 * @fileoverview Web Vitals 性能采样与上报工具。
 * @description 按隐私偏好和环境采样率收集核心性能指标，并通过站内接口进行旁路上报。
 */

import type { Metric } from 'web-vitals'

const METRIC_ENDPOINT = `${import.meta.env.BASE_URL.replace(/\/?$/u, '/')}api/web-vitals`
const DEFAULT_SAMPLE_RATE = 0.05

/**
 * @description 根据浏览器隐私设置、环境采样率和本次随机样本判断是否收集性能指标。
 * @param {{ random?: number }} [options] 采样选项。
 * @param {number} [options.random=Math.random()] 本次采样值，通常位于 `[0, 1)`。
 * @returns {boolean} 允许采集且样本值小于配置采样率时返回 `true`。
 * @example
 * shouldCollectWebVitals({ random: 0.01 })
 */
export function shouldCollectWebVitals({ random = Math.random() } = {}): boolean {
  const navigatorWithPrivacy = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (navigator.doNotTrack === '1' || navigatorWithPrivacy.globalPrivacyControl === true) return false

  const configured = Number(import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE)
  const sampleRate = Number.isFinite(configured)
    ? Math.min(1, Math.max(0, configured))
    : DEFAULT_SAMPLE_RATE
  return random < sampleRate
}

/**
 * @description 动态加载 `web-vitals`，注册 CLS、FCP、INP、LCP 与 TTFB 上报回调。
 * @returns {Promise<void>} 指标监听完成注册或旁路初始化结束后兑现的 Promise。
 * @example
 * void startWebVitals()
 */
export async function startWebVitals(): Promise<void> {
  if (!shouldCollectWebVitals()) return

  try {
    const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import('web-vitals')
    const report = (metric: Metric) => reportWebVital(metric)
    onCLS(report)
    onFCP(report)
    onINP(report)
    onLCP(report)
    onTTFB(report)
  } catch {
    // 性能观测属于旁路能力，初始化失败不得影响业务启动。
  }
}

function reportWebVital(metric: Metric): void {
  const payload = {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    version: __APP_VERSION__ || 'unknown',
    deviceClass: window.matchMedia('(max-width: 768px)').matches ? 'mobile' : 'desktop'
  }

  void fetch(METRIC_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    keepalive: true
  }).catch(() => undefined)
}
