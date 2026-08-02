import { describe, it, expect } from "vitest";
import {
	processStargazers,
	renderChart,
	calculateYAxisTicks,
	formatYTickLabel,
	generateMonotoneCubicPath,
	simplifySeriesData,
} from "./chart.js";

describe("ChartRenderer", () => {
	it("correctly sorts and backfills stargazer time series", () => {
		const raw = [
			{ date: "2023-01-03T10:00:00Z", count: 5 },
			{ date: "2023-01-01T10:00:00Z", count: 2 },
		];

		const result = processStargazers(raw);
		expect(result).toHaveLength(3);
		expect(result[0]).toEqual({ date: "2023-01-01", count: 2 });
		expect(result[1]).toEqual({ date: "2023-01-02", count: 2 });
		expect(result[2]).toEqual({ date: "2023-01-03", count: 5 });
	});

	it("renders a valid single-series SVG string with theme classes and animation CSS", () => {
		const data = [
			{ date: "2023-01-01", count: 10 },
			{ date: "2023-01-02", count: 20 },
		];

		const svg = renderChart(data, { theme: "auto" });
		expect(svg).toContain("<svg");
		expect(svg).toContain(".line-anim");
		expect(svg).toContain("@keyframes draw");
		expect(svg).toContain("</svg>");
	});

	it("renders a valid multi-series SVG chart with a legend", () => {
		const multiSeries = [
			{
				name: "Repo A",
				data: [
					{ date: "2023-01-01", count: 10 },
					{ date: "2023-01-02", count: 20 },
				],
			},
			{
				name: "Repo B",
				data: [
					{ date: "2023-01-01", count: 5 },
					{ date: "2023-01-02", count: 15 },
				],
			},
		];

		const svg = renderChart(multiSeries, { theme: "dark" });
		expect(svg).toContain('<g class="legend">');
		expect(svg).toContain("Repo A");
		expect(svg).toContain("Repo B");
		expect(svg).toContain(".bg { fill: #0d1117; }");
	});

	it("handles empty input gracefully", () => {
		const svg = renderChart([], { theme: "light" });
		expect(svg).toContain("No data available");
	});

	describe("Y-axis scale & label formatting", () => {
		it("calculates neat power of 10 ticks", () => {
			expect(calculateYAxisTicks(7)).toEqual({
				yMax: 10,
				ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
			});

			expect(calculateYAxisTicks(45)).toEqual({
				yMax: 50,
				ticks: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
			});

			expect(calculateYAxisTicks(350)).toEqual({
				yMax: 400,
				ticks: [0, 50, 100, 150, 200, 250, 300, 350, 400],
			});
		});

		it("formats tick labels using k and M modifiers", () => {
			expect(formatYTickLabel(0)).toBe("0");
			expect(formatYTickLabel(500)).toBe("500");
			expect(formatYTickLabel(1000)).toBe("1k");
			expect(formatYTickLabel(2500)).toBe("2.5k");
			expect(formatYTickLabel(150000)).toBe("150k");
			expect(formatYTickLabel(1000000)).toBe("1M");
			expect(formatYTickLabel(2500000)).toBe("2.5M");
		});
	});

	describe("Adaptive Density & Monotone Cubic Curve Smoothing", () => {
		it("generates a valid monotone cubic Bezier path for points", () => {
			const points = [
				{ x: 0, y: 100 },
				{ x: 10, y: 80 },
				{ x: 20, y: 50 },
				{ x: 30, y: 10 },
			];
			const path = generateMonotoneCubicPath(points);
			expect(path).toContain("M 0.00 100.00");
			expect(path).toContain("C");
		});

		it("renders sparse series with linear paths and visible dots", () => {
			const sparseData = [
				{ date: "2023-01-01", count: 10 },
				{ date: "2023-01-02", count: 20 },
			];
			const svg = renderChart(sparseData);
			expect(svg).toContain("<circle");
			expect(svg).toContain('<g class="dots">');
		});

		it("renders dense series with monotone cubic paths and suppresses dots", () => {
			// 100 points across innerWidth (700px) -> avgSpacing ~7px < 15px (dense)
			const denseData = Array.from({ length: 100 }, (_, i) => {
				const d = new Date(2023, 0, 1 + i).toISOString().split("T")[0];
				return { date: d, count: (i + 1) * 10 };
			});
			const svg = renderChart(denseData);
			expect(svg).not.toContain('<g class="dots">');
			expect(svg).not.toContain("<circle");
			expect(svg).toContain(" C ");
		});

		it("simplifies 100 flat daily points down to key change points", () => {
			const flatPoints = Array.from({ length: 100 }, (_, i) => {
				const d = new Date(2023, 0, 1 + i).toISOString().split("T")[0];
				return { date: d, count: i < 50 ? 10 : 20 };
			});
			const simplified = simplifySeriesData(flatPoints);
			expect(simplified.length).toBeLessThan(10);
			expect(simplified[0].count).toBe(10);
			expect(simplified[simplified.length - 1].count).toBe(20);
		});
	});
});
