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

  const { groupId } = await req.json();
  if (!groupId) {
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Fetch all members ordered by join date
  const { data: members, error: membersError } = await admin
    .from("group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  if (membersError || !members) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const me = members.find((m) => m.user_id === user.id);
  if (!me) {
    return NextResponse.json({ error: "You are not in this room" }, { status: 403 });
  }

  const others = members.filter((m) => m.user_id !== user.id);

  if (me.role === "host" && others.length > 0) {
    // Transfer host role to the member who joined earliest
    await admin
      .from("group_members")
      .update({ role: "host" })
      .eq("group_id", groupId)
      .eq("user_id", others[0].user_id);
  }

  // Remove the leaving member
  await admin
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  // If no members remain, delete the room
  if (others.length === 0) {
    await admin.from("groups").delete().eq("id", groupId);
  }

  return NextResponse.json({ ok: true });
}
