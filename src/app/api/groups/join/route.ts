import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invite_code } = await req.json();
  if (!invite_code?.trim()) {
    return NextResponse.json({ error: "Room code required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: group, error: groupError } = await admin
    .from("groups")
    .select("*")
    .eq("invite_code", invite_code.trim().toUpperCase())
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: "Invalid room code" }, { status: 404 });
  }

  // Upsert — safe to call even if already a member
  const { error: memberError } = await admin.from("group_members").upsert(
    { group_id: group.id, user_id: user.id, role: "member" },
    { onConflict: "group_id,user_id" }
  );

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json(group);
}
