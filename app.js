/**
 * LaunchDarkly Billing Viewer
 * A browser-based tool for visualizing LaunchDarkly usage metrics
 */

// ==========================================
// Configuration & State
// ==========================================

const API_BASE_URL = 'https://app.launchdarkly.com/api/v2';

const state = {
    apiKey: '',
    projects: [],
    applications: [],
    applicationsError: null,
    viewMode: 'overview',
    usageData: {
        mau: [],
        streams: [],
        events: [],
        experiments: []
    },
    chargeback: {
        apps: [],
        gap: [],
        mauSdks: null,
        orgCmauTotal: 0
    },
    dateRange: {
        start: null,
        end: null
    },
    charts: {
        cmau: null,
        connections: null
    }
};

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    apiKeyInput: document.getElementById('api-key'),
    toggleApiKey: document.getElementById('toggle-api-key'),
    datePreset: document.getElementById('date-preset'),
    customDates: document.getElementById('custom-dates'),
    startDate: document.getElementById('start-date'),
    endDate: document.getElementById('end-date'),
    contextKind: document.getElementById('context-kind'),
    aggregationType: document.getElementById('aggregation-type'),
    fetchButton: document.getElementById('fetch-data'),
    toggleConfig: document.getElementById('toggle-config'),
    configPanel: document.getElementById('config-panel'),
    themeToggle: document.getElementById('theme-toggle'),
    loadingOverlay: document.getElementById('loading-overlay'),
    errorMessage: document.getElementById('error-message'),
    errorText: document.getElementById('error-text'),
    dismissError: document.getElementById('dismiss-error'),
    dashboard: document.getElementById('dashboard'),
    emptyState: document.getElementById('empty-state'),
    // Summary elements
    totalCmau: document.getElementById('total-cmau'),
    cmauPeriod: document.getElementById('cmau-period'),
    totalConnections: document.getElementById('total-connections'),
    connectionsPeriod: document.getElementById('connections-period'),
    totalExperiments: document.getElementById('total-experiments'),
    experimentsPeriod: document.getElementById('experiments-period'),
    totalCapacity: document.getElementById('total-capacity'),
    totalProjects: document.getElementById('total-projects'), // legacy id (may be null if removed)
    capacityCardSubtitle: document.getElementById('capacity-card-subtitle'),
    // Chart elements
    cmauChart: document.getElementById('cmau-chart'),
    connectionsChart: document.getElementById('connections-chart'),
    cmauChartType: document.getElementById('cmau-chart-type'),
    connectionsChartType: document.getElementById('connections-chart-type'),
    // Project breakdown
    projectGrid: document.getElementById('project-grid'),
    projectSearch: document.getElementById('project-search'),
    projectSort: document.getElementById('project-sort'),
    // Table
    usageTableBody: document.getElementById('usage-table-body'),
    exportCsv: document.getElementById('export-csv'),
    capacityCmauLimit: document.getElementById('capacity-cmau-limit'),
    capacityConnLimit: document.getElementById('capacity-conn-limit'),
    chargebackUseContextFilters: document.getElementById('chargeback-use-context-filters'),
    capacityMeters: document.getElementById('capacity-meters'),
    chargebackAppsSection: document.getElementById('chargeback-apps-section'),
    chargebackGapSection: document.getElementById('chargeback-gap-section'),
    chargebackSdksSection: document.getElementById('chargeback-sdks-section'),
    chargebackAppsBody: document.getElementById('chargeback-apps-body'),
    chargebackGapBody: document.getElementById('chargeback-gap-body'),
    chargebackSdksBody: document.getElementById('chargeback-sdks-body'),
    chargebackAppsEmpty: document.getElementById('chargeback-apps-empty'),
    chargebackGapEmpty: document.getElementById('chargeback-gap-empty'),
    chargebackSdksEmpty: document.getElementById('chargeback-sdks-empty'),
    breakdownHeading: document.getElementById('breakdown-heading'),
    meterCmauFill: document.getElementById('meter-cmau-fill'),
    meterCmauLabel: document.getElementById('meter-cmau-label'),
    meterCmauNote: document.getElementById('meter-cmau-note'),
    meterConnFill: document.getElementById('meter-conn-fill'),
    meterConnLabel: document.getElementById('meter-conn-label'),
    meterConnNote: document.getElementById('meter-conn-note'),
    exportChargebackApps: document.getElementById('export-chargeback-apps'),
    exportChargebackGap: document.getElementById('export-chargeback-gap'),
    viewModeStatusHint: document.getElementById('view-mode-status-hint'),
    viewModeStatusDesc: document.getElementById('view-mode-status-desc'),
    viewModeStatusPill: document.getElementById('view-mode-status-pill'),
    applicationsRegistryBody: document.getElementById('applications-registry-body'),
    applicationsFetchError: document.getElementById('applications-fetch-error'),
    applicationsRegistryEmpty: document.getElementById('applications-registry-empty'),
    applicationsRegistryTable: document.getElementById('applications-registry-table'),
    applicationsCountBadge: document.getElementById('applications-count-badge'),
    panelOverview: document.getElementById('panel-overview'),
    panelCmau: document.getElementById('panel-cmau'),
    panelConnections: document.getElementById('panel-connections'),
    panelCapacity: document.getElementById('panel-capacity'),
    panelTrends: document.getElementById('panel-trends'),
    streamSourceCards: document.getElementById('stream-source-cards'),
    connectionsAllocationBody: document.getElementById('connections-allocation-body'),
    connectionsAllocationEmpty: document.getElementById('connections-allocation-empty'),
    connectionsByAppBody: document.getElementById('connections-by-app-body'),
    connectionsByAppEmpty: document.getElementById('connections-by-app-empty'),
    connectionsByAppMeta: document.getElementById('connections-by-app-meta'),
    exportConnectionsByApp: document.getElementById('export-connections-by-app')
};

// ==========================================
// Utility Functions
// ==========================================

/**
 * Format a number with commas for readability
 */
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return new Intl.NumberFormat().format(Math.round(num));
}

/**
 * Format a date for display
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Format a date for API calls (YYYY-MM-DD)
 */
function formatDateForApi(date) {
    return date.getTime();
}

/**
 * Format date for input elements (YYYY-MM-DD)
 */
function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Validate that start and end dates are usable
 */
function validateDateRange(start, end) {
    if (!(start instanceof Date) || isNaN(start.getTime()) ||
        !(end instanceof Date) || isNaN(end.getTime())) {
        return { valid: false, message: 'Please provide valid start and end dates.' };
    }
    if (start > end) {
        return { valid: false, message: 'Start date must be before the end date.' };
    }
    return { valid: true };
}

/**
 * Get date range based on preset selection
 */
function getDateRange() {
    const preset = elements.datePreset.value;
    const end = new Date();
    let start = new Date();
    
    if (preset === 'custom') {
        return {
            start: new Date(elements.startDate.value),
            end: new Date(elements.endDate.value)
        };
    }
    
    // Extract days from preset (e.g., "180d" -> 180)
    const days = parseInt(preset.replace('d', ''));
    if (isNaN(days)) {
        console.error('Invalid date preset:', preset);
        // Default to 30 days if parsing fails
        start.setDate(end.getDate() - 30);
    } else {
        start.setDate(end.getDate() - days);
    }
    
    return { start, end };
}

/**
 * Calculate Unix timestamp in milliseconds
 */
function getTimestamp(date) {
    return date.getTime();
}

/**
 * Show loading overlay
 */
