import * as core from '@actions/core';
import type * as github from '@actions/github';
import { processStargazers, type RepositorySeries, type TimeSeriesPoint } from './chart.js';

/**
 * A single record from the GitHub stargazers API containing a timestamp and 1-based ordinal index.
 * Produced by `fetchSampledStargazers` and consumed by `processStargazers`.
 */
export interface RawStarPoint {
  /** ISO 8601 timestamp of the star event (`starred_at`). */
  date: string;
  /** 1-based chronological index of this stargazer relative to total stars. */
  count: number;
}

/** Narrowed Octokit instance type — the return value of `github.getOctokit()`. */
export type OctokitInstance = ReturnType<typeof github.getOctokit>;

/**
 * Computes which page numbers to fetch given a total page count and a max-pages budget.
 *
 * When `totalPages <= maxPages` all pages are fetched sequentially.
 * When `totalPages > maxPages` a uniform-stride sample is chosen that always
 * includes the first and last page, guaranteeing the oldest and newest star events
 * are represented in the chart even for very large repositories.
 *
 * @param totalPages - Total number of 100-item pages in the repository's stargazer list.
 * @param maxPages   - Maximum number of pages to fetch. Defaults to 30.
 * @returns          - Sorted, deduplicated array of 1-based page numbers.
 */
export function calculatePagesToFetch(totalPages: number, maxPages = 30): number[] {
  if (totalPages <= maxPages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pagesToFetch: number[] = [1];
  const step = (totalPages - 2) / (maxPages - 2);

  for (let i = 1; i <= maxPages - 2; i++) {
    pagesToFetch.push(Math.round(1 + i * step));
  }
  pagesToFetch.push(totalPages);

  return Array.from(new Set(pagesToFetch)).sort((a, b) => a - b);
}

/**
 * Fetches and samples paginated stargazer records for a single repository.
 *
 * Tries Tier 1 (`application/vnd.github.star+json`) first to obtain `starred_at` timestamps.
 * On a per-page 403/4xx failure falls back to Tier 2 (`application/vnd.github+json`).
 * On a total failure emits an `::warning::` annotation and prints actionable permission
 * diagnostics when the error message contains "Resource not accessible".
 *
 * @param owner      - Repository owner (user or org).
 * @param repo       - Repository name.
 * @param octokit    - Authenticated Octokit instance.
 * @param totalStars - Total stargazer count used to calculate page distribution.
 * @returns          - Sampled `RawStarPoint[]`, possibly partial on API error.
 *
 * @internal Prefer `fetchStarHistory` for the public deep-module entry point.
 */
export async function fetchSampledStargazers(
  owner: string,
  repo: string,
  octokit: OctokitInstance,
  totalStars: number
): Promise<RawStarPoint[]> {
  const totalPages = Math.ceil(totalStars / 100);
  const pagesToFetch = calculatePagesToFetch(totalPages, 30);

  core.info(
    `Fetching ${pagesToFetch.length} pages out of ${totalPages} total pages for ${owner}/${repo}`
  );

  const rawData: RawStarPoint[] = [];

  try {
    for (const page of pagesToFetch) {
      let stargazers: unknown[] = [];

      try {
        // Tier 1: Try with star+json timestamp header
        const { data } = await octokit.rest.activity.listStargazersForRepo({
          owner,
          repo,
          per_page: 100,
          page,
          headers: {
            accept: 'application/vnd.github.star+json'
          }
        });
        stargazers = data as unknown[];
      } catch (tier1Err) {
        const errMsg = tier1Err instanceof Error ? tier1Err.message : String(tier1Err);
        core.warning(`Tier 1 (Auth + star+json) failed for ${owner}/${repo}: ${errMsg}`);

        // Tier 2 Fallback: Try with standard JSON header
        const { data } = await octokit.rest.activity.listStargazersForRepo({
          owner,
          repo,
          per_page: 100,
          page,
          headers: {
            accept: 'application/vnd.github+json'
          }
        });
        stargazers = data as unknown[];
      }

      for (let i = 0; i < stargazers.length; i++) {
        const item = stargazers[i] as { starred_at?: string; created_at?: string };
        const dateStr = item.starred_at || item.created_at || new Date().toISOString();
        const globalIndex = (page - 1) * 100 + i + 1;

        rawData.push({
          date: dateStr,
          count: globalIndex
        });
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    core.warning(
      `Encountered an error while fetching stargazers for ${owner}/${repo}. Will render partial data. Error: ${errMsg}`
    );

    if (errMsg.includes('Resource not accessible')) {
      core.error(
        `🔑 PERMISSION TROUBLESHOOTING FOR ${owner}/${repo}:\n` +
          `1. Fine-grained PAT: Go to 'User permissions' -> Set 'Starring' to 'Read-only'.\n` +
          `2. Repository access: Ensure 'Repository access' includes '${owner}/${repo}' with 'Metadata: Read-only' or 'Contents: Read and write'.\n` +
          `3. Classic PAT: Ensure 'public_repo' scope is checked (or 'repo' for private repositories).\n` +
          `4. Organization SSO: If '${owner}' is an organization with SAML SSO, click 'Configure SSO' next to your token.`
      );
    }
  }

  return rawData;
}

/**
 * Deep `StargazerFetcher` entry point. Parses one or more repository slugs, fetches their
 * metadata and sampled stargazer history via the GitHub REST API, and returns a ready-to-render
 * `RepositorySeries[]` array.
 *
 * Hides all implementation complexity behind a single call:
 * - Comma-separated `owner/repo` input parsing
 * - `GET /repos/{owner}/{repo}` total-star-count queries
 * - Page-sampling budget calculation
 * - Tier 1 / Tier 2 REST header fallbacks with permission diagnostics
 * - Daily time-series interpolation via `processStargazers`
 *
 * @param targetRepoInput - Comma-separated repository slugs (e.g. `"owner/a, owner/b"`),
 *                          or `undefined` to fall back to `defaultOwner/defaultRepo`.
 * @param octokit         - Authenticated Octokit instance.
 * @param defaultOwner    - Fallback owner when `targetRepoInput` is unset (typically `github.context.repo.owner`).
 * @param defaultRepo     - Fallback repo name when `targetRepoInput` is unset.
 * @returns               - Array of `RepositorySeries` ready to pass to `renderChart`.
 */
export async function fetchStarHistory(
  targetRepoInput: string | undefined,
  octokit: OctokitInstance,
  defaultOwner = '',
  defaultRepo = ''
): Promise<RepositorySeries[]> {
  const rawRepoList = targetRepoInput
    ? targetRepoInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : [defaultOwner && defaultRepo ? `${defaultOwner}/${defaultRepo}` : ''];

  const allSeries: RepositorySeries[] = [];

  for (const repoSlug of rawRepoList) {
    if (!repoSlug) continue;

    let owner = defaultOwner;
    let repo = defaultRepo;

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

      const timeSeries: TimeSeriesPoint[] = processStargazers(rawData);
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

  return allSeries;
}
