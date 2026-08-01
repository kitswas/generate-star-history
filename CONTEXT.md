# Domain Glossary & Context

## Terms

### RawStarPoint

A single record containing a stargazer's timestamp (`starred_at`) and its estimated or exact 1-based chronological index (`count`) relative to the repository's total stars.

### TimeSeriesPoint

A daily aggregated data point containing an ISO date string (`YYYY-MM-DD`) and the cumulative star count on that day. Intervening days with 0 new stars are backfilled with the previous known count to maintain horizontal stability.

### RepositorySeries

A named time-series data structure representing a repository (`name`, `color`, `data: TimeSeriesPoint[]`) used for multi-series comparison charting.

### ChartLegend

A visual component rendered at the top of a multi-repository chart containing color-coded badges and repository labels.

### AnimatedSvg

SVG chart markup enhanced with CSS keyframe stroke-dasharray animations (`@keyframes draw`) for progressive line rendering and CSS transition hover effects on data points.

### StargazerFetcher

A deep module responsible for interacting with the GitHub REST API, calculating page-sampling distributions for large repositories, and gracefully degrading when API rate limits or errors are encountered.

### ChartRenderer

A deep module responsible for transforming single or multi-repository time series data into a responsive, mathematically calculated SVG chart string with dynamic theme support (`dark`, `light`, `auto`) and SVG CSS animations.

### MockGitHubApi

A lightweight local mock server built using Node's native `http` server or `msw` that matches GitHub REST API responses for `/repos/{owner}/{repo}` and `/repos/{owner}/{repo}/stargazers`, adhering to schema specifications, custom media types (`application/vnd.github.star+json`), and simulating 403 Forbidden, 422 Unprocessable Entity, and rate limiting.

### FuzzTestSuite

Generative test suite (using `fast-check` property-based testing) that feeds thousands of randomized, malformed, out-of-order, or extreme edge-case payloads to `StargazerFetcher`, `processStargazers`, and `renderSvgChart` to guarantee program termination and crash resilience.
