import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CLIENT_ID = "f85f5f77192a4c81bc3707ee7053bdc6";
const CLIENT_SECRET = "e1a08a59224a48afb5f3ad50495bb50b";
const REDIRECT_URI = "https://csylhxbnpqsfwicqrsex.supabase.co/functions/v1/spotify-callback";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(CLIENT_ID + ":" + CLIENT_SECRET),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return new Response(JSON.stringify(tokens), { status: 400 });
  }

  // Store tokens in Supabase
  await supabase.from("spotify_tokens").upsert({
    id: 1,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  }, { onConflict: "id" });

  return new Response("<html><body><h2>Spotify connected! You can close this tab.</h2></body></html>", {
    headers: { "Content-Type": "text/html" }
  });
});
