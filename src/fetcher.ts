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

  core.info(`Fetching ${pagesToFetch.length} pages out of ${totalPages} total pages`);

  const rawData: RawStarPoint[] = [];

  try {
    for (const page of pagesToFetch) {
      const { data: stargazers } = await octokit.rest.activity.listStargazersForRepo({
        owner,
        repo,
        per_page: 100,
        page,
        headers: {
          accept: 'application/vnd.github.star+json'
        }
      });

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

  return rawData;
}
