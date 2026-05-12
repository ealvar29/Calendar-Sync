import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("group_members")
    .select("groups(*)")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const groups = (data ?? []).map(
    (row: { groups: unknown }) => row.groups
  );
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Room name required" }, { status: 400 });
  }

  const invite_code = randomBytes(3).toString("hex").toUpperCase(); // 6 chars
  const admin = getSupabaseAdmin();

  const { data: group, error: groupError } = await admin
    .from("groups")
    .insert({ name: name.trim(), invite_code, created_by: user.id })
    .select()
    .single();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  await admin
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id, role: "host" });

  return NextResponse.json(group, { status: 201 });
}
