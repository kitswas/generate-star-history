# Domain Glossary & Context

## Terms

### RawStarPoint

A single record containing a stargazer's timestamp (`starred_at`) and its estimated or exact 1-based chronological index (`count`) relative to the repository's total stars.

### TimeSeriesPoint

A daily aggregated data point containing an ISO date string (`YYYY-MM-DD`) and the cumulative star count on that day. Intervening days with 0 new stars are backfilled with the previous known count to maintain horizontal stability.

### StargazerFetcher

A deep module responsible for interacting with the GitHub REST API, calculating page-sampling distributions for large repositories, and gracefully degrading when API rate limits or errors are encountered.

### ChartRenderer

A deep module responsible for transforming time series data into a responsive, mathematically calculated SVG chart string with dynamic theme support (`dark`, `light`, `auto`).
