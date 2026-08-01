import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fetchStarHistory } from './fetcher.js';
import {
  renderChart,
  processStargazers,
  renderSvgChart,
  type ChartOptions,
  type RepositorySeries
} from './chart.js';

export { fetchStarHistory, renderChart, processStargazers, renderSvgChart };
export type { ChartOptions, RepositorySeries };

/**
 * Main Action Execution Orchestrator - Non-leaky 10-line runner
 */
async function run() {
  try {
    const token = core.getInput('github-token', { required: true });
    const targetRepoInput = core.getInput('repository');
    const outputPath = core.getInput('output-path') || 'assets/star-history.svg';
    const themeInput = (core.getInput('theme') || 'auto') as ChartOptions['theme'];

    const octokit = github.getOctokit(token);
    const context = github.context;

    // Deep modules: fetchStarHistory hides multi-repo orchestration & data aggregation; renderChart hides SVG generation
    const series = await fetchStarHistory(
      targetRepoInput,
      octokit,
      context.repo.owner,
      context.repo.repo
    );
    const svg = renderChart(series, { theme: themeInput });

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
