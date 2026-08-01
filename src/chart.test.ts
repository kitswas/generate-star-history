import { describe, it, expect } from 'vitest';
import { processStargazers, renderSvgChart } from './chart.js';

describe('ChartRenderer', () => {
  it('correctly sorts and backfills stargazer time series', () => {
    const raw = [
      { date: '2023-01-03T10:00:00Z', count: 5 },
      { date: '2023-01-01T10:00:00Z', count: 2 }
    ];

    const result = processStargazers(raw);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: '2023-01-01', count: 2 });
    expect(result[1]).toEqual({ date: '2023-01-02', count: 2 });
    expect(result[2]).toEqual({ date: '2023-01-03', count: 5 });
  });

  it('renders a valid single-series SVG string with theme classes and animation CSS', () => {
    const data = [
      { date: '2023-01-01', count: 10 },
      { date: '2023-01-02', count: 20 }
    ];

    const svg = renderSvgChart(data, { theme: 'auto' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('.line-anim');
    expect(svg).toContain('@keyframes draw');
    expect(svg).toContain('</svg>');
  });

  it('renders a valid multi-series SVG chart with a legend', () => {
    const multiSeries = [
      {
        name: 'Repo A',
        data: [
          { date: '2023-01-01', count: 10 },
          { date: '2023-01-02', count: 20 }
        ]
      },
      {
        name: 'Repo B',
        data: [
          { date: '2023-01-01', count: 5 },
          { date: '2023-01-02', count: 15 }
        ]
      }
    ];

    const svg = renderSvgChart(multiSeries, { theme: 'dark' });
    expect(svg).toContain('<g class="legend">');
    expect(svg).toContain('Repo A');
    expect(svg).toContain('Repo B');
    expect(svg).toContain('.bg { fill: #0d1117; }');
  });

  it('handles empty input gracefully', () => {
    const svg = renderSvgChart([], { theme: 'light' });
    expect(svg).toContain('No data available');
  });
});
