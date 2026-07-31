import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const YMOVE_BASE_URL = 'https://exercise-api.ymove.app/api/v2';

type ResultBody = { ok: true; data: unknown } | { ok: false; code: string; message: string };

function json(body: ResultBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function callYmoveDetail(externalId: string, apiKey: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(`${YMOVE_BASE_URL}/exercises/${encodeURIComponent(externalId)}?includeVideos=true`, {
      headers: { 'X-API-Key': apiKey },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed', message: 'Metodo non supportato.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ymoveApiKey = Deno.env.get('YMOVE_API_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ ok: false, code: 'server_not_configured', message: 'Configurazione Supabase mancante.' }, 500);
  }
  if (!ymoveApiKey) {
    return json({ ok: false, code: 'ymove_not_configured', message: 'Configurazione YMove mancante.' }, 503);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ ok: false, code: 'not_authenticated', message: 'Accesso richiesto.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ ok: false, code: 'not_authenticated', message: 'Sessione non valida.' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, code: 'invalid_payload', message: 'Richiesta non valida.' }, 400);
  }

  const exerciseId = pickString(payload.exercise_id);
  const exerciseKey = pickString(payload.exercise_key);
  if (!exerciseId && !exerciseKey) {
    return json({ ok: false, code: 'invalid_payload', message: 'exercise_id o exercise_key mancante.' }, 400);
  }

  let linkQuery = adminClient
    .from('exercise_external_links')
    .select('external_exercise_id, match_status')
    .eq('provider', 'ymove')
    .eq('is_primary', true)
    .eq('match_status', 'manual_approved')
    .limit(1);
  if (exerciseId && exerciseKey) {
    linkQuery = linkQuery.or(`exercise_id.eq.${exerciseId},exercise_key.eq.${exerciseKey}`);
  } else if (exerciseId) {
    linkQuery = linkQuery.eq('exercise_id', exerciseId);
  } else if (exerciseKey) {
    linkQuery = linkQuery.eq('exercise_key', exerciseKey);
  }
  const { data: links, error: linkError } = await linkQuery;

  if (linkError) {
    return json({ ok: false, code: 'link_lookup_failed', message: 'Impossibile leggere il collegamento video.' }, 500);
  }

  const externalId = pickString(links?.[0]?.external_exercise_id);
  if (!externalId) {
    return json({ ok: false, code: 'not_linked', message: 'Esercizio non associato a YMove.' }, 404);
  }

  try {
    const response = await callYmoveDetail(externalId, ymoveApiKey);
    const body = await response.json().catch(() => ({}));
    if (response.status === 404) {
      return json({ ok: false, code: 'ymove_not_found', message: 'Video YMove non piu disponibile.' }, 404);
    }
    if (response.status === 429) {
      return json({ ok: false, code: 'ymove_rate_limited', message: 'Limite YMove raggiunto. Riprova piu tardi.' }, 429);
    }
    if (!response.ok) {
      return json({ ok: false, code: 'ymove_error', message: 'Impossibile recuperare il video YMove.' }, 502);
    }

    const exercise = body.data ?? body;
    return json({
      ok: true,
      data: {
        id: pickString(exercise.id),
        title: pickString(exercise.title) ?? pickString(exercise.name),
        slug: pickString(exercise.slug),
        hasVideo: exercise.hasVideo === true,
        videoUrl: pickString(exercise.videoUrl),
        videoHlsUrl: pickString(exercise.videoHlsUrl),
        thumbnailUrl: pickString(exercise.thumbnailUrl),
        videoDurationSecs: typeof exercise.videoDurationSecs === 'number' ? exercise.videoDurationSecs : null,
      },
    }, 200);
  } catch {
    return json({ ok: false, code: 'ymove_timeout', message: 'YMove non ha risposto in tempo.' }, 504);
  }
});
