"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sessionSecret } from "@/lib/env";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_MAX_AGE,
  cookieOptions,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "./cookies";
import { requireMember } from "./current";
import { deviceLabel } from "./device";
import {
  checkRegistration,
  checkSignIn,
  passkeysFor,
  registrationOptions,
  savePasskey,
  signInOptions,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "./passkeys";
import { relyingParty } from "./relying-party";
import { safeNext } from "./routes";
import { createSession, deleteSession } from "./sessions";
import { createOwner, hasUsers } from "./setup";
import { seal, unseal } from "./tokens";

type Failure = { error: string };

/** The passkey challenge waiting for the second step, and what it's for. */
type Pending =
  | { purpose: "setup"; challenge: string; userId: string; name: string; email: string }
  | { purpose: "sign-in"; challenge: string }
  | { purpose: "add"; challenge: string; userId: string };

const TRY_AGAIN = "That didn't work. Try again, and if it keeps happening, use another device.";

async function request() {
  const h = await headers();
  return {
    rp: relyingParty(h.get("x-forwarded-host") ?? h.get("host")),
    userAgent: h.get("user-agent"),
  };
}

async function holdChallenge(pending: Pending) {
  const expires = new Date(Date.now() + CHALLENGE_MAX_AGE * 1000);
  (await cookies()).set(
    CHALLENGE_COOKIE,
    seal(pending, sessionSecret(), expires),
    cookieOptions(CHALLENGE_MAX_AGE),
  );
}

/** Takes the waiting challenge, which works once, as long as it's for this step. */
async function takeChallenge<P extends Pending["purpose"]>(purpose: P) {
  const jar = await cookies();
  const pending = unseal<Pending>(jar.get(CHALLENGE_COOKIE)?.value, sessionSecret());
  jar.delete(CHALLENGE_COOKIE);
  return pending?.purpose === purpose ? (pending as Extract<Pending, { purpose: P }>) : null;
}

async function startSession(userId: string) {
  const { token } = await createSession(getDb(), userId);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
}

function cleanSetup(input: {
  name: string;
  email: string;
}): Failure | { name: string; email: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (!name || name.length > 60) return { error: "Add your name, up to 60 letters." };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "That email doesn't look right." };
  return { name, email };
}

/** Set up, step 1: check the details and ask the browser for a new passkey. */
export async function startSetup(input: { name: string; email: string }) {
  const clean = cleanSetup(input);
  if ("error" in clean) return clean;
  if (await hasUsers(getDb())) return { error: "Bowerbird is already set up. Sign in instead." };
  const { rp } = await request();
  const userId = randomUUID();
  const options = await registrationOptions(rp, { id: userId, ...clean });
  await holdChallenge({ purpose: "setup", challenge: options.challenge, userId, ...clean });
  return { options };
}

/** Set up, step 2: save the owner, their household and passkey, then sign them in. */
export async function finishSetup(response: RegistrationResponseJSON): Promise<Failure> {
  const pending = await takeChallenge("setup");
  if (!pending) return { error: "That took too long. Start again." };
  const { rp, userAgent } = await request();
  const passkey = await checkRegistration(response, pending.challenge, rp);
  if (!passkey) return { error: TRY_AGAIN };
  const created = await createOwner(getDb(), {
    userId: pending.userId,
    name: pending.name,
    email: pending.email,
    passkey,
    label: deviceLabel(userAgent),
  });
  if (!created) return { error: "Bowerbird is already set up. Sign in instead." };
  await startSession(pending.userId);
  redirect("/");
}

/** Sign in, step 1: ask the browser for any passkey it has for this site. */
export async function startSignIn() {
  const { rp } = await request();
  const options = await signInOptions(rp);
  await holdChallenge({ purpose: "sign-in", challenge: options.challenge });
  return { options };
}

/** Sign in, step 2: check the passkey and start a session. */
export async function finishSignIn(
  response: AuthenticationResponseJSON,
  next?: string,
): Promise<Failure> {
  const pending = await takeChallenge("sign-in");
  if (!pending) return { error: "That took too long. Try again." };
  const { rp } = await request();
  const userId = await checkSignIn(getDb(), response, pending.challenge, rp);
  if (!userId) {
    return {
      error:
        "That passkey isn't set up for Bowerbird. Try another one on this device or your phone.",
    };
  }
  await startSession(userId);
  redirect(safeNext(next));
}

/** Add a passkey on this device for the signed-in member, step 1. */
export async function startAddPasskey() {
  const me = await requireMember();
  const { rp } = await request();
  const existing = await passkeysFor(getDb(), me.user.id);
  const options = await registrationOptions(rp, me.user, existing);
  await holdChallenge({ purpose: "add", challenge: options.challenge, userId: me.user.id });
  return { options };
}

/** Add a passkey on this device, step 2. */
export async function finishAddPasskey(
  response: RegistrationResponseJSON,
): Promise<Failure | { added: string }> {
  const me = await requireMember();
  const pending = await takeChallenge("add");
  if (!pending || pending.userId !== me.user.id) return { error: "That took too long. Try again." };
  const { rp, userAgent } = await request();
  const passkey = await checkRegistration(response, pending.challenge, rp);
  if (!passkey) return { error: TRY_AGAIN };
  const label = deviceLabel(userAgent);
  await savePasskey(getDb(), me.user.id, passkey, label);
  revalidatePath("/accounts");
  return { added: label };
}

/** Sign out on this device. */
export async function signOut() {
  const jar = await cookies();
  await deleteSession(getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/sign-in");
}

/** Local development only: sign in as the made-up demo household from `pnpm db:seed:demo`. */
export async function signInAsDemo() {
  if (process.env.NODE_ENV !== "development") return { error: "Not available here." };
  const [demo] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "demo@example.com"));
  if (!demo) return { error: "Run pnpm db:seed:demo first." };
  await startSession(demo.id);
  redirect("/");
}
