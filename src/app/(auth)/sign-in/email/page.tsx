import type { Metadata } from "next";
import { connection } from "next/server";
import { EmailLinkLanding } from "@/components/auth/EmailLinkLanding";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Signing in" };

/** Where the emailed sign-in link opens. The token is after the #, so only the browser sees it. */
export default async function EmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  await connection();
  const raw = (await searchParams).next;
  return <EmailLinkLanding next={safeNext(Array.isArray(raw) ? raw[0] : raw)} />;
}
