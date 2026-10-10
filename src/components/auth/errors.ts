import { APP_NAME } from "@/config/app";

/** Plain words for why the browser couldn't use a passkey. */
export function passkeyProblem(error: unknown, making: boolean): string {
  const name = error instanceof Error ? error.name : "";
  const code = (error as { code?: string } | null)?.code;
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError")
    return `This device already has a passkey for ${APP_NAME}.`;
  if (name === "NotAllowedError" || name === "AbortError")
    return making
      ? "No passkey was made. Try again when you're ready."
      : "Sign-in was cancelled or timed out. Try again when you're ready.";
  if (name === "SecurityError" || code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID")
    return `Passkeys don't work on this address. Open ${APP_NAME} from its usual link.`;
  return "This browser couldn't use a passkey. Try another browser or device.";
}
