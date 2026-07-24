#!/usr/bin/env node
/**
 * ld-export.mjs — headless LaunchDarkly usage/chargeback exporter.
 *
 * Pulls the same datasets the LD Billing Viewer web app computes, straight from the LaunchDarkly
 * usage APIs, and writes one CSV per dataset (+ a combined JSON). No dependencies — Node 18+ only
 * (uses the built-in global fetch). This mirrors the data layer in app.js; see README.md and
 * chargebackspec.md for the endpoint rationale and limitations.
 *
 * Usage:
 *   LD_API_TOKEN=api-xxxx node ld-export.mjs [--month=YYYY-MM] [--out=DIR] [--months=N] [--base=URL]
 *
 * Flags:
 *   --month=YYYY-MM   Billing month to snapshot (default: last complete month).
 *   --out=DIR         Output directory (default: ./ld-export-<month>).
 *   --months=N        Trailing months for the capacity-growth series (default: 12).
 *   --base=URL        API base (default: https://app.launchdarkly.com/api/v2).
 *
 * The token needs Reader role. Use a service-account token.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config / args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
        const m = a.match(/^--([^=]+)=(.*)$/);
        return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
    })
);
const TOKEN = process.env.LD_API_TOKEN || process.env.LAUNCHDARKLY_API_TOKEN;
if (!TOKEN) {
    console.error('ERROR: set LD_API_TOKEN (a Reader service-account token).');
    process.exit(1);
}
const BASE = args.base || 'https://app.launchdarkly.com/api/v2';
const MONTH_COUNT = Number.isFinite(+args.months) ? Math.max(1, +args.months) : 12;

function lastCompleteMonthKey() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const MONTH = /^\d{4}-\d{2}$/.test(args.month) ? args.month : lastCompleteMonthKey();
const OUT = args.out || `ld-export-${MONTH}`;

// ---------------------------------------------------------------------------
// Small utilities (mirroring app.js)
// ---------------------------------------------------------------------------
function monthToRange(yyyymm) {
    const [y, m] = yyyymm.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
    const now = new Date();
    const end = monthEnd > now ? now : monthEnd;
    return { from: start.getTime(), to: end.getTime() };
}
function monthLabel(yyyymm) {
    const [y, m] = yyyymm.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}
function trailingMonthKeys(n) {
    const now = new Date();
    const keys = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** GET with auth + retry on 429/5xx. `params` values may be arrays (repeated query keys). */
async function api(endpoint, params = {}, { beta = true } = {}) {
    const url = new URL(BASE + endpoint);
    for (const [k, v] of Object.entries(params)) {
        if (v == null) continue;
        for (const item of Array.isArray(v) ? v : [v]) {
            if (item !== undefined && item !== null && item !== '') url.searchParams.append(k, item);
        }
    }
    const headers = { Authorization: TOKEN };
    if (beta) headers['LD-API-Version'] = 'beta';
    for (let attempt = 0; attempt < 5; attempt++) {
        const res = await fetch(url, { headers });
        if (res.ok) return res.json();
        if (res.status === 429 || res.status >= 500) { await sleep(500 * (attempt + 1)); continue; }
        const body = await res.json().catch(() => ({}));
        throw new Error(`${res.status} ${res.statusText} on ${endpoint}: ${body.message || ''}`);
    }
    throw new Error(`Repeated failures on ${endpoint}`);
}
const apiSafe = (endpoint, params, opts) => api(endpoint, params, opts).catch(err => {
    console.warn(`  ! ${endpoint}: ${err.message}`);
    return null;
});

// Response-shape helpers (grouped { metadata[], series[] } with numeric index keys).
function resolveTs(point) {
    for (const k of ['time', 'timestamp', 'timeMillis']) {
        if (point[k] != null) { let t = point[k]; if (typeof t === 'number' && t < 1e12) t *= 1000; return t; }
    }
    return null;
}
function groupedToColumns(raw) {
    if (!raw || !Array.isArray(raw.metadata) || !Array.isArray(raw.series)) return [];
    return raw.metadata.map((meta, idx) => {
        const series = [];
        for (const point of raw.series) {
            const v = point[String(idx)] ?? point[idx];
            const ts = resolveTs(point);
            if (ts == null || v == null) continue;
            const num = Number(v);
            if (Number.isFinite(num)) series.push({ t: ts, v: num });
        }
        return { meta, series };
    });
}
const peak = (series) => series.reduce((mx, p) => Math.max(mx, p.v), 0);
const snapshot = (series) => series.length ? series.slice().sort((a, b) => a.t - b.t).at(-1).v : 0;
function seriesTotal(raw) {
    // Sum all numeric columns per timestamp → single series, then snapshot.
    const cols = groupedToColumns(raw);
    if (!cols.length) return 0;
    const byT = new Map();
    cols.forEach(c => c.series.forEach(p => byT.set(p.t, (byT.get(p.t) || 0) + p.v)));
    const merged = [...byT.entries()].map(([t, v]) => ({ t, v }));
    return snapshot(merged);
}

