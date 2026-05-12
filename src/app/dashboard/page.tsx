"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase";
import type { Group } from "@/types";

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("");

  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/"); return; }
      setUserName(user.email?.split("@")[0] ?? "");
    });
    fetchGroups();
  }, [router, fetchGroups]);

  // Auto-join when redirected here after magic link with ?join=CODE
  useEffect(() => {
    const joinCode = searchParams.get("join");
    if (!joinCode) return;
    fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: joinCode }),
    })
      .then((r) => r.json())
      .then((data: Group & { error?: string }) => {
        if (data.invite_code) {
          router.replace(`/room/${data.invite_code}`);
        }
      });
  }, [searchParams, router]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupName }),
    });
    if (res.ok) {
      const group: Group = await res.json();
      router.push(`/room/${group.invite_code}`);
    } else {
      setError("Failed to create room");
    }
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: inviteCode }),
    });
    if (res.ok) {
      const group: Group = await res.json();
      router.push(`/room/${group.invite_code}`);
    } else {
      const { error: msg } = await res.json();
      setError(msg ?? "Invalid code");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Rooms</h1>
            {userName && (
              <p className="text-slate-500 text-sm mt-1">
                Hey {userName} — pick a room to see everyone&apos;s schedule
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false); setError(""); }}
              className="text-sm px-4 py-2 rounded-lg border border-slate-200 bg-white hover:border-brand-300 transition-colors"
            >
              Join
            </button>
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false); setError(""); }}
              className="text-sm px-4 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              + New room
            </button>
          </div>
        </div>

        {(showCreate || showJoin) && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            {showCreate && (
              <form onSubmit={createGroup} className="space-y-3">
                <h2 className="font-semibold text-slate-800">Create a room</h2>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Alvarez siblings"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!newGroupName.trim()}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-2 text-slate-500 text-sm hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {showJoin && (
              <form onSubmit={joinGroup} className="space-y-3">
                <h2 className="font-semibold text-slate-800">
                  Join with room code
                </h2>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. A1B2C3"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 uppercase tracking-widest font-mono text-center text-lg"
                  maxLength={6}
                />
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={inviteCode.length < 6}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoin(false)}
                    className="px-4 py-2 text-slate-500 text-sm hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🗓️</p>
            <p className="font-medium">No rooms yet</p>
            <p className="text-sm mt-1">
              Create one or join with a room code
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => router.push(`/room/${group.invite_code}`)}
                className="text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:border-brand-200 transition-all"
              >
                <h2 className="font-semibold text-slate-900">{group.name}</h2>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded tracking-widest">
                    {group.invite_code}
                  </span>
                  <span className="text-xs text-brand-600">Open →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
