import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const STRAVA_CLIENT_ID = "257067";
const STRAVA_CLIENT_SECRET = "5d28f89ce72121719f5377816fb179ca676910e0";
const VERIFY_TOKEN = "health_dash_verify_2026";

serve(async (req) => {
  // Strava webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Strava event (POST)
  if (req.method === "POST") {
    const event = await req.json();
    console.log("Strava event:", JSON.stringify(event));

    // Only handle activity creates and updates
    if (event.object_type !== "activity" || !["create","update"].includes(event.aspect_type)) {
      return new Response("ok");
    }

    const activityId = event.object_id;
    const athleteId = event.owner_id;

    // Get a valid access token - fetch from our stored refresh token
    const { data: tokenRow } = await supabase
      .from("strava_tokens")
      .select("*")
      .eq("athlete_id", athleteId)
      .single();

    let accessToken;
    if (tokenRow) {
      // Refresh the token
      const tokenRes = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: tokenRow.refresh_token
        })
      });
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      // Update stored refresh token
      await supabase.from("strava_tokens").upsert({
        athlete_id: athleteId,
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token,
        expires_at: tokenData.expires_at
      }, { onConflict: "athlete_id" });
    } else {
      return new Response("No token for athlete", { status: 400 });
    }

    // Fetch activity details
    const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const a = await actRes.json();

    await supabase.from("workouts").upsert({
      strava_id: a.id,
      date: a.start_date_local.slice(0, 10),
      name: a.name,
      sport_type: a.sport_type,
      duration_s: a.moving_time,
      distance_m: a.distance || 0,
      elevation_m: a.total_elevation_gain || 0,
      avg_hr: a.average_heartrate || null,
      max_hr: a.max_heartrate || null,
      avg_cadence: a.average_cadence || null,
      calories: a.calories || null,
      relative_effort: a.suffer_score || null,
      pr_count: a.pr_count || 0,
      kudos_count: a.kudos_count || 0,
      source: "strava"
    }, { onConflict: "strava_id" });

    console.log("Synced activity:", a.name, a.start_date_local.slice(0,10));
    return new Response("ok");
  }

  return new Response("Method not allowed", { status: 405 });
});
