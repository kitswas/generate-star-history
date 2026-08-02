/** A daily aggregated data point produced by processStargazers. */
export interface TimeSeriesPoint {
	/** ISO date string in YYYY-MM-DD format. */
	date: string;
	/** Cumulative star count on this day. Days with no new stars carry the previous count forward. */
	count: number;
}

/** A named time-series representing a single repository's star history. */
export interface RepositorySeries {
	/** Full repository slug, e.g. "owner/repo". Used for the chart legend label. */
	name: string;
	/** Override the auto-assigned color from the default palette. */
	color?: string;
	/** Ordered daily time-series data points from processStargazers. */
	data: TimeSeriesPoint[];
}

/** Caller-visible configuration surface for the ChartRenderer. */
export interface ChartOptions {
	/**
	 * Chart color theme.
	 * - `'auto'`: Respects the viewer's system `prefers-color-scheme` media query.
	 * - `'dark'`: Forces dark background (#0d1117).
	 * - `'light'`: Forces light background (#ffffff).
	 */
	theme: "dark" | "light" | "auto";
}

const DEFAULT_PALETTE = [
	"#0366d6", // Blue
	"#28a745", // Green
	"#d73a49", // Red
	"#6f42c1", // Purple
	"#e36209", // Orange
	"#005cc5", // Dark Blue
	"#22863a", // Dark Green
];

function isValidIsoDate(dateStr: unknown): boolean {
	if (typeof dateStr !== "string" || dateStr.trim().length === 0) return false;
	const d = new Date(dateStr);
	const t = d.getTime();
	if (isNaN(t)) return false;
	try {
		d.toISOString();
		const year = d.getUTCFullYear();
		return year >= 2000 && year <= 2100;
	} catch {
		return false;
	}
}

/**
 * Formats a numeric count into a human-readable Y-axis tick label using 'k' or 'M' suffixes.
 */
