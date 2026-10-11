import type { Metadata } from "next";
import { ConnectFlow } from "@/components/connect/ConnectFlow";
import { getShell, PageHeader } from "@/components/shell";
import { Pill, Tag } from "@/components/ui";
import { LIVE_SYNC_PROVIDER } from "@/config/app";
import { requireMember } from "@/lib/auth";
import { canEncrypt } from "@/lib/crypto";

export const metadata: Metadata = { title: "Connect live sync" };

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ reconnect?: string | string[] }>;
}) {
  await getShell();
  const me = await requireMember();
  const { reconnect } = await searchParams;
  const id = typeof reconnect === "string" && reconnect !== "" ? reconnect : undefined;
  return (
    <>
      <PageHeader
        title={id ? "Reconnect live sync" : "Connect live sync"}
        phone={false}
        parent={{ href: "/accounts", label: "Accounts and sharing" }}
        actions={
          <>
            <Pill tone="quiet" icon="eye">
              Read-only, never moves money
            </Pill>
            <Tag>
              Optional · {LIVE_SYNC_PROVIDER.price}, paid to {LIVE_SYNC_PROVIDER.name}
            </Tag>
          </>
        }
      />
      <ConnectFlow ready={canEncrypt()} reconnect={id} inSetup={me.member.setupStep !== null} />
    </>
  );
}
