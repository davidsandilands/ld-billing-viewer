# LaunchDarkly Chargeback and Capacity Monitoring
**Specification Draft v0.1**

---

## Purpose

This document describes how to attribute LaunchDarkly usage costs to internal teams, projects, or applications. It covers two billable dimensions: **Client Monthly Active Users (cMAU)** and **Service Connections**. It also describes how to use the same data for capacity planning.

This spec assumes LaunchDarkly is deployed as a shared platform across multiple teams or business units.

---

## Prerequisites

### 1. Application Metadata (Required for cMAU Attribution)

Every client-side SDK instance **must** be initialized with an `applicationId`. Without it, cMAU cannot be attributed to a specific application, and chargeback becomes an estimate at best.

Set application metadata at SDK initialization:

```javascript
// Example: JavaScript SDK
const client = LDClient.initialize('sdk-key', context, {
  application: {
    id: 'checkout-service',       // required — unique, stable identifier
    version: '2.4.1'              // recommended
  }
});
```

The `applicationId` maps to the **Applications** page in LaunchDarkly and drives all attribution in this spec. Server-side SDKs should also set this for service connection attribution.

**Naming convention:** Use a consistent, org-wide format. Recommended: `<team>-<product>-<component>` (e.g., `payments-checkout-web`). Agree on this before rollout. Changing IDs mid-month breaks continuity.

**Verification:** Confirm registered applications via:

```
GET /api/v2/applications
```

Returns a list of applications with associated `key`, `name`, and `kind` (client or server). An application missing from this list has not been seen by LaunchDarkly yet, or its SDK is not configured with an `applicationId`.

---

## Billable Dimensions

### cMAU (Client Monthly Active Users)

cMAU counts the number of unique context keys evaluated by **client-side SDKs** in a rolling 30-day window, per environment.

**What counts as a cMAU:** A unique context key that triggers at least one flag evaluation on a client-side SDK within the billing period. This is per environment, not per project.

**Proportional allocation model:** Each application's cMAU is measured directly via the API. Chargeback is proportional: an application's cost share equals its cMAU as a fraction of total org cMAU for that period.

```
app_cost_share = app_cMAU / total_org_cMAU
app_charge     = app_cost_share * total_cMAU_invoice_line
```

Example: Application A has 1,000,000 cMAU. Application B has 250,000 cMAU. Total org cMAU is 1,250,000. Application B's share is 20% of the cMAU cost line, regardless of how many context kinds either application uses.

This model is self-correcting: a team that inflates its cMAU through unnecessary context kinds pays proportionally more, not less. No SDK-level governance is required for the chargeback math to work.

**Tier inflation risk:** Multi-context evaluation can inflate total org cMAU and push the org into a higher contracted tier. This is a cost risk at the org level, not an attribution problem. Teams adding new context kinds should be aware their choices affect the org's total bill, not just their own share. This is worth noting in your platform onboarding docs but does not require enforcement at the chargeback layer.

---

### Service Connections

Service connections count persistent SDK connections to LaunchDarkly's streaming infrastructure, primarily from **server-side SDKs**.

Each server-side SDK instance opens a persistent stream. For containerized workloads, this means one connection per pod/container instance, not per logical service.

**Division model:** Service connections are attributed to the project and environment they connect to via the SDK key. Since each server-side SDK connects to a specific environment key, attribution is direct and does not depend on `applicationId`.

Setting `applicationId` on server-side SDKs registers the application in the Applications registry and can provide additional visibility, but LD attributes stream connections by environment, not by application metadata. Do not assume `applicationId` appears as a breakdown dimension in stream connection reporting. Confirm with your LD account team whether per-application stream breakdowns are available on your plan before relying on them.

Split is proportional: if a project accounts for N connections out of a total T, its share is N/T of the service connection cost.

---

## APIs for Chargeback

### Step 1: Pull MAU by Application

```
GET /api/v2/applications
GET /api/v2/applications/{applicationKey}/versions
```

