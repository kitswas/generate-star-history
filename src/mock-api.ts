import * as http from 'node:http';
import { URL } from 'node:url';

/** Configuration options for `createMockGitHubApiServer`. */
export interface MockApiServerOptions {
  /**
   * TCP port to listen on. Defaults to `0`, which asks the OS to assign a free
   * ephemeral port — preventing `EADDRINUSE` collisions when Vitest runs test
   * files in parallel workers.
   */
  port?: number;
}

/**
 * Creates a zero-dependency mock GitHub REST API HTTP server using Node's native `http` module.
 *
 * Simulates the following GitHub REST endpoints used by `StargazerFetcher`:
 * - `GET /repos/{owner}/{repo}` — returns repo metadata including `stargazers_count`.
 * - `GET /repos/{owner}/{repo}/stargazers` — returns paginated stargazer records.
 *
 * Repo slugs are mapped to fixed scenarios via their name:
 * - `mock/repo-200`  — `200 OK` with `application/vnd.github.star+json` records
 * - `mock/repo-large` — `200 OK` with 5000 stars across 50 pages
 * - `mock/repo-403`  — `403 Forbidden` (permission error)
 * - `mock/repo-422`  — `422 Unprocessable Entity` (spammed endpoint)
 * - `mock/repo-429`  — `429 Too Many Requests` (rate limited)
 * - `mock/repo-empty` — `200 OK` with 0 stars
 *
 * @param options - Optional server configuration.
 * @returns An object with `start()`, `stop()`, and `baseUrl` members.
 */
export function createMockGitHubApiServer(options: MockApiServerOptions = {}) {
  const requestedPort = options.port ?? 0; // Default 0 for dynamic OS port assignment

  const server = http.createServer((req, res) => {
    const addr = server.address();
    const currentPort = typeof addr === 'object' && addr ? addr.port : requestedPort;
    const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${currentPort}`);
    const pathname = reqUrl.pathname;
    const acceptHeader = req.headers['accept'] ?? '';
    const mockStatusHeader = req.headers['x-mock-status'];

    res.setHeader('Content-Type', 'application/json');

    // Forced status code via header override
    if (mockStatusHeader) {
      const code = Number(mockStatusHeader);
      if (code === 403) {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            message: 'Resource not accessible by integration',
            documentation_url: 'https://docs.github.com/rest/activity/starring#list-stargazers'
          })
        );
        return;
      }
      if (code === 422) {
        res.writeHead(422);
        res.end(
          JSON.stringify({
            message: 'Validation failed, or the endpoint has been spammed.',
            documentation_url: 'https://docs.github.com/rest/activity/starring#list-stargazers'
          })
        );
        return;
      }
      if (code === 429) {
        res.setHeader('Retry-After', '60');
        res.writeHead(429);
        res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
        return;
      }
    }

    // Endpoint: GET /repos/{owner}/{repo}
    const repoMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
    if (repoMatch) {
      const [, owner, repo] = repoMatch;

      if (repo === 'repo-403') {
        res.writeHead(403);
        res.end(JSON.stringify({ message: 'Resource not accessible by integration' }));
        return;
      }
      if (repo === 'repo-empty') {
        res.writeHead(200);
        res.end(JSON.stringify({ stargazers_count: 0 }));
        return;
      }

      res.writeHead(200);
      res.end(
        JSON.stringify({
          id: 123456,
          name: repo,
          full_name: `${owner}/${repo}`,
          stargazers_count: repo === 'repo-large' ? 5000 : 250
        })
      );
      return;
    }

    // Endpoint: GET /repos/{owner}/{repo}/stargazers
    const stargazersMatch = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/stargazers$/);
    if (stargazersMatch) {
      const [, , repo] = stargazersMatch;
      const page = Number(reqUrl.searchParams.get('page') ?? '1');
      const perPage = Number(reqUrl.searchParams.get('per_page') ?? '100');

      if (repo === 'repo-403') {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            message: 'Resource not accessible by integration',
            documentation_url: 'https://docs.github.com/rest/activity/starring#list-stargazers'
          })
        );
        return;
      }

      if (repo === 'repo-422') {
        res.writeHead(422);
        res.end(
          JSON.stringify({
            message: 'Validation failed, or the endpoint has been spammed.'
          })
        );
        return;
      }

      if (repo === 'repo-429') {
        res.setHeader('Retry-After', '60');
        res.writeHead(429);
        res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
        return;
      }

      if (repo === 'repo-empty') {
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }

      const isStarJson = acceptHeader.includes('application/vnd.github.star+json');
      const items = [];
      const baseIndex = (page - 1) * perPage;

      for (let i = 0; i < perPage && baseIndex + i < 250; i++) {
        const itemNum = baseIndex + i + 1;
        const dateISO = new Date(Date.UTC(2024, 0, 1 + Math.floor(itemNum / 2))).toISOString();
        const userObj = {
          login: `user-${itemNum}`,
          id: itemNum,
          avatar_url: `https://github.com/images/user-${itemNum}.png`,
          html_url: `https://github.com/user-${itemNum}`
        };

        if (isStarJson) {
          items.push({
            starred_at: dateISO,
            user: userObj
          });
        } else {
          items.push({
            ...userObj,
            starred_at: dateISO
          });
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify(items));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ message: 'Not Found' }));
  });

  return {
    start: () =>
      new Promise<void>((resolve, reject) => {
        server.listen(requestedPort, '127.0.0.1', () => {
          resolve();
        });
        server.once('error', reject);
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    get port() {
      const addr = server.address();
      return typeof addr === 'object' && addr ? addr.port : requestedPort;
    },
    get baseUrl() {
      const addr = server.address();
      const p = typeof addr === 'object' && addr ? addr.port : requestedPort;
      return `http://127.0.0.1:${p}`;
    }
  };
}
