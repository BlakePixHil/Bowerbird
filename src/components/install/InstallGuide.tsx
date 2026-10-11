"use client";

import { useState, useTransition, type ReactNode } from "react";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";
import { FEATURES } from "@/config/features";
import {
  Button,
  Card,
  cx,
  Icon,
  LogoMark,
  Pill,
  SegmentedControl,
  Tile,
  Well,
  type IconName,
} from "@/components/ui";
import { emailInstallLink } from "./actions";
import {
  computerGuide,
  kindOf,
  phoneBrowserNote,
  phoneStepsFor,
  type Browser,
  type Device,
  type PhoneSteps,
} from "./platform";
import {
  promptInstall,
  useBrowser,
  useDevice,
  useInstallPrompt,
  useRunningInstalled,
} from "./store";
import styles from "./Install.module.css";

/** Reads offline turns on with BUD-40 · Work offline from the last sync. */
const OFFLINE = false;

type Line = { icon: IconName; title: string; text: string; when?: boolean };

const shown = (lines: Line[]) => lines.filter((line) => line.when !== false);

function Note({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Well className={cx("small", styles.note, className)}>
      <Icon name="info" size="sm" />
      <span>{children}</span>
    </Well>
  );
}

function Step({
  n,
  title,
  text,
  children,
}: {
  n: number;
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <Card as="li" className={styles.step}>
      <div className={styles.stepTop}>
        <span className={cx("tnum", styles.number)} aria-hidden="true">
          {n}
        </span>
        <div className="grow">
          <div className={styles.stepTitle}>
            <span className="sr-only">Step {n}: </span>
            {title}
          </div>
          <div className={cx("sub small", styles.stepText)}>{text}</div>
        </div>
      </div>
      <div className={styles.picture} aria-hidden="true">
        {children}
      </div>
    </Card>
  );
}

/** A Home Screen with the app among the others: square icons on an iPhone, round on Android. */
function HomeScreen({
  count,
  ours,
  round = false,
}: {
  count: number;
  ours: number;
  round?: boolean;
}) {
  return (
    <div className={cx(styles.homeScreen, styles.grid, round && styles.circle)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.app}>
          {i === ours ? (
            <span className={styles.ours}>
              <LogoMark size={46} />
            </span>
          ) : (
            <span className={styles.appIcon} />
          )}
          <span className={styles.appName}>
            {i === ours ? APP_SHORT_NAME : <span className={styles.nameSkeleton} />}
          </span>
        </div>
      ))}
    </div>
  );
}

function IphoneSteps() {
  return (
    <>
      <Step
        n={1}
        title="Tap Share in Safari"
        text="It is in the bar at the bottom of the screen. Don't see it? Tap ••• first."
      >
        <Well className={styles.safari}>
          <div className={styles.address}>
            <span className={styles.textSize}>aA</span>
            <span className={styles.addressMiddle}>
              <Icon name="lock" size="sm" className={styles.tinyIcon} />
              <span className={cx(styles.skeleton, styles.safariUrl)} />
            </span>
            <Icon name="refresh" size="sm" />
          </div>
          <div className={styles.toolbar}>
            <Icon name="chevron-left" />
            <Icon name="chevron-right" className={styles.off} />
            <span className={styles.picked}>
              <Icon name="share" />
            </span>
            <Icon name="book" />
            <Icon name="copy" />
          </div>
        </Well>
      </Step>
      <Step
        n={2}
        title="Tap Add to Home Screen, then Add"
        text={`Scroll down the list if you can't see it. Keep the name ${APP_SHORT_NAME}.`}
      >
        <Well className={styles.menu}>
          <div className={cx("small", styles.menuItem)}>
            Add Bookmark
            <Icon name="book" size="sm" />
          </div>
          <div className={cx(styles.menuItem, styles.menuPicked)}>
            Add to Home Screen
            <Icon name="add-square" />
          </div>
          <div className={cx("small", styles.menuItem)}>
            Find on Page
            <Icon name="search" size="sm" />
          </div>
        </Well>
      </Step>
      <Step
        n={3}
        title={`Open ${APP_SHORT_NAME} from your Home Screen`}
        text="Use it from there from now on. Sign in once with Face ID."
      >
        <HomeScreen count={8} ours={5} />
      </Step>
    </>
  );
}

