import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  console.log("[createClient] url=", process.env.NEXT_PUBLIC_SUPABASE_URL);
  try {
    const client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    console.log("[createClient] ok");
    return client;
  } catch (err) {
    console.error("[createClient] THREW:", err);
    throw err;
  }
}
