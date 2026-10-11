import nodemailer, { type Transporter } from "nodemailer";
import { APP_NAME } from "@/config/app";
import { smtpSettings } from "@/lib/env";
import { EMAIL_LINK_MINUTES } from "./limits";

/**
 * Email can't use the app's CSS variables, so these copy the light theme's tokens from
 * src/styles/tokens.css: --bg, --surface, --line, --text, --text-2 and --accent-btn.
 */
const EMAIL_COLOURS = {
  bg: "#F5F5F7",
  surface: "#FFFFFF",
  line: "#E6E6EA",
  text: "#111216",
  text2: "#55585F",
  button: "#2463C2",
};

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** The sign-in email: short, plain, and one button. */
export function signInMessage({ name, url }: { name: string; url: string }) {
  const first = name.split(" ")[0];
  const lasts = `It lasts ${EMAIL_LINK_MINUTES} minutes and works once.`;
  const ignore =
    "If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.";
  const c = EMAIL_COLOURS;
  return {
    subject: `Your ${APP_NAME} sign-in link`,
    text: [`Hi ${first},`, `Open this link to sign in to ${APP_NAME}. ${lasts}`, url, ignore].join(
      "\n\n",
    ),
    html: `<!doctype html>
<html lang="en-AU">
<body style="margin:0;padding:24px 12px;background:${c.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${c.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;margin:0 auto;background:${c.surface};border:1px solid ${c.line};border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;font-size:17px;font-weight:600;">${escape(APP_NAME)}</td></tr>
    <tr><td style="padding:8px 28px;font-size:15px;line-height:1.5;">Hi ${escape(first)}, tap the button to sign in. ${lasts}</td></tr>
    <tr><td style="padding:16px 28px;">
      <a href="${escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${c.button};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Sign in to ${escape(APP_NAME)}</a>
    </td></tr>
    <tr><td style="padding:8px 28px 28px;font-size:13px;line-height:1.5;color:${c.text2};">${ignore}</td></tr>
  </table>
</body>
</html>`,
  };
}

/** The SMTP connection from the SMTP_* settings, or null until they're set. */
export function smtpTransport(env: Record<string, string | undefined> = process.env) {
  const smtp = smtpSettings(env);
  if (!smtp) return null;
  return {
    from: smtp.from,
    transport: nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.port !== 465,
      auth: { user: smtp.user, pass: smtp.pass },
    }),
  };
}

type Message = { subject: string; text: string; html: string };

type SendOptions = {
  env?: Record<string, string | undefined>;
  smtp?: { from: string; transport: Transporter } | null;
};

/**
 * Sends one email. Nothing about its link or the address is logged, only that sending failed and
 * the mail server's error code. On your own computer without SMTP settings, the link is printed to
 * the terminal running `pnpm dev` instead, so you can test without a mail server.
 */
async function deliver(
  to: string,
  message: Message,
  { what, url }: { what: string; url: string },
  { env = process.env, smtp = smtpTransport(env) }: SendOptions,
): Promise<boolean> {
  if (!smtp) {
    if (env.NODE_ENV === "development") {
      console.info(`[${APP_NAME} dev] No SMTP settings, so here is the ${what} link: ${url}`);
      return true;
    }
    console.error(
      `${capital(what)} email not sent: SMTP_HOST, SMTP_USER and SMTP_PASS aren't set.`,
    );
    return false;
  }
  try {
    await smtp.transport.sendMail({ from: smtp.from, to, ...message });
    return true;
  } catch (error) {
    const code = (error as { code?: string; responseCode?: number }) ?? {};
    console.error(
      `${capital(what)} email not sent:`,
      code.code ?? "unknown",
      code.responseCode ?? "",
    );
    return false;
  }
}

const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Sends the sign-in email. */
export async function sendSignInEmail(
  to: string,
  message: { name: string; url: string },
  options: SendOptions = {},
): Promise<boolean> {
  return deliver(to, signInMessage(message), { what: "sign-in", url: message.url }, options);
}

/** The email from Install the app: the app's address, to open on a phone. */
export function appLinkMessage({ name, url }: { name: string; url: string }) {
  const first = name.split(" ")[0];
  const how =
    "Open it in Safari on an iPhone or Chrome on Android, then follow the steps to put it on your Home Screen.";
  const c = EMAIL_COLOURS;
  return {
    subject: `Open ${APP_NAME} on your phone`,
    text: [`Hi ${first},`, `Here's ${APP_NAME} for your phone. ${how}`, url].join("\n\n"),
    html: `<!doctype html>
<html lang="en-AU">
<body style="margin:0;padding:24px 12px;background:${c.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${c.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;margin:0 auto;background:${c.surface};border:1px solid ${c.line};border-radius:16px;">
    <tr><td style="padding:28px 28px 8px;font-size:17px;font-weight:600;">${escape(APP_NAME)}</td></tr>
    <tr><td style="padding:8px 28px;font-size:15px;line-height:1.5;">Hi ${escape(first)}, here's ${escape(APP_NAME)} for your phone. ${how}</td></tr>
    <tr><td style="padding:16px 28px 28px;">
      <a href="${escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:${c.button};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Open ${escape(APP_NAME)}</a>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

/** Sends the app's address to the person's own email, from Install the app. */
export async function sendAppLinkEmail(
  to: string,
  message: { name: string; url: string },
  options: SendOptions = {},
): Promise<boolean> {
  return deliver(to, appLinkMessage(message), { what: "app", url: message.url }, options);
}
