import { redirect } from "next/navigation";
import { getSetup } from "@/components/setup";
import { FIRST_RUN_PATHS } from "@/lib/first-run";

/** Picks setup up where it stopped, or Home once it's finished. */
export default async function StartPage() {
  const { at } = await getSetup();
  redirect(at ? FIRST_RUN_PATHS[at] : "/");
}
