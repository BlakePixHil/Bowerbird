/** A short name for the device a passkey was made on, shown in the list of passkeys. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Linux/.test(ua)) return "Linux computer";
  return "This device";
}

/**
 * The words on the phone's passkey button: Face ID on an iPhone or iPad, Touch ID on a Mac, and
 * plain words everywhere else.
 */
export function passkeyButtonLabel(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone|iPad/.test(ua)) return "Sign in with Face ID";
  if (/Macintosh/.test(ua)) return "Sign in with Touch ID";
  return "Sign in with your fingerprint or screen lock";
}
