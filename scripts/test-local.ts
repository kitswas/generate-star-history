import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as github from '@actions/github';
import { createMockGitHubApiServer } from '../src/mock-api.js';
import { fetchSampledStargazers } from '../src/fetcher.js';
import { processStargazers, renderSvgChart, type ChartOptions } from '../src/chart.js';

async function generateLocalChart() {
  const isMockMode = process.env.MOCK === 'true';
  const token = process.env.GITHUB_TOKEN ?? 'mock-token';
  const repoSlug = process.env.REPO || 'mock/repo-200';
  const outputPath = process.env.OUTPUT || 'assets/star-history-test.svg';
  const theme = (process.env.THEME || 'auto') as ChartOptions['theme'];

  let mockServer: ReturnType<typeof createMockGitHubApiServer> | null = null;

  if (isMockMode) {
    console.log('⚡ Booting up local Mock GitHub REST API server on http://127.0.0.1:9876 ...');
    mockServer = createMockGitHubApiServer({ port: 9876 });
    await mockServer.start();
  }

  try {
    if (!isMockMode && !process.env.GITHUB_TOKEN) {
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
    console.log(`🚀 Fetching star history for ${owner}/${repo}...`);

    const octokitOptions: Parameters<typeof github.getOctokit>[1] = {};
    if (isMockMode && mockServer) {
      octokitOptions.baseUrl = mockServer.baseUrl;
    }

    const octokit = github.getOctokit(token, octokitOptions);

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
    console.log(`✅ SVG generated successfully at: ${outputPath}`);
  } finally {
    if (mockServer) {
      await mockServer.stop();
    }
  }
}

generateLocalChart().catch((err) => {
  console.error('❌ Failed to generate chart:', err);
  process.exit(1);
});