export function formatYTickLabel(val: number): string {
	if (val >= 1_000_000) {
		const formatted = (val / 1_000_000).toFixed(1);
		return (
			(formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "M"
		);
	}
	if (val >= 1_000) {
		const formatted = (val / 1_000).toFixed(1);
		return (
			(formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted) + "k"
		);
	}
	return String(Math.round(val));
}

/**
 * Computes SVG path string with monotone cubic Bezier curves ('C') to prevent curve overshooting.
 * Uses Fritsch-Carlson monotone cubic spline interpolation algorithm.
 */
export function generateMonotoneCubicPath(
	points: { x: number; y: number }[],
): string {
	if (points.length < 1) return "";
	if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
	if (points.length === 2) {
		return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
	}

	const n = points.length;
	const dx: number[] = [];
	const dy: number[] = [];
	const ms: number[] = [];

	for (let i = 0; i < n - 1; i++) {
		const delX = points[i + 1].x - points[i].x;
		const delY = points[i + 1].y - points[i].y;
		dx.push(delX);
		dy.push(delY);
		ms.push(delX === 0 ? 0 : delY / delX);
	}

	const c1s: number[] = [ms[0]];
	for (let i = 0; i < n - 2; i++) {
		const m = ms[i];
		const mNext = ms[i + 1];
		if (m * mNext <= 0) {
			c1s.push(0);
		} else {
			const common = dx[i] + dx[i + 1];
			c1s.push(
				(3 * common) / ((common + dx[i + 1]) / m + (common + dx[i]) / mNext),
			);
		}
	}
	c1s.push(ms[ms.length - 1]);

	let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
	for (let i = 0; i < n - 1; i++) {
		const p1 = points[i];
		const p2 = points[i + 1];
		const d = dx[i];
		path += ` C ${(p1.x + d / 3).toFixed(2)} ${(p1.y + (c1s[i] * d) / 3).toFixed(2)}, ${(p2.x - d / 3).toFixed(2)} ${(p2.y - (c1s[i + 1] * d) / 3).toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
	}

	return path;
}

/**
 * Simplifies daily time-series points for smooth curve interpolation by retaining
 * only key star growth change points and range endpoints.
 */
export function simplifySeriesData(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
	if (!Array.isArray(data) || data.length <= 2) return data;

	const simplified: TimeSeriesPoint[] = [data[0]];

	for (let i = 1; i < data.length - 1; i++) {
		const prev = data[i - 1];
		const curr = data[i];
		const next = data[i + 1];

		// Retain point if star count changed from previous day or is about to change next day
		if (curr.count !== prev.count || curr.count !== next.count) {
			simplified.push(curr);
		}
	}

	simplified.push(data[data.length - 1]);

	// Deduplicate consecutive identical points
	const result: TimeSeriesPoint[] = [simplified[0]];
	for (let i = 1; i < simplified.length - 1; i++) {
		const prev = simplified[i - 1];
		const curr = simplified[i];
		const next = simplified[i + 1];

		if (prev.count === curr.count && curr.count === next.count) {
			continue;
		}
		result.push(curr);
	}
	result.push(simplified[simplified.length - 1]);

	return result;
}

/**
 * Calculates neat power-of-ten Y-axis ticks and upper bound for a given peak star count.
 */
export function calculateYAxisTicks(maxRawCount: number): {
	yMax: number;
	ticks: number[];
} {
	const safeCount = Math.max(1, Math.ceil(maxRawCount));
	if (safeCount <= 10) {
		return { yMax: 10, ticks: Array.from({ length: 11 }, (_, i) => i) };
	}

	const exp = Math.floor(Math.log10(safeCount));
	const baseStep = Math.pow(10, exp - 1);
	const candidates = [1, 2, 5, 10];

	let selectedStep = baseStep * 10;
	let yMax = selectedStep;

	for (const mult of candidates) {
		const step = baseStep * mult;
		let candidateYMax = Math.ceil(safeCount / step) * step;

		// If safeCount is an exact multiple of step, add one step so graph ceiling doesn't clip top line
		if (
			candidateYMax === safeCount &&
			safeCount % step === 0 &&
			safeCount > 10
		) {
			candidateYMax = Math.ceil((safeCount + 1) / step) * step;
		}

		const numTicks = Math.round(candidateYMax / step);
		if (numTicks >= 4 && numTicks <= 10) {
			selectedStep = step;
			yMax = candidateYMax;
			break;
		}
	}

	const ticks: number[] = [];
	for (let val = 0; val <= yMax; val += selectedStep) {
		ticks.push(Math.round(val));
	}

	return { yMax, ticks };
}

/**
 * Transforms sparse `RawStarPoint[]` records into a smooth daily cumulative `TimeSeriesPoint[]` time series.
 *
 * - Filters out invalid or out-of-range ISO dates (year 2000–2100).
 * - Sorts chronologically and backfills intermediate days with the last known count.
 * - Caps the date range at 3650 days (10 years) to prevent excessive iteration.
 *
 * @internal Used by `fetchStarHistory` in StargazerFetcher — not intended as a standalone public entry point.
 */
export function processStargazers(
	stars: { date: string; count: number }[],
): TimeSeriesPoint[] {
	if (!Array.isArray(stars) || stars.length === 0) return [];

	// Filter valid dates and normalize counts
	const validStars = stars
		.filter((s) => s && isValidIsoDate(s.date))
		.map((s) => ({
			date: s.date,
			count: Number.isFinite(s.count) ? Math.max(0, Math.floor(s.count)) : 0,
		}));

	if (validStars.length === 0) return [];

	// Sort chronologically
	validStars.sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);

	const result: TimeSeriesPoint[] = [];
	let currentCount = 0;

	const startDate = new Date(validStars[0].date);
	startDate.setUTCHours(0, 0, 0, 0);

	const endDate = new Date(validStars[validStars.length - 1].date);
	endDate.setUTCHours(0, 0, 0, 0);

	// Limit max date range (max 10 years / 3650 days) to avoid long execution loops
	const diffDays = Math.min(
		Math.max(
			0,
			Math.floor(
				(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
			),
		),
		3650,
	);

	// Create a map for quick lookups
	const starMap = new Map<string, number>();
	for (const s of validStars) {
		try {
			const d = new Date(s.date);
			const dateStr = d.toISOString().split("T")[0];
			starMap.set(dateStr, Math.max(starMap.get(dateStr) ?? 0, s.count));
		} catch {
			// Ignore invalid date conversion errors
		}
	}

	// Iterate day by day
	const currentDate = new Date(startDate);
	for (let day = 0; day <= diffDays; day++) {
		try {
			const dateStr = currentDate.toISOString().split("T")[0];
			if (starMap.has(dateStr)) {
				currentCount = starMap.get(dateStr)!;
			}
			result.push({ date: dateStr, count: currentCount });
			currentDate.setUTCDate(currentDate.getUTCDate() + 1);
		} catch {
			break;
		}
	}

	return result;
}

/**
 * Deep ChartRenderer entry point. Converts one or more repository star-history series into a
 * fully self-contained, animated SVG string ready to write to disk.
 *
 * Accepts either:
 * - A single `TimeSeriesPoint[]` (legacy single-repo mode)
 * - A `RepositorySeries[]` (multi-repo comparison mode)
 *
 * Hides all implementation complexity — baseline prepending, date sanitization, color palette
 * distribution, coordinate scaling, legend badge generation, and CSS `@keyframes draw`
 * stroke-dasharray animation embedding.
 *
 * @param inputData - One or more repository time-series. Accepts both legacy and multi-series inputs.
 * @param options   - Optional chart display options (theme). Defaults to `{ theme: 'auto' }`.
 * @returns         A complete, UTF-8 encoded SVG string.
 */
export function renderChart(
	inputData: TimeSeriesPoint[] | RepositorySeries[],
	options?: ChartOptions,
): string {
	const width = 800;
	const height = 400;

	// Convert legacy single-series input to RepositorySeries[]
	let seriesList: RepositorySeries[] = [];

	if (Array.isArray(inputData) && inputData.length > 0) {
		if ("data" in inputData[0]) {
			seriesList = inputData as RepositorySeries[];
		} else {
			seriesList = [
				{ name: "Stargazers", data: inputData as TimeSeriesPoint[] },
			];
		}
	}

	const padding = {
		top: seriesList.length > 1 ? 60 : 40,
		right: 40,
		bottom: 60,
		left: 60,
	};
	const innerWidth = width - padding.left - padding.right;
	const innerHeight = height - padding.top - padding.bottom;

	// Normalize series data
	const normalizedSeries: RepositorySeries[] = seriesList
		.map((s, idx) => {
			let data = (s.data ?? [])
				.filter((d) => d && isValidIsoDate(d.date))
				.map((d) => ({
					// Use toISOString() on the parsed Date to produce a canonical YYYY-MM-DD key.
					// Splitting the raw input string (e.g. "T 1".split('T')[0] === "") produces
					// empty strings for exotic-but-valid date strings, breaking downstream lookups.
					date: new Date(d.date).toISOString().split("T")[0],
					count: Number.isFinite(d.count)
						? Math.max(0, Math.floor(d.count))
						: 0,
				}));

			if (data.length === 1) {
				try {
					const prevDate = new Date(data[0].date);
					prevDate.setUTCDate(prevDate.getUTCDate() - 1);
					const prevDateStr = prevDate.toISOString().split("T")[0];
					data = [{ date: prevDateStr, count: 0 }, ...data];
				} catch {
					// Keep single point if ISO conversion fails
				}
			}

			return {
				name: s.name || `Series ${idx + 1}`,
				color: s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
				data,
			};
		})
		.filter((s) => s.data.length > 0);

	if (normalizedSeries.length === 0) {
		return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="sans-serif" fill="#666666">No data available</text>
    </svg>`;
	}

	// Calculate global max count and time bounds across all series
	const allCounts = normalizedSeries.flatMap((s) => s.data.map((d) => d.count));
	const rawMaxCount = Math.max(...allCounts, 1);
	const { yMax, ticks: yTicks } = calculateYAxisTicks(rawMaxCount);

	const allStartTimes = normalizedSeries.map((s) =>
		new Date(s.data[0].date).getTime(),
	);
	const allEndTimes = normalizedSeries.map((s) =>
		new Date(s.data[s.data.length - 1].date).getTime(),
	);

	const globalStartTime = Math.min(...allStartTimes);
	const globalEndTime = Math.max(...allEndTimes);
	const timeSpan = Math.max(globalEndTime - globalStartTime, 86400000);

	const globalStartDateStr = new Date(globalStartTime)
		.toISOString()
		.split("T")[0];
	const globalEndDateStr = new Date(globalEndTime).toISOString().split("T")[0];

	// Scaling helpers
	const scaleX = (dateStr: string) => {
		const t = new Date(dateStr).getTime();
		return padding.left + ((t - globalStartTime) / timeSpan) * innerWidth;
	};

	const scaleY = (count: number) => {
		return padding.top + innerHeight - (count / yMax) * innerHeight;
	};

	// Colors based on theme
	let bg = "#ffffff";
	let textPrimary = "#333333";
	let gridLine = "#e1e4e8";

	const theme = options?.theme ?? "auto";
	if (theme === "dark") {
		bg = "#0d1117";
		textPrimary = "#c9d1d9";
		gridLine = "#30363d";
	}

	// Generate paths, area fill, and dots per series
	let seriesMarkup = "";
	let legendMarkup = "";

	if (normalizedSeries.length > 1) {
		let legendX = padding.left;
		const legendY = 25;
		normalizedSeries.forEach((s) => {
			legendMarkup += `
        <g class="legend-item" transform="translate(${legendX}, ${legendY})">
          <rect width="12" height="12" rx="3" fill="${s.color}" />
          <text x="18" y="10" class="text" font-weight="600">${s.name}</text>
        </g>
      `;
			legendX += s.name.length * 8 + 40;
		});
	}

	normalizedSeries.forEach((s, sIdx) => {
		const simplifiedData = simplifySeriesData(s.data);
		const points = simplifiedData.map((d) => ({
			x: scaleX(d.date),
			y: scaleY(d.count),
		}));

		const avgSpacing =
			points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;
		const isDense = avgSpacing < 15;

		let pathD = "";
		if (isDense) {
			pathD = generateMonotoneCubicPath(points);
		} else {
			pathD = `M ${points[0].x} ${points[0].y}`;
			for (let i = 1; i < points.length; i++) {
				pathD += ` L ${points[i].x} ${points[i].y}`;
			}
		}

		let dotsMarkup = "";
		if (!isDense) {
			for (let i = 0; i < points.length; i++) {
				dotsMarkup += `<circle cx="${points[i].x}" cy="${points[i].y}" r="3" fill="${s.color}" class="dot" />`;
			}
		}

		const areaD = `${pathD} L ${points[points.length - 1].x} ${scaleY(0)} L ${points[0].x} ${scaleY(0)} Z`;

		seriesMarkup += `
      <g class="series-group series-${sIdx}">
        <path d="${areaD}" fill="${s.color}" fill-opacity="0.08" class="area" />
        <path d="${pathD}" stroke="${s.color}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="line line-anim" />
        ${dotsMarkup ? `<g class="dots">${dotsMarkup}</g>` : ""}
      </g>
    `;
	});

	// Dynamic CSS styling & keyframe animations
	const styleStr =
		theme === "auto"
			? `
    <style>
      .bg { fill: #ffffff; }
      .text { fill: #333333; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; }
      .grid { stroke: #e1e4e8; stroke-width: 1; stroke-dasharray: 4; }
      .line-anim {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: draw 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      .dot {
        transition: transform 0.2s ease, r 0.2s ease;
        cursor: pointer;
      }
      .dot:hover {
        r: 6px;
      }
      @keyframes draw {
        to { stroke-dashoffset: 0; }
      }
      @media (prefers-color-scheme: dark) {
        .bg { fill: #0d1117; }
        .text { fill: #c9d1d9; }
        .grid { stroke: #30363d; }
      }
    </style>
  `
			: `
    <style>
      .bg { fill: ${bg}; }
      .text { fill: ${textPrimary}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; }
      .grid { stroke: ${gridLine}; stroke-width: 1; stroke-dasharray: 4; }
      .line-anim {
        stroke-dasharray: 2000;
        stroke-dashoffset: 2000;
        animation: draw 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      .dot {
        transition: transform 0.2s ease, r 0.2s ease;
        cursor: pointer;
      }
      .dot:hover {
        r: 6px;
      }
      @keyframes draw {
        to { stroke-dashoffset: 0; }
      }
    </style>
  `;

	// Grid and Y labels
	let yGrids = "";
	yTicks.forEach((val) => {
		const yPos = scaleY(val);
		const label = formatYTickLabel(val);
		yGrids += `
      <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" class="grid" />
      <text x="${padding.left - 10}" y="${yPos + 4}" class="text" text-anchor="end">${label}</text>
    `;
	});

	// X labels
	let xLabels = "";
	xLabels += `<text x="${padding.left}" y="${height - 20}" class="text" text-anchor="middle">${globalStartDateStr}</text>`;
	xLabels += `<text x="${width - padding.right}" y="${height - 20}" class="text" text-anchor="middle">${globalEndDateStr}</text>`;

	return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
  ${styleStr}
  <rect width="100%" height="100%" class="bg" />
  ${legendMarkup ? `<g class="legend">${legendMarkup}</g>` : ""}
  <g class="grids">${yGrids}</g>
  <g class="labels">${xLabels}</g>
  ${seriesMarkup}
</svg>`;
}

/**
 * Backwards-compatibility alias for `renderChart`.
 * @deprecated Use `renderChart` directly.
 */
export const renderSvgChart = renderChart;
