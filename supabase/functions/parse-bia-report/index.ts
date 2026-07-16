import { createClient } from 'jsr:@supabase/supabase-js@2';

// Optional OCR adapter, server-side only:
// - BIA_OCR_ENDPOINT: HTTPS endpoint that accepts the PDF bytes with POST and returns { text: string }.
// - BIA_OCR_API_KEY: optional bearer token for that endpoint.
// If not configured, scanned PDFs are left in needs_review with code ocr_not_configured.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResultBody = { ok: true; data: unknown } | { ok: false; code: string; message: string };
type MetricKey =
  | 'weightKg'
  | 'heightCm'
  | 'bmi'
  | 'bodyFatPercent'
  | 'bodyFatKg'
  | 'leanMassKg'
  | 'muscleMassKg'
  | 'skeletalMuscleMassKg'
  | 'totalBodyWaterPercent'
  | 'totalBodyWaterL'
  | 'intracellularWaterL'
  | 'extracellularWaterL'
  | 'visceralFat'
  | 'basalMetabolicRateKcal'
  | 'phaseAngle'
  | 'waistCm'
  | 'hipsCm';

const METRIC_PATTERNS: Array<{ key: MetricKey; confidence: number; patterns: RegExp[]; min?: number; max?: number }> = [
  { key: 'weightKg', confidence: 0.85, min: 20, max: 350, patterns: [/(\bPeso\b|\bWeight\b)\s*[:=]?\s*(\d+[,.]?\d*)\s*kg/i] },
  { key: 'heightCm', confidence: 0.8, min: 80, max: 260, patterns: [/(\bAltezza\b|\bHeight\b)\s*[:=]?\s*(\d+[,.]?\d*)\s*cm/i] },
  { key: 'bmi', confidence: 0.85, min: 8, max: 80, patterns: [/(\bBMI\b|\bIMC\b)\s*[:=]?\s*(\d+[,.]?\d*)/i] },
  { key: 'bodyFatPercent', confidence: 0.78, min: 0, max: 80, patterns: [/(Massa grassa|Body Fat|Fat Mass|FM)[^\n%]{0,30}(\d+[,.]?\d*)\s*%/i] },
  { key: 'bodyFatKg', confidence: 0.74, min: 0, max: 250, patterns: [/(Massa grassa|Fat Mass|FM)[^\n]{0,30}(\d+[,.]?\d*)\s*kg/i] },
  { key: 'leanMassKg', confidence: 0.72, min: 0, max: 250, patterns: [/(Massa magra|Fat Free Mass|FFM|Lean Mass)[^\n]{0,30}(\d+[,.]?\d*)\s*kg/i] },
  { key: 'muscleMassKg', confidence: 0.72, min: 0, max: 250, patterns: [/(Massa muscolare|Muscle Mass)[^\n]{0,30}(\d+[,.]?\d*)\s*kg/i] },
  { key: 'skeletalMuscleMassKg', confidence: 0.72, min: 0, max: 250, patterns: [/(SMM|Skeletal Muscle Mass|Muscolo scheletrico)[^\n]{0,30}(\d+[,.]?\d*)\s*kg/i] },
  { key: 'totalBodyWaterPercent', confidence: 0.7, min: 0, max: 100, patterns: [/(TBW|Total Body Water|Acqua corporea)[^\n%]{0,30}(\d+[,.]?\d*)\s*%/i] },
  { key: 'totalBodyWaterL', confidence: 0.7, min: 0, max: 150, patterns: [/(TBW|Total Body Water|Acqua corporea)[^\n]{0,30}(\d+[,.]?\d*)\s*(L|l|litri)/i] },
  { key: 'intracellularWaterL', confidence: 0.7, min: 0, max: 100, patterns: [/(ICW|Intracellular Water|Acqua intracellulare)[^\n]{0,30}(\d+[,.]?\d*)\s*(L|l|litri)/i] },
  { key: 'extracellularWaterL', confidence: 0.7, min: 0, max: 100, patterns: [/(ECW|Extracellular Water|Acqua extracellulare)[^\n]{0,30}(\d+[,.]?\d*)\s*(L|l|litri)/i] },
  { key: 'visceralFat', confidence: 0.75, min: 0, max: 80, patterns: [/(Visceral Fat|Grasso viscerale)[^\n]{0,30}(\d+[,.]?\d*)/i] },
  { key: 'basalMetabolicRateKcal', confidence: 0.75, min: 500, max: 5000, patterns: [/(BMR|Metabolismo basale|Basal Metabolic Rate)[^\n]{0,30}(\d+[,.]?\d*)\s*kcal/i] },
  { key: 'phaseAngle', confidence: 0.7, min: 0, max: 20, patterns: [/(Phase Angle|Angolo di fase)[^\n]{0,30}(\d+[,.]?\d*)/i] },
  { key: 'waistCm', confidence: 0.66, min: 20, max: 250, patterns: [/(Waist|Girovita|Vita)[^\n]{0,30}(\d+[,.]?\d*)\s*cm/i] },
  { key: 'hipsCm', confidence: 0.66, min: 20, max: 250, patterns: [/(Hip|Hips|Fianchi)[^\n]{0,30}(\d+[,.]?\d*)\s*cm/i] },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed', message: 'Metodo non supportato.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, code: 'not_authenticated', message: 'Sessione mancante.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ ok: false, code: 'not_authenticated', message: 'Sessione non valida.' }, 401);

    const body = await req.json().catch(() => ({}));
    const reportId = typeof body.report_id === 'string' ? body.report_id : '';
    if (!reportId) return json({ ok: false, code: 'missing_report_id', message: 'report_id obbligatorio.' }, 400);

    const { data: report, error: reportError } = await admin
      .from('bia_reports')
      .select('id,coach_id,client_id,storage_path,status')
      .eq('id', reportId)
      .single();
    if (reportError || !report) return json({ ok: false, code: 'report_not_found', message: 'Report BIA non trovato.' }, 404);
    if (report.coach_id !== userData.user.id) return json({ ok: false, code: 'forbidden', message: 'Accesso negato.' }, 403);

    const { data: link } = await admin
      .from('coach_clients')
      .select('client_id')
      .eq('coach_id', report.coach_id)
      .eq('client_id', report.client_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!link) return json({ ok: false, code: 'client_not_linked', message: 'Cliente non collegato al coach.' }, 403);

    await admin.from('bia_reports').update({ status: 'processing' }).eq('id', reportId);
    const { data: fileData, error: downloadError } = await admin.storage.from('bia-reports').download(report.storage_path);
    if (downloadError || !fileData) {
      await markFailed(admin, reportId, 'download_failed', downloadError?.message ?? 'Download PDF fallito.');
      return json({ ok: false, code: 'download_failed', message: 'Download PDF fallito.' }, 500);
    }

    const bytes = new Uint8Array(await fileData.arrayBuffer());
    const digitalText = extractTextFromPdfBytes(bytes);
    const hasUsefulText = digitalText.replace(/\s+/g, ' ').trim().length >= 80;
    const ocrResult = hasUsefulText ? { ok: false as const, code: 'not_needed', text: '' } : await extractWithOcrIfConfigured(bytes);
    const extractedText = hasUsefulText ? digitalText : ocrResult.ok ? ocrResult.text : digitalText;
    const extraction = extractedText.replace(/\s+/g, ' ').trim().length >= 80 ? parseMetrics(extractedText) : { data: {}, confidence: {} };
    const nextStatus = Object.keys(extraction.data).length > 0 ? 'needs_review' : 'needs_review';
    const errorCode = hasUsefulText || ocrResult.ok ? null : ocrResult.code;
    const errorMessage = hasUsefulText || ocrResult.ok ? null : 'PDF senza testo digitale sufficiente. Completa la revisione manualmente.';

    await admin
      .from('bia_reports')
      .update({
        status: nextStatus,
        extracted_text: extractedText.slice(0, 20000),
        extracted_data: extraction.data,
        extraction_confidence: extraction.confidence,
        extraction_provider: hasUsefulText ? 'digital_pdf_regex_v1' : ocrResult.ok ? 'ocr_adapter_v1' : 'manual_review',
        error_code: errorCode,
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    return json({ ok: true, data: { report_id: reportId, status: nextStatus, fields: Object.keys(extraction.data).length } }, 200);
  } catch (err) {
    console.error('PARSE_BIA_REPORT_ERROR', { message: err instanceof Error ? err.message : String(err) });
    return json({ ok: false, code: 'internal_error', message: 'Errore analisi BIA.' }, 500);
  }
});

