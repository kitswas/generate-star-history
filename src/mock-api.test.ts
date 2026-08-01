import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as github from '@actions/github';
import { createMockGitHubApiServer } from './mock-api.js';
import { fetchSampledStargazers } from './fetcher.js';

describe('MockGitHubApi Integration', () => {
  const mockServer = createMockGitHubApiServer({ port: 0 }); // Port 0 allows OS dynamic assignment

  beforeAll(async () => {
    await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  it('handles 200 OK with star+json headers', async () => {
    const octokit = github.getOctokit('mock-token', { baseUrl: mockServer.baseUrl });
    const stars = await fetchSampledStargazers('mock', 'repo-200', octokit, 250);

    expect(stars.length).toBeGreaterThan(0);
    expect(stars[0]).toHaveProperty('date');
    expect(stars[0]).toHaveProperty('count');
  });

  it('handles 403 Forbidden access restriction gracefully', async () => {
    const octokit = github.getOctokit('mock-token', { baseUrl: mockServer.baseUrl });
    const stars = await fetchSampledStargazers('mock', 'repo-403', octokit, 250);

    expect(stars).toEqual([]);
  });

  it('handles 422 Unprocessable Entity spammed endpoint gracefully', async () => {
    const octokit = github.getOctokit('mock-token', { baseUrl: mockServer.baseUrl });
    const stars = await fetchSampledStargazers('mock', 'repo-422', octokit, 250);

    expect(stars).toEqual([]);
  });

  it('handles 429 Rate Limit Exceeded gracefully', async () => {
    const octokit = github.getOctokit('mock-token', { baseUrl: mockServer.baseUrl });
    const stars = await fetchSampledStargazers('mock', 'repo-429', octokit, 250);

    expect(stars).toEqual([]);
  });

  it('handles 200 OK empty array', async () => {
    const octokit = github.getOctokit('mock-token', { baseUrl: mockServer.baseUrl });
    const stars = await fetchSampledStargazers('mock', 'repo-empty', octokit, 0);

    expect(stars).toEqual([]);
  });
});
