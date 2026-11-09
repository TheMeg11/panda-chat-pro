import { getCurrentUser } from "@/lib/auth";
import { listDashboardChats } from "@/lib/rooms";
import { getSettings, roomLimitFor } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Client-side chat list loader.
 *
 * PRIVACY FIX (audit §4.4): the conversation list — including names, previews
 * and the very EXISTENCE of hidden conversations — used to be embedded in the
 * dashboard's server-rendered HTML (view-source leaked it). The server cannot
 * know which chats are hidden (the vault is device-local), so the whole list
 * now loads here AFTER paint, in the browser, and is never cached.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const settings = await getSettings();
  if (settings.maintenanceMode) return Response.json({ error: "maintenance" }, { status: 503 });

  const chats = await listDashboardChats(user);
  const totalRooms = chats.filter((c) => c.type === "room" && c.isOwner).length;
  return Response.json(
    { chats, totalRooms, roomLimit: roomLimitFor(user, settings) },
    { headers: { "cache-control": "no-store" } },
  );
}
