import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AdminLogin, AdminShell } from "@/components/admin/shell";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Super Admin",
  robots: { index: false, follow: false },
};

/**
 * The Super Admin console lives at a private, configurable URL (ADMIN_PATH) and,
 * when ADMIN_HOST is set, at the dedicated admin hostname. Any other top-level
 * path that reaches this segment is a plain 404.
 * Each page re-verifies the admin session server-side as well.
 */
export default async function PanelLayout({ children, params }: { children: ReactNode; params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel)) notFound();
  if (!(await getAdminSession())) return <AdminLogin />;
  return <AdminShell base={await getAdminBase()}>{children}</AdminShell>;
}
