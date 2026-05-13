"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

const EMOJI_OPTIONS = [
  "🐶","🐱","🦊","🐼","🐨","🦁","🐸","🐙",
  "🦋","🌸","🌻","🌈","🍕","🎸","🚀","⭐",
  "🎮","🦄","🍦","🎯","🏄","🎨","🌊","🔥",
];

export default function Navbar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUser(user);
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar")
        .eq("id", user.id)
        .single();
      const name = data?.display_name ?? user.email?.split("@")[0] ?? "";
      setDisplayName(name);
      setEditValue(name);
      setAvatar((data?.avatar as string | null) ?? null);
    });
  }, []);

  useEffect(() => {
    if (!showPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPicker]);

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

  async function selectAvatar(emoji: string | null) {
    if (!user) return;
    const next = emoji || null;
    setAvatar(next);
    setShowPicker(false);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ avatar: next })
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
            {/* Avatar with emoji picker */}
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowPicker((p) => !p)}
                title="Change your avatar"
                className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm shrink-0 hover:ring-2 hover:ring-brand-300 transition-all"
              >
                {avatar ? (
                  <span className="text-base leading-none">{avatar}</span>
                ) : (
                  displayName[0]?.toUpperCase()
                )}
              </button>

              {showPicker && (
                <div className="absolute right-0 top-10 bg-white rounded-2xl shadow-lg border border-slate-100 p-3 z-50 w-52">
                  <p className="text-xs text-slate-400 mb-2 text-center">Pick your avatar</p>
                  <div className="grid grid-cols-8 gap-1">
                    {EMOJI_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => selectAvatar(emoji)}
                        className={`text-lg w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors ${
                          avatar === emoji ? "bg-brand-50 ring-1 ring-brand-300" : ""
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {avatar && (
                    <button
                      onClick={() => selectAvatar(null)}
                      className="mt-2 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      Remove avatar
                    </button>
                  )}
                </div>
              )}
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