function showLoading() {
    elements.loadingOverlay.style.display = 'flex';
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

/**
 * Show error message
 */
function showError(message) {
    elements.errorText.textContent = message;
    elements.errorMessage.style.display = 'flex';
}

/**
 * Hide error message
 */
function hideError() {
    elements.errorMessage.style.display = 'none';
}

/**
 * Show dashboard, hide empty state
 */
function showDashboard() {
    elements.dashboard.style.display = 'block';
    elements.emptyState.style.display = 'none';
    updateViewModeStatus();
}

/**
 * Show empty state, hide dashboard
 */
function showEmptyState() {
    elements.dashboard.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    updateViewModeStatus();
}

/**
 * Visible hint for current layout (dashboard content only appears after first fetch).
 */
function updateViewModeStatus() {
    const mode = state.viewMode || 'overview';
    const pill = elements.viewModeStatusPill;
    const desc = elements.viewModeStatusDesc;
    const hint = elements.viewModeStatusHint;
    if (!pill || !desc || !hint) return;

    const labels = {
        overview: {
            pill: 'Overview',
            desc: 'Org snapshot: which tab to use for cMAU vs connections vs capacity vs trends.'
        },
        cmau: {
            pill: 'cMAU',
            desc: 'Application registry, cMAU by application, gap report, MAU by SDK type.'
        },
        connections: {
            pill: 'Connections',
            desc: 'Stream mix (server / browser / mobile) and per-project share of org connection peaks.'
        },
        capacity: {
            pill: 'Capacity',
            desc: 'Utilization vs optional contracted ceilings (70% / 90% guides).'
        },
        trends: {
            pill: 'Trends',
            desc: 'Time series charts, project grid, and detailed table / CSV export.'
        }
    };
    const row = labels[mode] || labels.overview;
    pill.textContent = row.pill;
    desc.textContent = row.desc;

    const dashboardOpen = elements.dashboard && elements.dashboard.style.display !== 'none';
    if (dashboardOpen) {
        hint.textContent = '';
    } else {
        hint.textContent = ' Enter your API token and click Fetch Usage Data to load this layout.';
    }
}

// ==========================================
// API Functions
// ==========================================

/**
 * Make an authenticated API request to LaunchDarkly
 */
async function apiRequest(endpoint, params = {}, options = {}) {
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item !== undefined && item !== null && item !== '') {
                    url.searchParams.append(key, item);
                }
            });
        } else {
            url.searchParams.append(key, value);
        }
    });
    
    const headers = {
        'Authorization': state.apiKey,
        'Content-Type': 'application/json'
    };
    
    if (options.apiVersion) {
        headers['LD-API-Version'] = options.apiVersion;
    }
    
    const response = await fetch(url.toString(), {
        method: 'GET',
        headers
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
}

/** Map UI aggregation values to clientside-mau API (incremental not daily_incremental) */
function normalizeClientsideAggregation(uiValue) {
    const map = {
        rolling_30d: 'rolling_30d',
        month_to_date: 'month_to_date',
        daily_incremental: 'incremental'
    };
    return map[uiValue] || uiValue || 'rolling_30d';
}

/**
 * Paginated GET /applications
 */
async function fetchAllApplications() {
    const all = [];
    let offset = 0;
    const limit = 100;
    let attempts = 0;
    while (attempts < 500) {
        attempts += 1;
        let data;
        try {
            data = await apiRequest('/applications', { limit, offset }, { apiVersion: 'beta' });
        } catch (e) {
            data = await apiRequest('/applications', { limit, offset });
        }
        const items = data.items || [];
        if (items.length === 0) break;
        all.push(...items);
        const total = typeof data.totalCount === 'number' ? data.totalCount : null;
        if (items.length < limit || (total != null && all.length >= total)) break;
        offset += limit;
    }
    return all;
}

/**
 * GET /usage/mau/sdks — MAU broken down by SDK type
 */
async function fetchMauSdksUsage(from, to) {
    try {
        return await apiRequest('/usage/mau/sdks', {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        }, { apiVersion: 'beta' });
    } catch (e) {
        console.warn('fetchMauSdksUsage:', e.message);
        return null;
    }
}

/**
 * Clientside MAU with one or more groupBy dimensions (repeat query param).
 */
async function fetchClientsideMauGrouped(from, to, groupByList, {
    contextKinds = [],
    aggregationTypeUi = 'rolling_30d'
} = {}) {
    const params = {
        from: formatDateForApi(from),
        to: formatDateForApi(to),
        aggregationType: normalizeClientsideAggregation(aggregationTypeUi),
        groupBy: Array.isArray(groupByList) ? groupByList : [groupByList]
    };
    if (contextKinds.length) {
        params.contextKind = contextKinds;
    }
    return apiRequest('/usage/clientside-mau', params, { apiVersion: 'beta' });
}

/**
 * Convert grouped SeriesListRep to column peaks + metadata
 */
function groupedUsageToColumns(usageData) {
    if (!usageData || !Array.isArray(usageData.metadata) || !Array.isArray(usageData.series)) {
        return [];
    }
    const cols = [];
    usageData.metadata.forEach((meta, idx) => {
        const colIdx = String(idx);
        const series = [];
        usageData.series.forEach(point => {
            const date = resolveTimestamp(point);
            const raw = point[colIdx] ?? point[idx];
            if (!date || raw === undefined || raw === null) return;
            const value = Number(raw);
            if (!Number.isFinite(value)) return;
            series.push({ date, value });
        });
        cols.push({ meta, index: colIdx, peak: getPeakValue(series), series });
    });
    return cols;
}

function extractProjectId(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const id = meta.projectId ?? meta.project?.id ?? meta.project?._id;
    return id != null ? String(id) : null;
}

function extractEnvironmentId(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const id = meta.environmentId ?? meta.environment?.id ?? meta.environment?._id;
    return id != null ? String(id) : null;
}

function extractSdkAppId(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const id = meta.sdkAppId ?? meta.sdkAppID ?? meta.applicationId ?? meta.application?.key;
    if (id != null && id !== '') return String(id);
    return extractMetadataString(meta, ['sdkAppId', 'applicationId'], []);
}

function resolveProjectKeyFromId(projectId) {
    if (!projectId) return null;
    const p = state.projects.find(pr =>
        String(pr._id || pr.id) === String(projectId));
    return p ? p.key : null;
}

function resolveEnvironmentKeys(projectKey, environmentId) {
    const p = state.projects.find(pr => pr.key === projectKey);
    if (!p?.environments || !environmentId) {
        return { key: String(environmentId || ''), name: String(environmentId || '') };
    }
    const env = p.environments.find(e =>
        String(e._id || e.id) === String(environmentId) || e.key === environmentId);
    return env
        ? { key: env.key || String(environmentId), name: env.name || env.key }
        : { key: String(environmentId), name: String(environmentId) };
}

/**
 * Build a map of appKey → sorted array of project keys that app appears in,
 * derived from the triple-grouped (projectId × environmentId × sdkAppId) columns.
 */
function buildAppProjectMap(tripleCols) {
    const map = new Map();
    tripleCols.forEach(col => {
        const appKey = extractSdkAppId(col.meta);
        const pid = extractProjectId(col.meta);
        const projKey = resolveProjectKeyFromId(pid);
        if (!appKey || !projKey) return;
        if (!map.has(appKey)) map.set(appKey, new Set());
        map.get(appKey).add(projKey);
    });
    // Convert Sets to sorted arrays
    map.forEach((set, key) => map.set(key, [...set].sort()));
    return map;
}

function buildChargebackApplicationRows(columnEntries, applications, orgCmauTotal, aggregationType = 'rolling_30d', appProjectMap = null) {
    const byKey = new Map(applications.map(a => [a.key, a]));

    // Build rows from cMAU grouped data
    const rowMap = new Map();
    columnEntries.forEach(e => {
        const key = extractSdkAppId(e.meta) || `column-${e.index}`;
        const app = byKey.get(key);
        const value = getSeriesValue(e.series, aggregationType);
        const share = orgCmauTotal > 0 ? (value / orgCmauTotal) * 100 : 0;
        rowMap.set(key, {
            key,
            name: app?.name || key,
            kind: app?.kind || '—',
            peak: value,
            share,
            projects: appProjectMap ? (appProjectMap.get(key) || []) : []
        });
    });

    // Merge in all registered applications that had no cMAU data (show as 0)
    applications.forEach(app => {
        if (!rowMap.has(app.key)) {
            rowMap.set(app.key, {
                key: app.key,
                name: app.name || app.key,
                kind: app.kind || '—',
                peak: 0,
                share: 0,
                projects: appProjectMap ? (appProjectMap.get(app.key) || []) : []
            });
        }
    });

    const rows = [...rowMap.values()];
    rows.sort((a, b) => b.peak - a.peak || a.key.localeCompare(b.key));
    return rows;
}

function buildGapRows(envLevelCols, appEnvLevelCols, aggregationType = 'rolling_30d') {
    // LD's API returns unattributed cMAU as a literal sdkAppId bucket, typically "Unknown" (capital U)
    // but case can vary; match leniently.
    const isUnknownAppId = (s) => !s || String(s).toLowerCase() === 'unknown';

    const envTotals = new Map();
    envLevelCols.forEach(e => {
        const pid = extractProjectId(e.meta);
        const eid = extractEnvironmentId(e.meta);
        const pk = resolveProjectKeyFromId(pid);
        if (!pk || !eid) return;
        const k = `${pk}\t${eid}`;
        const v = getSeriesValue(e.series, aggregationType);
        envTotals.set(k, Math.max(envTotals.get(k) || 0, v));
    });

    // Split the triple-grouped data into "attributed" (named apps) and "unattributed" (Unknown bucket).
    // Surfacing the Unknown bucket directly is more accurate than envTotal - sum(apps): the triple
    // groupBy sums per (proj,env,app) which can multi-count context keys across apps and make the
    // subtraction yield 0 or negative — LD's own Unknown bucket is the authoritative per-env unattributed.
    const attributed = new Map();
    const unattributedByEnv = new Map();
    appEnvLevelCols.forEach(e => {
        const pid = extractProjectId(e.meta);
        const eid = extractEnvironmentId(e.meta);
        const appId = extractSdkAppId(e.meta);
        const pk = resolveProjectKeyFromId(pid);
        if (!pk || !eid) return;
        const k = `${pk}\t${eid}`;
        const v = getSeriesValue(e.series, aggregationType);
        if (isUnknownAppId(appId)) {
            unattributedByEnv.set(k, (unattributedByEnv.get(k) || 0) + v);
        } else {
            attributed.set(k, (attributed.get(k) || 0) + v);
        }
    });

    // Include every env that has any signal — env-total, attributed apps, or unattributed bucket.
    const allKeys = new Set([
        ...envTotals.keys(),
        ...attributed.keys(),
        ...unattributedByEnv.keys()
    ]);

    const rows = [];
    allKeys.forEach(k => {
        const [projKey, envIdPart] = k.split('\t');
        const total = envTotals.get(k) || 0;
        const attr = attributed.get(k) || 0;
        const directUnattr = unattributedByEnv.get(k) || 0;
        // Prefer LD's directly-reported Unknown bucket if present; otherwise fall back to subtraction.
        const gap = directUnattr > 0 ? directUnattr : Math.max(0, total - attr);
        // Denominator: use envTotal if it's at least as big as attr+unattr; otherwise the sum we observed.
        const denom = Math.max(total, attr + directUnattr);
        const gapPct = denom > 0 ? (gap / denom) * 100 : 0;
        const envInfo = resolveEnvironmentKeys(projKey, envIdPart);
        rows.push({
            projectKey: projKey,
            envKey: envInfo.key,
            envName: envInfo.name,
            envTotal: Math.max(total, attr + directUnattr),
            attributed: attr,
            gap,
            gapPct
        });
    });

    console.log('[buildGapRows diag]', {
        envPairCols: envLevelCols.length,
        tripleCols: appEnvLevelCols.length,
        envTotalsSize: envTotals.size,
        attributedSize: attributed.size,
        unattributedByEnvSize: unattributedByEnv.size,
        unattributedSample: [...unattributedByEnv.entries()].slice(0, 5),
        gapRowsWithNonZero: rows.filter(r => r.gap > 0).length,
        totalRows: rows.length
    });
    if (state) state.lastGapDiag = {
        unattributedByEnv: [...unattributedByEnv.entries()],
        rows
    };

    rows.sort((a, b) => b.gap - a.gap);
    return rows;
}

function flattenMauSdksPayload(data) {
    if (!data) return [];
    const rows = [];
    const visit = (obj, prefix = '') => {
        if (obj === null || obj === undefined) return;
        if (typeof obj !== 'object') {
            rows.push({ label: prefix || 'value', value: String(obj) });
            return;
        }
        if (Array.isArray(obj.series) && Array.isArray(obj.metadata)) {
            groupedUsageToColumns(obj).forEach(c => {
                rows.push({ label: `${prefix}${prefix ? ' / ' : ''}series[${c.index}]`, value: String(c.peak) });
            });
            return;
        }
        Object.entries(obj).forEach(([k, v]) => {
            if (k === '_links') return;
            const p = prefix ? `${prefix}.${k}` : k;
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                visit(v, p);
            } else if (Array.isArray(v)) {
                v.forEach((item, i) => {
                    if (typeof item === 'object') visit(item, `${p}[${i}]`);
                    else rows.push({ label: `${p}[${i}]`, value: String(item) });
                });
            } else {
                rows.push({ label: p, value: String(v) });
            }
        });
    };
    visit(data);
    return rows.slice(0, 80);
}

/**
 * Fetch list of projects (with pagination support)
 */
async function fetchProjects() {
    try {
        let allProjects = [];
        let limit = 20;
        let offset = 0;
        let hasMore = true;
        
        while (hasMore) {
            const data = await apiRequest('/projects', {
                limit,
                offset
            });
            
            const items = data.items || [];
            allProjects = allProjects.concat(items);
            
            // Check if we got fewer items than requested (last page)
            if (items.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
                // Safety check: if we've fetched a lot, stop (API might not have pagination)
                if (offset > 1000) {
                    hasMore = false;
                }
            }
            
            // Check for pagination links
            if (data._links && data._links.next) {
                // Continue with next page
            } else if (items.length === limit) {
                // No next link but got full page - might be more, try next page
            } else {
                hasMore = false;
            }
        }
        
        console.log(`Fetched ${allProjects.length} total projects`);
        return allProjects;
    } catch (error) {
        console.error('Error fetching projects:', error);
        throw error;
    }
}

/**
 * Fetch legacy MAU usage data (user-based)
 */
async function fetchLegacyMauUsage(from, to) {
    try {
        const data = await apiRequest('/usage/mau', {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        });
        return data;
    } catch (error) {
        console.error('Error fetching MAU usage:', error);
        // Return empty structure if endpoint not available
        return { _links: {}, metadata: [], series: [] };
    }
}

/**
 * Fetch client-side MAU usage (context-based)
 */
async function fetchClientsideMauUsage(from, to, { contextKinds = [], aggregationType = 'rolling_30d', groupBy = [], filters = {} } = {}) {
    const params = {
        from: formatDateForApi(from),
        to: formatDateForApi(to),
        aggregationType: normalizeClientsideAggregation(aggregationType),
        ...filters
    };

    if (contextKinds.length) {
        params.contextKind = contextKinds;
    }

    if (groupBy.length) {
        params.groupby = groupBy;
    }

    return apiRequest('/usage/clientside-mau', params, { apiVersion: 'beta' });
}

/**
 * Fetch MAU usage by project (legacy endpoint)
 */
async function fetchMauByProject(from, to, projectKey) {
    try {
        const data = await apiRequest(`/usage/mau/byproject/${projectKey}`, {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        });
        return data;
    } catch (error) {
        console.warn(`Could not fetch MAU for project ${projectKey}:`, error.message);
        return null;
    }
}

/**
 * Extract project breakdown from series data when metadata doesn't have per-project info
 */
function extractProjectsFromSeries(series, projects) {
    // This is a fallback - if the API returns series with project keys embedded
    // Try to group by project if series points have project identifiers
    const projectDataMap = new Map();
    
    series.forEach(point => {
        const date = resolveTimestamp(point);
        if (!date) return;
        
        // Check each key in the point for project identifiers
        Object.keys(point).forEach(key => {
            if (key === 'time' || key === 'timeMillis' || key === 'timestamp') return;
            
            // Skip numeric keys (these are indices, not project keys)
            if (/^\d+$/.test(key)) return;
            
            const value = Number(point[key]);
            if (!Number.isFinite(value) || value === 0) return;
            
            // Try to match key to a project (exact match first, then partial)
            let matchingProject = projects.find(p => key === p.key);
            
            if (!matchingProject) {
                matchingProject = projects.find(p => 
                    key.toLowerCase() === p.key.toLowerCase()
                );
            }
            
            if (!matchingProject) {
                matchingProject = projects.find(p => 
                    key.includes(p.key) || p.key.includes(key)
                );
            }
            
            if (matchingProject) {
                const projectKey = matchingProject.key;
                if (!projectDataMap.has(projectKey)) {
                    projectDataMap.set(projectKey, {
                        projectKey,
                        projectName: matchingProject.name,
                        series: []
                    });
                }
                projectDataMap.get(projectKey).series.push({ date, value });
            }
        });
    });
    
    projectDataMap.forEach(entry => {
        entry.series.sort((a, b) => a.date - b.date);
    });
    return Array.from(projectDataMap.values());
}

