import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CLIENT_ID = "f85f5f77192a4c81bc3707ee7053bdc6";
const CLIENT_SECRET = "e1a08a59224a48afb5f3ad50495bb50b";

async function getAccessToken() {
  const { data } = await supabase.from("spotify_tokens").select("*").eq("id", 1).single();
  if (!data) throw new Error("No Spotify tokens");

  // Refresh if expired
  if (new Date(data.expires_at) < new Date(Date.now() + 60000)) {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa(CLIENT_ID + ":" + CLIENT_SECRET),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token,
      }),
    });
    const tokens = await res.json();
    await supabase.from("spotify_tokens").upsert({
      id: 1,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || data.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    }, { onConflict: "id" });
    return tokens.access_token;
  }
  return data.access_token;
}

serve(async (req) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");
    const token = await getAccessToken();

    const res = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), { headers });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
});
