"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import CalendarGrid from "@/components/CalendarGrid";
import { createClient } from "@/lib/supabase";
import type { Group, MemberWithProfile } from "@/types";

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [notMember, setNotMember] = useState(false);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }
      setCurrentUserId(user.id);

      const upperCode = (code as string).toUpperCase();

      // RLS: only returns the group if the user is already a member
      const { data: groupData } = await supabase
        .from("groups")
        .select("*")
        .eq("invite_code", upperCode)
        .single();

      if (!groupData) { setNotMember(true); setLoading(false); return; }
      setGroup(groupData as Group);

      const { data: memberRows } = await supabase
        .from("group_members")
        .select("user_id, role")
        .eq("group_id", groupData.id);

      if (!memberRows) { setLoading(false); return; }

      const me = memberRows.find((m) => m.user_id === user.id);
      if (!me) { setNotMember(true); setLoading(false); return; }
      setIsHost(me.role === "host");

      const userIds = memberRows.map((m) => m.user_id);
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      const profileMap = new Map(
        (profileRows ?? []).map((p) => [p.id, p.display_name as string | null])
      );

      setMembers(
        memberRows.map((m) => ({
          user_id: m.user_id,
          role: m.role as "host" | "member",
          display_name: profileMap.get(m.user_id) ?? m.user_id.slice(0, 8),
        }))
      );

      setLoading(false);
    }
    load();
  }, [code, router]);

  // ── Realtime: member join / leave / role change ─────────────
  useEffect(() => {
    if (!group || !currentUserId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`members-${group.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${group.id}`,
        },
        async (payload) => {
          const row = payload.new as { user_id: string; role: string };
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, display_name")
            .eq("id", row.user_id)
            .single();
          setMembers((prev) => {
            if (prev.find((m) => m.user_id === row.user_id)) return prev;
            return [
              ...prev,
              {
                user_id: row.user_id,
                role: row.role as "host" | "member",
                display_name:
                  (profile?.display_name as string | null) ??
                  row.user_id.slice(0, 8),
              },
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${group.id}`,
        },
        (payload) => {
          const row = payload.old as { user_id: string };
          if (row.user_id === currentUserId) {
            // We were kicked — go back to dashboard
            router.push("/dashboard");
          } else {
            setMembers((prev) => prev.filter((m) => m.user_id !== row.user_id));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${group.id}`,
        },
        (payload) => {
          const row = payload.new as { user_id: string; role: string };
          setMembers((prev) =>
            prev.map((m) =>
              m.user_id === row.user_id
                ? { ...m, role: row.role as "host" | "member" }
                : m
            )
          );
          if (row.user_id === currentUserId) {
            setIsHost(row.role === "host");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [group, currentUserId, router]);

  // ── Actions ─────────────────────────────────────────────────
  async function joinRoom() {
    setJoinError("");
    setJoining(true);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      let message = `Error ${res.status}`;
      try {
        const data = await res.json();
        message = data.error ?? message;
      } catch {}
      setJoinError(message);
    } catch {
      setJoinError("Network error — check the console and try again.");
    } finally {
      setJoining(false);
    }
  }

  async function kickMember(userId: string) {
    if (!group) return;
    await fetch("/api/groups/kick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: group.id, userId }),
    });
    // Optimistic — realtime DELETE event will also fire
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
  }

  async function leaveRoom() {
    if (!group) return;
    await fetch("/api/groups/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: group.id }),
    });
    router.push("/dashboard");
  }

  async function copyCode() {
    await navigator.clipboard.writeText(group!.invite_code);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  // ── Render: loading / not-member / not-found ─────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notMember) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="max-w-md mx-auto px-4 py-20 text-center space-y-5">
          <p className="text-5xl">🔒</p>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Room {(code as string).toUpperCase()}
            </h2>
            <p className="text-slate-500 mt-1">
              You&apos;re not in this room yet.
            </p>
          </div>
          <button
            onClick={joinRoom}
            disabled={joining}
            className="px-6 py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {joining ? "Joining…" : "Join this room"}
          </button>
          {joinError && (
            <p className="text-sm text-red-500">{joinError}</p>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="block w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Back to dashboard
          </button>
        </main>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
          <p className="text-5xl">❓</p>
          <h2 className="text-xl font-bold text-slate-900">Room not found</h2>
          <p className="text-slate-500">Double-check the code and try again.</p>
          <button onClick={() => router.push("/dashboard")} className="text-brand-600 text-sm">
            ← Dashboard
          </button>
        </main>
      </div>
    );
  }

  // ── Render: full room ────────────────────────────────────────
  const isLastMember = members.length === 1;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-slate-400 hover:text-slate-700 text-sm transition-colors"
        >
          ← Back
        </button>

        {/* Room header */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h1 className="text-xl font-bold text-slate-900">{group.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-500">Room code</span>
            <span className="font-mono font-bold text-brand-600 tracking-widest text-lg">
              {group.invite_code}
            </span>
            <button
              onClick={copyCode}
              className="text-xs px-3 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
            >
              {inviteCopied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Share this code with anyone you want to add
          </p>
        </div>

        {/* Members */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-3">
            Members ({members.length})
          </h2>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center justify-between py-1"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
                    {member.display_name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-700">
                    {member.display_name}
                  </span>
                  {member.role === "host" && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                      host
                    </span>
                  )}
                  {member.user_id === currentUserId && (
                    <span className="text-xs text-slate-400">(you)</span>
                  )}
                </div>
                {isHost && member.user_id !== currentUserId && (
                  <button
                    onClick={() => kickMember(member.user_id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Leave room */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
            {!confirmLeave ? (
              <button
                onClick={() => setConfirmLeave(true)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                {isHost && isLastMember ? "Delete room" : "Leave room"}
              </button>
            ) : (
              <>
                <span className="text-xs text-slate-500">
                  {isHost && isLastMember
                    ? "This will permanently delete the room."
                    : isHost
                    ? "Host role will transfer to the next member."
                    : "You'll be removed from this room."}
                </span>
                <button
                  onClick={leaveRoom}
                  className="text-xs text-red-600 font-medium hover:text-red-800 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Calendar */}
        {currentUserId && (
          <CalendarGrid
            groupId={group.id}
            currentUserId={currentUserId}
            members={members}
          />
        )}
      </main>
    </div>
  );
}