function AndroidSteps() {
  return (
    <>
      <Step
        n={1}
        title="Tap the menu in Chrome"
        text="The three dots at the top right of the screen."
      >
        <Well className={styles.chrome}>
          <Icon name="home" />
          <span className={styles.chromeAddress}>
            <Icon name="text" size="sm" className={styles.tinyIcon} />
            <span className={cx(styles.skeleton, styles.chromeUrl)} />
          </span>
          <span className={styles.tabs}>2</span>
          <span className={cx(styles.picked, styles.round)}>
            <Icon name="more-vertical" className={styles.dots} />
          </span>
        </Well>
      </Step>
      <Step
        n={2}
        title="Tap Install app, then Install"
        text="Some phones say Add to Home screen instead. Either works."
      >
        <Well className={styles.menu}>
          <div className={cx("small", styles.menuItem, styles.iconFirst)}>
            <Icon name="plus-box" size="sm" />
            New tab
          </div>
          <div className={cx(styles.menuItem, styles.iconFirst, styles.menuPicked)}>
            <Icon name="install-phone" />
            Install app
          </div>
          <div className={cx("small", styles.menuItem, styles.iconFirst)}>
            <Icon name="share-nodes" size="sm" />
            Share
          </div>
        </Well>
      </Step>
      <Step
        n={3}
        title={`Open ${APP_SHORT_NAME} from your Home screen`}
        text="It is in your app list too, and you stay signed in."
      >
        <HomeScreen count={8} ours={5} round />
      </Step>
    </>
  );
}

const PHONES = [
  { value: "ios", label: "iPhone", icon: "phone" },
  { value: "android", label: "Android", icon: "phone" },
] as const;

/** On a phone or tablet: why, then the three steps for an iPhone or an Android phone. */
function PhoneGuide({ device, browser }: { device: Device; browser: Browser }) {
  const [picked, setPicked] = useState<PhoneSteps | null>(null);
  const steps = picked ?? phoneStepsFor(device);
  const ios = steps === "ios";
  const note = phoneBrowserNote(device, browser, steps);
  const why = shown([
    {
      icon: "full-screen",
      title: "Opens full screen",
      text: "No browser bars. One tap from your Home Screen straight to your money.",
    },
    {
      icon: "bell",
      title: "Notifications work",
      text: ios ? "On iPhone they only work after this step." : "Alerts arrive like any other app.",
      when: FEATURES.notifications,
    },
    {
      icon: "offline",
      title: "Reads offline",
      text: "Everything from the last sync, even with no signal.",
      when: OFFLINE,
    },
  ]);
  return (
    <div className={styles.phone}>
      <SegmentedControl
        label="Which phone you have"
        options={PHONES}
        value={steps}
        onChange={setPicked}
      />
      <Card as="section" aria-label="Why put it on your Home Screen" className={styles.why}>
        {why.map((line) => (
          <div key={line.title} className={styles.whyRow}>
            <Tile icon={line.icon} size="sm" />
            <div className="grow">
              <div className={styles.whyTitle}>{line.title}</div>
              <div className="muted small">{line.text}</div>
            </div>
          </div>
        ))}
      </Card>
      <div className={styles.stepsHead}>
        <h2 className="h2">
          {ios ? "On your iPhone, in Safari" : "On your Android phone, in Chrome"}
        </h2>
        <span className="muted small">3 steps</span>
      </div>
      {note && <Note>{note}</Note>}
      <ol className={styles.steps}>{ios ? <IphoneSteps /> : <AndroidSteps />}</ol>
    </div>
  );
}

/** Running from the Home Screen already: nothing left to do on this phone. */
function PhoneDone() {
  return (
    <div className={styles.phone}>
      <Card as="section" className={styles.done} role="status">
        <Tile icon="check" size="sm" tone="good" />
        <div className="grow">
          <h2 className="h2">{APP_SHORT_NAME} is on your Home Screen</h2>
          <p className={cx("sub small", styles.doneText)}>
            You&apos;re using it from there now. To put it on another phone or a computer, open{" "}
            {APP_NAME} in that device&apos;s browser and sign in.
          </p>
        </div>
      </Card>
    </div>
  );
}

/** A browser window with the install icon in its address bar picked out, and the prompt it opens. */
function ChromePicture() {
  return (
    <Well className={styles.browser} aria-hidden="true">
      <div className={styles.tabStrip}>
        <span className={styles.lights}>
          <span />
          <span />
          <span />
        </span>
        <span className={styles.browserTab}>
          <LogoMark size={14} />
          <span className="grow ellipsis">{APP_SHORT_NAME}</span>
          <Icon name="close" size="sm" />
        </span>
      </div>
      <div className={styles.urlBar}>
        <Icon name="arrow-back" size="sm" />
        <Icon name="refresh" size="sm" />
        <div className={styles.omnibox}>
          <Icon name="lock" size="sm" className={styles.tinyIcon} />
          <span className={cx(styles.skeleton, styles.desktopUrl)} />
          <span className="grow" />
          <span className={styles.omniboxPicked}>
            <Icon name="install-desktop" size="sm" />
          </span>
          <span className={styles.omniboxIcon}>
            <Icon name="star" size="sm" />
          </span>
        </div>
        <Icon name="more-vertical" size="sm" className={styles.dots} />
      </div>
      <div className={styles.page}>
        <PageSketch />
        <div className={styles.prompt}>
          <div className={styles.promptTitle}>Install app?</div>
          <div className={styles.promptApp}>
            <LogoMark size={30} />
            <div className="grow">
              <div className={cx("small ellipsis", styles.strong)}>{APP_SHORT_NAME}</div>
              <div className="tiny muted ellipsis">Opens in its own window</div>
            </div>
          </div>
          <div className={styles.promptButtons}>
            <span className={styles.fakeButton}>Cancel</span>
            <span className={cx(styles.fakeButton, styles.fakePrimary)}>Install</span>
          </div>
        </div>
      </div>
    </Well>
  );
}

