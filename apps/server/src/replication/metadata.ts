export const MYELIN_METADATA_KEY = '_myelin'
export const MYELIN_METADATA_VALUE = '1'

export function isMyelinTagged(
  metadata: Record<string, unknown> | null | undefined
) {
  return metadata?.[MYELIN_METADATA_KEY] === MYELIN_METADATA_VALUE
}

export function normalizeMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, string> {
  const normalized: Record<string, string> = {}

  if (!metadata) {
    return normalized
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (value == null) {
      continue
    }

    normalized[key] = typeof value === 'string' ? value : String(value)
  }

  return normalized
}

export function withMyelinMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, string> {
  return {
    ...normalizeMetadata(metadata),
    [MYELIN_METADATA_KEY]: MYELIN_METADATA_VALUE,
  }
}
