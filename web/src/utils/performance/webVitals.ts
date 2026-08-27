import type { Metric } from 'web-vitals'

const METRIC_ENDPOINT = `${import.meta.env.BASE_URL.replace(/\/?$/u, '/')}api/web-vitals`
const DEFAULT_SAMPLE_RATE = 0.05

export function shouldCollectWebVitals({ random = Math.random() } = {}): boolean {
  const navigatorWithPrivacy = navigator as Navigator & { globalPrivacyControl?: boolean }
  if (navigator.doNotTrack === '1' || navigatorWithPrivacy.globalPrivacyControl === true) return false

  const configured = Number(import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE)
  const sampleRate = Number.isFinite(configured)
    ? Math.min(1, Math.max(0, configured))
    : DEFAULT_SAMPLE_RATE
  return random < sampleRate
}

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
