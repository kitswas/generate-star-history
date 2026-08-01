export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ChartOptions {
  theme: 'dark' | 'light' | 'auto';
}

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
 * Renders the SVG chart mathematically
 */
export function renderSvgChart(dataInput: TimeSeriesPoint[], options: ChartOptions): string {
  const width = 800;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  if (!Array.isArray(dataInput)) {
    dataInput = [];
  }

  // Filter valid points
  let data = dataInput
    .filter((d) => d && isValidIsoDate(d.date))
    .map((d) => ({
      date: d.date.includes('T') ? d.date.split('T')[0] : d.date,
      count: Number.isFinite(d.count) ? Math.max(0, Math.floor(d.count)) : 0
    }));

  if (data.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="sans-serif" fill="#666666">No data available</text>
    </svg>`;
  }

  // If only 1 data point exists, prepend a baseline 0 point from 1 day prior
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

  const maxCount = Math.max(...data.map((d) => d.count), 10);
  const startTime = new Date(data[0].date).getTime();
  const endTime = new Date(data[data.length - 1].date).getTime();
  const timeSpan = Math.max(endTime - startTime, 86400000); // minimum 1 day

  // Math scaling functions
  const scaleX = (dateStr: string) => {
    const t = new Date(dateStr).getTime();
    return padding.left + ((t - startTime) / timeSpan) * innerWidth;
  };

  const scaleY = (count: number) => {
    return padding.top + innerHeight - (count / maxCount) * innerHeight;
  };

  // Generate Path & Dots
  let pathD = `M ${scaleX(data[0].date)} ${scaleY(data[0].count)}`;
  let dotsMarkup = '';

  for (let i = 0; i < data.length; i++) {
    const cx = scaleX(data[i].date);
    const cy = scaleY(data[i].count);
    if (i > 0) {
      pathD += ` L ${cx} ${cy}`;
    }
    dotsMarkup += `<circle cx="${cx}" cy="${cy}" r="3" class="dot" />`;
  }

  const areaD = `${pathD} L ${scaleX(data[data.length - 1].date)} ${scaleY(0)} L ${scaleX(data[0].date)} ${scaleY(0)} Z`;

  // Colors based on theme
  let bg = '#ffffff';
  let textPrimary = '#333333';
  let gridLine = '#e1e4e8';
  let primary = '#0366d6';

  const theme = options?.theme ?? 'auto';

  if (theme === 'dark') {
    bg = '#0d1117';
    textPrimary = '#c9d1d9';
    gridLine = '#30363d';
    primary = '#58a6ff';
  }

  // Dynamic CSS for auto theme
  const styleStr =
    theme === 'auto'
      ? `
    <style>
      .bg { fill: #ffffff; }
      .text { fill: #333333; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; }
      .grid { stroke: #e1e4e8; stroke-width: 1; stroke-dasharray: 4; }
      .line { stroke: #0366d6; stroke-width: 2; fill: none; stroke-linecap: round; }
      .area { fill: #0366d6; fill-opacity: 0.1; }
      .dot { fill: #0366d6; }
      @media (prefers-color-scheme: dark) {
        .bg { fill: #0d1117; }
        .text { fill: #c9d1d9; }
        .grid { stroke: #30363d; }
        .line { stroke: #58a6ff; }
        .area { fill: #58a6ff; fill-opacity: 0.1; }
        .dot { fill: #58a6ff; }
      }
    </style>
  `
      : `
    <style>
      .bg { fill: ${bg}; }
      .text { fill: ${textPrimary}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; }
      .grid { stroke: ${gridLine}; stroke-width: 1; stroke-dasharray: 4; }
      .line { stroke: ${primary}; stroke-width: 2; fill: none; stroke-linecap: round; }
      .area { fill: ${primary}; fill-opacity: 0.1; }
      .dot { fill: ${primary}; }
    </style>
  `;

  // Grid and labels
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

  let xLabels = '';
  xLabels += `<text x="${padding.left}" y="${height - 20}" class="text" text-anchor="middle">${data[0].date}</text>`;
  xLabels += `<text x="${width - padding.right}" y="${height - 20}" class="text" text-anchor="middle">${data[data.length - 1].date}</text>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
  ${styleStr}
  <rect width="100%" height="100%" class="bg" />
  <g class="grids">${yGrids}</g>
  <g class="labels">${xLabels}</g>
  <path d="${areaD}" class="area" />
  <path d="${pathD}" class="line" />
  <g class="dots">${dotsMarkup}</g>
</svg>`;
}
