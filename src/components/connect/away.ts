import { FIRST_RUN_PATHS } from "@/lib/first-run/rules";

/**
 * Where the phone's back button leaves the live sync flow for: Accounts and sharing, or step 2 of
 * the first run while setup is under way. Continue setup, at the end, goes on to payday.
 */
export function awayFrom(inSetup: boolean): { href: string; label: string } {
  return inSetup
    ? { href: FIRST_RUN_PATHS.bring, label: "Back to setup" }
    : { href: "/accounts", label: "Back to accounts and sharing" };
}

export const SETUP_NEXT = FIRST_RUN_PATHS.payday;
