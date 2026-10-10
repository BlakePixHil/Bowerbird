import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell";

/** Every signed-in page sits in the app frame. Sign-in (BUD-11) adds the check for a member. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
