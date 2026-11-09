import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Ban, Link2Off, UserX, Wrench } from "lucide-react";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { Logo } from "@/components/brand";
import { ChatView } from "@/components/chat/chat-view";
import { GateForm, GuestActions, JoinForm } from "@/components/chat/invite-forms";
import { LangToggle, ThemeToggle } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { buildSnapshot } from "@/lib/chat";
import { getI18n } from "@/lib/i18n-server";
import { getRoomByToken, resolveGuestAccess } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // Never leak the room name through the tab title before access is granted.
  return { title: { absolute: t.meta.roomTitle }, robots: { index: false, follow: false } };
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <div className="flex items-center gap-0.5">
          <LangToggle compact />
          <ThemeToggle />
        </div>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-16 pt-4">{children}</main>
    </div>
  );
}

function StateCard({
  icon: Icon,
  title,
  text,
  tone = "amber",
  homeLabel,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  tone?: "amber" | "rose";
  homeLabel: string;
}) {
  return (
    <div className="card fade-up w-full max-w-md p-8 text-center shadow-card">
      <span className={`icon-tile mx-auto ${tone === "rose" ? "bg-rose-soft text-rose-ink" : "bg-amber-soft text-amber-ink"}`}>
        <Icon className="size-5" />
      </span>
      <h1 className="mt-5 text-xl font-extrabold text-ink">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
      <Link href="/" className="btn btn-secondary mt-7">
        {homeLabel}
      </Link>
    </div>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
  const home = t.common.backHome;

  if (settings.maintenanceMode) {
    return (
      <InviteShell>
        <StateCard icon={Wrench} title={t.common.maintenanceTitle} text={t.common.maintenanceText} homeLabel={home} />
      </InviteShell>
    );
  }

  const room = await getRoomByToken(token);
  if (!room) {
    return (
      <InviteShell>
        <StateCard icon={Link2Off} tone="rose" title={t.invite.invalidTitle} text={t.invite.invalidText} homeLabel={home} />
      </InviteShell>
    );
  }
  if (room.isDisabled) {
    return (
      <InviteShell>
        <StateCard icon={Ban} title={t.invite.disabledTitle} text={t.invite.disabledText} homeLabel={home} />
      </InviteShell>
    );
  }

  const user = await getCurrentUser();
  if (user && user.id === room.ownerId) redirect(`/dashboard/rooms/${room.id}`);

  const access = await resolveGuestAccess(room);
  if (access.state === "banned") {
    return (
      <InviteShell>
        <StateCard icon={UserX} tone="rose" title={t.invite.removedTitle} text={t.invite.removedText} homeLabel={home} />
      </InviteShell>
    );
  }
  if (access.state === "password") {
    // Only the password form is rendered — no room name, members or messages.
    return (
      <InviteShell>
        <GateForm token={token} />
      </InviteShell>
    );
  }
  if (access.state === "join") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.status, "active"), isNotNull(roomMembers.nickname)));
    return (
      <InviteShell>
        <JoinForm token={token} roomName={room.name} description={room.description} memberCount={n} />
      </InviteShell>
    );
  }

  const nickname = access.member.nickname ?? "Guest";
  const snapshot = await buildSnapshot(room, { memberId: access.member.id, nickname, role: "guest" }, 0, null);
  return (
    <div className="h-dvh">
      <ChatView
        endpoint={`/api/r/${token}/messages`}
        initial={snapshot}
        maxLength={settings.maxMessageLength}
        headerActions={<GuestActions token={token} nickname={nickname} />}
      />
    </div>
  );
}
