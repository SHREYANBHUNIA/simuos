/* @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { simulateCpu } from "@/lib/simulations";
import Home, { GanttChart } from "./Home";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

describe("GanttChart interaction", () => {
  const result = simulateCpu("rr", [
    { id: "P1", arrival: 0, burst: 4, priority: 2, color: "#1fb5b5" },
    { id: "P2", arrival: 1, burst: 2, priority: 1, color: "#5067e8" },
  ], { quantum: 2 });

  it("shows a time tooltip on hover and selects the clicked process", () => {
    const onSelectProcess = vi.fn();
    const { container } = render(<GanttChart result={result} selectedProcess="P1" onSelectProcess={onSelectProcess} />);
    const segments = container.querySelectorAll("svg rect");

    fireEvent.mouseEnter(segments[0]);
    expect(screen.getByText("0–2 ms")).not.toBeNull();

    fireEvent.click(segments[1]);
    expect(onSelectProcess).toHaveBeenCalledWith("P2");
  });

  it("starts a new generated scheduling experiment from the header control", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /new run/i }));

    expect(screen.getByText("Run #2 ready")).not.toBeNull();
    expect(screen.getAllByDisplayValue("5").length).toBeGreaterThan(0);
  });
});
