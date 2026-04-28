import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import {
  extractKnowledgeBody,
  fetchLinkKnowledgeSource,
} from './lib/link-content-utils.mjs';

dotenv.config();

const ROOT = process.cwd();
const ATTACHMENTS_ROOT = path.join(ROOT, 'public', 'agent-attachments');
const REPORT_PATH = path.join(ROOT, 'attached_assets', 'link_content_validation_report.json');
const OUTPUT_PATH = path.join(ROOT, 'attached_assets', 'link_content_repair_report.json');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const dryRun = hasFlag('--dry-run');
const requestedTopic = getArgValue('--topic');
const requestedRelPath = getArgValue('--rel-path').replace(/\\/g, '/');
const explicitLimit = Number.parseInt(getArgValue('--limit') || '', 10);
const limit = Number.isFinite(explicitLimit) && explicitLimit > 0 ? explicitLimit : 101;
const requestedStatuses = String(getArgValue('--status') || 'review,mismatch,low_content,fetch_error')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokenSet(value = '') {
  const matches = normalizeText(value).match(/[a-z0-9_-]{4,}/g) || [];
  return new Set(matches);
}

function computeTokenMetrics(leftText = '', rightText = '') {
  const leftTokens = getTokenSet(leftText);
  const rightTokens = getTokenSet(rightText);
  const intersection = new Set([...leftTokens].filter((token) => rightTokens.has(token)));
  const unionSize = new Set([...leftTokens, ...rightTokens]).size || 1;

  return {
    leftTokenCount: leftTokens.size,
    rightTokenCount: rightTokens.size,
    sharedTokenCount: intersection.size,
    leftCoverage: Number((intersection.size / Math.max(leftTokens.size, 1)).toFixed(4)),
    rightCoverage: Number((intersection.size / Math.max(rightTokens.size, 1)).toFixed(4)),
    jaccard: Number((intersection.size / unionSize).toFixed(4)),
  };
}

function getPriority(entry) {
  const statusWeight = {
    mismatch: 4,
    low_content: 3,
    fetch_error: 2,
    review: 1,
  };

  return statusWeight[entry.status] || 0;
}

function toAbsoluteAttachmentPath(relPath) {
  const normalizedRelPath = String(relPath || '').replace(/\//g, path.sep);
  return path.join(ATTACHMENTS_ROOT, normalizedRelPath);
}

async function loadRepairCandidates() {
  const rawReport = await fs.readFile(REPORT_PATH, 'utf8');
  const report = JSON.parse(rawReport);
  const results = Array.isArray(report?.results) ? report.results : [];

  return results
    .filter((entry) => requestedStatuses.includes(entry.status))
    .filter((entry) => !requestedTopic || entry.topic === requestedTopic)
    .filter((entry) => !requestedRelPath || entry.relPath === requestedRelPath)
    .sort((left, right) => {
      const weightDiff = getPriority(right) - getPriority(left);
      if (weightDiff !== 0) return weightDiff;
      return String(left.relPath || '').localeCompare(String(right.relPath || ''), 'pt-BR');
    })
    .slice(0, limit);
}

async function repairEntry(entry) {
  const absolutePath = toAbsoluteAttachmentPath(entry.relPath);
  const previousRaw = await fs.readFile(absolutePath, 'utf8');
  const previousBody = normalizeText(extractKnowledgeBody(previousRaw));
  const refreshed = await fetchLinkKnowledgeSource(entry.sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (FlixPrev Link Repair/2.0)' },
  });
  const nextRaw = refreshed.savedText || '';
  const nextBody = normalizeText(extractKnowledgeBody(nextRaw));
  const changed = nextRaw.trim() !== previousRaw.trim();

  if (!dryRun && changed) {
    await fs.writeFile(absolutePath, nextRaw, 'utf8');
  }

  return {
    topic: entry.topic,
    relPath: entry.relPath,
    sourceUrl: entry.sourceUrl,
    previousStatus: entry.status,
    changed,
    wrote: !dryRun && changed,
    finalUrl: refreshed.finalUrl,
    title: refreshed.title || '',
    contentType: refreshed.contentType || '',
    previousLength: previousBody.length,
    refreshedLength: nextBody.length,
    similarity: computeTokenMetrics(previousBody, nextBody),
  };
}

function summarizeRepairs(results = []) {
  const summary = {
    totalSelected: results.length,
    changed: 0,
    wrote: 0,
    byTopic: {},
  };

  for (const result of results) {
    if (result.changed) summary.changed += 1;
    if (result.wrote) summary.wrote += 1;

    if (!summary.byTopic[result.topic]) {
      summary.byTopic[result.topic] = { total: 0, changed: 0, wrote: 0 };
    }

    summary.byTopic[result.topic].total += 1;
    if (result.changed) summary.byTopic[result.topic].changed += 1;
    if (result.wrote) summary.byTopic[result.topic].wrote += 1;
  }

  return summary;
}

async function main() {
  const selected = await loadRepairCandidates();
  if (!selected.length) {
    console.log(JSON.stringify({
      ok: true,
      dryRun,
      message: 'Nenhum arquivo correspondente aos filtros informados.',
    }, null, 2));
    return;
  }

  const results = [];
  for (const entry of selected) {
    try {
      results.push(await repairEntry(entry));
    } catch (error) {
      results.push({
        topic: entry.topic,
        relPath: entry.relPath,
        sourceUrl: entry.sourceUrl,
        previousStatus: entry.status,
        changed: false,
        wrote: false,
        error: error?.message || String(error),
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    dryRun,
    filters: {
      statuses: requestedStatuses,
      topic: requestedTopic || null,
      relPath: requestedRelPath || null,
      limit,
    },
    summary: summarizeRepairs(results),
    results,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});