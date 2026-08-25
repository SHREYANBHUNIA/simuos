import { describe, expect, it } from "vitest";
import { simulateAllocation, simulateCpu, simulatePages } from "./simulations";

describe("CPU scheduling simulations", () => {
  const workload = [
    { id: "P1", arrival: 0, burst: 7, priority: 2 },
    { id: "P2", arrival: 2, burst: 4, priority: 1 },
    { id: "P3", arrival: 4, burst: 1, priority: 3 },
  ];

  it("runs FCFS in arrival order and reports timing metrics", () => {
    const result = simulateCpu("fcfs", workload, { quantum: 2 });
    expect(result.timeline.filter(segment => !segment.idle).map(segment => segment.processId)).toEqual(["P1", "P2", "P3"]);
    expect(result.processes.find(process => process.id === "P2")?.waiting).toBe(5);
    expect(result.cpuUtilization).toBe(100);
  });

  it("preempts with SRTF when a shorter job arrives", () => {
    const result = simulateCpu("srtf", workload, { quantum: 2 });
    expect(result.timeline.filter(segment => !segment.idle).map(segment => `${segment.processId}:${segment.start}-${segment.end}`)).toContain("P2:2-4");
    expect(result.processes.find(process => process.id === "P3")?.completion).toBe(5);
  });

  it("slices recurring work with Round Robin", () => {
    const result = simulateCpu("rr", workload, { quantum: 2 });
    expect(result.timeline.filter(segment => segment.processId === "P1").reduce((sum, segment) => sum + segment.end - segment.start, 0)).toBe(7);
    expect(result.processes).toHaveLength(3);
  });

  it("returns a complete analytical result for every dispatch policy", () => {
    (["fcfs", "sjf", "srtf", "rr", "priority", "mlq", "mlfq"] as const).forEach(algorithm => {
      const result = simulateCpu(algorithm, workload, { quantum: 2, mlfqQuantums: [2, 4, 8] });
      expect(result.processes).toHaveLength(3);
      expect(result.timeline.length).toBeGreaterThan(0);
      expect(result.cpuUtilization).toBeGreaterThan(0);
      expect(result.throughput).toBeGreaterThan(0);
    });
  });
});

describe("memory simulations", () => {
  it("calculates LRU faults and hits", () => {
    const result = simulatePages("lru", [1, 2, 1, 3, 1, 2], 2);
    expect(result.faults).toBe(4);
    expect(result.hits).toBe(2);
  });

  it("advances FIFO through frame positions in insertion order", () => {
    const result = simulatePages("fifo", [1, 2, 3, 4, 5], 3);
    expect(result.steps[3]?.frames).toEqual([4, 2, 3]);
    expect(result.steps[4]?.frames).toEqual([4, 5, 3]);
  });

  it("provides results for FIFO, LRU, and optimal policies", () => {
    (["fifo", "lru", "optimal"] as const).forEach(algorithm => {
      const result = simulatePages(algorithm, [7, 0, 1, 2, 0, 3, 0, 4], 3);
      expect(result.faults + result.hits).toBe(8);
    });
  });

  it("selects a best fit block and reports utilization", () => {
    const result = simulateAllocation("best-fit", [100, 220, 150], [{ id: "A", size: 140 }]);
    expect(result.cells.find(cell => cell.allocation)?.size).toBe(140);
    expect(result.utilization).toBeCloseTo(140 / 470 * 100);
  });

  it("handles all requested allocation strategies", () => {
    (["first-fit", "best-fit", "worst-fit", "next-fit"] as const).forEach(strategy => {
      const result = simulateAllocation(strategy, [100, 220, 150], [{ id: "A", size: 90 }, { id: "B", size: 130 }]);
      expect(result.allocated).toBe(220);
      expect(result.rejected).toHaveLength(0);
    });
  });
});
