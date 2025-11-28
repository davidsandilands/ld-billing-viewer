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
    usageData: {
        mau: [],
        streams: [],
        events: [],
        experiments: []
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
    sdkType: document.getElementById('sdk-type'),
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
    totalProjects: document.getElementById('total-projects'),
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
    exportCsv: document.getElementById('export-csv')
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
    
    const days = parseInt(preset);
    start.setDate(end.getDate() - days);
    
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
}

/**
 * Show empty state, hide dashboard
 */
function showEmptyState() {
    elements.dashboard.style.display = 'none';
    elements.emptyState.style.display = 'flex';
}

// ==========================================
// API Functions
// ==========================================

/**
 * Make an authenticated API request to LaunchDarkly
 */
async function apiRequest(endpoint, params = {}) {
    const url = new URL(`${API_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
        }
    });
    
    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Authorization': state.apiKey,
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
}

/**
 * Fetch list of projects
 */
async function fetchProjects() {
    try {
        const data = await apiRequest('/projects');
        return data.items || [];
    } catch (error) {
        console.error('Error fetching projects:', error);
        throw error;
    }
}

/**
 * Fetch MAU usage data
 */
async function fetchMauUsage(from, to) {
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
 * Fetch MAU usage by project
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
 * Fetch stream (connections) usage
 */
async function fetchStreamsUsage(source, from, to) {
    try {
        const data = await apiRequest(`/usage/streams/${source}`, {
            from: formatDateForApi(from),
            to: formatDateForApi(to)
        });
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
        });
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
    
    showLoading();
    hideError();
    
    try {
        // Fetch projects first
        const projects = await fetchProjects();
        state.projects = projects;
        
        // Fetch usage data in parallel
        const [mauData, serverStreams, clientStreams, mobileStreams, experimentationKeys] = await Promise.all([
            fetchMauUsage(start, end),
            fetchStreamsUsage('server', start, end),
            fetchStreamsUsage('browser', start, end),
            fetchStreamsUsage('mobile', start, end),
            fetchExperimentationUsage(start, end)
        ]);
        
        // Store MAU data
        state.usageData.mau = mauData;
        
        // Combine stream data
        state.usageData.streams = {
            server: serverStreams,
            browser: clientStreams,
            mobile: mobileStreams
        };
        
        // Store experimentation data
        state.usageData.experiments = experimentationKeys;
        
        // Fetch MAU by project for each project
        const projectMauPromises = projects.slice(0, 20).map(project => 
            fetchMauByProject(start, end, project.key).then(data => ({
                projectKey: project.key,
                projectName: project.name,
                data
            }))
        );
        
        const projectMauResults = await Promise.all(projectMauPromises);
        state.usageData.projectMau = projectMauResults.filter(r => r.data !== null);
        
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
    updateCharts();
    updateProjectGrid();
    updateDataTable();
}

/**
 * Update summary cards with totals
 */
function updateSummaryCards() {
    const { start, end } = state.dateRange;
    const periodText = `${formatDate(start)} - ${formatDate(end)}`;
    
    // Calculate total MAU
    let totalMau = 0;
    if (state.usageData.mau && state.usageData.mau.series) {
        // Sum up the last/most recent values across all series
        state.usageData.mau.series.forEach(series => {
            if (series[0] && series[0].length > 0) {
                // Get the maximum value in the series (peak MAU)
                const maxValue = Math.max(...series[0].filter(v => v !== null && v !== undefined));
                totalMau = Math.max(totalMau, maxValue);
            }
        });
    }
    
    // If we have project MAU data, use that instead for more accuracy
    if (state.usageData.projectMau && state.usageData.projectMau.length > 0) {
        let projectMauSum = 0;
        state.usageData.projectMau.forEach(proj => {
            if (proj.data && proj.data.series) {
                proj.data.series.forEach(series => {
                    if (series[0] && series[0].length > 0) {
                        const maxValue = Math.max(...series[0].filter(v => v !== null && v !== undefined));
                        projectMauSum += maxValue;
                    }
                });
            }
        });
        if (projectMauSum > 0) {
            totalMau = projectMauSum;
        }
    }
    
    elements.totalCmau.textContent = formatNumber(totalMau);
    elements.cmauPeriod.textContent = periodText;
    
    // Calculate total connections
    let totalConnections = 0;
    ['server', 'browser', 'mobile'].forEach(source => {
        if (state.usageData.streams[source] && state.usageData.streams[source].series) {
            state.usageData.streams[source].series.forEach(series => {
                if (series[0] && series[0].length > 0) {
                    const maxValue = Math.max(...series[0].filter(v => v !== null && v !== undefined));
                    totalConnections += maxValue;
                }
            });
        }
    });
    
    elements.totalConnections.textContent = formatNumber(totalConnections);
    elements.connectionsPeriod.textContent = 'Peak in period';
    
    // Experimentation keys
    let totalExperiments = 0;
    if (state.usageData.experiments && state.usageData.experiments.series) {
        state.usageData.experiments.series.forEach(series => {
            if (series[0] && series[0].length > 0) {
                const maxValue = Math.max(...series[0].filter(v => v !== null && v !== undefined));
                totalExperiments = Math.max(totalExperiments, maxValue);
            }
        });
    }
    elements.totalExperiments.textContent = formatNumber(totalExperiments);
    elements.experimentsPeriod.textContent = periodText;
    
    // Projects count
    elements.totalProjects.textContent = formatNumber(state.projects.length);
}

/**
 * Extract time series data for charts
 */
function extractTimeSeriesData(usageData) {
    const result = [];
    
    if (!usageData || !usageData.metadata || !usageData.series) {
        return result;
    }
    
    // Metadata contains timestamps
    const timestamps = usageData.metadata.map(m => new Date(m.time || m));
    
    // Series contains the values
    usageData.series.forEach((seriesGroup, idx) => {
        if (seriesGroup[0]) {
            seriesGroup[0].forEach((value, timeIdx) => {
                if (timestamps[timeIdx] && value !== null && value !== undefined) {
                    result.push({
                        date: timestamps[timeIdx],
                        value: value
                    });
                }
            });
        }
    });
    
    // Sort by date
    result.sort((a, b) => a.date - b.date);
    
    return result;
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
    const labels = data.map(d => d.date);
    const values = data.map(d => d.value);
    
    const baseConfig = {
        labels,
        datasets: [{
            label,
            data: values,
            borderColor: color,
            backgroundColor: type === 'area' ? `${color}33` : color,
            borderWidth: 2,
            tension: 0.3,
            fill: type === 'area',
            pointRadius: data.length > 60 ? 0 : 3,
            pointHoverRadius: 5
        }]
    };
    
    return baseConfig;
}

/**
 * Update Client MAU chart
 */
function updateCmauChart() {
    const chartType = elements.cmauChartType.value;
    let mauData = extractTimeSeriesData(state.usageData.mau);
    
    // If no direct MAU data, aggregate from projects
    if (mauData.length === 0 && state.usageData.projectMau) {
        const allProjectData = [];
        state.usageData.projectMau.forEach(proj => {
            const projData = extractTimeSeriesData(proj.data);
            allProjectData.push(...projData);
        });
        mauData = aggregateByDay(allProjectData);
    }
    
    // Destroy existing chart
    if (state.charts.cmau) {
        state.charts.cmau.destroy();
    }
    
    if (mauData.length === 0) {
        // No data available
        return;
    }
    
    const ctx = elements.cmauChart.getContext('2d');
    const config = getChartConfig(chartType, 'Client MAU', '#00d4aa', mauData);
    
    state.charts.cmau = new Chart(ctx, {
        type: chartType === 'area' ? 'line' : chartType,
        data: config,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1a222c',
                    titleColor: '#e6edf3',
                    bodyColor: '#e6edf3',
                    borderColor: '#30363d',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (items) => formatDate(items[0].label),
                        label: (item) => `MAU: ${formatNumber(item.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'MMM d'
                        }
                    },
                    grid: {
                        color: '#21262d',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b949e',
                        maxTicksLimit: 10
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#21262d',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b949e',
                        callback: (value) => formatNumber(value)
                    }
                }
            }
        }
    });
}

