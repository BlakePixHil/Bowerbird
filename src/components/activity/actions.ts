"use server";

import { activityPage, viewerOf, type ActivityPage } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isPlainDate } from "@/lib/money";
import { filtersOf, parseSearch, parseShow, viewOf } from "./show";

/** The next page of Activity: the whole days before `before`, for the same chip and search. */
export async function moreActivity(
  show: string,
  search: string,
  before: string,
): Promise<ActivityPage> {
  const viewer = viewerOf(await requireMember());
  if (!isPlainDate(before)) return { rows: [], next: null };
  const chip = parseShow(show);
  return activityPage(getDb(), viewer, viewOf(chip), filtersOf(chip, parseSearch(search)), before);
}