function json(body: ResultBody, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function markFailed(admin: ReturnType<typeof createClient>, reportId: string, code: string, message: string) {
  await admin.from('bia_reports').update({
    status: 'failed',
    error_code: code,
    error_message: message,
    processed_at: new Date().toISOString(),
  }).eq('id', reportId);
}

function extractTextFromPdfBytes(bytes: Uint8Array) {
  const raw = new TextDecoder('latin1').decode(bytes);
  const chunks: string[] = [];
  const literalPattern = /\(([^()]{2,200})\)\s*Tj/g;
  const arrayPattern = /\[((?:\([^()]{1,200}\)\s*)+)\]\s*TJ/g;
  let match: RegExpExecArray | null;
  while ((match = literalPattern.exec(raw))) chunks.push(unescapePdfText(match[1]));
  while ((match = arrayPattern.exec(raw))) {
    const inner = match[1].match(/\(([^()]+)\)/g) ?? [];
    chunks.push(inner.map((item) => unescapePdfText(item.slice(1, -1))).join(''));
  }
  return chunks.join('\n').replace(/\s+/g, ' ').trim();
}

function unescapePdfText(value: string) {
  return value
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\');
}

function parseMetrics(text: string) {
  const data: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  for (const metric of METRIC_PATTERNS) {
    for (const pattern of metric.patterns) {
      const match = pattern.exec(text);
      if (!match) continue;
      const value = Number(match[2].replace(',', '.'));
      if (!Number.isFinite(value)) continue;
      const plausible = (metric.min === undefined || value >= metric.min) && (metric.max === undefined || value <= metric.max);
      data[metric.key] = value;
      confidence[metric.key] = plausible ? metric.confidence : Math.min(metric.confidence, 0.45);
      break;
    }
  }
  return { data, confidence };
}

async function extractWithOcrIfConfigured(bytes: Uint8Array): Promise<{ ok: true; text: string } | { ok: false; code: string }> {
  const endpoint = Deno.env.get('BIA_OCR_ENDPOINT');
  const apiKey = Deno.env.get('BIA_OCR_API_KEY');
  if (!endpoint) return { ok: false, code: 'ocr_not_configured' };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: bytes,
    });
    if (!response.ok) return { ok: false, code: 'ocr_provider_error' };
    const payload = await response.json().catch(() => null) as { text?: unknown } | null;
    const text = typeof payload?.text === 'string' ? payload.text : '';
    return text.trim() ? { ok: true, text } : { ok: false, code: 'document_unreadable' };
  } catch {
    return { ok: false, code: 'ocr_provider_error' };
  }
}
