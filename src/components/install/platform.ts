/**
 * Which device and browser someone is using, so Install the app shows the steps that match. Pure,
 * so the server can guess from the request's user agent and the browser can check again with
 * what only it knows (an iPad says it's a Mac, but has a touch screen).
 */
import { APP_SHORT_NAME } from "@/config/app";

export type Device = "iphone" | "ipad" | "android" | "computer";

export type Browser = "safari" | "chromium" | "firefox" | "other";

/** Phones and tablets put the app on the Home Screen; computers install it in its own window. */
export type Kind = "phone" | "computer";

export function deviceOf(userAgent: string | null, touchPoints = 0): Device {
  const ua = userAgent ?? "";
  if (/iPhone|iPod/.test(ua)) return "iphone";
  // iPadOS asks for the desktop site and says it's a Mac. Only the touch screen gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "ipad";
  if (/Android/.test(ua)) return "android";
  return "computer";
}

export function browserOf(userAgent: string | null): Browser {
  const ua = userAgent ?? "";
  // Every iPhone and iPad browser is Safari underneath, but only Safari itself has these menus.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua)) return "other";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/SamsungBrowser|; wv\)/.test(ua)) return "other";
  if (/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua)) return "chromium";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "other";
}

export function kindOf(device: Device): Kind {
  return device === "computer" ? "computer" : "phone";
}

/** The guide's tabs on a phone: iPhone steps for an iPhone or iPad, Android's for the rest. */
export type PhoneSteps = "ios" | "android";

export function phoneStepsFor(device: Device): PhoneSteps {
  return device === "android" ? "android" : "ios";
}

export type ComputerGuide = {
  /** Under "This computer". */
  where: string;
  /** Three short steps: the bold start, then the rest. */
  steps: readonly (readonly [string, string])[];
  /** Set when this browser can't install apps, saying which can. */
  cannot: string | null;
};

const CHROMIUM_STEPS = [
  ["Click the install icon", "at the right end of the address bar."],
  ["Click Install.", "That's it, nothing to download."],
  ["Open it like any app.", "Pin it to your Dock or taskbar."],
] as const;

/** The steps for a computer, from the board "Desktop: Install the app", for the browser in use. */
export function computerGuide(browser: Browser): ComputerGuide {
  if (browser === "safari")
    return {
      where: "Safari, on a Mac",
      steps: [
        ["Click File", "in the menu bar, then Add to Dock."],
        ["Click Add.", `Keep the name ${APP_SHORT_NAME}.`],
        ["Open it like any app.", "It's in your Dock and Launchpad."],
      ],
      cannot: null,
    };
  if (browser === "chromium")
    return { where: "Chrome or Edge, on a Mac or Windows", steps: CHROMIUM_STEPS, cannot: null };
  return {
    where: "Chrome or Edge, on a Mac or Windows",
    steps: CHROMIUM_STEPS,
    cannot:
      browser === "firefox"
        ? "Firefox can't install apps. Open this page in Chrome, Edge or Safari to install it."
        : "This browser may not install apps. If you can't see the install icon, open this page in Chrome, Edge or Safari.",
  };
}

/**
 * A note above the phone steps when this browser isn't the one they're written for, or null. The
 * steps are for Safari on an iPhone and Chrome on Android.
 */
export function phoneBrowserNote(
  device: Device,
  browser: Browser,
  steps: PhoneSteps,
): string | null {
  if (device === "computer") return null;
  if (steps === "ios" && (device === "iphone" || device === "ipad") && browser !== "safari")
    return "These steps are for Safari. In another browser, tap Share, then Add to Home Screen, or open this page in Safari.";
  if (steps === "android" && device === "android" && browser !== "chromium")
    return "These steps are for Chrome. In another browser, look for Install or Add to Home screen in its menu.";
  return null;
}
