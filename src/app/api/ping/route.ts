import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// Lightweight endpoint hit daily by an external cron (e.g. cron-job.org)
// to prevent the Supabase free-tier project from pausing after 7 days of inactivity.
export async function GET() {
  const admin = getSupabaseAdmin();
  await admin.from("groups").select("id").limit(1);
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
