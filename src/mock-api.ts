import * as http from 'node:http';
import { URL } from 'node:url';

export interface MockApiServerOptions {
  port?: number;
}

/**
 * Zero-dependency Mock GitHub REST API HTTP server
 */
export function createMockGitHubApiServer(options: MockApiServerOptions = {}) {
  const port = options.port ?? 9876;

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = reqUrl.pathname;
    const acceptHeader = req.headers['accept'] ?? '';
    const mockStatusHeader = req.headers['x-mock-status'];

    // CORS & Content-Type
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

      // Scenario simulation by repository name
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

      // Generate items based on media type header
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
      new Promise<void>((resolve) => {
        server.listen(port, '127.0.0.1', () => {
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
    port,
    baseUrl: `http://127.0.0.1:${port}`
  };
}
