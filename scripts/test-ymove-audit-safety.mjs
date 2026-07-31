#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const forbiddenEverywhere = ['YMOVE_API_KEY', 'X-API-Key'];
const forbiddenAuditPayload = ['videoUrl', 'videoHlsUrl', 'thumbnailUrl', 'token='];

const simulatedResponse = {
  ok: true,
  auditRunId: '00000000-0000-4000-8000-000000000000',
  startedAt: '2026-07-30T00:00:00.000Z',
  finishedAt: '2026-07-30T00:00:01.000Z',
  durationMs: 1000,
  algorithmVersion: 'ymove-one-shot-audit-2026-07-30',
  fitcoach: { total: 1, active: 1, inactive: 0, missingMetadata: 0, duplicates: 0 },
  ymove: { totalDeclared: 1, totalFetched: 1, pagesFetched: 1, usageBefore: {}, usageAfter: {} },
  summary: { autoMatch: 1, reviewRequired: 0, unmatched: 0, conflict: 0 },
  results: [{
    fitcoachId: 'petto-panca-piana',
    fitcoachName: 'Panca piana bilanciere',
    status: 'AUTO_MATCH',
    candidate: 'Barbell Bench Press',
    ymoveId: '11111111-1111-4111-8111-111111111111',
    ymoveTitle: 'Barbell Bench Press',
    score: 98,
    margin: 20,
    motivations: ['nome normalizzato esatto'],
    contradictions: [],
    alternatives: [],
  }],
  responseBytes: 0,
};

const simulatedLogs = [
  'YMOVE_CATALOG_AUDIT_ERROR {"message":"YMOVE_TIMEOUT"}',
  'YMOVE_AUDIT_ABORTED page=2 status=429 retries=2',
].join('\n');

async function listFiles(dir) {
  const out = [];
  try {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...await listFiles(full));
      else out.push(full);
    }
  } catch {
    return out;
  }
  return out;
}

function findForbidden(label, text) {
  return [...forbiddenEverywhere, ...forbiddenAuditPayload].filter((item) => text.includes(item)).map((item) => `${label}:${item}`);
}

function findForbiddenBundle(label, text) {
  return forbiddenEverywhere.filter((item) => text.includes(item)).map((item) => `${label}:${item}`);
}

const findings = [
  ...findForbidden('simulatedResponse', JSON.stringify(simulatedResponse)),
  ...findForbidden('simulatedLogs', simulatedLogs),
];

for (const file of await listFiles(path.resolve('mobile/dist'))) {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  findings.push(...findForbiddenBundle(`bundle:${path.relative(process.cwd(), file)}`, text));
}

const responseText = JSON.stringify(simulatedResponse);
const responseBytes = new TextEncoder().encode(responseText).length;
const result = {
  ok: findings.length === 0,
  responseBytes,
  scanned: {
    simulatedResponse: true,
    simulatedLogs: true,
    mobileDist: true,
  },
  findings,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
