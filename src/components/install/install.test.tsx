import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APP_SHORT_NAME } from "@/config/app";
import { InstallGuide } from "./InstallGuide";
import { InstallNudge } from "./InstallNudge";
import { browserOf, computerGuide, deviceOf, kindOf, phoneBrowserNote } from "./platform";

/** Real user agents, trimmed to what matters. */
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1",
  // iPadOS asks for the desktop site, so it looks just like a Mac.
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
  windowsFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
};

describe("telling devices and browsers apart", () => {
  it("knows phones, tablets and computers", () => {
    expect(deviceOf(UA.iphoneSafari)).toBe("iphone");
    expect(deviceOf(UA.androidChrome)).toBe("android");
    expect(deviceOf(UA.macChrome)).toBe("computer");
    expect(deviceOf(null)).toBe("computer");
    // Only the touch screen tells an iPad from a Mac.
    expect(deviceOf(UA.ipad, 0)).toBe("computer");
    expect(deviceOf(UA.ipad, 5)).toBe("ipad");
    expect(kindOf("ipad")).toBe("phone");
  });

  it("knows Safari, Chrome and Edge, Firefox and the rest", () => {
    expect(browserOf(UA.iphoneSafari)).toBe("safari");
    expect(browserOf(UA.ipad)).toBe("safari");
    expect(browserOf(UA.iphoneChrome)).toBe("other");
    expect(browserOf(UA.androidChrome)).toBe("chromium");
    expect(browserOf(UA.androidSamsung)).toBe("other");
    expect(browserOf(UA.macChrome)).toBe("chromium");
    expect(browserOf(UA.windowsEdge)).toBe("chromium");
    expect(browserOf(UA.windowsFirefox)).toBe("firefox");
  });

  it("says when the phone steps are for another browser", () => {
    expect(phoneBrowserNote("iphone", "safari", "ios")).toBeNull();
    expect(phoneBrowserNote("iphone", "other", "ios")).toMatch(/^These steps are for Safari/);
    expect(phoneBrowserNote("android", "other", "android")).toMatch(/^These steps are for Chrome/);
    // Looking at the other phone's steps needs no note.
    expect(phoneBrowserNote("android", "chromium", "ios")).toBeNull();
  });

  it("gives each computer browser its own steps", () => {
    expect(computerGuide("chromium").steps[0][0]).toBe("Click the install icon");
    expect(computerGuide("safari").steps[0]).toEqual([
      "Click File",
      "in the menu bar, then Add to Dock.",
    ]);
    expect(computerGuide("chromium").cannot).toBeNull();
    expect(computerGuide("firefox").cannot).toMatch(/^Firefox can't install apps/);
  });
});

const guide = (userAgent: string) =>
  renderToStaticMarkup(
    <InstallGuide
      device={deviceOf(userAgent)}
      browser={browserOf(userAgent)}
      email="olive@example.com"
    />,
  );

describe("Install the app", () => {
  it("shows an iPhone the three steps in Safari", () => {
    const html = guide(UA.iphoneSafari);
    expect(html).toContain("On your iPhone, in Safari");
    expect(html).toContain("Tap Share in Safari");
    expect(html).toContain("Tap Add to Home Screen, then Add");
    expect(html).toContain(`Open ${APP_SHORT_NAME} from your Home Screen`);
    expect(html).not.toContain("These steps are for Safari");
    expect(html).not.toContain("This computer");
  });

  it("tells an iPhone in another browser the steps are for Safari", () => {
    expect(guide(UA.iphoneChrome)).toContain("These steps are for Safari");
  });

  it("shows an Android phone the three steps in Chrome", () => {
    const html = guide(UA.androidChrome);
    expect(html).toContain("On your Android phone, in Chrome");
    expect(html).toContain("Tap the menu in Chrome");
    expect(html).toContain("Tap Install app, then Install");
    expect(html).not.toContain("Tap Share in Safari");
  });

  it("shows a computer its browser's steps and the phone steps in short", () => {
    const html = guide(UA.windowsEdge);
    expect(html).toContain("This computer");
    expect(html).toContain("Not installed yet");
    expect(html).toContain("Click the install icon");
    expect(html).toContain("Your phone");
    expect(html).toContain("Tap Share");
    expect(html).toContain("Tap the three dots menu");
    expect(html).toContain("Goes to olive@example.com.");
    // Install now only shows once the browser offers its prompt.
    expect(html).not.toContain("Install now");
    expect(guide(UA.windowsFirefox)).toContain("Firefox can&#x27;t install apps");
    expect(guide(UA.ipad)).toContain("Click File");
  });

  it("says it reads offline, and leaves notifications out until they're built", () => {
    for (const html of [guide(UA.iphoneSafari), guide(UA.androidChrome), guide(UA.macChrome)]) {
      expect(html).toContain("Reads offline");
      expect(html).not.toContain("otifications");
    }
  });

  it("asks once on Home, in the words for the device", () => {
    const phone = renderToStaticMarkup(<InstallNudge device="iphone" />);
    expect(phone).toContain(`Put ${APP_SHORT_NAME} on your Home Screen`);
    expect(phone).toContain('href="/install"');
    expect(phone).toContain("not-installed");
    expect(renderToStaticMarkup(<InstallNudge device="computer" />)).toContain(
      `Install ${APP_SHORT_NAME} on this computer`,
    );
  });
});
