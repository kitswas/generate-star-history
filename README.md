# Generate Star History

A standalone GitHub Action that generates responsive, animated SVG star history charts with zero external cloud or binary dependencies.

![Multi-repo Star History Demo](assets/star-history-virtualgamepad.svg)

---

## Why this exists

Following GitHub's [June 30, 2026 API restrictions](https://github.blog/changelog/2026-06-30-upcoming-access-restrictions-to-public-api-endpoints-and-ui-views/), public stargazer endpoints require collaborator-level API access. As a result, external image badges like `star-history.com` no longer work without collaborator permissions ([details](https://www.star-history.com/blog/github-stargazer-api-restriction)).

This action runs directly inside your workflow using your repository's own `${{ secrets.GITHUB_TOKEN }}`. _(Multi-Repo requires a Fine-Grained PAT to repos you own.)_

---

## Overview

| 🔒 Security & Privacy                                                    | ⚡ Performance & Architecture                                                    | ✔️ Features                                                                    |
| :----------------------------------------------------------------------- | :------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **Self-Hosted**: Runs 100% inside your runner; tokens never leave GitHub | **Single SVG**: Theme switching via embedded CSS `@media (prefers-color-scheme)` | **Multi-Repo**: Chart multiple repos side-by-side (`owner/repo1, owner/repo2`) |
| **No Bot Accounts**: No third-party apps or permissions required         | **Monotone Spline**: Smooth Fritsch-Carlson cubic curves (small SVG size)        | **Keyframe Animations**: Animated line drawing on load with hover scaling      |
| **Zero Runtime Deps**: Pure TypeScript bundle; zero supply-chain risk    | **Smart Sampling**: Page-sampling engine avoids hitting API rate limits          | **Adaptive Density**: Hides crowded data points automatically below 15px       |

---

## Competitor Comparison

| Feature                                | **Generate Star History**  |    `shieldcn-starchart`    | `self-hosted-repository-visuals` |   `star-history-action`    |
| :------------------------------------- | :------------------------: | :------------------------: | :------------------------------: | :------------------------: |
| **Infrastructure**                     |      **Self-Hosted**       | Cloud Bot (`shieldcn.dev`) |           Self-Hosted            |        Self-Hosted         |
| **Output**                             | **Single Auto-Theme SVG**  |        Hosted Image        |    2 Files (`-light`/`-dark`)    | 2 Files (`-light`/`-dark`) |
| **Runtime Dependencies**               |          **Zero**          |          Unknown           |           npm Packages           |     Puppeteer / sharp      |
| **Multi-Repo Support**                 |        **✅ Built-in**        |             ❌             |                ❌                |         ⚠️ Partial         |
| **Git Safety**                         | **Commits SVG chart Only** |             ✅             |                ✅                |  ❌ Modifies `README.md`   |
| **Themes**                             |       ⚠️ _3 Themes_       |      ❌ Shadcn preset      |   ✅ **Full Color Overrides**    |     ⚠️ _Fixed Themes_      |
| **Stateless** |  ✅  |     ⚠️ Cloud buffered      |   ❌ Incremental JSON Log    |  ✅   |

---

## Quick Start

```yaml
name: Generate Star History

on:
  schedule:
    - cron: "0 0 * * 0" # Weekly on Sunday
  workflow_dispatch:

jobs:
  star-history:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7

      - name: Generate Star History
        uses: kitswas/generate-star-history@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          output-path: "assets/star-history.svg"

      - name: Commit Chart
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add assets/star-history.svg
          git diff --staged --quiet || git commit -m "chore: update star history chart [skip ci]" && git push
```

---

## Action Inputs & Outputs

### Inputs

| Input          | Description                                                      | Required | Default                    |
| :------------- | :--------------------------------------------------------------- | :------: | :------------------------- |
| `github-token` | GitHub access token (`GITHUB_TOKEN` or PAT)                      | **Yes**  | `${{ github.token }}`      |
| `repository`   | Target repo or comma-separated list (`owner/repo1, owner/repo2`) |    No    | `${{ github.repository }}` |
| `output-path`  | Output path for the SVG chart                                    |    No    | `assets/star-history.svg`  |
| `theme`        | Theme (`auto`, `dark`, `light`)                                  |    No    | `auto`                     |

### Outputs

| Output     | Description                               |
| :--------- | :---------------------------------------- |
| `svg-path` | Workspace path to the generated SVG chart |

---

## Authentication & PAT Setup

- **Single Repository (Current Repo)**: Standard `${{ secrets.GITHUB_TOKEN }}` works automatically with `permissions: { contents: write }`.
- **Multi-Repository Comparison**: Use a Fine-Grained Personal Access Token (PAT) with `Starring: Read-only` and `Contents: Read and write` access across target repos.

---

## Local Development

```bash
# Offline test
pnpm test:local

# Run test suite
pnpm test

# Build bundle
pnpm build
```
