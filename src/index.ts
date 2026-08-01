import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface StargazerItem {
  starred_at: string;
}

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

  // Sort chronologically just to be safe
  stars.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const result: TimeSeriesPoint[] = [];
  let currentCount = 0;

  const startDate = new Date(stars[0].date);
  // Reset to start of day
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(stars[stars.length - 1].date);
  endDate.setUTCHours(0, 0, 0, 0);

  // Create a map for quick lookups
  const starMap = new Map<string, number>();
  for (const s of stars) {
    const d = new Date(s.date);
    const dateStr = d.toISOString().split('T')[0];
    // Keep max count for the day
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
  // simple start and end labels
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

/**
 * Main execution loop
 */
async function run() {
  try {
    const token = core.getInput('github-token', { required: true });
    const outputPath = core.getInput('output-path') || 'assets/star-history.svg';
    const themeInput = (core.getInput('theme') || 'auto') as ChartOptions['theme'];

    const octokit = github.getOctokit(token);
    const context = github.context;

    // 1. Fetch repo total stars
    const { data: repo } = await octokit.rest.repos.get({
      owner: context.repo.owner,
      repo: context.repo.repo
    });

    const totalStars = repo.stargazers_count;
    if (totalStars === 0) {
      core.info('Repository has 0 stars. Generating empty chart.');
      const svg = renderSvgChart([], { theme: themeInput });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, svg, 'utf-8');
      return;
    }

    // 2. Page sampling
    const totalPages = Math.ceil(totalStars / 100);
    const pagesToFetch: number[] = [];

    if (totalPages <= 30) {
      for (let i = 1; i <= totalPages; i++) {
        pagesToFetch.push(i);
      }
    } else {
      pagesToFetch.push(1);
      const step = (totalPages - 2) / 28;
      for (let i = 1; i <= 28; i++) {
        pagesToFetch.push(Math.round(1 + i * step));
      }
      pagesToFetch.push(totalPages);
      // Remove duplicates just in case
      const uniquePages = Array.from(new Set(pagesToFetch)).sort((a, b) => a - b);
      pagesToFetch.length = 0;
      pagesToFetch.push(...uniquePages);
    }

    core.info(`Fetching ${pagesToFetch.length} pages out of ${totalPages} total pages`);

    const rawData: { date: string; count: number }[] = [];

    // 3. Fetch sampled pages
    try {
      for (const page of pagesToFetch) {
        const { data: stargazers } = await octokit.rest.activity.listStargazersForRepo({
          owner: context.repo.owner,
          repo: context.repo.repo,
          per_page: 100,
          page,
          headers: {
            accept: 'application/vnd.github.star+json'
          }
        });

        // The API returns mixed types depending on the header, we must cast it
        const starItems = stargazers as unknown as { starred_at: string }[];

        for (let i = 0; i < starItems.length; i++) {
          const item = starItems[i];
          if (!item.starred_at) continue;
          const globalIndex = (page - 1) * 100 + i + 1;
          rawData.push({
            date: item.starred_at,
            count: globalIndex
          });
        }
      }
    } catch (err) {
      core.warning(
        'Encountered an error while fetching stargazers. Will render partial data. Error: ' +
          (err instanceof Error ? err.message : String(err))
      );
    }

    if (rawData.length === 0) {
      core.warning('No stargazers with timestamps could be fetched.');
    }

    // Add current point
    rawData.push({
      date: new Date().toISOString(),
      count: totalStars
    });

    // 4. Process and render
    const timeSeries = processStargazers(rawData);
    const svg = renderSvgChart(timeSeries, { theme: themeInput });

    // 5. Write to output
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, svg, 'utf-8');

    core.setOutput('svg-path', outputPath);
    core.info(`Successfully generated star history chart at ${outputPath}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(String(error));
    }
  }
}

// Ensure the code runs only when executed directly, not during testing
if (process.env.NODE_ENV !== 'test' && import.meta.url.endsWith(process.argv[1] ?? '')) {
  run();
}
