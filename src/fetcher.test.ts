import { describe, it, expect } from 'vitest';
import { calculatePagesToFetch } from './fetcher.js';

describe('calculatePagesToFetch', () => {
  it('returns all pages if total pages <= maxPages', () => {
    expect(calculatePagesToFetch(5, 30)).toEqual([1, 2, 3, 4, 5]);
    expect(calculatePagesToFetch(30, 30)).toHaveLength(30);
  });

  it('samples evenly spaced pages if total pages > maxPages', () => {
    const pages = calculatePagesToFetch(100, 30);
    expect(pages.length).toBeLessThanOrEqual(30);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(100);
  });
});
