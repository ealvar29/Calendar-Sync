"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type Step = "landing" | "check_email";
type Mode = "create" | "join";

export default function LandingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("landing");
  const [mode, setMode] = useState<Mode>("create");
  const [email, setEmail] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (session) router.replace("/dashboard");
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const redirectTo =
      mode === "join" && roomCode.trim()
        ? `${location.origin}/auth/callback?next=/dashboard?join=${roomCode.trim().toUpperCase()}`
        : `${location.origin}/auth/callback`;

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setStep("check_email");
    }
  }

  if (step === "check_email") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-5xl">📬</div>
          <h1 className="text-2xl font-bold text-slate-900">Check your email</h1>
          <p className="text-slate-600">
            We sent a magic link to <strong>{email}</strong>.
            <br />
            Click it to sign in — no password needed.
          </p>
          <button
            onClick={() => {
              setStep("landing");
              setEmail("");
              setError("");
            }}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Use a different email
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="text-5xl mb-4">📅</div>
          <h1 className="text-4xl font-bold text-brand-900 tracking-tight">
            HangoutSync
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            Mark your free days. See when everyone&apos;s available.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            <button
              onClick={() => setMode("create")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                mode === "create"
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Create a room
            </button>
            <button
              onClick={() => setMode("join")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                mode === "join"
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Join a room
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "join" && (
              <input
                type="text"
                placeholder="Room code (e.g. A1B2C3)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 uppercase tracking-widest font-mono text-center text-lg"
                maxLength={6}
                autoComplete="off"
              />
            )}
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={
                loading ||
                !email.trim() ||
                (mode === "join" && roomCode.length < 6)
              }
              className="w-full py-3 bg-brand-600 text-white rounded-xl font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400">
          No password. No Google. Just your email.
        </p>
      </div>
    </main>
  );
}
