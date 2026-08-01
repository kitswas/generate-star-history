# Generate Star History GitHub Action

A lightweight, standalone TypeScript GitHub Action that generates responsive, mathematically calculated SVG star history charts for your repositories without external binary dependencies.

![Star History Demo](assets/star-history-virtualgamepad.svg)

## Features

- **Rate Limit Resilience**: Built-in page-sampling algorithm that works safely on large repositories without burning your `${{ secrets.GITHUB_TOKEN }}`.
- **Graceful Fallback**: Gracefully renders partial data if GitHub REST API rate limits are hit halfway.
- **Zero Native Binaries**: Pure mathematical SVG generation (no D3, no Canvas, no C++ compilation).
- **Themes**: Supports `dark`, `light`, and `auto` (uses system color scheme `@media (prefers-color-scheme)`).
- **Multi-Repo Support**: Target any repository (`owner/repo`) within a single workflow.

---

## Action Inputs & Outputs

### Inputs

| Input          | Description                                   | Required | Default                    |
| :------------- | :-------------------------------------------- | :------: | :------------------------- |
| `github-token` | GitHub access token (`GITHUB_TOKEN` or `PAT`) | **Yes**  | `${{ github.token }}`      |
| `repository`   | Target repository in `owner/repo` format      |    No    | `${{ github.repository }}` |
| `output-path`  | Output path for the generated `.svg` file     |    No    | `assets/star-history.svg`  |
| `theme`        | Chart theme (`auto`, `dark`, `light`)         |    No    | `auto`                     |

> [!IMPORTANT]  
> **Cross-Repository Token Permissions & PAT:**  
> When targeting **other/external repositories** (e.g., `repository: 'kitswas/VirtualGamePad-PC'`), the default `${{ secrets.GITHUB_TOKEN }}` generated for the runner may fail with `Resource not accessible by integration`.  
> To resolve this, pass a Personal Access Token (PAT) with `public_repo` or `repo` scope:
>
> ```yaml
> with:
>   github-token: ${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
>   repository: 'kitswas/VirtualGamePad-PC'
> ```

### Outputs

| Output     | Description                                            |
| :--------- | :----------------------------------------------------- |
| `svg-path` | Absolute/relative file path to the generated SVG chart |

---

## Usage Examples

### 1. Single Repository Setup (Current Repo)

Place this workflow in `.github/workflows/star-history.yml`:

```yaml
name: Generate Star History

on:
  schedule:
    - cron: '0 0 * * 0' # Every Sunday at midnight
  workflow_dispatch:

jobs:
  star-history:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate Star History
        uses: kitswas/generate-star-history@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          output-path: 'assets/star-history.svg'
          theme: 'auto'

      - name: Commit and Push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add assets/star-history.svg
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "chore: update star history chart [skip ci]"
            git push
          fi
```

---

### 2. Multi-Repository Setup (`VirtualGamePad` Suite)

To generate star history charts for multiple repositories within one workflow:

```yaml
name: Generate Multi-Repo Star History

on:
  schedule:
    - cron: '0 0 * * 0'
  workflow_dispatch:

jobs:
  generate-charts:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Generate Star History (VirtualGamePad-PC)
        uses: kitswas/generate-star-history@v1
        with:
          github-token: ${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
          repository: 'kitswas/VirtualGamePad-PC'
          output-path: 'assets/star-history-virtualgamepad-pc.svg'
          theme: 'auto'

      - name: Generate Star History (VirtualGamePad)
        uses: kitswas/generate-star-history@v1
        with:
          github-token: ${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
          repository: 'kitswas/VirtualGamePad'
          output-path: 'assets/star-history-virtualgamepad.svg'
          theme: 'auto'

      - name: Generate Star History (VirtualGamePad-Mobile)
        uses: kitswas/generate-star-history@v1
        with:
          github-token: ${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
          repository: 'kitswas/VirtualGamePad-Mobile'
          output-path: 'assets/star-history-virtualgamepad-mobile.svg'
          theme: 'auto'

      - name: Commit and Push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add assets/*.svg
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "chore: update star history charts [skip ci]"
            git push
          fi
```

---

## Local Development & Testing

You can test chart generation locally without running a GitHub Action:

```bash
# Offline mode (generates mock data SVG)
pnpm test:local

# Live mode (fetches real repository data)
GITHUB_TOKEN="your_pat_token" REPO="facebook/react" THEME="dark" OUTPUT="assets/react.svg" pnpm test:local
```

### Development Commands

```bash
pnpm typecheck # TypeScript compilation check
pnpm lint      # Lint codebase
pnpm test      # Run Vitest unit tests
pnpm depcruise # Verify circular dependency constraints
pnpm build     # Build production bundle using @vercel/ncc
```
