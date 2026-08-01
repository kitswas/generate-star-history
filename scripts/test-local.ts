import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as github from '@actions/github';
import { fetchSampledStargazers } from '../src/fetcher.js';
import { processStargazers, renderSvgChart, type ChartOptions } from '../src/chart.js';

async function generateLocalChart() {
  const token = process.env.GITHUB_TOKEN;
  const repoSlug = process.env.REPO; // default test repo
  const outputPath = process.env.OUTPUT || 'assets/star-history-test.svg';
  const theme = (process.env.THEME || 'auto') as ChartOptions['theme'];

  if (!token) {
    console.log('ℹ️ No GITHUB_TOKEN provided. Generating chart using mock data...');
    const mockData = [
      { date: '2023-01-01T00:00:00Z', count: 150 },
      { date: '2023-04-15T00:00:00Z', count: 800 },
      { date: '2023-08-20T00:00:00Z', count: 2100 },
      { date: '2024-01-10T00:00:00Z', count: 4500 },
      { date: '2024-06-01T00:00:00Z', count: 8900 }
    ];

    const timeSeries = processStargazers(mockData);
    const svg = renderSvgChart(timeSeries, { theme });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, svg, 'utf-8');
    console.log(`✅ Mock SVG generated successfully at: ${outputPath}`);
    return;
  }

  const [owner, repo] = repoSlug.split('/');
  console.log(`🚀 Fetching real star history for ${owner}/${repo}...`);

  const octokit = github.getOctokit(token);

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const totalStars = repoData.stargazers_count;

  const rawData = await fetchSampledStargazers(owner, repo, octokit, totalStars);
  rawData.push({
    date: new Date().toISOString(),
    count: totalStars
  });

  const timeSeries = processStargazers(rawData);
  const svg = renderSvgChart(timeSeries, { theme });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, svg, 'utf-8');
  console.log(`✅ Real repo SVG generated successfully at: ${outputPath}`);
}

generateLocalChart().catch((err) => {
  console.error('❌ Failed to generate chart:', err);
  process.exit(1);
});
