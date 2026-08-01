export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface RepositorySeries {
  name: string;
  color?: string;
  data: TimeSeriesPoint[];
}

export interface ChartOptions {
  theme: 'dark' | 'light' | 'auto';
}

const DEFAULT_PALETTE = [
  '#0366d6', // Blue
  '#28a745', // Green
  '#d73a49', // Red
  '#6f42c1', // Purple
  '#e36209', // Orange
  '#005cc5', // Dark Blue
  '#22863a' // Dark Green
];

function isValidIsoDate(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string' || dateStr.trim().length === 0) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  try {
    const year = new Date(t).getUTCFullYear();
    return year >= 2000 && year <= 2100;
  } catch {
    return false;
  }
}

/**
 * Transforms sparse data points into a daily cumulative series with interpolation
 */
export function processStargazers(stars: { date: string; count: number }[]): TimeSeriesPoint[] {
  if (!Array.isArray(stars) || stars.length === 0) return [];

  // Filter valid dates and normalize counts
  const validStars = stars
    .filter((s) => s && isValidIsoDate(s.date))
    .map((s) => ({
      date: s.date,
      count: Number.isFinite(s.count) ? Math.max(0, Math.floor(s.count)) : 0
    }));

  if (validStars.length === 0) return [];

  // Sort chronologically
  validStars.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const result: TimeSeriesPoint[] = [];
  let currentCount = 0;

  const startDate = new Date(validStars[0].date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(validStars[validStars.length - 1].date);
  endDate.setUTCHours(0, 0, 0, 0);

  // Limit max date range (max 10 years / 3650 days) to avoid long execution loops
  const diffDays = Math.min(
    Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))),
    3650
  );

  // Create a map for quick lookups
  const starMap = new Map<string, number>();
  for (const s of validStars) {
    try {
      const d = new Date(s.date);
      const dateStr = d.toISOString().split('T')[0];
      starMap.set(dateStr, Math.max(starMap.get(dateStr) ?? 0, s.count));
    } catch {
      // Ignore invalid date conversion errors
    }
  }

  // Iterate day by day
  const currentDate = new Date(startDate);
  for (let day = 0; day <= diffDays; day++) {
    try {
      const dateStr = currentDate.toISOString().split('T')[0];
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
 * Renders the SVG chart mathematically with animation and multi-series support
 */
export function renderSvgChart(
  inputData: TimeSeriesPoint[] | RepositorySeries[],
  options: ChartOptions
): string {
  const width = 800;
  const height = 400;

  // Convert legacy single-series input to RepositorySeries[]
  let seriesList: RepositorySeries[] = [];

  if (Array.isArray(inputData) && inputData.length > 0) {
    if ('data' in inputData[0]) {
      seriesList = inputData as RepositorySeries[];
    } else {
      seriesList = [{ name: 'Stargazers', data: inputData as TimeSeriesPoint[] }];
    }
  }

  const padding = { top: seriesList.length > 1 ? 60 : 40, right: 40, bottom: 60, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Normalize series data
  const normalizedSeries: RepositorySeries[] = seriesList
    .map((s, idx) => {
      let data = (s.data ?? [])
        .filter((d) => d && isValidIsoDate(d.date))
        .map((d) => ({
          date: d.date.includes('T') ? d.date.split('T')[0] : d.date,
          count: Number.isFinite(d.count) ? Math.max(0, Math.floor(d.count)) : 0
        }));

      if (data.length === 1) {
        try {
          const prevDate = new Date(data[0].date);
          prevDate.setUTCDate(prevDate.getUTCDate() - 1);
          const prevDateStr = prevDate.toISOString().split('T')[0];
          data = [{ date: prevDateStr, count: 0 }, ...data];
        } catch {
          // Keep single point if ISO conversion fails
        }
      }

      return {
        name: s.name || `Series ${idx + 1}`,
        color: s.color || DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length],
        data
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
  const maxCount = Math.max(...allCounts, 10);

  const allStartTimes = normalizedSeries.map((s) => new Date(s.data[0].date).getTime());
  const allEndTimes = normalizedSeries.map((s) =>
    new Date(s.data[s.data.length - 1].date).getTime()
  );

  const globalStartTime = Math.min(...allStartTimes);
  const globalEndTime = Math.max(...allEndTimes);
  const timeSpan = Math.max(globalEndTime - globalStartTime, 86400000);

  const globalStartDateStr = new Date(globalStartTime).toISOString().split('T')[0];
  const globalEndDateStr = new Date(globalEndTime).toISOString().split('T')[0];

  // Scaling helpers
  const scaleX = (dateStr: string) => {
    const t = new Date(dateStr).getTime();
    return padding.left + ((t - globalStartTime) / timeSpan) * innerWidth;
  };

  const scaleY = (count: number) => {
    return padding.top + innerHeight - (count / maxCount) * innerHeight;
  };

  // Colors based on theme
  let bg = '#ffffff';
  let textPrimary = '#333333';
  let gridLine = '#e1e4e8';

  const theme = options?.theme ?? 'auto';
  if (theme === 'dark') {
    bg = '#0d1117';
    textPrimary = '#c9d1d9';
    gridLine = '#30363d';
  }

  // Generate paths, area fill, and dots per series
  let seriesMarkup = '';
  let legendMarkup = '';

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
    let pathD = `M ${scaleX(s.data[0].date)} ${scaleY(s.data[0].count)}`;
    let dotsMarkup = '';

    for (let i = 0; i < s.data.length; i++) {
      const cx = scaleX(s.data[i].date);
      const cy = scaleY(s.data[i].count);
      if (i > 0) {
        pathD += ` L ${cx} ${cy}`;
      }
      dotsMarkup += `<circle cx="${cx}" cy="${cy}" r="3" fill="${s.color}" class="dot" />`;
    }

    const areaD = `${pathD} L ${scaleX(s.data[s.data.length - 1].date)} ${scaleY(0)} L ${scaleX(s.data[0].date)} ${scaleY(0)} Z`;

    seriesMarkup += `
      <g class="series-group series-${sIdx}">
        <path d="${areaD}" fill="${s.color}" fill-opacity="0.08" class="area" />
        <path d="${pathD}" stroke="${s.color}" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="line line-anim" />
        <g class="dots">${dotsMarkup}</g>
      </g>
    `;
  });

  // Dynamic CSS styling & keyframe animations
  const styleStr =
    theme === 'auto'
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
  let yGrids = '';
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxCount / ySteps) * i;
    const yPos = scaleY(val);
    yGrids += `
      <line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" class="grid" />
      <text x="${padding.left - 10}" y="${yPos + 4}" class="text" text-anchor="end">${Math.round(val)}</text>
    `;
  }

  // X labels
  let xLabels = '';
  xLabels += `<text x="${padding.left}" y="${height - 20}" class="text" text-anchor="middle">${globalStartDateStr}</text>`;
  xLabels += `<text x="${width - padding.right}" y="${height - 20}" class="text" text-anchor="middle">${globalEndDateStr}</text>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
  ${styleStr}
  <rect width="100%" height="100%" class="bg" />
  ${legendMarkup ? `<g class="legend">${legendMarkup}</g>` : ''}
  <g class="grids">${yGrids}</g>
  <g class="labels">${xLabels}</g>
  ${seriesMarkup}
</svg>`;
}
