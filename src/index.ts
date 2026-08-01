import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fetchSampledStargazers } from './fetcher.js';
import { processStargazers, renderSvgChart, type ChartOptions } from './chart.js';

export { processStargazers, renderSvgChart };
export type { ChartOptions };

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

    // Parse repository owner & name
    let owner = context.repo.owner;
    let repo = context.repo.repo;

    if (targetRepoInput && targetRepoInput.includes('/')) {
      const parts = targetRepoInput.split('/');
      owner = parts[0].trim();
      repo = parts[1].trim();
    }

    core.info(`Target repository: ${owner}/${repo}`);

    // 1. Fetch total repo star count
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo
    });

    const totalStars = repoData.stargazers_count;
    if (totalStars === 0) {
      core.info(`Repository ${owner}/${repo} has 0 stars. Generating empty chart.`);
      const svg = renderSvgChart([], { theme: themeInput });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, svg, 'utf-8');
      return;
    }

    // 2. Fetch sampled stargazers via deep fetcher module
    const rawData = await fetchSampledStargazers(owner, repo, octokit, totalStars);

    if (rawData.length === 0) {
      core.warning('No stargazers with timestamps could be fetched.');
    }

    // Add current endpoint data point
    rawData.push({
      date: new Date().toISOString(),
      count: totalStars
    });

    // 3. Transform & render chart via deep renderer module
    const timeSeries = processStargazers(rawData);
    const svg = renderSvgChart(timeSeries, { theme: themeInput });

    // 4. Save file & set output
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
