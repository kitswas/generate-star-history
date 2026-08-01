import { describe, it, expect } from 'vitest';
import { processStargazers, renderSvgChart } from './index.js';

describe('processStargazers', () => {
  it('handles empty arrays', () => {
    expect(processStargazers([])).toEqual([]);
  });

  it('generates cumulative counts and backfills missing days', () => {
    const input = [
      { date: '2024-01-01T12:00:00Z', count: 10 },
      { date: '2024-01-03T12:00:00Z', count: 20 }
    ];

    const result = processStargazers(input);
    expect(result).toHaveLength(3);

    expect(result[0].date).toBe('2024-01-01');
    expect(result[0].count).toBe(10);

    expect(result[1].date).toBe('2024-01-02');
    expect(result[1].count).toBe(10); // Backfilled from Jan 1

    expect(result[2].date).toBe('2024-01-03');
    expect(result[2].count).toBe(20);
  });
});

describe('renderSvgChart', () => {
  it('renders an empty state for no data', () => {
    const svg = renderSvgChart([], { theme: 'auto' });
    expect(svg).toContain('No data available');
  });

  it('renders SVG for valid data', () => {
    const data = [
      { date: '2024-01-01', count: 10 },
      { date: '2024-01-02', count: 20 }
    ];

    const svg = renderSvgChart(data, { theme: 'dark' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('class="line"');
    expect(svg).toContain('class="area"');
    // Ensure dark theme colors are applied directly
    expect(svg).toContain('fill: #0d1117');
    // Ensure date labels are present
    expect(svg).toContain('2024-01-01');
    expect(svg).toContain('2024-01-02');
  });
});
