import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
    const since120 = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10)

    const [todayWorkouts, lastSleep, recentWorkouts, bodyMetrics] = await Promise.all([
      supabase.from('workouts').select('name,sport_type,distance,moving_time,relative_effort').eq('date', today),
      supabase.from('sleep').select('duration_h,deep_h,rem_h').eq('date', yesterday).single(),
      supabase.from('workouts').select('date,sport_type,relative_effort').gte('date', since120).order('date', { ascending: true }),
      supabase.from('body_metrics').select('weight_kg,resting_hr').order('date', { ascending: false }).limit(1).single(),
    ])

    const loadMap: Record<string, number> = {}
    recentWorkouts.data?.forEach(w => {
      loadMap[w.date] = (loadMap[w.date] || 0) + (w.relative_effort || 0)
    })
    const k7 = 2/8, k42 = 2/43
    let atl = 0, ctl = 0
    Object.keys(loadMap).sort().forEach(day => {
      const load = loadMap[day] || 0
      atl = load * k7 + atl * (1 - k7)
      ctl = load * k42 + ctl * (1 - k42)
    })
    const tsb = Math.round(ctl - atl)

    const todayDone = todayWorkouts.data?.map(w => {
      const dist = w.distance ? (w.distance / 1609).toFixed(1) + ' mi' : ''
      const mins = w.moving_time ? Math.round(w.moving_time / 60) + ' min' : ''
      return `${w.sport_type}${dist ? ' ' + dist : ''}${mins ? ' ' + mins : ''}`
    }).join(', ') || 'nothing yet today'

    const sleep = lastSleep.data
    const sleepStr = sleep ? `${sleep.duration_h?.toFixed(1)}h sleep (${sleep.deep_h?.toFixed(1)}h deep, ${sleep.rem_h?.toFixed(1)}h REM)` : 'sleep data unavailable'
    const weight = bodyMetrics.data?.weight_kg ? (bodyMetrics.data.weight_kg * 2.205).toFixed(1) + ' lbs' : 'unknown'
    const rhr = bodyMetrics.data?.resting_hr ? bodyMetrics.data.resting_hr + ' bpm RHR' : ''

    const prompt = `You are a personal triathlon coach assistant for Danny, who is training for Ironman 70.3 Salem Oregon on July 19, 2027. His goal is sub-5:30.

Current data:
- Today's workouts so far: ${todayDone}
- Last night's sleep: ${sleepStr}
- Training form (TSB): ${tsb} (positive = fresh, negative = fatigued)
- Fitness (CTL): ${Math.round(ctl)}, Fatigue (ATL): ${Math.round(atl)}
- Weight: ${weight}${rhr ? ', ' + rhr : ''}
- Current date: ${today}

Write a single short paragraph (2-3 sentences max) with a personalized insight or recommendation for Danny today. Be specific, encouraging, and reference his actual data. Sound like a knowledgeable coach, not a robot. Don't start with "Great" or "Hey". Don't mention TSB/CTL/ATL by name.`

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ insight: 'Error: ANTHROPIC_API_KEY not set' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const anthropicData = await anthropicRes.json()
    
    if (anthropicData.error) {
      return new Response(JSON.stringify({ insight: 'API error: ' + anthropicData.error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const insight = anthropicData.content?.[0]?.text || 'Unable to generate insight.'

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ insight: 'Error: ' + e.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  }
})
