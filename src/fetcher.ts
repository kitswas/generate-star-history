import * as core from '@actions/core';
import type * as github from '@actions/github';

export interface RawStarPoint {
  date: string;
  count: number;
}

export type OctokitInstance = ReturnType<typeof github.getOctokit>;

/**
 * Calculates page numbers to sample given total pages
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
 * Deep module fetching sampled stargazers with rate-limit recovery
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
          `2. Repository access: Ensure 'Repository access' includes '${owner}/${repo}' with 'Metadata: Read-only' or 'Contents: Read-only'.\n` +
          `3. Classic PAT: Ensure 'public_repo' scope is checked (or 'repo' for private repositories).\n` +
          `4. Organization SSO: If '${owner}' is an organization with SAML SSO, click 'Configure SSO' next to your token.`
      );
    }
  }

  return rawData;
}