`GET /api/v2/applications` returns a list of registered applications with their `key`, `name`, and `kind` (client or server). It confirms which applications have been seen by LaunchDarkly.

**Important:** This endpoint lists applications and metadata. It does not necessarily return historical cMAU time series per application for an arbitrary billing window. The specific response fields and usage endpoints that produce application-level cMAU data vary by plan. Before implementing the chargeback calculation, confirm with your LaunchDarkly account team:

- Which endpoint returns per-application cMAU for a given time window
- Whether that data is available programmatically or only in the Applications dashboard UI
- Which response field maps to the billable cMAU count for a given period

Until confirmed, treat the Applications dashboard as the source of record for per-application cMAU and document the manual export process as an interim step.

```
GET /api/v2/usage/mau/sdks
```

Returns MAU broken down by SDK type. Use alongside the Applications data to cross-reference client vs. server attribution.

### Step 2: Pull Service Connection Counts

LaunchDarkly exposes stream connections across multiple source dimensions. Known endpoints include:

```
GET /api/v2/usage/streams/server
GET /api/v2/usage/streams/client
GET /api/v2/usage/streams/browser
GET /api/v2/usage/streams/mobile
```

Some of these are in beta and require:

```
LD-API-Version: beta
```

**Action required:** Validate which endpoints are available on your plan before building automation. The LD usage API surface has evolved across plan tiers and not all sources are available on all contracts. Maintain an internal API contract document that pins the exact endpoints, required headers, and response schema versions you have confirmed. Reference that document from this spec.

```
GET /api/v2/projects
```

Use this to enumerate all projects and their environments so you can map connection counts to owners.

### Step 3: Pull Evaluation Volume (Optional, Capacity Signal)

```
GET /api/v2/usage/evaluations/{projectKey}/{environmentKey}/{featureFlagKey}
```

Returns evaluation counts for a specific flag. Aggregating across flags in a project gives you total evaluation load per project. This is a secondary signal, not a billing input, but useful for capacity planning.

### Authentication

All API calls require a LaunchDarkly API access token with at minimum **Reader** role. Use a service account token, not a personal token. Rotate on your standard credential cycle.

```
Authorization: <your-api-token>
```

---

## Chargeback Allocation Model

### cMAU Allocation

1. Pull cMAU per application from the Applications API for the billing period.
2. Sum cMAU across all applications owned by each team or cost centre.
3. Divide team cMAU by total org cMAU to get the cost share percentage.
4. Apply that percentage to the total cMAU cost line on your LaunchDarkly invoice.

No context kind filtering is required. The proportional model uses raw cMAU per application as reported by LaunchDarkly. A team with inflated cMAU due to multi-context usage pays proportionally more, which provides a natural disincentive without requiring governance enforcement.

### Unattributed cMAU Detection and Enforcement

For each environment in a project, calculate the gap between total environment cMAU and the sum of cMAU across all registered applications in that environment:

```
unattributed_cMAU = env_total_cMAU - sum(app_cMAU for each app in environment)
```

**Consistency requirements for this formula to be valid:**

Both `env_total_cMAU` and `app_cMAU` must use the same time window and aggregation method. LaunchDarkly invoices on a rolling 30-day window, not a calendar month. For chargeback to reconcile with the invoice, either:

- Pull the snapshot on the same day each month and use the rolling 30-day figure as reported by LD on that day, or
- Accept a small carry-over variance at month boundaries and document it as expected

Pick one and document it. **Agreed snapshot day:** [to be defined]. The same day must be used for both `env_total_cMAU` and per-application cMAU pulls, and must match the field LD uses on your invoice. Confirm the exact API response field that corresponds to your invoiced cMAU figure with your LD account team before automating.

Produce a gap report per project each billing period:

| Environment | Total cMAU | Attributed cMAU | Unattributed cMAU | Gap % |
|---|---|---|---|---|
| production | 1,500,000 | 1,250,000 | 250,000 | 16.7% |
| staging | 80,000 | 80,000 | 0 | 0% |

