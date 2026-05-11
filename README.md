# LaunchDarkly Billing Viewer

A browser-based dashboard for visualizing LaunchDarkly usage metrics including Client MAU (Monthly Active Users), Service Connections, and Experimentation Keys with customizable time frames and project breakdowns.

## Overview

The LaunchDarkly Billing Viewer provides a better user experience for analyzing your LaunchDarkly usage data compared to the built-in billing UI. It allows you to:

- **Easily customize time frames** - Select from presets (7, 14, 30, 60, 90, 180, 365 days) or choose custom date ranges
- **Break down usage by project** - See which projects are consuming the most resources
- **Visualize trends** - Interactive charts show usage patterns over time
- **Export data** - Download usage data as CSV for further analysis

## Features

- 📊 **Interactive Charts** - Line, bar, or area charts for MAU and Service Connections
- 📈 **Summary Dashboard** - At-a-glance metrics for total MAU, connections, experimentation keys, and projects
- 🎯 **Project Breakdown** - Filter, search, and sort projects by usage
- 📅 **Flexible Time Ranges** - Easy date selection with presets and custom ranges
- 🧩 **Context Filters** - Limit Client-side MAU to specific context kinds and choose the aggregation window (rolling 30-day, MTD, or daily incremental)
- 🌙 **Dark/Light Theme** - Toggle between themes for comfortable viewing
- 📥 **CSV Export** - Download detailed usage data for reporting
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

3. **Select Time Period**
   - Choose a preset (Last 7/14/30/60/90/180/365 days) or
   - Select "Custom range" and pick specific dates

4. **(Optional) Choose Context & Aggregation**
   - Enter one or more context kinds (for example `user`, `device`) to scope the Client-side MAU metric
   - Pick an aggregation window (rolling 30 day, month-to-date, or daily incremental) to match LaunchDarkly’s billing view

5. **Fetch Data**
   - Click "Fetch Usage Data" to load your metrics
   - View the interactive dashboard with charts and project breakdown

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

1. Push this repository to GitHub
2. Go to Settings > Pages
3. Select "Deploy from a branch" and choose `main`
4. Your dashboard will be available at `https://yourusername.github.io/ld-billing-viewer/`

### Option 4: Other Static Hosting

Deploy to any static hosting service:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Azure Static Web Apps
- Any web server

## Understanding the Metrics

### Client-side MAU (Monthly Active Users)
The dashboard calls LaunchDarkly’s `/api/v2/usage/clientside-mau` beta endpoint to report the unique client-side contexts seen during the selected window. You can scope this metric with context kinds (for example, `user` vs `device`) and pick the aggregation window that matches LaunchDarkly’s billing UI.

### Service Connections
The peak number of concurrent connections from your SDKs to LaunchDarkly. This includes:
- **Server** - Server-side SDK connections
- **Browser** - Client-side JavaScript SDK connections
- **Mobile** - Mobile SDK (iOS/Android) connections

### Experimentation Keys
The number of unique experimentation metric keys used in your experiments during the period.

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
Download all usage data as a CSV file for external analysis or reporting.

## Security Notes

- **API tokens are not stored** - You must re-enter your token each session
- **Browser-only requests** - All API calls are made directly from your browser to LaunchDarkly
- **No backend required** - No data passes through any third-party servers
- **Use read-only tokens** - For maximum security, create tokens with Reader role only

## Limitations

- Data availability depends on your LaunchDarkly plan and data retention settings
- Some metrics may require specific LaunchDarkly features to be enabled
- Large date ranges may take longer to load due to API pagination
- CORS must be enabled for browser access (LaunchDarkly's API supports this)
- Client-side MAU data comes from LaunchDarkly’s beta `/usage/clientside-mau` endpoint. If that endpoint is unavailable for your account we automatically fall back to the legacy `/usage/mau` API, which only reports user-based MAU counts.

## Troubleshooting

### "API Error: 401 Unauthorized"
- Verify your API token is correct and hasn't expired
- Ensure the token has the necessary read permissions

### "API Error: 403 Forbidden"
- Your token may lack permissions for certain endpoints
- Try creating a new token with Reader role

### "No data available"
- Try selecting a different or shorter time range
- Verify your account has usage data for the selected period

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

