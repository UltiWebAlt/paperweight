/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import TrendChart from "./TrendChartCard";

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { readonly children: React.ReactNode }) => <div>{children}</div>,
  Line: ({ activeDot }: { readonly activeDot: (p: { cx?: number; cy?: number; value?: number }) => React.ReactNode }) => <>{activeDot({ cx: 1, cy: 2, value: 9 })}</>,
  XAxis: ({ tickFormatter }: { readonly tickFormatter: (label: string) => string }) => <span>{tickFormatter("2025-01-01")}</span>,
  YAxis: () => null,
}));

describe("TrendChart", () => {
  it("renders title, description, good trend badge, and chart values", () => {
    render(<TrendChart title="Messages" description="Last month" trendDirection="up" trend={{ labels: ["2025-01-01", "2025-01-02"], series: [{ key: "messages", values: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2] }], markers: [] }} />);
    expect(screen.getByText("Messages")).toBeTruthy();
    expect(screen.getByText("Last month")).toBeTruthy();
    expect(screen.getByText(/vs prior/)).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("Jan 1")).toBeTruthy();
  });

  it("handles an empty series and flat trend without an optional direction", () => {
    render(<TrendChart title="Empty" trend={{ labels: [], series: [], markers: [] }} />);
    expect(screen.getByText("Empty")).toBeTruthy();
    expect(screen.queryByText(/vs prior/)).toBeNull();
  });
});
