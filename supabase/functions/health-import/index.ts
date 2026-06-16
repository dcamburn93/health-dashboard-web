import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const body = await req.json();
    const metrics = body.data?.metrics || body.metrics || body.data || [];

    const activity: Record<string, Record<string, number>> = {};
    const heartRate: Record<string, Record<string, number>> = {};
    const bodyMetrics: Record<string, Record<string, number>> = {};
    const sleep: Record<string, Record<string, any>> = {};

    for (const metric of metrics) {
      const name = metric.name;
      for (const point of (metric.data || [])) {
        const date = (point.date || point.startDate || "").split(" ")[0];
        if (!date) continue;

        const qty = parseFloat(point.qty ?? point.Avg ?? point.value ?? 0);

        if (name === "step_count" || name === "Step Count") {
          if (qty > 0) activity[date] = { ...activity[date], steps: Math.round(qty) };
        } else if (name === "active_energy" || name === "Active Energy") {
          if (qty > 0) activity[date] = { ...activity[date], active_calories: Math.round(qty) };
        } else if (name === "flights_climbed" || name === "Flights Climbed") {
          if (qty > 0) activity[date] = { ...activity[date], flights_climbed: Math.round(qty) };
        } else if (name === "apple_stand_hour" || name === "Apple Stand Hour") {
          if (qty > 0) activity[date] = { ...activity[date], stand_hours: qty };
        } else if (name === "apple_exercise_time" || name === "Apple Exercise Time") {
          if (qty > 0) activity[date] = { ...activity[date], exercise_minutes: qty };
        } else if (name === "resting_heart_rate" || name === "Resting Heart Rate") {
          if (qty > 0) heartRate[date] = { ...heartRate[date], resting_hr: qty };
        } else if (name === "heart_rate_variability" || name === "Heart Rate Variability") {
          if (qty > 0) heartRate[date] = { ...heartRate[date], hrv_ms: qty };
        } else if (name === "weight_body_mass" || name === "Weight & Body Mass") {
          if (qty > 0) bodyMetrics[date] = { ...bodyMetrics[date], weight_lbs: qty };
        } else if (name === "sleep_analysis" || name === "Sleep Analysis") {
          const totalSleep = parseFloat(point.totalSleep ?? 0);
          const inBed = parseFloat(point.inBed ?? 0);
          const deep = parseFloat(point.deep ?? 0);
          const rem = parseFloat(point.rem ?? 0);
          const core = parseFloat(point.core ?? 0);
          const awake = parseFloat(point.awake ?? 0);
          // Only write if we have meaningful sleep data
          if (totalSleep > 1) {
            sleep[date] = {
              ...sleep[date],
              duration_h: totalSleep,
              in_bed_h: inBed || null,
              deep_h: deep || null,
              rem_h: rem || null,
              core_h: core || null,
              awake_h: awake || null,
            };
          }
        }
      }
    }

    for (const [date, data] of Object.entries(activity)) {
      await supabase.from("daily_activity").upsert({ date, ...data, source: "apple_health" }, { onConflict: "date" });
    }
    for (const [date, data] of Object.entries(heartRate)) {
      await supabase.from("heart_rate").upsert({ date, ...data, source: "apple_health" }, { onConflict: "date" });
    }
    for (const [date, data] of Object.entries(bodyMetrics)) {
      await supabase.from("body_metrics").upsert({ date, ...data, source: "apple_health" }, { onConflict: "date" });
    }
    for (const [date, data] of Object.entries(sleep)) {
      await supabase.from("sleep").upsert({ date, ...data, source: "apple_health" }, { onConflict: "date" });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
