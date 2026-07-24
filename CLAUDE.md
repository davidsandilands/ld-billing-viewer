# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

This is a zero-build, zero-dependency static web app — no package manager, no bundler, no transpilation.

```bash
# Serve locally (any of these work)
python3 -m http.server 8744
npx http-server -p 8000
# Then open http://localhost:8744
```

The `.claude/launch.json` is pre-configured so `preview_start` spins up the Python server on port 8744.

**Cache-busting:** `index.html` references `styles.css?v=N` and `app.js?v=N`. Bump `N` whenever you make CSS or JS changes that need to reach a browser that has cached the old files.

## Architecture

Three files do everything:

| File | Role |
|------|------|
| `index.html` | All markup. Panels are in the DOM at load time, shown/hidden by JS. |
| `app.js` | All logic — API calls, state, rendering, event wiring. Single global `state` object. |
| `styles.css` | All styles. LD brand palette defined as CSS custom properties at `:root`. |

External dependencies loaded from CDN: **Chart.js 4.4.1** + **chartjs-adapter-date-fns** (time-axis support).

### State

One module-level `const state` object holds everything:
- `state.projects` — all LD projects (fetched first, needed to resolve project IDs to keys)
- `state.applications` — registered LD applications from `GET /api/v2/applications`
- `state.usageData` — raw API responses: `mau`, `streams.{server,browser,mobile}`, `experiments`, `projectMau`, `projectConnections`, `projectConnectionsBrowser`, `projectConnectionsMobile`
- `state.chargeback` — derived chargeback rows: `apps[]` (billing, primary-context cMAU by app), `gap[]`, `mauSdks`, `orgCmauTotal`, and `appKind`/`projectKind` (largest-context-kind allocation, each `{ available, rows[], denom, debug }`)
- `state.filters` — `{ contextKinds, aggregationType }` from the config form
- `state.viewMode` — which panel is active (`'overview' | 'cmau' | 'connections' | 'capacity' | 'trends'`)

### Data flow

`fetchAllUsageData()` is the single entry point triggered by the Fetch button:

1. Fetches `state.projects` first (needed for ID→key resolution throughout)
2. Fires ~13 parallel API calls via `Promise.all` — all usage endpoints, applications registry, and three separate `groupBy` variants of clientside-MAU
3. Builds chargeback structures from raw API data
4. Calls `updateDashboard()` → individual render functions per panel

### Navigation

The four summary cards (CLIENT MAU, SERVICE CONNECTIONS, EXPERIMENTATION KEYS, ACTIVE PROJECTS) are the primary navigation. Each card with a `data-view-mode` attribute calls `setViewMode(mode)` on click. The hidden `.view-mode-toggle` buttons in the header still exist in the DOM for the Capacity panel (accessible only programmatically).

`setViewMode(mode)` → updates `state.viewMode`, adds/removes `is-nav-active` on the corresponding card, calls `applyViewModeLayout()` which shows/hides the five `#panel-*` divs.

### cMAU chargeback pipeline

The cMAU panel has **two independent views** (a top switch, `state.chargebackView`):

**1. Billing view (primary context).** `/usage/clientside-mau` is called several ways in the main `Promise.all` — this is the invoice-reconciling, primary-context-kind metric:

| Variable | `groupBy` | Purpose |
|----------|-----------|---------|
| `cmauByAppRaw` | `['sdkAppId']` | Per-app cMAU → chargeback share |
| `envPairRaw` | `['projectId','environmentId']` | Env totals → gap report denominator |
| `tripleRaw` | `['projectId','environmentId','sdkAppId']` | App-to-project mapping + gap report numerator |
| `cmauChargebackTotalRaw` | _(none)_ | Org total → denominator for share % |

**2. Largest-context-kind view (`state.chargebackDim` = `'app'|'project'`).** `/usage/clientside-mau` is **primary-kind only and cannot break down by context kind**, so this view uses **`/usage/clientside-contexts`** instead. That endpoint won't split by kind when grouped by an entity, so the build is: `fetchAccountContextKinds()` (union of `/projects/{key}/context-kinds`) → `fetchPerKindContexts(from,to,dim,kinds)` fires one `clientside-contexts?groupBy=<dim>&contextKind=<K>` call **per kind** → `buildLargestKindRowsFromPerKind()` folds them into a per-(entity × kind) matrix, sizes each entity by its largest kind, and allocates `share = max / Σ(max)`. This runs after the main `Promise.all` (needs `state.projects`), before `updateDashboard()`. It is a **different metric** (context-key usages, not billed cMAU) — a relative comparison, not the invoice figure.