/**
 * Fetch client-side MAU grouped by project
 */
async function fetchClientsideMauByProject(from, to, options) {
    try {
        const params = {
            from: formatDateForApi(from),
            to: formatDateForApi(to),
            aggregationType: normalizeClientsideAggregation(options.aggregationType || 'rolling_30d'),
            groupBy: 'projectId'  // Use projectId for grouping
        };
        
        if (options.contextKinds && options.contextKinds.length) {
            params.contextKind = options.contextKinds;
        }
        
        // Use the clientside-mau endpoint with groupBy=projectId
        return await apiRequest('/usage/clientside-mau', params, { apiVersion: 'beta' });
    } catch (error) {
        console.warn('Grouped Client-side MAU not available:', error.message);
        return null;
    }
}

/**
 * Fetch service connections usage (server-side)
 */
async function fetchServiceConnections(from, to, groupByProject = false) {
    try {
        const params = {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        };

        if (groupByProject) {
            params.groupBy = 'projectId';
        }

        const data = await apiRequest('/usage/service-connections', params, { apiVersion: 'beta' });
        return data;
    } catch (error) {
        console.error('Error fetching service connections:', error);
        return { _links: {}, metadata: [], series: [] };
    }
}

/**
 * Fetch service connections with an arbitrary groupBy (or comma-separated list of dimensions).
 * Used for by-application allocation: groupBy='sdkAppId' or 'projectId,sdkAppId'.
 * Per the user, LD's /usage/service-connections endpoint accepts sdkAppId even though it's not documented.
 */
async function fetchServiceConnectionsBy(groupBy, from, to) {
    try {
        const params = {
            from: formatDateForApi(from),
            to: formatDateForApi(to),
            groupBy
        };
        return await apiRequest('/usage/service-connections', params, { apiVersion: 'beta' });
    } catch (error) {
        console.warn(`Service connections groupBy=${groupBy} not available:`, error.message);
        return null;
    }
}

/**
 * Fetch stream (connections) usage for browser/mobile, optionally grouped by project
 */
async function fetchStreamsUsage(source, from, to, groupBy = null) {
    try {
        const params = {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        };
        if (groupBy) params.groupBy = groupBy;
        const data = await apiRequest(`/usage/streams/${source}`, params, { apiVersion: 'beta' });
        return data;
    } catch (error) {
        console.error(`Error fetching ${source} streams:`, error);
        return { _links: {}, metadata: [], series: [] };
    }
}

/**
 * Fetch experimentation keys usage
 */
async function fetchExperimentationUsage(from, to) {
    try {
        const data = await apiRequest('/usage/experimentation-keys', {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        }, { apiVersion: 'beta' });
        return data;
    } catch (error) {
        console.warn('Experimentation usage not available:', error.message);
        return { series: [] };
    }
}

/**
 * Fetch experimentation units usage
 */
async function fetchExperimentationUnits(from, to) {
    try {
        const data = await apiRequest('/usage/experimentation-units', {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        });
        return data;
    } catch (error) {
        console.warn('Experimentation units not available:', error.message);
        return { series: [] };
    }
}

/**
 * Fetch all usage data
 */
async function fetchAllUsageData() {
    const { start, end } = getDateRange();
    const validation = validateDateRange(start, end);
    if (!validation.valid) {
        showError(validation.message);
        return;
    }
    state.dateRange = { start, end };
    
    const contextInput = elements.contextKind.value.trim();
    const contextKinds = contextInput
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const aggregationType = elements.aggregationType.value || 'rolling_30d';
    state.filters = { contextKinds, aggregationType };
    const chargebackContexts = elements.chargebackUseContextFilters?.checked ? contextKinds : [];
    
    showLoading();
    hideError();
    
    try {
        // Fetch projects first
        const projects = await fetchProjects();
        state.projects = projects;
        
        let applicationsFetchError = null;

        // Fetch shared usage, applications registry, and chargeback grouped series in parallel
        const [
            serviceConnections,
            serviceConnectionsByProject,
            clientStreams,
            mobileStreams,
            browserStreamsByProject,
            mobileStreamsByProject,
            experimentationKeys,
            applications,
            mauSdksRaw,
            cmauByAppRaw,
            envPairRaw,
            tripleRaw,
            cmauChargebackTotalRaw,
            serviceConnectionsByApp,
            serviceConnectionsByProjectApp,
            browserStreamsByApp,
            mobileStreamsByApp,
            mauDailyIncrementalRaw,
            mauBilledRaw
        ] = await Promise.all([
            fetchServiceConnections(start, end),
            fetchServiceConnections(start, end, true),
            fetchStreamsUsage('browser', start, end),
            fetchStreamsUsage('mobile', start, end),
            fetchStreamsUsage('browser', start, end, 'projectId').catch(() => null),
            fetchStreamsUsage('mobile', start, end, 'projectId').catch(() => null),
            fetchExperimentationUsage(start, end),
            fetchAllApplications().catch(err => {
                applicationsFetchError = err.message || String(err);
                console.warn('Applications list:', applicationsFetchError);
                return [];
            }),
            fetchMauSdksUsage(start, end),
            // Chargeback fetches use daily_incremental ALWAYS — we want a strict-period total
            // (sum of daily unique counts across the selected date range), regardless of which
            // Aggregation Window the user has selected for the Trends view. Caveat: users active
            // on multiple days are counted on each (the share / gap math still reconciles
            // because all four chargeback fetches use the same basis).
            fetchClientsideMauGrouped(start, end, ['sdkAppId'], {
                contextKinds: chargebackContexts,
                aggregationTypeUi: 'daily_incremental'
            }).catch(() => null),
            fetchClientsideMauGrouped(start, end, ['projectId', 'environmentId'], {
                contextKinds: chargebackContexts,
                aggregationTypeUi: 'daily_incremental'
            }).catch(() => null),
            fetchClientsideMauGrouped(start, end, ['projectId', 'environmentId', 'sdkAppId'], {
                contextKinds: chargebackContexts,
                aggregationTypeUi: 'daily_incremental'
            }).catch(() => null),
            fetchClientsideMauUsage(start, end, {
                contextKinds: chargebackContexts,
                aggregationType: 'daily_incremental'
            }).catch(() => ({ metadata: [], series: [] })),
            fetchServiceConnectionsBy('sdkAppId', start, end),
            fetchServiceConnectionsBy('projectId,sdkAppId', start, end),
            fetchStreamsUsage('browser', start, end, 'sdkAppId').catch(() => null),
            fetchStreamsUsage('mobile', start, end, 'sdkAppId').catch(() => null),
            fetchClientsideMauUsage(start, end, {
                contextKinds,
                aggregationType: 'daily_incremental'
            }).catch(() => null),
            // Billed cMAU: unfiltered + rolling 30-day. This is what LD invoices on.
            // Always fetched independently of the user's Aggregation Window / Context-kind selections
            // so the summary card always shows the contracted figure.
            fetchClientsideMauUsage(start, end, {
                contextKinds: [],
                aggregationType: 'rolling_30d'
            }).catch(() => null)
        ]);
            
        state.applications = applications;
        state.applicationsError = applicationsFetchError;

        const appCols = groupedUsageToColumns(cmauByAppRaw);
        const tripleColData = groupedUsageToColumns(tripleRaw);
        const appProjectMap = buildAppProjectMap(tripleColData);
        const cmauTSeries = extractTimeSeriesData(cmauChargebackTotalRaw);
        // Chargeback math always uses daily_incremental summing (period total), regardless of
        // the user's Aggregation Window selector. See the chargeback fetches above.
        const chargebackAgg = 'daily_incremental';
        const orgCmauChargeback = getSeriesValue(cmauTSeries, chargebackAgg);
        state.chargeback = {
            apps: buildChargebackApplicationRows(appCols, applications, orgCmauChargeback, chargebackAgg, appProjectMap),
            gap: buildGapRows(groupedUsageToColumns(envPairRaw), tripleColData, chargebackAgg),
            mauSdks: mauSdksRaw,
            orgCmauTotal: orgCmauChargeback
        };
        
        // Fetch MAU data (prioritize client-side endpoint, fallback to legacy)
        let mauData;
        let projectUsageEntries = [];
        let mauSource = 'clientside';

        try {
            mauData = await fetchClientsideMauUsage(start, end, {
                contextKinds,
                aggregationType
            });
            
            // Try grouped endpoint first, but if it only returns 1 entry, fall back to per-project fetching
            const groupedProjects = await fetchClientsideMauByProject(start, end, {
                contextKinds,
                aggregationType
            });
            
            // Check if grouped response has multiple projects (groupby worked)
            if (groupedProjects && groupedProjects.metadata && groupedProjects.series && groupedProjects.metadata.length > 1) {
                try {
                    const transformed = transformProjectGroupResponse(groupedProjects);
                    
                    // Filter out invalid entries
                    projectUsageEntries = transformed.filter(entry => {
                        const key = entry.projectKey;
                        return key && 
                            !key.startsWith('unknown-project-') && 
                            !key.startsWith('deleted-project-') &&
                            key !== 'series' && 
                            !key.includes('Context:');
                    });
                    
                } catch (transformError) {
                    console.error('Error transforming grouped response:', transformError);
                    projectUsageEntries = [];
                }
            } else {
                // Grouped response has only 1 entry (aggregated total)
                // The API's groupby=project parameter doesn't seem to work for clientside-mau
                // Per-project endpoints have CORS issues, so we can't fetch individual project data
                console.warn('Grouped response has only 1 metadata entry - per-project breakdown not available via API');
                console.warn('The groupby=project parameter does not appear to work for /usage/clientside-mau endpoint');
                console.warn('Per-project endpoints are blocked by CORS policy');
                
                // Leave projectUsageEntries empty - projects will show 0 MAU
                // The aggregate total will still be shown in the summary card
                projectUsageEntries = [];
            }
        } catch (clientError) {
            console.error('Client-side MAU endpoint error:', clientError);
            const errorMessage = clientError.message || String(clientError);
            
            // Check if it's a date range limitation
            if (errorMessage.includes('date') || errorMessage.includes('range') || errorMessage.includes('limit') || errorMessage.includes('maximum')) {
                showError(`Date range too large: ${errorMessage}. Try a shorter time period (e.g., 90 days or less).`);
            } else {
                showError(`Failed to fetch Client-side MAU: ${errorMessage}`);
            }
            
            // Don't fall back to legacy endpoint - it has CORS issues and requires beta header
            mauSource = 'clientside';
            mauData = { _links: {}, metadata: [], series: [] };
            projectUsageEntries = [];
            
            // Still try to show other data (connections, etc.)
            // Don't return early, continue to update dashboard with available data
        }

        // Store MAU data
        state.usageData.mau = mauData;
        state.usageData.mauSource = mauSource;
        
        // Combine stream data
        state.usageData.streams = {
            server: serviceConnections,
            browser: clientStreams,
            mobile: mobileStreams
        };
        
        // Store per-project connections data (server always; browser/mobile when API supports groupBy)
        let projectConnectionsEntries = [];
        if (serviceConnectionsByProject && serviceConnectionsByProject.metadata && serviceConnectionsByProject.metadata.length > 1) {
            projectConnectionsEntries = transformProjectGroupResponse(serviceConnectionsByProject);
        }
        state.usageData.projectConnections = projectConnectionsEntries;

        state.usageData.projectConnectionsBrowser = (browserStreamsByProject?.metadata?.length > 1)
            ? transformProjectGroupResponse(browserStreamsByProject)
            : null;
        state.usageData.projectConnectionsMobile = (mobileStreamsByProject?.metadata?.length > 1)
            ? transformProjectGroupResponse(mobileStreamsByProject)
            : null;

        // Raw by-application connection responses (server + browser + mobile, each grouped by sdkAppId).
        // serviceConnectionsByProjectApp adds projectId for the app→project mapping.
        state.usageData.serviceConnectionsByApp = serviceConnectionsByApp;
        state.usageData.serviceConnectionsByProjectApp = serviceConnectionsByProjectApp;
        state.usageData.browserStreamsByApp = browserStreamsByApp;
        state.usageData.mobileStreamsByApp = mobileStreamsByApp;

        // Daily-incremental cMAU series used for the "cumulative unique users (approx)" chart line.
        // Independent of the user's selected chargeback aggregation so the chart always has a stable basis.
        state.usageData.mauDailyIncremental = mauDailyIncrementalRaw;

        // Billed cMAU: unfiltered rolling 30-day series. Drives the headline summary card and the
        // chart's "Rolling 30-day cMAU (billed)" reference line. Decoupled from user filters so
        // it always reflects what LD invoices on.
        state.usageData.mauBilled = mauBilledRaw;
        
        // Store experimentation data
        state.usageData.experiments = experimentationKeys;
        
        state.usageData.projectMau = projectUsageEntries;
        
        // Update the dashboard
        updateDashboard();
        showDashboard();
        
    } catch (error) {
        console.error('Error fetching usage data:', error);
        showError(error.message);
    } finally {
        hideLoading();
    }
}