/**
 * Update Connections chart
 */
function updateConnectionsChart() {
    const chartType = elements.connectionsChartType.value;
    
    // Combine all stream sources
    const allStreamData = [];
    ['server', 'browser', 'mobile'].forEach(source => {
        const sourceData = extractTimeSeriesData(state.usageData.streams[source]);
        allStreamData.push(...sourceData);
    });
    
    const aggregatedData = aggregateByDay(allStreamData);
    
    // Destroy existing chart
    if (state.charts.connections) {
        state.charts.connections.destroy();
    }
    
    if (aggregatedData.length === 0) {
        return;
    }
    
    const ctx = elements.connectionsChart.getContext('2d');
    const config = getChartConfig(chartType, 'Service Connections', '#7c3aed', aggregatedData);
    
    state.charts.connections = new Chart(ctx, {
        type: chartType === 'area' ? 'line' : chartType,
        data: config,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1a222c',
                    titleColor: '#e6edf3',
                    bodyColor: '#e6edf3',
                    borderColor: '#30363d',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (items) => formatDate(items[0].label),
                        label: (item) => `Connections: ${formatNumber(item.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'MMM d'
                        }
                    },
                    grid: {
                        color: '#21262d',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b949e',
                        maxTicksLimit: 10
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#21262d',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b949e',
                        callback: (value) => formatNumber(value)
                    }
                }
            }
        }
    });
}

/**
 * Update project breakdown grid
 */
function updateProjectGrid() {
    const searchTerm = elements.projectSearch.value.toLowerCase();
    const sortBy = elements.projectSort.value;
    
    // Build project data with usage stats
    let projectData = state.projects.map(project => {
        let mau = 0;
        let connections = 0;
        
        // Find MAU data for this project
        const projectMau = state.usageData.projectMau?.find(p => p.projectKey === project.key);
        if (projectMau && projectMau.data && projectMau.data.series) {
            projectMau.data.series.forEach(series => {
                if (series[0] && series[0].length > 0) {
                    const maxValue = Math.max(...series[0].filter(v => v !== null && v !== undefined));
                    mau += maxValue;
                }
            });
        }
        
        return {
            key: project.key,
            name: project.name || project.key,
            mau,
            connections
        };
    });
    
    // Filter by search term
    if (searchTerm) {
        projectData = projectData.filter(p => 
            p.name.toLowerCase().includes(searchTerm) || 
            p.key.toLowerCase().includes(searchTerm)
        );
    }
    
    // Sort
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
    
    // Render cards
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
            if (proj.data && proj.data.series) {
                const projectData = extractTimeSeriesData(proj.data);
                projectData.forEach(point => {
                    rows.push({
                        date: point.date,
                        project: proj.projectName || proj.projectKey,
                        environment: 'All',
                        sdkType: 'Client',
                        mau: point.value,
                        connections: null
                    });
                });
            }
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
                sdkType: source.charAt(0).toUpperCase() + source.slice(1),
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
            <td>${escapeHtml(row.sdkType)}</td>
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
    
    const headers = ['Date', 'Project', 'Environment', 'SDK Type', 'MAU', 'Connections'];
    const csvContent = [
        headers.join(','),
        ...state.tableData.map(row => [
            formatDateForInput(row.date),
            `"${row.project}"`,
            `"${row.environment}"`,
            `"${row.sdkType}"`,
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

// ==========================================
// Event Handlers
// ==========================================

/**
 * Initialize event listeners
 */
function initEventListeners() {
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

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initDateInputs();
    initEventListeners();
});