// Entity resolvers
const extractSdkAppId = (m) => m?.sdkAppId ?? m?.sdkAppID ?? m?.applicationId ?? m?.application?.key ?? null;
const extractProjectId = (m) => m?.projectId ?? m?.project?.id ?? m?.project?._id ?? null;
const isUnknown = (s) => !s || String(s).toLowerCase() === 'unknown';

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------
async function fetchAllPaged(endpoint) {
    const items = [];
    let next = endpoint + (endpoint.includes('?') ? '&' : '?') + 'limit=100';
    let guard = 0;
    while (next && guard++ < 50) {
        const page = await api(next.replace(BASE, ''), {}, { beta: false });
        if (Array.isArray(page?.items)) items.push(...page.items);
        const href = page?._links?.next?.href;
        next = href ? (href.startsWith('http') ? href : BASE + href.replace(/^\/api\/v2/, '')) : null;
    }
    return items;
}

function grouped(from, to, groupBy, extra = {}) {
    return apiSafe('/usage/clientside-mau', { from, to, aggregationType: 'month_to_date', groupBy, ...extra });
}
function contexts(from, to, groupBy, contextKind) {
    return apiSafe('/usage/clientside-contexts', { from, to, aggregationType: 'month_to_date', groupBy, contextKind });
}
function connections(from, to, groupBy) {
    return apiSafe('/usage/service-connections', { from, to, groupBy });
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------
function perEntityValue(raw, resolveKey, agg) {
    // raw grouped by a single entity → { key: value }
    const out = new Map();
    for (const col of groupedToColumns(raw)) {
        const key = resolveKey(col.meta) || 'unknown';
        const v = agg === 'peak' ? peak(col.series) : snapshot(col.series);
        out.set(key, (out.get(key) || 0) + v);
    }
    return out;
}

function shareRows(map, orgTotal, nameFor) {
    const denom = orgTotal || [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
        .map(([key, value]) => ({ key, name: nameFor(key), value, sharePct: denom > 0 ? (value / denom) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);
}

// Rolling 3-month growth projection on completed-month org values.
function project(completed, limit) {
    const clean = completed.filter(m => m.value > 0);
    if (clean.length < 2) return { avgGrowthPct: null, breachMonth: null, monthsToBreach: null, alreadyOver: false };
    const ratios = [];
    for (let i = Math.max(1, clean.length - 3); i < clean.length; i++) {
        if (clean[i - 1].value > 0) ratios.push(clean[i].value / clean[i - 1].value);
    }
    const r = ratios.reduce((s, x) => s + x, 0) / ratios.length;
    const last = clean.at(-1);
    const hasLimit = Number.isFinite(limit) && limit > 0;
    const alreadyOver = hasLimit && last.value >= limit;
    let value = last.value, breachMonth = null, monthsToBreach = null;
    if (hasLimit && !alreadyOver) {
        for (let step = 1; step <= 12; step++) {
            value *= r;
            if (value >= limit) { breachMonth = `+${step}mo`; monthsToBreach = step; break; }
        }
    }
    return { avgGrowthPct: (r - 1) * 100, breachMonth, monthsToBreach, alreadyOver };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function toCsv(headers, rows) {
    const cell = (v) => (typeof v === 'number' && Number.isFinite(v)) ? String(v) : `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n') + '\n';
}
const written = [];
async function writeCsv(name, headers, rows) {
    await writeFile(path.join(OUT, name), toCsv(headers, rows));
    written.push(`${name} (${rows.length} rows)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    await mkdir(OUT, { recursive: true });
    const { from, to } = monthToRange(MONTH);
    console.log(`LaunchDarkly export → ${OUT}  (month ${MONTH})`);

    console.log('Fetching projects, applications, context kinds…');
    const projects = await fetchAllPaged('/projects').catch(() => []);
    const applications = await fetchAllPaged('/applications').catch(() => []);
    const projName = new Map(projects.map(p => [p.key, p.name || p.key]));
    const projById = new Map(projects.map(p => [String(p._id || p.id), p.key]));
    const appName = new Map(applications.map(a => [a.key, a.name || a.key]));
    const resolveApp = (m) => { const k = extractSdkAppId(m); return isUnknown(k) ? 'unknown' : k; };
    const resolveProj = (m) => { const k = projById.get(String(extractProjectId(m))) || null; return k || 'unknown'; };
    const nameApp = (k) => k === 'unknown' ? 'Unattributed' : (appName.get(k) || k);
    const nameProj = (k) => k === 'unknown' ? 'Unattributed' : (projName.get(k) || k);

    // Enumerate context kinds (union across projects).
    const kindSet = new Set();
    await Promise.all(projects.map(async p => {
        const r = await apiSafe(`/projects/${encodeURIComponent(p.key)}/context-kinds`, {}, { beta: false });
        (r?.items || []).forEach(k => k?.key && kindSet.add(String(k.key)));
    }));
    if (!kindSet.size) kindSet.add('user');
    const kinds = [...kindSet];

    console.log('Fetching cMAU (billing), gap, connections, context kinds…');
    const [appRaw, envRaw, tripleRaw, totalRaw, connAppRaw, connProjRaw, sdksRaw] = await Promise.all([
        grouped(from, to, ['sdkAppId']),
        grouped(from, to, ['projectId', 'environmentId']),
        grouped(from, to, ['projectId', 'environmentId', 'sdkAppId']),
        apiSafe('/usage/clientside-mau', { from, to, aggregationType: 'month_to_date' }),
        connections(from, to, 'sdkAppId'),
        connections(from, to, 'projectId'),
        apiSafe('/usage/mau/sdks', { from, to })
    ]);

    const orgCmau = seriesTotal(totalRaw);

    // 1. cMAU billing by application
    const cmauByApp = shareRows(perEntityValue(appRaw, resolveApp, 'snapshot'), orgCmau, nameApp);
    await writeCsv('cmau-billing-by-app.csv',
        ['applicationKey', 'name', 'cmau', 'sharePercentOrg'],
        cmauByApp.map(r => [r.key, r.name, Math.round(r.value), r.sharePct.toFixed(4)]));

    // 2. Unattributed gap by environment
    const envCols = groupedToColumns(envRaw);
    const tripleCols = groupedToColumns(tripleRaw);
    const envTotal = new Map();
    envCols.forEach(c => {
        const pk = resolveProj(c.meta), env = c.meta?.environmentId ?? '';
        envTotal.set(`${pk}\t${env}`, snapshot(c.series));
    });
    const envAttr = new Map(), envUnknown = new Map();
    tripleCols.forEach(c => {
        const pk = resolveProj(c.meta), env = c.meta?.environmentId ?? '', key = `${pk}\t${env}`;
        const v = snapshot(c.series);
        if (isUnknown(extractSdkAppId(c.meta))) envUnknown.set(key, (envUnknown.get(key) || 0) + v);
        else envAttr.set(key, (envAttr.get(key) || 0) + v);
    });
    const gapRows = [...envTotal.entries()].map(([key, total]) => {
        const [pk, env] = key.split('\t');
        const attributed = envAttr.get(key) || 0;
        const unknown = envUnknown.get(key) || 0;
        const gap = unknown > 0 ? unknown : Math.max(0, total - attributed);
        const denom = Math.max(total, attributed + unknown);
        return { pk, env, total, attributed, gap, gapPct: denom > 0 ? (gap / denom) * 100 : 0 };
    }).sort((a, b) => b.gap - a.gap);
    await writeCsv('gap-by-environment.csv',
        ['projectKey', 'environmentId', 'envTotalCmau', 'attributedCmau', 'unattributedCmau', 'gapPercent'],
        gapRows.map(r => [r.pk, r.env, Math.round(r.total), Math.round(r.attributed), Math.round(r.gap), r.gapPct.toFixed(4)]));

    // 3. Largest context kind (by app + by project) — per-kind clientside-contexts loop
    console.log(`Fetching largest-context-kind (${kinds.length} kinds x 2 dimensions)…`);
    async function largestKind(dim, resolveKey, nameFor) {
        const perKind = await Promise.all(kinds.map(async kind => ({ kind, raw: await contexts(from, to, [dim], [kind]) })));
        const byEntity = new Map();
        for (const { kind, raw } of perKind) {
            for (const col of groupedToColumns(raw)) {
                const key = resolveKey(col.meta); const v = peak(col.series);
                if (!(v > 0)) continue;
                if (!byEntity.has(key)) byEntity.set(key, {});
                byEntity.get(key)[kind] = (byEntity.get(key)[kind] || 0) + v;
            }
        }
        const rows = [...byEntity.entries()].map(([key, kmap]) => {
            let largest = null, largestVal = 0, total = 0;
            for (const [k, v] of Object.entries(kmap)) { total += v; if (v > largestVal) { largestVal = v; largest = k; } }
            return { key, name: nameFor(key), largestKind: largest, largestValue: largestVal, totalAllKinds: total };
        });
        const denom = rows.reduce((s, r) => s + r.largestValue, 0);
        rows.forEach(r => r.sharePct = denom > 0 ? (r.largestValue / denom) * 100 : 0);
        return rows.sort((a, b) => b.largestValue - a.largestValue);
    }
    const lkApp = await largestKind('sdkAppId', resolveApp, nameApp);
    const lkProj = await largestKind('projectId', resolveProj, nameProj);
    for (const [file, rows, keyCol] of [['largest-kind-by-app.csv', lkApp, 'applicationKey'], ['largest-kind-by-project.csv', lkProj, 'projectKey']]) {
        await writeCsv(file,
            [keyCol, 'name', 'largestContextKind', 'largestKindContextUsages', 'proportionalSharePercent', 'totalAllKinds'],
            rows.map(r => [r.key, r.name, r.largestKind || '', Math.round(r.largestValue), r.sharePct.toFixed(4), Math.round(r.totalAllKinds)]));
    }

    // 4. Service connections by app + by project
    const orgConnApp = [...perEntityValue(connAppRaw, resolveApp, 'peak').values()].reduce((s, v) => s + v, 0);
    const connByApp = shareRows(perEntityValue(connAppRaw, resolveApp, 'peak'), 0, nameApp);
    const connByProj = shareRows(perEntityValue(connProjRaw, resolveProj, 'peak'), 0, nameProj);
    await writeCsv('connections-by-app.csv',
        ['applicationKey', 'name', 'peakConnections', 'sharePercent'],
        connByApp.map(r => [r.key, r.name, Math.round(r.value), r.sharePct.toFixed(4)]));
    await writeCsv('connections-by-project.csv',
        ['projectKey', 'name', 'peakConnections', 'sharePercent'],
        connByProj.map(r => [r.key, r.name, Math.round(r.value), r.sharePct.toFixed(4)]));

    // 5. MAU by SDK type
    const sdkRows = [];
    (function flatten(obj, prefix) {
        if (Array.isArray(obj)) { obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`)); return; }
        if (obj && typeof obj === 'object') { for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k); return; }
        if (typeof obj === 'number') sdkRows.push([prefix, obj]);
    })(sdksRaw, '');
    await writeCsv('mau-by-sdk.csv', ['seriesPath', 'value'], sdkRows);

    // 6. Capacity growth (trailing months) — cMAU by app + connections by app/project, month-end/peak
    console.log(`Fetching ${MONTH_COUNT}-month capacity growth series…`);
    const monthKeys = trailingMonthKeys(MONTH_COUNT);
    const growth = []; // {metric, dimension, entity, month, value}
    const orgCmauByMonth = {};
    for (const mk of monthKeys) {
        const { from: mf, to: mt } = monthToRange(mk);
        const [cmA, cnA, cnP] = await Promise.all([
            grouped(mf, mt, ['sdkAppId']),
            connections(mf, mt, 'sdkAppId'),
            connections(mf, mt, 'projectId')
        ]);
        const cmauMap = perEntityValue(cmA, resolveApp, 'snapshot');
        orgCmauByMonth[mk] = [...cmauMap.values()].reduce((s, v) => s + v, 0);
        for (const [k, v] of cmauMap) growth.push(['cmau', 'application', nameApp(k), mk, Math.round(v)]);
        for (const [k, v] of perEntityValue(cnA, resolveApp, 'peak')) growth.push(['connections', 'application', nameApp(k), mk, Math.round(v)]);
        for (const [k, v] of perEntityValue(cnP, resolveProj, 'peak')) growth.push(['connections', 'project', nameProj(k), mk, Math.round(v)]);
    }
    await writeCsv('capacity-growth.csv', ['metric', 'dimension', 'entity', 'month', 'value'], growth);

    // Projection on completed months (exclude current partial month).
    const currentKey = trailingMonthKeys(1)[0];
    const completed = monthKeys.filter(k => k !== currentKey).map(k => ({ month: k, value: orgCmauByMonth[k] || 0 }));
    const proj = project(completed, NaN);

    // 7. Combined JSON
    const summary = {
        generatedAt: new Date().toISOString(),
        month: MONTH,
        apiBase: BASE,
        orgCmauSnapshot: Math.round(orgCmau),
        contextKinds: kinds,
        cmauBillingByApp: cmauByApp,
        gapByEnvironment: gapRows,
        largestKindByApp: lkApp,
        largestKindByProject: lkProj,
        connectionsByApp: connByApp,
        connectionsByProject: connByProj,
        capacityGrowth: { months: monthKeys, orgCmauByMonth, projection: proj },
    };
    await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
    written.push('summary.json');

    console.log(`\nDone. Wrote to ${OUT}/:`);
    written.forEach(w => console.log('  - ' + w));
    console.log('\nNote: per-app/project cMAU overlaps (unique contexts counted per entity) and');
    console.log('largest-kind is context-key usage, not the billed figure — see README.md / chargebackspec.md.');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