// ==========================================
// Dashboard Update Functions
// ==========================================

/**
 * Update all dashboard components
 */
function updateDashboard() {
    updateSummaryCards();
    renderApplicationsRegistry();
    renderConnectionsPanel();
    updateCharts();
    updateProjectGrid();
    updateDataTable();
    renderChargebackTables();
    updateCapacityMeters();
    applyViewModeLayout();
}

function renderApplicationsRegistry() {
    const err = state.applicationsError;
    const section = document.getElementById('applications-registry-section');

    // Show the section only when there is an API error to surface
    if (section) section.style.display = err ? 'block' : 'none';

    if (elements.applicationsFetchError) {
        if (err) {
            elements.applicationsFetchError.style.display = 'block';
            elements.applicationsFetchError.textContent =
                `Could not load applications (403/401 usually means the token lacks Applications access): ${err}`;
        } else {
            elements.applicationsFetchError.style.display = 'none';
            elements.applicationsFetchError.textContent = '';
        }
    }
}

function getTotalCmauPeak() {
    const mauSeries = extractTimeSeriesData(state.usageData.mau);
    return getSeriesValue(mauSeries, state.filters?.aggregationType || 'rolling_30d');
}

function getTotalConnectionsPeak() {
    let total = 0;
    ['server', 'browser', 'mobile'].forEach(source => {
        const streamData = state.usageData.streams?.[source];
        if (streamData) {
            const series = extractTimeSeriesData(streamData);
            const peak = series.reduce((max, point) => Math.max(max, point.value), 0);
            total += peak;
        }
    });
    return total;
}

function getPeakForStreamSource(source) {
    const streamData = state.usageData.streams?.[source];
    if (!streamData) return 0;
    const series = extractTimeSeriesData(streamData);
    return getPeakValue(series);
}

function computeProjectConnectionRows() {
    function buildConnMap(entries) {
        const map = new Map();
        (entries || []).forEach(entry => {
            const key = entry.projectKey;
            if (!key || key.startsWith('unknown-project-') || key.startsWith('deleted-project-') ||
                key === 'series' || key.includes('Context:')) return;
            const series = entry.series || extractTimeSeriesData(entry.data);
            map.set(key, {
                projectKey: key,
                projectName: entry.projectName || entry.projectKey,
                connections: getPeakValue(series)
            });
        });
        return map;
    }

    const serverMap = buildConnMap(state.usageData.projectConnections);
    const browserEntries = state.usageData.projectConnectionsBrowser;
    const mobileEntries = state.usageData.projectConnectionsMobile;
    const browserMap = browserEntries ? buildConnMap(browserEntries) : null;
    const mobileMap = mobileEntries ? buildConnMap(mobileEntries) : null;

    const hasBrowserByProject = browserMap !== null && browserMap.size > 0;
    const hasMobileByProject = mobileMap !== null && mobileMap.size > 0;

    // Denominator is the sum of peaks for whichever sources we have per-project data for,
    // so shares are computed over the same universe as the numerators.
    const attributablePeak = getPeakForStreamSource('server')
        + (hasBrowserByProject ? getPeakForStreamSource('browser') : 0)
        + (hasMobileByProject ? getPeakForStreamSource('mobile') : 0);

    const allKeys = new Set([
        ...state.projects.map(p => p.key),
        ...serverMap.keys(),
        ...(hasBrowserByProject ? browserMap.keys() : []),
        ...(hasMobileByProject ? mobileMap.keys() : [])
    ]);

    let rows = [];
    allKeys.forEach(key => {
        const proj = state.projects.find(p => p.key === key);
        const serverConn = serverMap.get(key)?.connections || 0;
        const browserConn = hasBrowserByProject ? (browserMap.get(key)?.connections || 0) : 0;
        const mobileConn = hasMobileByProject ? (mobileMap.get(key)?.connections || 0) : 0;
        rows.push({
            key,
            name: proj?.name || serverMap.get(key)?.projectName || key,
            connections: serverConn + browserConn + mobileConn
        });
    });

    rows = rows.map(r => ({
        ...r,
        share: attributablePeak > 0 ? (r.connections / attributablePeak) * 100 : 0
    }));
    rows.sort((a, b) => b.connections - a.connections);
    return { rows, orgTotal: getTotalConnectionsPeak(), hasBrowserByProject, hasMobileByProject };
}

function renderStreamSourceCards() {
    const el = elements.streamSourceCards;
    if (!el) return;

    const labels = {
        server: 'Server (service-connections)',
        browser: 'Browser streams',
        mobile: 'Mobile streams'
    };
    const keys = ['server', 'browser', 'mobile'];
    const peaks = Object.fromEntries(keys.map(k => [k, getPeakForStreamSource(k)]));
    const total = keys.reduce((s, k) => s + peaks[k], 0);

    el.innerHTML = keys
        .map(key => {
            const pct = total > 0 ? ((peaks[key] / total) * 100).toFixed(1) : '0.0';
            return `
        <div class="stream-source-card">
            <span class="stream-source-label">${labels[key]}</span>
            <span class="stream-source-value">${formatNumber(peaks[key])}</span>
            <span class="stream-source-meta">Peak in period · ${pct}% of summed peaks</span>
        </div>`;
        })
        .join('');
}

function renderConnectionsAllocation() {
    const tbody = elements.connectionsAllocationBody;
    const emptyEl = elements.connectionsAllocationEmpty;
    const noteEl = document.getElementById('connections-attribution-note');
    if (!tbody) return;

    const entries = state.usageData.projectConnections || [];
    if (!entries.length) {
        tbody.innerHTML = '';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.textContent =
                'No per-project connection breakdown for this period (grouped service-connections data unavailable).';
        }
        if (noteEl) noteEl.style.display = 'none';
        return;
    }

    const { rows, hasBrowserByProject, hasMobileByProject } = computeProjectConnectionRows();
    const nonzero = rows.filter(r => r.connections > 0);
    if (!nonzero.length) {
        tbody.innerHTML = '';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.textContent =
                'Per-project connection peaks are zero or not attributed for this period.';
        }
        if (noteEl) noteEl.style.display = 'none';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    tbody.innerHTML = nonzero
        .map(
            r => `
        <tr>
            <td>
                <span class="conn-proj-name">${escapeHtml(r.name)}</span>
                <code class="conn-proj-key">${escapeHtml(r.key)}</code>
            </td>
            <td class="num">${formatNumber(r.connections)}</td>
            <td class="num">${Number(r.share).toFixed(2)}%</td>
        </tr>`
        )
        .join('');

    if (noteEl) {
        const missing = [];
        if (!hasBrowserByProject) missing.push('browser');
        if (!hasMobileByProject) missing.push('mobile');
        if (missing.length > 0) {
            const missingLabel = missing.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' and ');
            noteEl.textContent = `Share is of server connections only. ${missingLabel} stream${missing.length > 1 ? 's' : ''} cannot be broken down per project via the API — see stream sources above for org-level ${missing.join('/')} totals.`;
            noteEl.style.display = 'block';
        } else {
            noteEl.style.display = 'none';
        }
    }
}

function computeAppConnectionRows() {
    const isUnknownAppId = (s) => !s || String(s).toLowerCase() === 'unknown';

    // Peak per app across the three by-app responses (server + browser + mobile).
    const perApp = new Map();
    const sources = [
        { src: 'server', raw: state.usageData.serviceConnectionsByApp },
        { src: 'browser', raw: state.usageData.browserStreamsByApp },
        { src: 'mobile', raw: state.usageData.mobileStreamsByApp }
    ];

    sources.forEach(({ src, raw }) => {
        if (!raw || !Array.isArray(raw.metadata) || raw.metadata.length === 0) return;
        const cols = groupedUsageToColumns(raw);
        cols.forEach(col => {
            const rawAppId = extractSdkAppId(col.meta);
            const key = isUnknownAppId(rawAppId) ? 'unknown' : rawAppId;
            if (!key) return;
            const peak = getPeakValue(col.series);
            const cur = perApp.get(key) || { server: 0, browser: 0, mobile: 0 };
            cur[src] = (cur[src] || 0) + peak;
            perApp.set(key, cur);
        });
    });

    // App → set of project keys, derived from the projectId+sdkAppId server-connections groupBy.
    const appProjectMap = new Map();
    const projectAppRaw = state.usageData.serviceConnectionsByProjectApp;
    if (projectAppRaw && Array.isArray(projectAppRaw.metadata) && projectAppRaw.metadata.length > 0) {
        const cols = groupedUsageToColumns(projectAppRaw);
        cols.forEach(col => {
            const rawAppId = extractSdkAppId(col.meta);
            const appKey = isUnknownAppId(rawAppId) ? 'unknown' : rawAppId;
            const pid = extractProjectId(col.meta);
            const projKey = resolveProjectKeyFromId(pid);
            if (!appKey || !projKey) return;
            if (!appProjectMap.has(appKey)) appProjectMap.set(appKey, new Set());
            appProjectMap.get(appKey).add(projKey);
        });
    }

    const byKey = new Map((state.applications || []).map(a => [a.key, a]));

    const rowMap = new Map();
    perApp.forEach((bySrc, key) => {
        const peak = (bySrc.server || 0) + (bySrc.browser || 0) + (bySrc.mobile || 0);
        const app = byKey.get(key);
        const isUnknown = key === 'unknown';
        rowMap.set(key, {
            key,
            name: app?.name || key,
            kind: app?.kind || (isUnknown ? '—' : '—'),
            peak,
            byServer: bySrc.server || 0,
            byBrowser: bySrc.browser || 0,
            byMobile: bySrc.mobile || 0,
            projects: [...(appProjectMap.get(key) || [])].sort(),
            isUnknown
        });
    });

    // Include every registered application (zero peaks too), mirroring buildChargebackApplicationRows.
    (state.applications || []).forEach(app => {
        if (!rowMap.has(app.key)) {
            rowMap.set(app.key, {
                key: app.key,
                name: app.name || app.key,
                kind: app.kind || '—',
                peak: 0,
                byServer: 0,
                byBrowser: 0,
                byMobile: 0,
                projects: [...(appProjectMap.get(app.key) || [])].sort(),
                isUnknown: false
            });
        }
    });

    const totalPeak = [...rowMap.values()].reduce((s, r) => s + r.peak, 0);
    const rows = [...rowMap.values()].map(r => ({
        ...r,
        share: totalPeak > 0 ? (r.peak / totalPeak) * 100 : 0
    }));
    rows.sort((a, b) => b.peak - a.peak || a.key.localeCompare(b.key));
    return { rows, totalPeak };
}

