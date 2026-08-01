import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fetchSampledStargazers } from './fetcher.js';
import {
  processStargazers,
  renderSvgChart,
  type ChartOptions,
  type RepositorySeries
} from './chart.js';

export { processStargazers, renderSvgChart };
export type { ChartOptions, RepositorySeries };

/**
 * Main Action Execution Orchestrator
 */
async function run() {
  try {
    const token = core.getInput('github-token', { required: true });
    const targetRepoInput = core.getInput('repository');
    const outputPath = core.getInput('output-path') || 'assets/star-history.svg';
    const themeInput = (core.getInput('theme') || 'auto') as ChartOptions['theme'];

    const octokit = github.getOctokit(token);
    const context = github.context;

    // Parse repository list (comma-separated or single)
    const rawRepoList = targetRepoInput
      ? targetRepoInput
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : [`${context.repo.owner}/${context.repo.repo}`];

    const allSeries: RepositorySeries[] = [];

    for (const repoSlug of rawRepoList) {
      let owner = context.repo.owner;
      let repo = context.repo.repo;

      if (repoSlug.includes('/')) {
        const parts = repoSlug.split('/');
        owner = parts[0].trim();
        repo = parts[1].trim();
      }

      core.info(`Fetching stargazers for target repository: ${owner}/${repo}`);

      try {
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
        const totalStars = repoData.stargazers_count;

        if (totalStars === 0) {
          core.info(`Repository ${owner}/${repo} has 0 stars.`);
          allSeries.push({
            name: `${owner}/${repo}`,
            data: []
          });
          continue;
        }

        const rawData = await fetchSampledStargazers(owner, repo, octokit, totalStars);
        rawData.push({
          date: new Date().toISOString(),
          count: totalStars
        });

        const timeSeries = processStargazers(rawData);
        allSeries.push({
          name: `${owner}/${repo}`,
          data: timeSeries
        });
      } catch (err) {
        core.warning(
          `Failed to fetch data for ${owner}/${repo}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (allSeries.length === 0 || allSeries.every((s) => s.data.length === 0)) {
      core.info('No stargazer data retrieved for any repository. Generating empty chart.');
      const svg = renderSvgChart([], { theme: themeInput });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, svg, 'utf-8');
      return;
    }

    // Transform & render multi-series SVG chart
    const svg = renderSvgChart(allSeries, { theme: themeInput });

    // Save file & set output
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
