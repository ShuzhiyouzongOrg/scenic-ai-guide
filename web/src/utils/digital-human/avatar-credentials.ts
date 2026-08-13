export interface AvatarCredentials {
  appId: string
  apiKey: string
  apiSecret: string
}

export type AvatarCredentialLoader = () => Promise<Partial<AvatarCredentials> | null | undefined>

function normalizeCredentials(values: Partial<AvatarCredentials> | null | undefined): AvatarCredentials {
  return {
    appId: String(values?.appId || '').trim(),
    apiKey: String(values?.apiKey || '').trim(),
    apiSecret: String(values?.apiSecret || '').trim()
  }
}

export function hasAvatarCredentials(values: Partial<AvatarCredentials> | null | undefined) {
  const normalized = normalizeCredentials(values)
  return Boolean(normalized.appId && normalized.apiKey && normalized.apiSecret)
}

export async function resolveAvatarCredentials(
  compiled: Partial<AvatarCredentials>,
  loadDesktopCredentials?: AvatarCredentialLoader
): Promise<AvatarCredentials | null> {
  const bundled = normalizeCredentials(compiled)
  if (hasAvatarCredentials(bundled)) return bundled
  if (!loadDesktopCredentials) return null

  try {
    const desktop = normalizeCredentials(await loadDesktopCredentials())
    return hasAvatarCredentials(desktop) ? desktop : null
  } catch {
    return null
  }
}