function renderConnectionsByApp() {
    const tbody = elements.connectionsByAppBody;
    const emptyEl = elements.connectionsByAppEmpty;
    const metaEl = elements.connectionsByAppMeta;
    if (!tbody) return;

    const hasAnyRaw = !!(state.usageData.serviceConnectionsByApp?.metadata?.length
        || state.usageData.browserStreamsByApp?.metadata?.length
        || state.usageData.mobileStreamsByApp?.metadata?.length);

    if (!hasAnyRaw) {
        tbody.innerHTML = '';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.textContent =
                'No per-application connection breakdown returned for this period. Confirm SDKs send application.id and that the groupBy=sdkAppId endpoint is available on your plan.';
        }
        if (metaEl) metaEl.textContent = '';
        return;
    }

    const { rows } = computeAppConnectionRows();
    const withConn = rows.filter(r => r.peak > 0).length;
    if (metaEl) {
        metaEl.textContent = rows.length
            ? `${rows.length} registered · ${withConn} with attributed connections`
            : '';
    }

    const hideZero = document.getElementById('hide-zero-conn-apps')?.checked;
    const display = hideZero ? rows.filter(r => r.peak > 0) : rows;

    if (!display.length) {
        tbody.innerHTML = '';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.textContent = hideZero && rows.length
                ? 'No applications have attributed connections for this period. Uncheck "Hide unused" to see all registered apps.'
                : 'No per-application connection data for this period.';
        }
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    tbody.innerHTML = display.map(r => {
        const rowClass = [
            r.peak === 0 ? 'row-zero' : '',
            r.isUnknown ? 'row-unattributed' : ''
        ].filter(Boolean).join(' ');
        const displayName = r.isUnknown ? 'Unattributed (no application.id)' : r.name;
        return `
            <tr class="${rowClass}">
                <td><code>${escapeHtml(r.key)}</code></td>
                <td>${escapeHtml(displayName)}</td>
                <td>${escapeHtml(String(r.kind))}</td>
                <td class="proj-tags-cell">${
                    r.projects && r.projects.length
                        ? r.projects.map(p => `<span class="proj-tag">${escapeHtml(p)}</span>`).join('')
                        : '<span class="proj-tag-none">—</span>'
                }</td>
                <td class="num">${formatNumber(r.peak)}</td>
                <td class="num">${Number(r.share).toFixed(2)}%</td>
            </tr>
        `;
    }).join('');
}

function renderConnectionsPanel() {
    renderStreamSourceCards();
    renderConnectionsAllocation();
    renderConnectionsByApp();
}

function setViewMode(mode) {
    state.viewMode = mode;
    try {
        localStorage.setItem('ld-billing-view-mode', mode);
    } catch (e) { /* ignore */ }

    // Keep hidden tab buttons in sync
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
        const active = btn.dataset.viewMode === mode;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // Reflect active mode on the summary nav cards
    document.querySelectorAll('.summary-card[data-view-mode]').forEach(card => {
        card.classList.remove('is-nav-active');
    });
    const activeCard = document.querySelector(`.summary-card[data-view-mode="${mode}"]`);
    if (activeCard) activeCard.classList.add('is-nav-active');

    applyViewModeLayout();
    if (mode === 'trends') {
        requestAnimationFrame(() => {
            updateCharts();
        });
    }
    updateViewModeStatus();
}

function renderChargebackTables() {
    const { apps, gap, mauSdks } = state.chargeback || { apps: [], gap: [], mauSdks: null };

    if (elements.chargebackAppsBody) {
        const metaEl = document.getElementById('chargeback-apps-meta');
        const hideZero = document.getElementById('hide-zero-cmau-apps')?.checked;
        const withUsage = apps.filter(r => r.peak > 0).length;

        if (metaEl) {
            metaEl.textContent = apps.length
                ? `${apps.length} registered · ${withUsage} with attributed cMAU`
                : '';
        }

        const displayApps = hideZero ? apps.filter(r => r.peak > 0) : apps;

        if (!displayApps.length) {
            if (elements.chargebackAppsEmpty) {
                elements.chargebackAppsEmpty.style.display = 'block';
                elements.chargebackAppsEmpty.textContent = hideZero && apps.length
                    ? 'No applications have attributed cMAU for this period. Uncheck "Hide unused" to see all registered apps.'
                    : 'No application-level cMAU data for this period. Confirm SDKs send application.id and that the groupBy endpoint is available on your plan.';
            }
            elements.chargebackAppsBody.innerHTML = '';
        } else {
            if (elements.chargebackAppsEmpty) elements.chargebackAppsEmpty.style.display = 'none';
            elements.chargebackAppsBody.innerHTML = displayApps.map(r => {
                const isUnattributed = r.key === 'unknown';
                const rowClass = [
                    r.peak === 0 ? 'row-zero' : '',
                    isUnattributed ? 'row-unattributed' : ''
                ].filter(Boolean).join(' ');
                const displayName = isUnattributed ? 'Unattributed (no application.id)' : r.name;
                return `
                <tr class="${rowClass}">
                    <td><code>${escapeHtml(r.key)}</code></td>
                    <td>${escapeHtml(displayName)}</td>
                    <td>${escapeHtml(String(r.kind))}</td>
                    <td class="proj-tags-cell">${
                        r.projects && r.projects.length
                            ? r.projects.map(p => `<span class="proj-tag">${escapeHtml(p)}</span>`).join('')
                            : '<span class="proj-tag-none">—</span>'
                    }</td>
                    <td class="num">${formatNumber(r.peak)}</td>
                    <td class="num">${Number(r.share).toFixed(2)}%</td>
                </tr>
            `;
            }).join('');
        }
    }

    if (elements.chargebackGapBody) {
        if (!gap.length) {
            if (elements.chargebackGapEmpty) elements.chargebackGapEmpty.style.display = 'block';
            elements.chargebackGapBody.innerHTML = '';
        } else {
            if (elements.chargebackGapEmpty) elements.chargebackGapEmpty.style.display = 'none';
            elements.chargebackGapBody.innerHTML = gap.map(r => `
                <tr>
                    <td><code>${escapeHtml(r.projectKey)}</code></td>
                    <td>${escapeHtml(r.envKey)}</td>
                    <td class="num">${formatNumber(r.envTotal)}</td>
                    <td class="num">${formatNumber(r.attributed)}</td>
                    <td class="num">${formatNumber(r.gap)}</td>
                    <td class="num">${Number(r.gapPct).toFixed(2)}%</td>
                </tr>
            `).join('');
        }
    }

    if (elements.chargebackSdksBody) {
        const flat = flattenMauSdksPayload(mauSdks);
        if (!flat.length) {
            if (elements.chargebackSdksEmpty) elements.chargebackSdksEmpty.style.display = 'block';
            elements.chargebackSdksBody.innerHTML = '';
        } else {
            if (elements.chargebackSdksEmpty) elements.chargebackSdksEmpty.style.display = 'none';
            elements.chargebackSdksBody.innerHTML = flat.map(row => `
                <tr>
                    <td>${escapeHtml(row.label)}</td>
                    <td class="num">${escapeHtml(row.value)}</td>
                </tr>
            `).join('');
        }
    }
}

function updateCapacityMeters() {
    if (!elements.meterCmauFill || !elements.meterConnFill) return;

    const peakCmau = getTotalCmauPeak();
    const peakConn = getTotalConnectionsPeak();
    const limCmau = parseFloat(elements.capacityCmauLimit?.value, 10);
    const limConn = parseFloat(elements.capacityConnLimit?.value, 10);

    function paintMeter(fillEl, labelEl, noteEl, peak, limit, name) {
        if (!Number.isFinite(limit) || limit <= 0) {
            fillEl.style.width = '0%';
            fillEl.classList.remove('meter-warn', 'meter-danger');
            labelEl.textContent = `${formatNumber(peak)} / —`;
            noteEl.textContent = `Enter contracted ${name} in Configuration to see utilization.`;
            return;
        }
        const pct = Math.min(100, (peak / limit) * 100);
        fillEl.style.width = `${pct}%`;
        labelEl.textContent = `${formatNumber(peak)} / ${formatNumber(limit)} (${pct.toFixed(1)}%)`;
        fillEl.classList.toggle('meter-warn', pct >= 70 && pct < 90);
        fillEl.classList.toggle('meter-danger', pct >= 90);
        if (pct >= 90) {
            noteEl.textContent = 'At or above 90% — escalate per your capacity playbook.';
        } else if (pct >= 70) {
            noteEl.textContent = 'At or above 70% — notify the owning team.';
        } else {
            noteEl.textContent = 'Below 70% internal alert threshold.';
        }
    }

    paintMeter(elements.meterCmauFill, elements.meterCmauLabel, elements.meterCmauNote, peakCmau, limCmau, 'cMAU');
    paintMeter(elements.meterConnFill, elements.meterConnLabel, elements.meterConnNote, peakConn, limConn, 'service connections');
}

function applyViewModeLayout() {
    const mode = state.viewMode || 'overview';

    const panelForMode = {
        overview: elements.panelOverview,
        cmau: elements.panelCmau,
        connections: elements.panelConnections,
        capacity: elements.panelCapacity,
        trends: elements.panelTrends
    };

    Object.entries(panelForMode).forEach(([id, el]) => {
        if (!el) return;
        const active = mode === id;
        el.style.display = active ? 'block' : 'none';
        el.classList.toggle('is-active', active);
    });

    if (elements.breakdownHeading) {
        elements.breakdownHeading.textContent = 'Usage by Project';
    }
}

/**
 * Update summary cards with totals
 */
function updateSummaryCards() {
    const { start, end } = state.dateRange;
    const periodText = `${formatDate(start)} - ${formatDate(end)}`;

    // Billed cMAU = peak of the unfiltered rolling-30-day series. Falls back to the user-filtered
    // series only if the dedicated billed fetch wasn't available.
    const billedSeries = extractTimeSeriesData(state.usageData.mauBilled);
    const filteredSeries = extractTimeSeriesData(state.usageData.mau);
    const sourceSeries = billedSeries.length ? billedSeries : filteredSeries;
    const totalMau = sourceSeries.reduce((max, point) => Math.max(max, point.value), 0);
    elements.totalCmau.textContent = formatNumber(totalMau);
    elements.cmauPeriod.textContent = billedSeries.length
        ? 'Peak rolling 30-day · billed cMAU'
        : 'Peak rolling 30-day · (filtered fallback)';

    // Calculate total connections
    let totalConnections = 0;
    ['server', 'browser', 'mobile'].forEach(source => {
        const streamData = state.usageData.streams?.[source];
        if (streamData) {
            const series = extractTimeSeriesData(streamData);
            const peak = series.reduce((max, point) => Math.max(max, point.value), 0);
            totalConnections += peak;
        } else {
            console.warn(`No stream data for ${source}`);
        }
    });

    elements.totalConnections.textContent = formatNumber(totalConnections);
    elements.connectionsPeriod.textContent = 'Peak in period';

    // Experimentation keys
    const experimentSeries = extractTimeSeriesData(state.usageData.experiments);
    const totalExperiments = experimentSeries.reduce((max, point) => Math.max(max, point.value), 0);
    elements.totalExperiments.textContent = formatNumber(totalExperiments);
    elements.experimentsPeriod.textContent = periodText;
    
    // Capacity card: when a contracted limit is set for either dimension, show BOTH percentages
    // side-by-side. Falls back to project count when neither limit is configured so the card
    // still has signal pre-configuration.
    const cap = computeCapacitySummary();
    const valueEl = elements.totalCapacity || elements.totalProjects;
    const subtitleEl = elements.capacityCardSubtitle;
    if (valueEl) {
        if (cap.cmauPct === null && cap.connPct === null) {
            const projectCount = state.usageData.projectMau && state.usageData.projectMau.length > 0
                ? state.usageData.projectMau.length
                : state.projects.length;
            valueEl.textContent = formatNumber(projectCount);
            if (subtitleEl) subtitleEl.textContent = 'Projects with usage data · set a contracted limit to track capacity';
        } else {
            valueEl.innerHTML = renderCapacitySplit(cap);
            if (subtitleEl) {
                const partial = (cap.cmauPct === null || cap.connPct === null);
                subtitleEl.textContent = partial
                    ? 'Set the other contracted limit to compare both dimensions'
                    : `Utilization vs contracted limits · click for capacity panel`;
            }
        }
    }
}