**Enforcement model:** Unattributed cMAU is charged directly to the project owner at the same proportional rate as attributed cMAU. It is not absorbed by the platform or spread across other teams. The project owner is responsible for finding the unregistered SDK instances in their environments and configuring `applicationId`. The chargeback is the enforcement mechanism: there is no separate policy process.

```
project_unattributed_charge = (unattributed_cMAU / total_org_cMAU) * total_cMAU_invoice_line
```

This means a project owner pays for all cMAU generated in their environments, attributed or not. Once they configure `applicationId` correctly, the unattributed line disappears and the cost is redistributed across their named applications with no change to their total charge. The incentive to fix it is visibility and accountability, not cost reduction.

**Identifying the source:** LaunchDarkly's APIs cannot tell you which specific SDK instance is missing `applicationId`. Identification requires a deployment audit: enumerate all services and client builds connecting to the affected environment and verify their SDK initialisation config. The gap report tells you the scale of the problem; your own infrastructure tells you the source.

### Service Connection Allocation

1. Pull stream connection counts by environment.
2. Map each environment to its owning project/team using your project registry.
3. Calculate each team's share: `team_connections / total_connections`.
4. Apply that share to the service connection cost line.

For teams with variable connection counts (e.g., autoscaling workloads), use the monthly average, not a point-in-time snapshot.

---

## Capacity Planning

The same data drives capacity planning. Track the following monthly:

| Metric | Source | Signal |
|---|---|---|
| cMAU per application | Applications API / dashboard | Growth rate, approaching plan limits |
| cMAU per environment | `/api/v2/usage/mau` | Environment-level headroom |
| Service connections peak | `/api/v2/usage/streams/server` | Scaling headroom |
| Evaluation volume per project | `/api/v2/usage/evaluations/...` | SDK load, flag sprawl |
| MAU by SDK type | `/api/v2/usage/mau/sdks` | Client vs. server balance |

**Thresholds to define:** Set internal alerts at 70% and 90% of your contracted cMAU limit. At 70%, notify the owning team. At 90%, escalate to platform ownership to negotiate overage terms or trigger a limit review.

**Projection model:** Use a rolling 3-month average growth rate per application to project when a team will hit its allocated cMAU budget. This gives teams 60-90 days notice to either optimize (reduce unique context churn, implement anonymous user strategies) or request additional allocation.

---

## Risks and Open Questions

**Plan-tier API availability:** The granularity of usage data available via API varies by LaunchDarkly plan. Some breakdowns visible in the UI may not be programmatically accessible. Validate each endpoint against your plan before building automation on top of it.

**Environment proliferation:** Teams that create many environments inflate service connection counts without proportional value. Define an environment governance policy (e.g., max N non-production environments per project) to contain this.

**Anonymous contexts:** Anonymous context keys are typically ephemeral and can inflate cMAU significantly. Teams using anonymous contexts should use LaunchDarkly's anonymous context handling (which can collapse anonymous users into a single key per SDK instance) rather than generating unique keys per session. This must be enforced at SDK integration review.

**Context kind governance:** Defining permissible context kinds org-wide prevents ad hoc proliferation. Every new context kind should be reviewed by the platform team before adoption.

**Backdating:** LaunchDarkly's MAU window is rolling 30 days. Chargeback should align to calendar months with the understanding that a small amount of carry-over is expected at month boundaries. Agree on which day of the month you pull the snapshot for billing.

---

## Summary Checklist

- [ ] All client-side SDKs configured with `applicationId`
- [ ] Gap report generated per project each billing period
- [ ] Unattributed cMAU assigned to project owner, not absorbed centrally
- [ ] Application registry documents owning team per application
- [ ] API access token (service account, Reader role) provisioned for usage queries
- [ ] Project-to-team ownership mapping documented
- [ ] Chargeback snapshot schedule agreed (day of month, who pulls it)
- [ ] Capacity alert thresholds set (70% / 90% of contracted cMAU)
- [ ] Anonymous context handling policy enforced