/** Safari on a Mac: the File menu open, with Add to Dock picked out. */
function SafariPicture() {
  return (
    <Well className={styles.browser} aria-hidden="true">
      <div className={styles.macMenu}>
        <span>Safari</span>
        <span className={styles.menuOpen}>File</span>
        <span>Edit</span>
        <span>View</span>
      </div>
      <div className={styles.page}>
        <PageSketch />
        <div className={cx(styles.dropdown, styles.menu)}>
          <div className={cx("small", styles.menuItem)}>New Window</div>
          <div className={cx(styles.menuItem, styles.menuPicked)}>
            Add to Dock…
            <Icon name="dock" />
          </div>
          <div className={cx("small", styles.menuItem)}>Close Window</div>
        </div>
      </div>
    </Well>
  );
}

/** The app's page behind the prompt, as grey shapes. */
function PageSketch() {
  return (
    <>
      <div className={styles.pageNav}>
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className={styles.pageBody}>
        <span className={styles.pageTitle} />
        <div className={styles.pageCards}>
          <span />
          <span />
          <span />
        </div>
        <span className={styles.pageWide} />
      </div>
    </>
  );
}

function ThisComputer({ browser, running }: { browser: Browser; running: boolean }) {
  const { canPrompt, justInstalled } = useInstallPrompt();
  const [declined, setDeclined] = useState(false);
  const installed = running || justInstalled;
  const guide = computerGuide(browser);
  const gets = shown([
    { icon: "window", title: "Its own window", text: "No tabs or address bar, just your money." },
    { icon: "dock", title: "One click to open", text: "From your Dock, taskbar or Start menu." },
    {
      icon: "bell",
      title: "Notifications",
      text: "Alerts on this computer, even when it's closed.",
      when: FEATURES.notifications,
    },
    {
      icon: "offline",
      title: "Reads offline",
      text: "Everything from the last sync, with no internet.",
      when: OFFLINE,
    },
  ]);

  async function install() {
    setDeclined(!(await promptInstall()));
  }

  return (
    <Card
      as="section"
      aria-labelledby="install-computer"
      className={cx(styles.thisComputer, installed && styles.short)}
    >
      <div className={styles.cardHead}>
        <Tile icon="monitor" size="sm" />
        <div className={styles.cardTitle}>
          <h2 id="install-computer" className="h2">
            This computer
          </h2>
          <div className="muted small">{guide.where}</div>
        </div>
        {installed ? (
          <Pill tone="good">Installed</Pill>
        ) : (
          <Pill tone="quiet" icon="clock">
            Not installed yet
          </Pill>
        )}
      </div>

      {!installed && (
        <>
          {browser === "safari" ? <SafariPicture /> : <ChromePicture />}
          <ol className={styles.computerSteps}>
            {guide.steps.map(([title, text], i) => (
              <li key={title}>
                <span className={cx("tnum", styles.number, styles.smallNumber)} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={cx("small", styles.computerStep)}>
                  <span className="sr-only">Step {i + 1}: </span>
                  <strong>{title}</strong> <span className="sub">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      {(installed || canPrompt || guide.cannot || declined) && (
        <div className={styles.foot}>
          {installed ? (
            <div role="status" className={cx("small", styles.installed)}>
              <Icon name="check" size="sm" />
              <span>Installed. {APP_SHORT_NAME} is in your apps and opens in its own window.</span>
            </div>
          ) : canPrompt ? (
            <>
              <Button variant="primary" size="lg" icon="install-desktop" onClick={install}>
                Install now
              </Button>
              <span className={cx("small muted", styles.footNote)}>
                Same as the icon in the address bar. In Edge it may say App available.
              </span>
            </>
          ) : (
            <span className={cx("small muted", styles.footNote)} role="status">
              {guide.cannot ??
                "Not now? You can install it any time from the icon in the address bar."}
            </span>
          )}
        </div>
      )}

      <h3 className={cx("h3", styles.getsTitle)}>What you get</h3>
      <div className={styles.gets}>
        {gets.map((get) => (
          <Well key={get.title} className={styles.get}>
            <Icon name={get.icon} size="sm" />
            <div className="grow">
              <div className={cx("small", styles.strong)}>{get.title}</div>
              <div className="tiny muted">{get.text}</div>
            </div>
          </Well>
        ))}
      </div>
    </Card>
  );
}

const SHORT_STEPS: readonly {
  name: string;
  browser: string;
  steps: readonly (readonly [string, IconName])[];
}[] = [
  {
    name: "iPhone",
    browser: "in Safari",
    steps: [
      ["Tap Share", "share"],
      ["Tap Add to Home Screen, then Add", "add-square"],
      [`Open ${APP_SHORT_NAME} from your Home Screen`, "home"],
    ],
  },
  {
    name: "Android",
    browser: "in Chrome",
    steps: [
      ["Tap the three dots menu", "more-vertical"],
      ["Tap Install app, then Install", "install-phone"],
      [`Open ${APP_SHORT_NAME} from your Home screen`, "home"],
    ],
  },
];

function YourPhone({ email }: { email: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const result = await emailInstallLink();
      if ("error" in result) setError(result.error);
      else setSent(result.sentTo);
    });
  }

  return (
    <Card as="section" aria-labelledby="install-phone" className={styles.yourPhone}>
      <div className={styles.cardHead}>
        <Tile icon="phone" size="sm" />
        <div className={styles.cardTitle}>
          <h2 id="install-phone" className="h2">
            Your phone
          </h2>
          <div className="muted small">Open {APP_NAME} in your phone&apos;s browser</div>
        </div>
      </div>

      {SHORT_STEPS.map((phone) => (
        <div key={phone.name} className={styles.phoneKind}>
          <div className={styles.phoneKindHead}>
            <h3 className="h2">{phone.name}</h3>
            <span className="tiny muted">{phone.browser}</span>
          </div>
          <ol className={styles.shortSteps}>
            {phone.steps.map(([text, icon], i) => (
              <li key={text} className="small">
                <span className={cx("tnum", styles.quietNumber)} aria-hidden="true">
                  {i + 1}
                </span>
                <span className="grow">
                  <span className="sr-only">Step {i + 1}: </span>
                  {text}
                </span>
                <span className={styles.shortIcon} aria-hidden="true">
                  <Icon
                    name={icon}
                    size="sm"
                    className={icon === "more-vertical" ? styles.dots : undefined}
                  />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {FEATURES.notifications && (
        <Note className={styles.phoneNote}>
          On iPhone, notifications only work once {APP_SHORT_NAME} is on your Home Screen.
        </Note>
      )}

      <div className={cx(styles.homeScreen, styles.dock)} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.app}>
            {i === 2 ? (
              <span className={styles.ours}>
                <LogoMark size={44} />
              </span>
            ) : (
              <span className={styles.appIcon} />
            )}
            <span className={styles.appName}>
              {i === 2 ? APP_SHORT_NAME : <span className={styles.nameSkeleton} />}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.email}>
        {sent ? (
          <div role="status" className={cx("small", styles.sent)}>
            <Icon name="check" size="sm" />
            <span>Sent to {sent}. Open it on your phone.</span>
          </div>
        ) : (
          <>
            <Button size="lg" block icon="mail" onClick={send} disabled={sending}>
              {sending ? "Sending…" : "Email me the link"}
            </Button>
            {error ? (
              <p role="alert" className={cx("tiny", styles.failed)}>
                {error}
              </p>
            ) : (
              <div className={cx("tiny muted", styles.emailNote)}>
                Goes to {email}. Open it on your phone.
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Install the app: the steps for the device in use. A phone or tablet gets the three Home Screen
 * steps for an iPhone or Android, and a computer gets its browser's install button or steps, with
 * the phone steps in short. Once it's running installed, the steps make way for a short note.
 */
export function InstallGuide({
  device: guessDevice,
  browser: guessBrowser,
  email,
}: {
  /** The server's guess from the user agent, until the browser checks. */
  device: Device;
  browser: Browser;
  email: string;
}) {
  const device = useDevice(guessDevice);
  const browser = useBrowser(guessBrowser);
  const running = useRunningInstalled();
  if (kindOf(device) === "phone")
    return running ? <PhoneDone /> : <PhoneGuide device={device} browser={browser} />;
  return (
    <div className={styles.computer}>
      <ThisComputer browser={browser} running={running} />
      <YourPhone email={email} />
    </div>
  );
}