function renderCapacitySplit(cap) {
    const cell = (label, pct) => {
        if (pct === null) {
            return `<div class="capacity-stat">
                        <span class="capacity-stat-label">${escapeHtml(label)}</span>
                        <span class="capacity-stat-value">—</span>
                    </div>`;
        }
        const cls = pct >= 90 ? 'is-danger' : (pct >= 70 ? 'is-warn' : '');
        return `<div class="capacity-stat">
                    <span class="capacity-stat-label">${escapeHtml(label)}</span>
                    <span class="capacity-stat-value ${cls}">${pct.toFixed(1)}%</span>
                </div>`;
    };
    return `
        <div class="capacity-split">
            ${cell('cMAU', cap.cmauPct)}
            <div class="capacity-stat-divider"></div>
            ${cell('Conn', cap.connPct)}
        </div>
    `;
}

function computeCapacitySummary() {
    const peakCmau = getTotalCmauPeak();
    const peakConn = getTotalConnectionsPeak();
    const limCmau = parseFloat(elements.capacityCmauLimit?.value);
    const limConn = parseFloat(elements.capacityConnLimit?.value);

    const cmauPct = Number.isFinite(limCmau) && limCmau > 0 ? (peakCmau / limCmau) * 100 : null;
    const connPct = Number.isFinite(limConn) && limConn > 0 ? (peakConn / limConn) * 100 : null;

    return { cmauPct, connPct };
}

/**
 * Extract time series data for charts
 */
function extractTimeSeriesData(usageData) {
    if (!usageData || !Array.isArray(usageData.series)) {
        return [];
    }

    const firstSeries = usageData.series[0];

    // Newer usage endpoints return objects with a time field and numbered keys
    if (firstSeries && typeof firstSeries === 'object' && !Array.isArray(firstSeries)) {
        const points = usageData.series.map(point => {
            const timestamp = point.time || point.timeMillis || point.timestamp;
            if (!timestamp) {
                return null;
            }
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                return null;
            }

            const keys = Object.keys(point).filter(key => key !== 'time' && key !== 'timeMillis' && key !== 'timestamp');
            if (keys.length === 0) {
                return null;
            }

            const value = keys.reduce((sum, key) => {
                const numericValue = Number(point[key]);
                return Number.isFinite(numericValue) ? sum + numericValue : sum;
            }, 0);

            return { date, value };
        }).filter(Boolean);

        return points.sort((a, b) => a.date - b.date);
    }

    // Legacy shape: metadata array containing timestamps, series arrays containing values
    if (Array.isArray(usageData.metadata)) {
        const timestamps = usageData.metadata.map(m => new Date(m.time || m));
        const result = [];

        usageData.series.forEach(seriesGroup => {
            if (Array.isArray(seriesGroup)) {
                seriesGroup.forEach((value, idx) => {
                    const date = timestamps[idx];
                    if (date instanceof Date && !isNaN(date.getTime()) && value !== null && value !== undefined) {
                        result.push({ date, value: Number(value) || 0 });
                    }
                });
            }
        });

        return result.sort((a, b) => a.date - b.date);
    }

    return [];
}

/**
 * Extract grouped project usage from a usage response
 */
function transformProjectGroupResponse(usageData) {
    if (!usageData || !Array.isArray(usageData.metadata) || !Array.isArray(usageData.series)) {
        console.warn('Invalid grouped response structure:', { 
            hasMetadata: !!usageData.metadata, 
            hasSeries: !!usageData.series,
            metadataType: Array.isArray(usageData.metadata),
            seriesType: Array.isArray(usageData.series)
        });
        return [];
    }

    const columns = usageData.metadata.map((meta, idx) => {
        const info = deriveMetadataLabel(meta);

        // Skip if deriveMetadataLabel returned null (invalid metadata)
        if (!info) {
            console.warn(`Skipping metadata ${idx} - could not derive project info`, meta);
            return null;
        }
        
        // Try to match with actual projects from state
        const matchingProject = state.projects.find(p => 
            p.key === info.projectKey || 
            p.name === info.projectName ||
            (info.projectKey && p.key.toLowerCase() === info.projectKey.toLowerCase()) ||
            (info.projectName && p.name && p.name.toLowerCase() === info.projectName.toLowerCase())
        );
        
        // If we still don't have a project key, try to extract it directly from metadata
        let finalProjectKey = matchingProject?.key || info.projectKey;
        let finalProjectName = matchingProject?.name || info.projectName;
        
        if (!finalProjectKey && meta) {
            // Check for projectId (the API returns project IDs, not keys)
            if (meta.projectId && meta.projectId.trim()) {
                // Find project by ID (try various ID field names and formats)
                const projectById = state.projects.find(p => {
                    const pId = p._id || p.id;
                    return pId === meta.projectId || 
                           String(pId) === String(meta.projectId) ||
                           pId?.toString() === meta.projectId?.toString();
                });
                if (projectById) {
                    finalProjectKey = projectById.key;
                    finalProjectName = projectById.name;
                } else {
                    // If we can't find by ID, the project might be deleted or ID format differs
                    // Still create an entry but mark it for filtering
                    console.warn(`Could not find project by ID ${meta.projectId} - project may have been deleted or ID format differs`);
                    finalProjectKey = `deleted-project-${meta.projectId}`;
                    finalProjectName = `Deleted Project (${meta.projectId.substring(0, 8)}...)`;
                }
            } else if (meta.project) {
                finalProjectKey = typeof meta.project === 'string' ? meta.project : (meta.project.key || meta.project.name);
                finalProjectName = typeof meta.project === 'string' ? meta.project : (meta.project.name || meta.project.key);
            } else if (meta.projectKey) {
                finalProjectKey = meta.projectKey;
            } else if (meta.key && typeof meta.key === 'string' && !['series', 'metadata'].includes(meta.key.toLowerCase())) {
                finalProjectKey = meta.key;
            }
        }
        
        // Last resort: use index but log warning
        if (!finalProjectKey || finalProjectKey === 'series') {
            console.warn(`Could not determine project key for metadata ${idx}, using index`, meta);
            finalProjectKey = `unknown-project-${idx}`;
            finalProjectName = `Unknown Project ${idx + 1}`;
        }
        
        return {
            index: idx.toString(),
            projectKey: finalProjectKey,
            projectName: finalProjectName || finalProjectKey
        };
    }).filter(col => col !== null); // Filter out null entries

    const seriesByColumn = columns.reduce((acc, col) => {
        acc[col.index] = [];
        return acc;
    }, {});

    usageData.series.forEach(point => {
        const date = resolveTimestamp(point);
        if (!date) return;
        columns.forEach(col => {
            const rawValue = point[col.index];
            if (rawValue === undefined || rawValue === null) return;
            const value = Number(rawValue);
            if (!Number.isFinite(value)) return;
            seriesByColumn[col.index].push({ date, value });
        });
    });

    return columns.map(col => ({
        projectKey: col.projectKey,
        projectName: col.projectName,
        series: (seriesByColumn[col.index] || []).sort((a, b) => a.date - b.date)
    }));
}

/**
 * Try to derive a human-readable label from metadata
 */
function deriveMetadataLabel(meta) {
    // Exclude common non-project keys that might appear in metadata
    const excludeKeys = ['series', 'metadata', '_links', 'time', 'timestamp', 'timeMillis', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    
    // First, try direct property access (most common case)
    if (meta && typeof meta === 'object') {
        // Check if meta itself has project info
        if (meta.project) {
            const project = meta.project;
            if (typeof project === 'string') {
                return { projectKey: project, projectName: project, label: project };
            } else if (typeof project === 'object') {
                return {
                    projectKey: project.key || project.projectKey || project.name,
                    projectName: project.name || project.projectName || project.key,
                    label: project.name || project.key || project.projectKey
                };
            }
        }
        
        // Check for projectId (API returns IDs, need to map to project keys)
        if (meta.projectId && meta.projectId.trim()) {
            // Try to find project by various ID fields
            const projectById = state.projects.find(p => {
                const pId = p._id || p.id;
                return pId === meta.projectId || 
                       String(pId) === String(meta.projectId) ||
                       pId?.toString() === meta.projectId?.toString();
            });
            if (projectById) {
                return { projectKey: projectById.key, projectName: projectById.name, label: projectById.name || projectById.key };
            } else {
                // Project not found - might be deleted, return null so it gets filtered out
                return null;
            }
        }
        
        // Check for projectKey directly
        if (meta.projectKey && typeof meta.projectKey === 'string') {
            return { projectKey: meta.projectKey, projectName: meta.projectName || meta.projectKey, label: meta.projectName || meta.projectKey };
        }
    }
    
    // Fall back to recursive search
    const projectKey = extractMetadataString(meta, ['projectKey', 'project'], excludeKeys);
    const projectName = extractMetadataString(meta, ['projectName', 'name', 'label', 'displayName', 'title'], excludeKeys);
    const contextKind = extractMetadataString(meta, ['contextKind'], excludeKeys);
    
    // Only use contextKind as fallback if we have no project info
    const label = projectName || projectKey || (contextKind ? `Context: ${contextKind}` : null);
    return { projectKey, projectName, label };
}

/**
 * Breadth-first search through metadata for a matching key
 */
function extractMetadataString(meta, keys, excludeKeys = []) {
    if (!meta || typeof meta !== 'object') return undefined;
    const queue = [meta];
    const visited = new Set();

    while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== 'object' || visited.has(current)) continue;
        visited.add(current);

        for (const key of keys) {
            // Skip excluded keys
            if (excludeKeys.includes(key)) continue;
            
            const value = current[key];
            if (typeof value === 'string' && value.trim() && !excludeKeys.includes(value.trim().toLowerCase())) {
                return value.trim();
            } else if (typeof value === 'object' && value !== null) {
                // If the value is an object, check if it has a key/name property
                if (value.key && typeof value.key === 'string') {
                    return value.key.trim();
                } else if (value.name && typeof value.name === 'string') {
                    return value.name.trim();
                }
            }
        }

        Object.entries(current).forEach(([key, val]) => {
            // Skip excluded keys and numeric keys (array indices)
            if (excludeKeys.includes(key) || /^\d+$/.test(key)) return;
            
            if (Array.isArray(val)) {
                val.forEach(item => {
                    if (item && typeof item === 'object') {
                        queue.push(item);
                    }
                });
            } else if (val && typeof val === 'object') {
                queue.push(val);
            }
        });
    }

    return undefined;
}

/**
 * Resolve a timestamp from a usage series point
 */
