import type { ReactNode } from "react";
import { AppFrame } from "@/components/shell";

/** Every signed-in page sits in the app frame, which sends anyone signed out to sign in. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
