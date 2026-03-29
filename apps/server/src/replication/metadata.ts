export const MSP_METADATA_KEY = '_msp'
export const MSP_METADATA_VALUE = '1'

export function isMspTagged(
  metadata: Record<string, unknown> | null | undefined
) {
  return metadata?.[MSP_METADATA_KEY] === MSP_METADATA_VALUE
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

export function withMspMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, string> {
  return {
    ...normalizeMetadata(metadata),
    [MSP_METADATA_KEY]: MSP_METADATA_VALUE,
  }
}