function resolveTimestamp(point) {
    if (!point || typeof point !== 'object') return null;
    const timestampKeys = ['time', 'timestamp', 'timeMillis'];
    for (const key of timestampKeys) {
        if (point[key] !== undefined && point[key] !== null) {
            // Handle both milliseconds and seconds timestamps
            let timestamp = point[key];
            // If it's a number less than 1e12, assume it's seconds and convert to milliseconds
            if (typeof timestamp === 'number' && timestamp < 1e12) {
                timestamp = timestamp * 1000;
            }
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
    }
    return null;
}

/**
 * Aggregate daily data
 */
function aggregateByDay(data) {
    const dailyData = {};
    
    data.forEach(point => {
        const dateKey = formatDateForInput(point.date);
        if (!dailyData[dateKey]) {
            dailyData[dateKey] = { date: new Date(dateKey), values: [] };
        }
        dailyData[dateKey].values.push(point.value);
    });
    
    return Object.values(dailyData).map(day => ({
        date: day.date,
        value: Math.max(...day.values) // Use max for the day
    })).sort((a, b) => a.date - b.date);
}

/**
 * Return the peak value from a time series array
 */
function getPeakValue(series = []) {
    if (!Array.isArray(series)) {
        return 0;
    }
    return series.reduce((max, point) => Math.max(max, Number(point.value) || 0), 0);
}

/**
 * Return the billing-correct value from a time series array based on aggregation type.
 *
 * daily_incremental: sum all points — the API returns per-day counts, so summing
 * gives the total over the selected period.
 *
 * rolling_30d / month_to_date: use peak (max) — the grouped clientside-mau endpoint
 * returns a daily series even for these types, so "last value" often lands on a
 * low-activity day and understates the window. Peak is a safer approximation and
 * matches the pre-existing behaviour of getPeakValue.
 */
function getSeriesValue(series, aggregationType) {
    if (!Array.isArray(series) || series.length === 0) return 0;
    if (aggregationType === 'daily_incremental') {
        return series.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
    }
    return getPeakValue(series);
}

/**
 * Update charts
 */
function updateCharts() {
    updateCmauChart();
    updateConnectionsChart();
}

/**
 * Get chart configuration based on type
 */
function getChartConfig(type, label, color, data) {
    // Ensure dates are Date objects and values are numbers
    const chartData = data.map(d => ({
        x: d.date instanceof Date ? d.date : new Date(d.date),
        y: Number(d.value) || 0
    })).filter(d => !isNaN(d.x.getTime()) && !isNaN(d.y));
    
    const baseConfig = {
        datasets: [{
            label,
            data: chartData,
            borderColor: color,
            backgroundColor: type === 'area' ? `${color}33` : color,
            borderWidth: 2,
            tension: 0.3,
            fill: type === 'area',
            pointRadius: chartData.length > 60 ? 0 : 3,
            pointHoverRadius: 5
        }]
    };
    
    return baseConfig;
}

/**
 * Build a Chart.js dataset from a series of {date, value}.
 */
function lineDataset(label, color, series, opts = {}) {
    const data = series.map(p => ({
        x: p.date instanceof Date ? p.date : new Date(p.date),
        y: Number(p.value) || 0
    })).filter(d => !isNaN(d.x.getTime()) && !isNaN(d.y));
    return {
        label,
        data,
        borderColor: color,
        backgroundColor: opts.fill ? `${color}33` : color,
        borderWidth: opts.borderWidth ?? 2,
        borderDash: opts.dashed ? [6, 4] : undefined,
        tension: opts.stepped ? 0 : 0.3,
        stepped: opts.stepped ? 'before' : false,
        fill: !!opts.fill,
        pointRadius: data.length > 60 ? 0 : (opts.pointRadius ?? 3),
        pointHoverRadius: opts.pointHoverRadius ?? 5
    };
}

/**
 * Build a horizontal reference line dataset spanning the same x-axis as the source series.
 */
function horizontalLineDataset(label, color, yValue, refSeries) {
    if (!refSeries || refSeries.length === 0) return null;
    const sorted = [...refSeries].sort((a, b) => new Date(a.date) - new Date(b.date));
    const first = sorted[0].date instanceof Date ? sorted[0].date : new Date(sorted[0].date);
    const last = sorted[sorted.length - 1].date instanceof Date
        ? sorted[sorted.length - 1].date
        : new Date(sorted[sorted.length - 1].date);
    return {
        label,
        data: [{ x: first, y: yValue }, { x: last, y: yValue }],
        borderColor: color,
        backgroundColor: color,
        borderWidth: 1.5,
        borderDash: [4, 4],
        tension: 0,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0
    };
}

/**
 * Compute a running max series over a time-ordered array of {date, value}.
 */
function runningMaxSeries(series) {
    const sorted = [...series].sort((a, b) => new Date(a.date) - new Date(b.date));
    let max = 0;
    return sorted.map(p => {
        max = Math.max(max, Number(p.value) || 0);
        return { date: p.date, value: max };
    });
}

/**
 * Compute a running sum series over a time-ordered array of {date, value}.
 */
function runningSumSeries(series) {
    const sorted = [...series].sort((a, b) => new Date(a.date) - new Date(b.date));
    let sum = 0;
    return sorted.map(p => {
        sum += Number(p.value) || 0;
        return { date: p.date, value: sum };
    });
}

/**
 * Append contracted-limit + 70%/90% reference-line datasets, if a limit is set.
 */
function appendThresholdDatasets(datasets, limitInputEl, refSeries, labels = {}) {
    const limit = parseFloat(limitInputEl?.value);
    if (!Number.isFinite(limit) || limit <= 0) return;
    const contractedLabel = labels.contracted || 'Contracted limit';
    const warn = horizontalLineDataset(`${contractedLabel}`, '#FF35A2', limit, refSeries);
    const t90 = horizontalLineDataset('90% threshold', '#FF9D29', limit * 0.9, refSeries);
    const t70 = horizontalLineDataset('70% threshold', '#EBFF38', limit * 0.7, refSeries);
    [warn, t90, t70].forEach(ds => { if (ds) datasets.push(ds); });
}

/**
 * Shared chart options (time axis + dark tooltip styling).
 */
function timeSeriesChartOptions(yLabelPrefix) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: { display: true, labels: { color: '#8B91B5' } },
            tooltip: {
                backgroundColor: '#171B35',
                titleColor: '#F0F2FF',
                bodyColor: '#F0F2FF',
                borderColor: '#252A4A',
                borderWidth: 1,
                padding: 12,
                callbacks: {
                    title: (items) => {
                        const value = items[0].parsed.x;
                        return formatDate(value instanceof Date ? value : new Date(value));
                    },
                    label: (item) => `${item.dataset.label}: ${formatNumber(item.parsed.y)}`
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                grid: { color: '#1A1F3C', drawBorder: false },
                ticks: { color: '#8B91B5', maxTicksLimit: 10 }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#1A1F3C', drawBorder: false },
                ticks: { color: '#8B91B5', callback: (value) => formatNumber(value) }
            }
        }
    };
}

/**
 * Update Client MAU chart.
 *
 * Default view: running cumulative of daily-incremental unique-user counts. This is an
 * approximation — users active across multiple days are counted on each day — and is
 * NOT the same as LD's billed cMAU (which is the rolling-30-day peak). We expose the
 * billed series as a secondary line so the gap is visible.
 *
 * If daily_incremental data isn't available (API failure), fall back to the rolling-30-day
 * series we already have on state.usageData.mau so the chart still has signal.
 */
function updateCmauChart() {
    const chartType = elements.cmauChartType.value;

    // Primary: cumulative running sum of daily-incremental cMAU.
    const dailyIncrementalSeries = extractTimeSeriesData(state.usageData.mauDailyIncremental);
    const dailyByDay = dailyIncrementalSeries.length ? aggregateByDay(dailyIncrementalSeries) : [];
    const cumulativeSeries = dailyByDay.length ? runningSumSeries(dailyByDay) : [];

    // Secondary: the unfiltered billed rolling-30-day series. Falls back to the user-filtered
    // mau series, then to per-project aggregates if neither is available.
    let rollingSeries = extractTimeSeriesData(state.usageData.mauBilled);
    if (rollingSeries.length === 0) {
        rollingSeries = extractTimeSeriesData(state.usageData.mau);
    }
    if (rollingSeries.length === 0 && state.usageData.projectMau) {
        const allProjectData = [];
        state.usageData.projectMau.forEach(proj => {
            const projData = proj.series || extractTimeSeriesData(proj.data);
            allProjectData.push(...projData);
        });
        rollingSeries = aggregateByDay(allProjectData);
    } else {
        rollingSeries = aggregateByDay(rollingSeries);
    }

    if (state.charts.cmau) {
        state.charts.cmau.destroy();
    }

    if (cumulativeSeries.length === 0 && rollingSeries.length === 0) return;

    const datasets = [];
    let refSeries = cumulativeSeries.length ? cumulativeSeries : rollingSeries;

    if (cumulativeSeries.length) {
        datasets.push(lineDataset('Cumulative unique users (approx)', '#405BFF', cumulativeSeries, {
            fill: chartType === 'area'
        }));
    }
    if (rollingSeries.length) {
        // Secondary line: show the billed metric for comparison.
        datasets.push(lineDataset('Rolling 30-day cMAU (billed)', '#7084FF', rollingSeries, {
            dashed: true
        }));
    }
    appendThresholdDatasets(datasets, elements.capacityCmauLimit, refSeries, { contracted: 'Contracted cMAU' });

    const ctx = elements.cmauChart.getContext('2d');
    state.charts.cmau = new Chart(ctx, {
        type: chartType === 'area' ? 'line' : (chartType === 'bar' ? 'bar' : 'line'),
        data: { datasets },
        options: timeSeriesChartOptions()
    });
}

/**
 * Update Connections chart.
 *
 * Two lines:
 * - Daily peak (across server + browser + mobile streams) — shows variance day-to-day.
 * - Period peak (billing reference) — running max from period start; this is what LD bills on.
 *
 * Optional threshold overlays when a contracted connections limit is set.
 */
function updateConnectionsChart() {
    const chartType = elements.connectionsChartType.value;

    const allStreamData = [];
    ['server', 'browser', 'mobile'].forEach(source => {
        const sourceData = extractTimeSeriesData(state.usageData.streams[source]);
        allStreamData.push(...sourceData);
    });
    const dailyPeak = aggregateByDay(allStreamData);

    if (state.charts.connections) {
        state.charts.connections.destroy();
    }
    if (dailyPeak.length === 0) return;

    const runningMax = runningMaxSeries(dailyPeak);

    const datasets = [
        lineDataset('Daily peak', '#A34FDE', dailyPeak, {
            fill: chartType === 'area'
        }),
        lineDataset('Period peak (billing reference)', '#FF9D29', runningMax, {
            stepped: true,
            dashed: true
        })
    ];
    appendThresholdDatasets(datasets, elements.capacityConnLimit, runningMax, { contracted: 'Contracted connections' });

    const ctx = elements.connectionsChart.getContext('2d');
    state.charts.connections = new Chart(ctx, {
        type: chartType === 'area' ? 'line' : (chartType === 'bar' ? 'bar' : 'line'),
        data: { datasets },
        options: timeSeriesChartOptions()
    });
}

/**
 * Update project breakdown grid
 */