`groupedUsageToColumns(raw)` converts the `{ metadata[], series[] }` response shape into `[{ meta, index, peak, series }]` columns. The response uses numeric index keys (`"0"`, `"1"`, …) to reference columns in each series point.

**Aggregation:** `getSeriesValue(series, aggregationType)` — use **sum** for `daily_incremental` (API returns per-day counts), use **peak** (`getPeakValue`) for `rolling_30d`/`month_to_date` (the grouped endpoint returns a daily series regardless of type; last-value would land on a low-activity day). The largest-kind build also uses **peak** — the `clientside-contexts` MTD series is cumulative and its final partial-day point is often 0.

### ID resolution

LD usage APIs return internal MongoDB-style IDs (`projectId`, `environmentId`), not human-readable keys. `resolveProjectKeyFromId(id)` and `resolveEnvironmentKeys(projectKey, envId)` look up `state.projects` to convert them. This is why projects must be fetched before the parallel data fetch.

## Key files beyond the three main ones

- `chargebackspec.md` — internal spec describing the chargeback allocation model, the two billable dimensions (cMAU by application, service connections by project/env), the gap report formula, and capacity alert thresholds (70%/90%). Read this before changing chargeback logic.
- `ld-export.mjs` — standalone headless exporter (Node 18+, no deps). Mirrors this app's data layer (same endpoints/derivations: cMAU billing by app, gap report, largest-context-kind by app+project via the per-kind loop, connections by app+project, trailing-month capacity growth) and writes one CSV per dataset + `summary.json`. Run `LD_API_TOKEN=… node ld-export.mjs`. Keep it in sync when the in-app fetch/derivation logic changes; usage is documented in `README.md`.
- In the web app, every chart and table has an **Export CSV** control. Charts use a generic `exportChartCsv(chart, filename)` that serializes the rendered Chart.js datasets; small `data-export="chart:<key>|table:<key>"` buttons dispatch through `exportDataset()`.

## LD brand palette (from `styles.css` `:root`)

```
--ld-blue:        #405BFF   (primary actions, active states)
--ld-powder-blue: #7084FF
--ld-cyan:        #3DD6F5
--ld-purple:      #A34FDE
--ld-pink:        #FF35A2
--ld-orange:      #FF9D29
--ld-yellow:      #EBFF38
--ld-green:       #A9FF5E
```

Font: **Inter** (display) + **JetBrains Mono** (numbers, code, tags).

## Known API limitations

- **`/usage/clientside-mau` is primary-context-kind only.** No `contextKind` filter or groupBy — you cannot get a per-context-kind breakdown from it. Valid `groupBy`: `projectId, environmentId, sdkName, sdkAppId, anonymousV2`. This is the billed metric; LD is moving the billed kind from fixed-`user` to the highest-cardinality kind per month.
- **Per-context-kind data comes from `/usage/clientside-contexts`**, which does *not* split by kind when grouped by an entity (metadata carries only the entity). The tool loops the `contextKind` filter per kind (kinds enumerated via `/projects/{key}/context-kinds`) to build the (entity × kind) matrix. Cost ≈ `#projects + #kinds×2` extra calls per fetch.
- **Do not use `/usage/mau`** (deprecated): lowercase `groupby` param, and it **rejects `sdkAppId`** as a group-by argument on some accounts (`"Invalid group by argument: sdkAppId"`). We migrated the largest-kind view off it.
- `groupBy=projectId` on `/usage/clientside-mau` returns only one metadata entry for many accounts — per-project MAU breakdown is not available via browser for most plans. The Trends project grid shows a message when this is the case.
- `/usage/streams/browser` and `/usage/streams/mobile` do not support `groupBy=projectId` on most plans. The Connections panel fetches them optimistically and falls back gracefully; the allocation table notes which sources are included.
- Per-application data (cMAU, service connections) depends on SDKs sending `application.id` at init; otherwise usage lands in an `Unknown`/"Unattributed" bucket.
- Summing per-project (or per-app) cMAU does not equal the org total — the same unique context can appear in multiple groups; there's no clean de-dup for a unique-count metric.
- All usage endpoints require `LD-API-Version: beta`. `apiRequest(endpoint, params, { apiVersion: 'beta' })` sets this header. (`/projects/{key}/context-kinds` is GA and is called without the beta header.)
