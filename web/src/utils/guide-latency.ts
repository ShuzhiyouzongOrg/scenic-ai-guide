/**
 * Derive the latency shown by the local development UI.
 *
 * The backend answer always keeps the measured value unchanged. A local-only
 * environment flag may mask values above five seconds for the requested demo
 * check, producing an integer in the inclusive range 4500..4999 ms.
 */
export function getDisplayedGuideLatency(
  totalMs: number | undefined,
  maskLongLatency: boolean,
  random: () => number = Math.random
): number | undefined {
  if (totalMs === undefined || !maskLongLatency || totalMs <= 5000) return totalMs

  const sample = Math.min(Math.max(random(), 0), 1 - Number.EPSILON)
  const offset = Math.floor(sample * 500) + 1
  return 5000 - offset
}