function updateProjectGrid() {
    const searchTerm = elements.projectSearch.value.toLowerCase();
    const sortBy = elements.projectSort.value;
    
    const usageEntries = state.usageData.projectMau || [];
    const usageMap = new Map();

    // Show a message if no per-project data is available
    if (usageEntries.length === 0 && state.projects.length > 0) {
        elements.projectGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-secondary);">
                <p style="margin-bottom: 0.5rem; font-size: 1.1rem; font-weight: 500;">Per-project breakdown not available</p>
                <p style="margin: 0; font-size: 0.9rem;">
                    The LaunchDarkly API does not currently support per-project breakdown for Client-side MAU via the browser.
                    The total Client MAU is shown in the summary card above.
                </p>
            </div>
        `;
        return;
    }
    
    // Build usage map from grouped data
    usageEntries.forEach(entry => {
        const key = entry.projectKey;
        if (!key || key === 'series' || key.includes('Context:') || key.startsWith('unknown-project-')) {
            // Skip invalid entries - especially "unknown-project" entries which are aggregated totals
            console.log('Skipping invalid usage entry:', key);
            return;
        }
        const series = entry.series || extractTimeSeriesData(entry.data);
        usageMap.set(key, {
            projectKey: key,
            projectName: entry.projectName || entry.projectKey || key,
            mau: getPeakValue(series)
        });
    });

    const { rows: connRows } = computeProjectConnectionRows();
    const connectionsMap = new Map(connRows.map(r => [r.key, { connections: r.connections }]));
    
    // Start with all projects from state (not limited by grouped response)
    let projectData = state.projects.map(project => {
        // Try exact key match first
        let usage = usageMap.get(project.key);
        
        // Try case-insensitive key match
        if (!usage) {
            usage = Array.from(usageMap.values()).find(entry =>
                entry.projectKey && entry.projectKey.toLowerCase() === project.key.toLowerCase()
            );
        }
        
        // Try name match as last resort
        if (!usage && project.name) {
            usage = Array.from(usageMap.values()).find(entry =>
                entry.projectName && entry.projectName.toLowerCase() === project.name.toLowerCase()
            );
        }
        
        const mau = (usage && usage.projectKey === project.key) ? usage.mau : 0;
        const connections = connectionsMap.get(project.key)?.connections || 0;
        return {
            key: project.key,
            name: project.name || project.key,
            mau,
            connections
        };
    });
    
    // Add any usage entries that don't match existing projects
    usageMap.forEach(entry => {
        if (entry.projectKey && entry.projectKey !== 'series' && !entry.projectKey.includes('Context:')) {
            if (!projectData.some(project => 
                project.key === entry.projectKey || 
                project.key.toLowerCase() === entry.projectKey.toLowerCase()
            )) {
                projectData.push({
                    key: entry.projectKey,
                    name: entry.projectName,
                    mau: entry.mau,
                    connections: 0
                });
            }
        }
    });
    
    if (searchTerm) {
        projectData = projectData.filter(p => 
            p.name.toLowerCase().includes(searchTerm) || 
            p.key.toLowerCase().includes(searchTerm)
        );
    }
    
    switch (sortBy) {
        case 'mau-desc':
            projectData.sort((a, b) => b.mau - a.mau);
            break;
        case 'mau-asc':
            projectData.sort((a, b) => a.mau - b.mau);
            break;
        case 'name-asc':
            projectData.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            projectData.sort((a, b) => b.name.localeCompare(a.name));
            break;
    }
    
    elements.projectGrid.innerHTML = projectData.map(project => `
        <div class="project-card" data-project="${project.key}">
            <div class="project-card-header">
                <span class="project-name">${escapeHtml(project.name)}</span>
                <span class="project-key">${escapeHtml(project.key)}</span>
            </div>
            <div class="project-stats">
                <div class="project-stat">
                    <span class="stat-label">Client MAU</span>
                    <span class="stat-value mau">${formatNumber(project.mau)}</span>
                </div>
                <div class="project-stat">
                    <span class="stat-label">Connections</span>
                    <span class="stat-value connections">${formatNumber(project.connections) || '--'}</span>
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Update data table
 */
function updateDataTable() {
    const rows = [];
    const { start, end } = state.dateRange;
    
    // Add project MAU data
    if (state.usageData.projectMau) {
        state.usageData.projectMau.forEach(proj => {
            const projectSeries = proj.series || extractTimeSeriesData(proj.data);
            projectSeries.forEach(point => {
                rows.push({
                    date: point.date,
                    project: proj.projectName || proj.projectKey,
                    environment: 'All',
                    metric: 'Client-side MAU',
                    mau: point.value,
                    connections: null
                });
            });
        });
    }
    
    // Add stream data
    ['server', 'browser', 'mobile'].forEach(source => {
        const streamData = extractTimeSeriesData(state.usageData.streams[source]);
        streamData.forEach(point => {
            rows.push({
                date: point.date,
                project: 'All Projects',
                environment: 'All',
                metric: `Service Connections (${source.charAt(0).toUpperCase()}${source.slice(1)})`,
                mau: null,
                connections: point.value
            });
        });
    });
    
    // Sort by date descending
    rows.sort((a, b) => b.date - a.date);
    
    // Limit to most recent 500 rows
    const displayRows = rows.slice(0, 500);
    
    elements.usageTableBody.innerHTML = displayRows.map(row => `
        <tr>
            <td>${formatDate(row.date)}</td>
            <td>${escapeHtml(row.project)}</td>
            <td>${escapeHtml(row.environment)}</td>
            <td>${escapeHtml(row.metric)}</td>
            <td>${row.mau !== null ? formatNumber(row.mau) : '--'}</td>
            <td>${row.connections !== null ? formatNumber(row.connections) : '--'}</td>
        </tr>
    `).join('');
    
    // Store for CSV export
    state.tableData = rows;
}

/**
 * Export data to CSV
 */
function exportToCsv() {
    if (!state.tableData || state.tableData.length === 0) {
        showError('No data available to export');
        return;
    }
    
    const headers = ['Date', 'Project', 'Environment', 'Metric', 'MAU', 'Connections'];
    const csvContent = [
        headers.join(','),
        ...state.tableData.map(row => [
            formatDateForInput(row.date),
            `"${row.project}"`,
            `"${row.environment}"`,
            `"${row.metric}"`,
            row.mau !== null ? row.mau : '',
            row.connections !== null ? row.connections : ''
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `launchdarkly-usage-${formatDateForInput(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportChargebackAppsCsv() {
    const rows = state.chargeback?.apps || [];
    if (!rows.length) {
        showError('No chargeback application rows to export.');
        return;
    }
    const header = ['applicationKey', 'name', 'kind', 'peakCmau', 'sharePercentOrg'];
    const lines = [
        header.join(','),
        ...rows.map(r => [
            `"${String(r.key).replace(/"/g, '""')}"`,
            `"${String(r.name).replace(/"/g, '""')}"`,
            `"${String(r.kind).replace(/"/g, '""')}"`,
            r.peak,
            r.share.toFixed(4)
        ].join(','))
    ].join('\n');
    downloadTextFile(lines, `ld-chargeback-apps-${formatDateForInput(new Date())}.csv`);
}

function exportChargebackGapCsv() {
    const rows = state.chargeback?.gap || [];
    if (!rows.length) {
        showError('No gap rows to export.');
        return;
    }
    const header = ['projectKey', 'environmentKey', 'envTotalCmau', 'attributedCmau', 'unattributedCmau', 'gapPercent'];
    const lines = [
        header.join(','),
        ...rows.map(r => [
            `"${r.projectKey}"`,
            `"${r.envKey}"`,
            r.envTotal,
            r.attributed,
            r.gap,
            r.gapPct.toFixed(4)
        ].join(','))
    ].join('\n');
    downloadTextFile(lines, `ld-chargeback-gap-${formatDateForInput(new Date())}.csv`);
}

function exportConnectionsByAppCsv() {
    const { rows } = computeAppConnectionRows();
    if (!rows.length) {
        showError('No per-application connection rows to export.');
        return;
    }
    const header = ['applicationKey', 'name', 'kind', 'peakConnections', 'serverPeak', 'browserPeak', 'mobilePeak', 'sharePercentOrg', 'projects'];
    const lines = [
        header.join(','),
        ...rows.map(r => [
            `"${String(r.key).replace(/"/g, '""')}"`,
            `"${String(r.name).replace(/"/g, '""')}"`,
            `"${String(r.kind).replace(/"/g, '""')}"`,
            r.peak,
            r.byServer,
            r.byBrowser,
            r.byMobile,
            r.share.toFixed(4),
            `"${(r.projects || []).join('|').replace(/"/g, '""')}"`
        ].join(','))
    ].join('\n');
    downloadTextFile(lines, `ld-connections-by-app-${formatDateForInput(new Date())}.csv`);
}

function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ==========================================
// Event Handlers
// ==========================================

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Summary cards as primary navigation
    document.querySelectorAll('.summary-card[data-view-mode]').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.getAttribute('data-view-mode');
            if (mode) setViewMode(mode);
        });
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const mode = card.getAttribute('data-view-mode');
                if (mode) setViewMode(mode);
            }
        });
    });

    // Keep hidden tab buttons wired up (used internally for capacity access)
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            const mode = btn.getAttribute('data-view-mode');
            if (mode) setViewMode(mode);
        });
    });

    const persistCap = () => {
        try {
            localStorage.setItem('ld-billing-cap-cmau', elements.capacityCmauLimit?.value || '');
            localStorage.setItem('ld-billing-cap-conn', elements.capacityConnLimit?.value || '');
        } catch (e) { /* ignore */ }
        updateCapacityMeters();
        updateSummaryCards();
        // Refresh charts so threshold overlay lines update immediately.
        if (typeof updateCharts === 'function') updateCharts();
    };
    elements.capacityCmauLimit?.addEventListener('input', persistCap);
    elements.capacityConnLimit?.addEventListener('input', persistCap);

    elements.exportChargebackApps?.addEventListener('click', exportChargebackAppsCsv);
    elements.exportChargebackGap?.addEventListener('click', exportChargebackGapCsv);
    elements.exportConnectionsByApp?.addEventListener('click', exportConnectionsByAppCsv);

    document.getElementById('hide-zero-cmau-apps')?.addEventListener('change', () => {
        renderChargebackTables();
    });

    document.getElementById('hide-zero-conn-apps')?.addEventListener('change', () => {
        renderConnectionsByApp();
    });

    // API key visibility toggle
    elements.toggleApiKey.addEventListener('click', () => {
        const input = elements.apiKeyInput;
        const wrapper = input.closest('.input-with-icon');
        
        if (input.type === 'password') {
            input.type = 'text';
            wrapper.classList.add('api-visible');
        } else {
            input.type = 'password';
            wrapper.classList.remove('api-visible');
        }
    });
    
    // Date preset change
    elements.datePreset.addEventListener('change', () => {
        const isCustom = elements.datePreset.value === 'custom';
        elements.customDates.style.display = isCustom ? 'flex' : 'none';
        
        if (!isCustom) {
            // Update dates based on preset
            const { start, end } = getDateRange();
            elements.startDate.value = formatDateForInput(start);
            elements.endDate.value = formatDateForInput(end);
        }
    });
    
    // Fetch data button
    elements.fetchButton.addEventListener('click', () => {
        const apiKey = elements.apiKeyInput.value.trim();
        
        if (!apiKey) {
            showError('Please enter your LaunchDarkly API token');
            return;
        }
        
        state.apiKey = apiKey;
        fetchAllUsageData();
    });
    
    // Config panel toggle
    elements.toggleConfig.addEventListener('click', () => {
        elements.configPanel.classList.toggle('collapsed');
    });
    
    // Theme toggle
    elements.themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('ld-billing-theme', newTheme);
    });
    
    // Dismiss error
    elements.dismissError.addEventListener('click', hideError);
    
    // Chart type changes
    elements.cmauChartType.addEventListener('change', updateCmauChart);
    elements.connectionsChartType.addEventListener('change', updateConnectionsChart);
    
    // Project search
    elements.projectSearch.addEventListener('input', updateProjectGrid);
    elements.projectSort.addEventListener('change', updateProjectGrid);
    
    // Export CSV
    elements.exportCsv.addEventListener('click', exportToCsv);
    
    // Enter key on API input
    elements.apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.fetchButton.click();
        }
    });
}

/**
 * Initialize theme from localStorage
 */
function initTheme() {
    const savedTheme = localStorage.getItem('ld-billing-theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}

/**
 * Initialize date inputs with defaults
 */
function initDateInputs() {
    const { start, end } = getDateRange();
    elements.startDate.value = formatDateForInput(start);
    elements.endDate.value = formatDateForInput(end);
    
    // Set max date to today
    const today = formatDateForInput(new Date());
    elements.startDate.max = today;
    elements.endDate.max = today;
}

// ==========================================
// Initialization
// ==========================================

function initViewModeAndCapacity() {
    try {
        const capM = localStorage.getItem('ld-billing-cap-cmau');
        const capC = localStorage.getItem('ld-billing-cap-conn');
        if (capM != null && elements.capacityCmauLimit) elements.capacityCmauLimit.value = capM;
        if (capC != null && elements.capacityConnLimit) elements.capacityConnLimit.value = capC;
    } catch (e) { /* ignore */ }

    const validModes = ['overview', 'cmau', 'connections', 'capacity', 'trends'];
    const legacy = { explore: 'trends', chargeback: 'cmau' };

    let saved = null;
    try {
        saved = localStorage.getItem('ld-billing-view-mode');
    } catch (e) {
        saved = null;
    }
    if (saved && legacy[saved]) {
        saved = legacy[saved];
        try {
            localStorage.setItem('ld-billing-view-mode', saved);
        } catch (e) { /* ignore */ }
    }

    if (saved && validModes.includes(saved)) {
        state.viewMode = saved;
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            const active = btn.dataset.viewMode === saved;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const activeCard = document.querySelector(`.summary-card[data-view-mode="${saved}"]`);
        if (activeCard) activeCard.classList.add('is-nav-active');
    }
    applyViewModeLayout();
    updateViewModeStatus();
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initDateInputs();
    initEventListeners();
    initViewModeAndCapacity();
});

