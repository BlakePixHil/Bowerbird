import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell";

// Any signed-in page can carry on a first sync after it's sent (src/lib/banks/live/background.ts),
// so each gets room for one run of it.
export const maxDuration = 60;

/** Every signed-in page sits in the app frame, which sends anyone signed out to sign in. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
