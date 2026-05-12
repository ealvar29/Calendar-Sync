"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUser(user);
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      const name = data?.display_name ?? user.email?.split("@")[0] ?? "";
      setDisplayName(name);
      setEditValue(name);
    });
  }, []);

  async function saveName() {
    const trimmed = editValue.trim();
    setEditing(false);
    if (!user || !trimmed || trimmed === displayName) return;
    setDisplayName(trimmed);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", user.id);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-100">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-bold text-brand-700 text-lg">
          📅 HangoutSync
        </Link>
        {user && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>

            {editing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setEditValue(displayName);
                    setEditing(false);
                  }
                }}
                className="text-sm border border-brand-300 rounded-lg px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-brand-400"
                maxLength={30}
              />
            ) : (
              <button
                onClick={() => setEditing(true)}
                title="Click to edit your name"
                className="hidden sm:flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 group transition-colors"
              >
                {displayName}
                <span className="text-slate-300 group-hover:text-slate-500 transition-colors">
                  ✎
                </span>
              </button>
            )}

            <button
              onClick={signOut}
              className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
