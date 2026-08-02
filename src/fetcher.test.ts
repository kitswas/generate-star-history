import { describe, it, expect } from "vitest";
import { calculatePagesToFetch } from "./fetcher.js";

describe("StargazerFetcher", () => {
	it("returns all pages when totalPages <= maxPages", () => {
		const pages = calculatePagesToFetch(10, 30);
		expect(pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});

	it("samples pages evenly when totalPages > maxPages", () => {
		const pages = calculatePagesToFetch(100, 30);
		expect(pages.length).toBeLessThanOrEqual(30);
		expect(pages[0]).toBe(1);
		expect(pages[pages.length - 1]).toBe(100);
	});
});
