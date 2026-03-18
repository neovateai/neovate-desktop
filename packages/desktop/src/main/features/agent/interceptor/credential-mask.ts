const SENSITIVE_HEADERS = new Set(["x-api-key", "authorization"]);

/**
 * Mask an API key or token, keeping a recognizable prefix and the last 3 chars.
 *
 * Examples:
 *   "sk-ant-api03-abcdef...xyz"  → "sk-ant-****xyz"
 *   "Bearer sk-ant-api03-abc..."  → "Bearer sk-ant-****xyz"
 */
export function maskCredential(value: string): string {
  if (value.startsWith("Bearer ")) {
    return `Bearer ${maskCredential(value.slice(7))}`;
  }

  if (value.startsWith("sk-")) {
    const prefix = value.slice(0, 6);
    const suffix = value.slice(-3);
    return `${prefix}****${suffix}`;
  }

  return value;
}

/**
 * Return a copy of the headers with sensitive values masked.
 */
export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    masked[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? maskCredential(val) : val;
  }
  return masked;
}
