# Generate Star History GitHub Action

A lightweight, standalone TypeScript GitHub Action that generates responsive, mathematically calculated SVG star history charts for your repositories with smooth CSS `@keyframes` line drawing animations and zero external binary dependencies.

![Star History Demo](assets/star-history-virtualgamepad.svg)

## Features

- **Multi-Series Comparison Charting**: Pass a comma-separated repository list (`repository: 'owner/repo1, owner/repo2'`) to render multiple star trajectories on a single chart with a color-coded legend key.
- **Pure CSS Keyframe Animations**: Includes `@keyframes draw` stroke-dasharray animations for smooth line drawing on load, and interactive `:hover` dot scaling.
- **Rate Limit Resilience**: Built-in page-sampling algorithm that works safely on large repositories without burning your `${{ secrets.GITHUB_TOKEN }}`.
- **Graceful Fallback**: Gracefully renders partial data if GitHub REST API rate limits are hit halfway.
- **Zero Native Binaries**: Pure mathematical SVG generation (no D3, no Canvas, no C++ compilation).
- **Themes**: Supports `dark`, `light`, and `auto` (uses system color scheme `@media (prefers-color-scheme)`).

---

## Action Inputs & Outputs

### Inputs

| Input          | Description                                                            | Required | Default                    |
| :------------- | :--------------------------------------------------------------------- | :------: | :------------------------- |
| `github-token` | GitHub access token (`GITHUB_TOKEN` or `PAT`)                          | **Yes**  | `${{ github.token }}`      |
| `repository`   | Target repository or comma-separated list (`owner/repo1, owner/repo2`) |    No    | `${{ github.repository }}` |
| `output-path`  | Output path for the generated `.svg` file                              |    No    | `assets/star-history.svg`  |
| `theme`        | Chart theme (`auto`, `dark`, `light`)                                  |    No    | `auto`                     |

> [!IMPORTANT]
> **Fine-Grained Personal Access Token (PAT) Permissions:**  
> If using a **Fine-grained PAT** for cross-repository star history, set:
>
> 1. **User permissions** $\rightarrow$ **Starring**: `Access: Read-only`
> 2. **Repository permissions** $\rightarrow$ **Metadata** or **Contents**: `Access: Read-only`
> 3. **Repository access**: Ensure the target repository (or _All repositories_) is selected.

### Outputs

| Output     | Description                                            |
| :--------- | :----------------------------------------------------- |
| `svg-path` | Absolute/relative file path to the generated SVG chart |

---

## Usage Examples

### 1. Single Repository Setup (Current Repo)

Place this workflow in `.github/workflows/generate-star-history.yml`:

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
      - uses: actions/checkout@v7

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

### 2. Multi-Repository Comparison on a Single Chart

Compare multiple repositories on a single chart with a color-coded legend:

```yaml
name: Generate Comparison Star History

on:
  schedule:
    - cron: '0 0 * * 0'
  workflow_dispatch:

jobs:
  generate-comparison:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7

      - name: Generate Comparison Chart
        uses: kitswas/generate-star-history@v1
        with:
          github-token: ${{ secrets.PAT_TOKEN || secrets.GITHUB_TOKEN }}
          repository: 'kitswas/VirtualGamePad-PC, kitswas/VirtualGamePad-Mobile'
          output-path: 'assets/star-history-comparison.svg'
          theme: 'auto'

      - name: Commit and Push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add assets/*.svg
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "chore: update comparison star history chart [skip ci]"
            git push
          fi
```

---

## Local Development & Testing

You can test chart generation locally without running a GitHub Action:

```bash
# Offline single-repo mock mode
pnpm test:local

# Offline multi-series mock mode
MOCK=true REPO="mock/repo-200, mock/repo-large" pnpm test:local

# Live mode
GITHUB_TOKEN="your_pat_token" REPO="facebook/react, vuejs/core" THEME="dark" OUTPUT="assets/comparison.svg" pnpm test:local
```

### Development Commands

```bash
pnpm typecheck # TypeScript compilation check
pnpm lint      # Lint codebase
pnpm test      # Run Vitest unit tests
pnpm test:fuzz # Run property-based fuzz tests
pnpm depcruise # Verify circular dependency constraints
pnpm build     # Build production bundle using @vercel/ncc
```
