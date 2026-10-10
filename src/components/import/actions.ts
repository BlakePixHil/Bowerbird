"use server";

import { revalidatePath } from "next/cache";
import { viewerOf } from "@/lib/access";
import { requireMember } from "@/lib/auth";
import { COLUMN_ROLES, MAX_FILE_BYTES, TOO_BIG, type ColumnRole } from "@/lib/banks/files";
import {
  checkImport,
  FILE_ACCOUNT_KINDS,
  runImport,
  type FileAccountKind,
  type ImportCheck,
  type ImportDone,
  type ImportProblem,
  type ImportRequest,
} from "@/lib/banks/imports";
import { getDb } from "@/lib/db";

const NO_FILE = "Choose a CSV, OFX or QIF file to import.";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * The form the import screens send: the file, the account (an id, or "new" with the new
 * account's name, bank, kind and whether it's joint) and any change of columns. Everything in it
 * is checked here, because anyone can post this form.
 */
async function readForm(form: FormData): Promise<ImportRequest | ImportProblem> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: NO_FILE };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: TOO_BIG };

  const account = text(form, "account");
  const kind = text(form, "kind") as FileAccountKind;
  const target: ImportRequest["target"] =
    account === "new"
      ? {
          newAccount: {
            name: text(form, "name"),
            institution: text(form, "bank") || null,
            kind: FILE_ACCOUNT_KINDS.includes(kind) ? kind : "everyday",
            isJoint: text(form, "joint") === "on",
          },
        }
      : { accountId: account };

  let columns: ColumnRole[] | undefined;
  const chosen = text(form, "columns");
  if (chosen) {
    try {
      const parsed: unknown = JSON.parse(chosen);
      if (
        Array.isArray(parsed) &&
        parsed.length <= 200 &&
        parsed.every((role) => (COLUMN_ROLES as readonly unknown[]).includes(role))
      ) {
        columns = parsed;
      }
    } catch {
      // A broken choice of columns is ignored, so the file is read as it would be by itself.
    }
  }

  return {
    target,
    filename: file.name.slice(0, 255) || "bank file",
    bytes: new Uint8Array(await file.arrayBuffer()),
    columns,
  };
}

/** "Check before importing": what importing this file would do. Saves nothing. */
export async function checkFile(form: FormData): Promise<ImportCheck | ImportProblem> {
  const me = await requireMember();
  const request = await readForm(form);
  if ("ok" in request) return request;
  return checkImport(getDb(), viewerOf(me), request);
}

/** Imports the file's new rows. Every page that shows money reads them fresh afterwards. */
export async function importFile(form: FormData): Promise<ImportDone | ImportProblem> {
  const me = await requireMember();
  const request = await readForm(form);
  if ("ok" in request) return request;
  const result = await runImport(getDb(), viewerOf(me), request);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
