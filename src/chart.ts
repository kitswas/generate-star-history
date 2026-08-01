export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ChartOptions {
  theme: 'dark' | 'light' | 'auto';
}

/**
 * Transforms sparse data points into a daily cumulative series with interpolation
 */
export function processStargazers(stars: { date: string; count: number }[]): TimeSeriesPoint[] {
  if (stars.length === 0) return [];

  // Sort chronologically
  stars.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const result: TimeSeriesPoint[] = [];
  let currentCount = 0;

  const startDate = new Date(stars[0].date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(stars[stars.length - 1].date);
  endDate.setUTCHours(0, 0, 0, 0);

  // Create a map for quick lookups
  const starMap = new Map<string, number>();
  for (const s of stars) {
    const d = new Date(s.date);
    const dateStr = d.toISOString().split('T')[0];
    starMap.set(dateStr, Math.max(starMap.get(dateStr) ?? 0, s.count));
  }

  // Iterate day by day
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    if (starMap.has(dateStr)) {
      currentCount = starMap.get(dateStr)!;
    }
    result.push({ date: dateStr, count: currentCount });
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return result;
}

/**
 * Renders the SVG chart mathematically
 */
export function renderSvgChart(data: TimeSeriesPoint[], options: ChartOptions): string {
  const width = 800;
  const height = 400;
  const padding = { top: 40, right: 40, bottom: 60, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  if (data.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="auto">
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-family="sans-serif">No data available</text>
    </svg>`;
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

  // Generate Path
  let pathD = `M ${scaleX(data[0].date)} ${scaleY(data[0].count)}`;
  for (let i = 0; i < data.length; i++) {
    pathD += ` L ${scaleX(data[i].date)} ${scaleY(data[i].count)}`;
  }

  const areaD = `${pathD} L ${scaleX(data[data.length - 1].date)} ${scaleY(0)} L ${scaleX(data[0].date)} ${scaleY(0)} Z`;

  // Colors based on theme
  let bg = '#ffffff';
  let textPrimary = '#333333';
  let gridLine = '#e1e4e8';
  let primary = '#0366d6';

  if (options.theme === 'dark') {
    bg = '#0d1117';
    textPrimary = '#c9d1d9';
    gridLine = '#30363d';
    primary = '#58a6ff';
  }

  // Dynamic CSS for auto theme
  const styleStr =
    options.theme === 'auto'
      ? `
    <style>
      .bg { fill: #ffffff; }
      .text { fill: #333333; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; }
      .grid { stroke: #e1e4e8; stroke-width: 1; stroke-dasharray: 4; }
      .line { stroke: #0366d6; stroke-width: 2; fill: none; }
      .area { fill: #0366d6; fill-opacity: 0.1; }
      @media (prefers-color-scheme: dark) {
        .bg { fill: #0d1117; }
        .text { fill: #c9d1d9; }
        .grid { stroke: #30363d; }
        .line { stroke: #58a6ff; }
        .area { fill: #58a6ff; fill-opacity: 0.1; }
      }
    </style>
  `
      : `
    <style>
      .bg { fill: ${bg}; }
      .text { fill: ${textPrimary}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 12px; }
      .grid { stroke: ${gridLine}; stroke-width: 1; stroke-dasharray: 4; }
      .line { stroke: ${primary}; stroke-width: 2; fill: none; }
      .area { fill: ${primary}; fill-opacity: 0.1; }
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
</svg>`;
}
