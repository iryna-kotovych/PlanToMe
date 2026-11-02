import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { syncCalendar } from "@/lib/calendar/sync";
import { DEMO_MODE } from "@/lib/env";
import { signedInOwner } from "@/lib/supabase/owner";

// Each Google call gives up after 10 seconds; a sync makes a handful.
export const maxDuration = 60;

const BodySchema = z.object({ pull: z.boolean() });
const NO_STORE = { "Cache-Control": "no-store" };

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * The app calls this on open, on pull to refresh and after saving changes:
 * timed tasks go to Google Calendar and, with `pull`, the events come back.
 */
export async function POST(request: NextRequest) {
  // The public demo never talks to Google.
  if (DEMO_MODE) return new NextResponse(null, { status: 404 });
  const owner = await signedInOwner();
  if (!owner) return reply({ error: "unauthorized" }, 401);
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return reply({ error: "bad-request" }, 400);
  try {
    return reply(await syncCalendar(owner.id, body.data));
  } catch (error) {
    console.error("Calendar sync failed", error);
    return reply({ error: "unavailable" }, 503);
  }
}
