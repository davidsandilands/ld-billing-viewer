# LaunchDarkly Billing Viewer

> ⚠️ **Not an official or supported LaunchDarkly project.** This is a community tool under **active development and testing**. Behaviour and numbers may change, and figures should be independently verified against LaunchDarkly before you rely on them for billing or chargeback.

A browser-based dashboard — **plus a headless export script** — for LaunchDarkly usage and chargeback: billed cMAU, service connections, context-kind allocation, and capacity/run-rate planning, broken down by **application** and **project**.

> Two ways to use it: the **web app** (`index.html`, zero-build static site) for interactive exploration, or **`ld-export.mjs`** (Node 18+, no dependencies) to pull the same datasets to CSV/JSON headlessly. See [Headless export](#headless-export-ld-exportmjs).

## Overview

A friendlier lens on LaunchDarkly usage than the built-in billing UI, aimed at internal cost allocation:

- **Chargeback** — cMAU billing by application or project (primary-context, reconciles to the invoice), plus a de-duplicated **largest-context-kind** proportional allocation.
- **Capacity** — growth over time, a rolling-3-month **run-rate projection** (with projected breach month), and a contributor breakdown vs your contracted cMAU / connection limits.
- **Break down by application and project** — see who's driving each billable dimension.
- **Pick a billing month** (this/last month, a recent month, or a custom range); chargeback snapshots the last day of the month.
- **Export anything** — every chart and table has an Export CSV button, or run the script for the full set without the UI.

## Features

- 🧾 **Chargeback** - billed cMAU by application/project (primary context) + a largest-context-kind proportional allocation, with an unattributed-cMAU gap report
- 📈 **Capacity planning** - growth, run-rate projection, and contributor stacks vs contracted limits (70% / 90% threshold lines)
- 📊 **Interactive Charts** - line, bar, or area charts for MAU, connections, and growth
- 🎯 **Application & Project breakdowns** - filter, search, and sort by usage
- 📅 **Billing-month selector** - this month, last month, recent months, or a custom date range
- 📥 **CSV export everywhere** - every chart and table exports its data
- 🖥️ **Headless CLI** - `ld-export.mjs` (Node 18+, no deps) writes the same datasets as CSV + JSON
- 🌙 **Dark/Light Theme** - toggle for comfortable viewing
- 🔒 **Secure** - API tokens are never stored; all requests are made directly from your browser

## Quick Start

### Prerequisites

- A LaunchDarkly account
- A LaunchDarkly API access token (read-only recommended)
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Usage

1. **Open the Tool**
   - Open `index.html` directly in your browser, or
   - Host on a web server (see deployment options below)

2. **Enter Your API Token**
   - Generate a read-only API token from [LaunchDarkly Authorization Settings](https://app.launchdarkly.com/settings/authorization)
   - Paste it into the API Access Token field

3. **Select the Billing Month**
   - Choose **This month**, **Last month**, or a recent month — or pick **Custom range** for specific dates
   - Chargeback figures snapshot the last day of the selected month (the current month is partial / month-to-date)
   - Optionally set your contracted cMAU / service-connection limits under **Capacity thresholds** to see utilization and run-rate projections

4. **Fetch Data**
   - Click "Fetch Usage Data", then explore the **Overview**, **cMAU**, **Connections**, **Capacity**, and **Trends** panels
   - Use the **By application / By project** toggles and **Export CSV** on any chart or table

## API Token Setup

1. Go to [LaunchDarkly Account Settings > Authorization](https://app.launchdarkly.com/settings/authorization)
2. Click **Create token**
3. Give it a descriptive name (e.g., "Billing Viewer - Read Only")
4. Set the role to **Reader** for security
5. Copy and securely store the token (it's only shown once)

### Required Permissions

The token needs read access to:
- Projects
- Usage metrics (MAU, streams, experimentation)

## Deployment Options

### Option 1: Local File
Simply open `index.html` in your browser.

### Option 2: Local Web Server

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (with http-server)
npx http-server -p 8000

# Then open http://localhost:8000
```

### Option 3: GitHub Pages

This repo deploys via **Pages "Deploy from a branch"** (`main` / root) — no build step, no workflow. A `.nojekyll` file is included so files are served verbatim. To set it up on a fork:

1. Push to GitHub
2. Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, Folder: `/ (root)`
3. Your dashboard will be available at `https://<username>.github.io/ld-billing-viewer/`

(The token is entered client-side and calls go straight to LaunchDarkly, so the static host needs no secrets or backend.)

### Option 4: Other Static Hosting

Deploy to any static hosting service:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Azure Static Web Apps
- Any web server

## Headless export (`ld-export.mjs`)

Prefer a script over the web page? `ld-export.mjs` pulls the **same datasets** the dashboard computes, straight from the LaunchDarkly usage APIs, and writes CSVs + a combined JSON. **No dependencies** — Node 18+ only (built-in `fetch`).

```bash
# Reader service-account token in the environment
export LD_API_TOKEN=api-xxxxxxxx
node ld-export.mjs                      # last complete month → ./ld-export-<month>/
node ld-export.mjs --month=2026-06      # a specific month
node ld-export.mjs --out=/tmp/ld --months=6   # custom output dir + trailing-months window
```

**Flags:** `--month=YYYY-MM` (default: last complete month) · `--out=DIR` · `--months=N` (capacity-growth window, default 12) · `--base=URL` (default `https://app.launchdarkly.com/api/v2`).

**Outputs** (one CSV per dataset + `summary.json`):

| File | Contents | Endpoint(s) |
|------|----------|-------------|
| `cmau-billing-by-app.csv` | Billed cMAU per application + share of org | `/usage/clientside-mau` (`groupBy=sdkAppId`) |
| `gap-by-environment.csv` | Env total vs attributed vs unattributed cMAU | `/usage/clientside-mau` (`projectId,environmentId[,sdkAppId]`) |
| `largest-kind-by-app.csv`, `largest-kind-by-project.csv` | Each entity's largest context kind + proportional share | `/usage/clientside-contexts` (per-kind loop) + `/projects/{key}/context-kinds` |
| `connections-by-app.csv`, `connections-by-project.csv` | Peak service connections + share | `/usage/service-connections` (`groupBy=sdkAppId`/`projectId`) |
| `capacity-growth.csv` | Trailing-N-month cMAU (by app) + connections (by app/project) | monthly loop of the above |
| `mau-by-sdk.csv` | MAU by SDK type/series | `/usage/mau/sdks` |
| `summary.json` | All of the above + the org cMAU snapshot, context-kind list, and run-rate projection | — |

The script mirrors the data layer in `app.js`; see `chargebackspec.md` for the endpoint rationale and **limitations** (billed cMAU is primary-context-kind only; largest-kind is context-key usage, a different metric; per-app/project figures overlap and don't de-duplicate; `/usage/mau` is deprecated and rejects `sdkAppId`).

## Understanding the Metrics

### Client-side MAU (Monthly Active Users)
The dashboard calls LaunchDarkly’s `/api/v2/usage/clientside-mau` beta endpoint to report the billed client-side MAU for the selected window. This metric is **primary-context-kind only** (LD bills on the highest-cardinality kind) — it can’t be filtered or grouped by context kind. For a per-context-kind view (the “largest context kind” chargeback comparison) the app uses `/api/v2/usage/clientside-contexts` instead.

### Service Connections
The peak number of concurrent connections from your SDKs to LaunchDarkly. This includes:
- **Server** - Server-side SDK connections
- **Browser** - Client-side JavaScript SDK connections
- **Mobile** - Mobile SDK (iOS/Android) connections

### Experimentation Keys
The number of unique experimentation metric keys used in your experiments during the period.

### Chargeback allocation (two models)
- **Billing (primary context)** — each application's or project's billed cMAU as a share of the org total. Reconciles to the invoice; duplication across context kinds is inherent and stays.
- **Largest context kind (de-duplicated)** — each entity is sized by its single largest context kind, then allocated proportionally against the sum of those maxima. Reduces the same entity being counted once per kind, and tracks the dimension LaunchDarkly is moving to bill on. Built from `/usage/clientside-contexts` — a comparison metric, not the invoice figure.

An **unattributed-cMAU gap report** (per environment) shows how much usage isn't tied to an `application.id`.

### Capacity
Growth of billed cMAU / peak connections over the trailing 12 months, a rolling-3-month run-rate projection (with the projected month you'd cross a contracted limit), and a contributor breakdown by application or project. Set contracted limits in **Configuration** to see utilization and 70% / 90% threshold lines.

See [`chargebackspec.md`](chargebackspec.md) for the full allocation model, endpoint rationale, and limitations.

## Dashboard Features

### Summary Cards
Quick overview of:
- Total Client MAU for the period
- Peak Service Connections
- Experimentation Keys used
- Number of active projects

### Time Series Charts
Interactive charts showing usage trends over time. Switch between:
- Line chart
- Bar chart
- Area chart

### Project Breakdown
Grid view of all projects with their usage metrics. Features:
- Search by project name or key
- Sort by MAU (high/low) or name (A-Z/Z-A)

### Data Table
Detailed tabular view of all usage data with:
- Date
- Project name
- Environment
- Metric
- MAU count
- Connection count

### CSV Export
Every chart and table has its own **Export CSV** button (charts export the exact series plotted). For the complete set without the UI, use the [`ld-export.mjs`](#headless-export-ld-exportmjs) script.

## Security Notes

- **API tokens are not stored** - You must re-enter your token each session
- **Browser-only requests** - All API calls are made directly from your browser to LaunchDarkly
- **No backend required** - No data passes through any third-party servers
- **Use read-only tokens** - For maximum security, create tokens with Reader role only

## Limitations

- Data availability and API granularity depend on your LaunchDarkly plan (some breakdowns visible in the UI aren't exposed via API on all plans).
- **Billed cMAU (`/usage/clientside-mau`) is primary-context-kind only** and can't be split by context kind. The per-context-kind "largest context kind" view uses `/usage/clientside-contexts` — a *different* metric (context-key usages), a proportional comparison, **not** the invoice figure.
- **Per-application / per-project figures overlap** — a unique context active in multiple apps/projects is counted in each, so they sum to more than the org total. They're proportional allocations, not a clean de-duplicated split (the UI flags this).
- The largest-context-kind and capacity-growth views fire extra API calls (per context kind, and per trailing month) — heavier on large accounts, though all run in parallel and degrade gracefully per endpoint.
- CORS is required for browser access (LaunchDarkly's usage API supports it); all usage endpoints use `LD-API-Version: beta`.

## Troubleshooting

### "API Error: 401 Unauthorized"
- Verify your API token is correct and hasn't expired
- Ensure the token has the necessary read permissions

### "API Error: 403 Forbidden"
- Your token may lack permissions for certain endpoints
- Try creating a new token with Reader role

### "No data available"
- Try a different billing month (the current month is partial)
- Verify your account has usage data for the selected period
- For empty per-application rows, confirm your SDKs send `application.id` at init

### Charts not displaying
- Ensure JavaScript is enabled in your browser
- Check the browser console for errors

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

Apache 2.0 - see [LICENSE](LICENSE) file for details.

## Resources

- [LaunchDarkly API Documentation](https://apidocs.launchdarkly.com/)
- [LaunchDarkly Account Metrics](https://docs.launchdarkly.com/home/account/metrics)
- [Creating API Access Tokens](https://docs.launchdarkly.com/home/account/api)

---

Made with ❤️ for the LaunchDarkly community

