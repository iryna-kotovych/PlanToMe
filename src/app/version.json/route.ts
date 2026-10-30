import { APP_VERSION } from "@/lib/env";

/** Lets an open app notice that a newer deployment is live. */
export function GET() {
  return Response.json({ version: APP_VERSION });
}
