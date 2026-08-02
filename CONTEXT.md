# Domain Glossary & Context

## Terms

### RawStarPoint

A single record containing a stargazer's timestamp (`starred_at`) and its estimated or exact 1-based chronological index (`count`) relative to the repository's total stars. Emitted by `fetchSampledStargazers` and consumed internally by `processStargazers`.

### TimeSeriesPoint

A daily aggregated data point containing an ISO date string (`YYYY-MM-DD`) and the cumulative star count on that day. Intervening days with 0 new stars are backfilled with the previous known count to maintain horizontal stability in the rendered chart.

### RepositorySeries

A named time-series data structure representing a single repository's star history: `{ name, color?, data: TimeSeriesPoint[] }`. The unit of composition for multi-repository comparison charts. Produced by `fetchStarHistory` and consumed by `renderChart`.

### ChartOptions

The caller-visible configuration surface for the chart renderer: currently `{ theme: 'dark' | 'light' | 'auto' }`. Callers never touch SVG coordinates, color palettes, legend placement, or animation parameters — those are implementation details of `ChartRenderer`.

### ChartLegend

A visual component rendered at the top of a multi-repository chart containing color-coded `<rect>` badges and repository name labels (`<text>`). Automatically emitted by `renderChart` when more than one `RepositorySeries` is present.

### AnimatedSvg

SVG chart markup enhanced with CSS keyframe stroke-dasharray animations (`@keyframes draw`) for progressive 1.2s ease-out line rendering and CSS transition hover effects on data point `<circle>` elements.

### DensityThreshold

A horizontal distance boundary ($< 15\text{px}$ average spacing between consecutive data points on the SVG canvas) that determines when a `RepositorySeries` is dense. When dense, static `<circle>` data dots are suppressed to eliminate visual clutter, and line pathing switches to monotone cubic spline curve smoothing.

### MonotoneCubicSpline

Fritsch-Carlson monotone cubic spline interpolation algorithm implemented in `generateMonotoneCubicPath` (`src/chart.ts`). Computes cubic Bezier `C` path instructions for dense series that preserve monotonic trends without overshooting or undershooting data bounds.

### StargazerFetcher

The deep module in `src/fetcher.ts`. Exposes two seams:

- **External seam** — `fetchStarHistory(targetRepoInput, octokit, defaultOwner?, defaultRepo?)`: hides repository string parsing, `GET /repos/{owner}/{repo}` metadata queries, page-sampling distribution, Tier 1 / Tier 2 REST header fallbacks, permission diagnostics, and time-series interpolation behind a single entry point.
- **Internal seam** — `fetchSampledStargazers(owner, repo, octokit, totalStars)`: used only by `fetchStarHistory`; responsible for paginated REST calls with rate-limit recovery.

### ChartRenderer

The deep module in `src/chart.ts`. Exposes two seams:

- **External seam** — `renderChart(inputData, options?)`: accepts either a legacy `TimeSeriesPoint[]` or a `RepositorySeries[]` and returns a fully-formed, self-contained SVG string. Hides baseline prepending, date sanitization, color palette assignment, coordinate scaling, legend generation, and CSS animation embedding.
- **Internal seam** — `processStargazers(stars)`: used only by `fetchStarHistory`; transforms sparse `RawStarPoint[]` arrays into smooth daily `TimeSeriesPoint[]` time series with linear backfill.
- **Backwards-compatibility alias** — `renderSvgChart` re-exports `renderChart`.

### MockGitHubApi

A lightweight local mock HTTP server in `src/mock-api.ts` built using Node's native `http.createServer()`. Matches GitHub REST API routes for `GET /repos/{owner}/{repo}` and `GET /repos/{owner}/{repo}/stargazers`, supporting the `application/vnd.github.star+json` media header and simulating 6 scenarios: 200 OK (star+json), 200 OK (json fallback), 403 Forbidden, 422 Unprocessable Entity, 429 Rate Limit, and empty stargazer list. Uses `port: 0` for OS-assigned dynamic port to prevent `EADDRINUSE` conflicts across parallel Vitest workers.

### FuzzTestSuite

Generative test suite in `src/fuzz.test.ts` using `fast-check` property-based testing. Feeds thousands of randomized, malformed, out-of-order, or extreme edge-case payloads to `processStargazers` and `renderChart` to guarantee crash resilience, program termination, and ISO-date boundary handling (year range 2000–2100).

## Architecture Decisions

### Seam placement: deep entry points, not shallow pass-throughs

Both `fetchStarHistory` (in `StargazerFetcher`) and `renderChart` (in `ChartRenderer`) are designed as deep modules. Callers in `src/index.ts` see a 2-call orchestrator. Implementation complexity (parsing, pagination, retry, interpolation, SVG layout) is fully contained behind the seam, giving callers high leverage and maintainers high locality.

### No seam between rendering and data transformation

`processStargazers` is an internal function inside `ChartRenderer`'s implementation — not a public seam. Exposing it as a separate module would be shallow: callers would have to sequence two calls correctly, and the ordering constraint would become a hidden invariant. Because only `fetchStarHistory` calls it, it stays private behind `renderChart`.

### Zero native binary dependencies

SVG generation is done via pure mathematical coordinate computation (no D3, no Canvas, no C++ build). This guarantees reproducible builds across environments and zero system-level installation requirements.

### Dynamic port assignment in MockGitHubApi

`MockGitHubApi` defaults to `port: 0` to let the OS assign a free port. This prevents `EADDRINUSE` errors when Vitest runs test files in parallel workers, each starting their own mock server instance.
