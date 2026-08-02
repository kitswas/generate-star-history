import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { processStargazers, renderSvgChart } from "./chart.js";

describe("Large-Scale Fuzz Testing (fast-check)", () => {
	it("fuzzes processStargazers with arbitrary date/count arrays", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						date: fc.oneof(
							fc.date().map((d) => {
								try {
									return d.toISOString();
								} catch {
									return "2024-01-01T00:00:00Z";
								}
							}),
							fc.string(),
							fc.constant("invalid-date-string"),
							fc.constant("-271821-04-20"),
							fc.constant("1970-01-01T00:00:00Z"),
						),
						count: fc.oneof(
							fc.integer(),
							fc.nat(),
							fc.constant(0),
							fc.constant(-100),
						),
					}),
				),
				(inputStars) => {
					expect(() => {
						const res = processStargazers(inputStars);
						expect(Array.isArray(res)).toBe(true);

						for (let i = 1; i < res.length; i++) {
							const prev = new Date(res[i - 1].date).getTime();
							const curr = new Date(res[i].date).getTime();
							expect(isNaN(prev) || isNaN(curr) || curr >= prev).toBe(true);
						}
					}).not.toThrow();
				},
			),
			{ numRuns: 100 },
		);
	}, 15000);

	it("fuzzes renderSvgChart with arbitrary TimeSeriesPoint inputs and themes", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						date: fc.oneof(
							fc.date().map((d) => {
								try {
									return d.toISOString().split("T")[0];
								} catch {
									return "2024-01-01";
								}
							}),
							fc.string(),
							fc.constant("-271821-04-20"),
						),
						count: fc.integer({ min: -1000, max: 1000000 }),
					}),
				),
				fc.constantFrom("dark", "light", "auto"),
				(dataPoints, theme) => {
					expect(() => {
						const svg = renderSvgChart(dataPoints, {
							theme: theme as "dark" | "light" | "auto",
						});
						expect(typeof svg).toBe("string");
						expect(svg.startsWith("<?xml") || svg.startsWith("<svg")).toBe(
							true,
						);
						expect(svg).toContain("</svg>");
					}).not.toThrow();
				},
			),
			{ numRuns: 100 },
		);
	}, 15000);
});
