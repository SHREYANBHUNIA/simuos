export type AlgorithmId = "fcfs" | "sjf" | "srtf" | "rr" | "priority" | "mlq" | "mlfq";

export type ProcessInput = {
  id: string;
  arrival: number;
  burst: number;
  priority: number;
  queue?: number;
  color?: string;
};

export type TimelineSegment = {
  processId: string;
  label: string;
  start: number;
  end: number;
  idle?: boolean;
};

export type ProcessMetric = ProcessInput & {
  start: number;
  completion: number;
  waiting: number;
  turnaround: number;
  response: number;
};

export type SimulationConfig = {
  quantum: number;
  priorityPreemptive?: boolean;
  mlfqQuantums?: number[];
};

export type SimulationResult = {
  algorithm: AlgorithmId;
  timeline: TimelineSegment[];
  processes: ProcessMetric[];
  averages: { waiting: number; turnaround: number; response: number };
  cpuUtilization: number;
  throughput: number;
  totalTime: number;
};

export const algorithmCatalog: Record<AlgorithmId, { label: string; description: string }> = {
  fcfs: { label: "FCFS", description: "Arrival-order, non-preemptive" },
  sjf: { label: "SJF", description: "Shortest burst first" },
  srtf: { label: "SRTF", description: "Preemptive shortest remaining time" },
  rr: { label: "Round Robin", description: "Time-sliced, fair-share" },
  priority: { label: "Priority", description: "Priority-ranked execution" },
  mlq: { label: "Multilevel Queue", description: "Static queues by class" },
  mlfq: { label: "MLFQ", description: "Feedback queues with demotion" },
};

type InternalProcess = ProcessInput & { sequence: number; remaining: number };

const byArrival = (a: InternalProcess, b: InternalProcess) => a.arrival - b.arrival || a.sequence - b.sequence;
const clampInt = (value: number, minimum: number) => Math.max(minimum, Math.round(Number.isFinite(value) ? value : minimum));

function normalize(processes: ProcessInput[]): InternalProcess[] {
  return processes.map((process, sequence) => ({
    ...process,
    arrival: clampInt(process.arrival, 0),
    burst: clampInt(process.burst, 1),
    priority: clampInt(process.priority, 0),
    queue: clampInt(process.queue ?? Math.min(process.priority, 2), 0),
    sequence,
    remaining: clampInt(process.burst, 1),
  }));
}

function appendSegment(timeline: TimelineSegment[], segment: TimelineSegment) {
  const previous = timeline[timeline.length - 1];
  if (previous && previous.processId === segment.processId && previous.idle === segment.idle && previous.end === segment.start) {
    previous.end = segment.end;
    return;
  }
  timeline.push(segment);
}

function appendIdle(timeline: TimelineSegment[], start: number, end: number) {
  if (end > start) appendSegment(timeline, { processId: "IDLE", label: "Idle", start, end, idle: true });
}

function finish(
  algorithm: AlgorithmId,
  timeline: TimelineSegment[],
  source: InternalProcess[],
): SimulationResult {
  const workSegments = timeline.filter(segment => !segment.idle);
  const processMetrics = source.map(process => {
    const segments = workSegments.filter(segment => segment.processId === process.id);
    const start = segments.length ? Math.min(...segments.map(segment => segment.start)) : process.arrival;
    const completion = segments.length ? Math.max(...segments.map(segment => segment.end)) : process.arrival;
    const turnaround = completion - process.arrival;
    return {
      id: process.id,
      arrival: process.arrival,
      burst: process.burst,
      priority: process.priority,
      queue: process.queue,
      color: process.color,
      start,
      completion,
      turnaround,
      waiting: Math.max(0, turnaround - process.burst),
      response: Math.max(0, start - process.arrival),
    };
  });
  const totalTime = timeline.length ? Math.max(...timeline.map(segment => segment.end)) : 0;
  const busyTime = workSegments.reduce((sum, segment) => sum + segment.end - segment.start, 0);
  const count = processMetrics.length || 1;

  return {
    algorithm,
    timeline,
    processes: processMetrics,
    averages: {
      waiting: processMetrics.reduce((sum, process) => sum + process.waiting, 0) / count,
      turnaround: processMetrics.reduce((sum, process) => sum + process.turnaround, 0) / count,
      response: processMetrics.reduce((sum, process) => sum + process.response, 0) / count,
    },
    cpuUtilization: totalTime ? (busyTime / totalTime) * 100 : 0,
    throughput: totalTime ? processMetrics.length / totalTime : 0,
    totalTime,
  };
}

function simulateNonPreemptive(
  algorithm: AlgorithmId,
  processes: InternalProcess[],
  pick: (ready: InternalProcess[]) => InternalProcess,
) {
  const remaining = new Set(processes.map(process => process.id));
  const timeline: TimelineSegment[] = [];
  let time = 0;
  while (remaining.size) {
    const ready = processes.filter(process => remaining.has(process.id) && process.arrival <= time);
    if (!ready.length) {
      const next = Math.min(...processes.filter(process => remaining.has(process.id)).map(process => process.arrival));
      appendIdle(timeline, time, next);
      time = next;
      continue;
    }
    const active = pick(ready);
    appendSegment(timeline, { processId: active.id, label: active.id, start: time, end: time + active.burst });
    time += active.burst;
    remaining.delete(active.id);
  }
  return finish(algorithm, timeline, processes);
}

function simulateSrtf(processes: InternalProcess[]) {
  const timeline: TimelineSegment[] = [];
  const pending = processes.map(process => ({ ...process }));
  let time = 0;
  let completed = 0;
  while (completed < pending.length) {
    const ready = pending
      .filter(process => process.arrival <= time && process.remaining > 0)
      .sort((a, b) => a.remaining - b.remaining || byArrival(a, b));
    if (!ready.length) {
      const next = Math.min(...pending.filter(process => process.remaining > 0).map(process => process.arrival));
      appendIdle(timeline, time, next);
      time = next;
      continue;
    }
    const active = ready[0];
    appendSegment(timeline, { processId: active.id, label: active.id, start: time, end: time + 1 });
    active.remaining -= 1;
    time += 1;
    if (active.remaining === 0) completed += 1;
  }
  return finish("srtf", timeline, pending);
}

function simulateRoundRobin(processes: InternalProcess[], quantum: number) {
  const work = processes.map(process => ({ ...process }));
  const arrivals = [...work].sort(byArrival);
  const queue: InternalProcess[] = [];
  const timeline: TimelineSegment[] = [];
  let arrivalIndex = 0;
  let completed = 0;
  let time = 0;
  const enqueueArrivals = () => {
    while (arrivalIndex < arrivals.length && arrivals[arrivalIndex].arrival <= time) queue.push(arrivals[arrivalIndex++]);
  };
  while (completed < work.length) {
    enqueueArrivals();
    if (!queue.length) {
      const next = arrivals[arrivalIndex]?.arrival ?? time;
      appendIdle(timeline, time, next);
      time = next;
      enqueueArrivals();
    }
    const active = queue.shift();
    if (!active) continue;
    const duration = Math.min(active.remaining, quantum);
    appendSegment(timeline, { processId: active.id, label: active.id, start: time, end: time + duration });
    time += duration;
    active.remaining -= duration;
    enqueueArrivals();
    if (active.remaining > 0) queue.push(active);
    else completed += 1;
  }
  return finish("rr", timeline, work);
}

function simulateMultilevelQueue(processes: InternalProcess[], quantum: number) {
  const work = processes.map(process => ({ ...process, queue: Math.min(2, process.queue ?? 2) }));
  const arrivals = [...work].sort(byArrival);
  const queues: InternalProcess[][] = [[], [], []];
  const timeline: TimelineSegment[] = [];
  let arrivalIndex = 0;
  let completed = 0;
  let time = 0;
  const enqueueArrivals = () => {
    while (arrivalIndex < arrivals.length && arrivals[arrivalIndex].arrival <= time) {
      queues[Math.min(2, arrivals[arrivalIndex].queue ?? 2)].push(arrivals[arrivalIndex++]);
    }
  };
  while (completed < work.length) {
    enqueueArrivals();
    let level = queues.findIndex(queue => queue.length);
    if (level === -1) {
      const next = arrivals[arrivalIndex]?.arrival ?? time;
      appendIdle(timeline, time, next);
      time = next;
      enqueueArrivals();
      level = queues.findIndex(queue => queue.length);
    }
    const active = queues[level]?.shift();
    if (!active) continue;
    const upcomingHigher = arrivals.slice(arrivalIndex).find(process => (process.queue ?? 2) < level)?.arrival;
    const baseDuration = level === 0 ? Math.min(active.remaining, quantum) : active.remaining;
    const duration = upcomingHigher && upcomingHigher > time ? Math.min(baseDuration, upcomingHigher - time) : baseDuration;
    appendSegment(timeline, { processId: active.id, label: active.id, start: time, end: time + duration });
    time += duration;
    active.remaining -= duration;
    enqueueArrivals();
    if (active.remaining > 0) queues[level].unshift(active);
    else completed += 1;
  }
  return finish("mlq", timeline, work);
}

function simulateMlfq(processes: InternalProcess[], quantums: number[]) {
  const work = processes.map(process => ({ ...process, queue: 0 }));
  const arrivals = [...work].sort(byArrival);
  const queues: InternalProcess[][] = [[], [], []];
  const timeline: TimelineSegment[] = [];
  let arrivalIndex = 0;
  let completed = 0;
  let time = 0;
  const enqueueArrivals = () => {
    while (arrivalIndex < arrivals.length && arrivals[arrivalIndex].arrival <= time) queues[0].push(arrivals[arrivalIndex++]);
  };
  while (completed < work.length) {
    enqueueArrivals();
    let level = queues.findIndex(queue => queue.length);
    if (level === -1) {
      const next = arrivals[arrivalIndex]?.arrival ?? time;
      appendIdle(timeline, time, next);
      time = next;
      enqueueArrivals();
      level = queues.findIndex(queue => queue.length);
    }
    const active = queues[level]?.shift();
    if (!active) continue;
    const upcomingArrival = level > 0 ? arrivals[arrivalIndex]?.arrival : undefined;
    const slice = Math.min(active.remaining, quantums[level] ?? quantums[quantums.length - 1] ?? 8);
    const duration = upcomingArrival && upcomingArrival > time ? Math.min(slice, upcomingArrival - time) : slice;
    appendSegment(timeline, { processId: active.id, label: active.id, start: time, end: time + duration });
    time += duration;
    active.remaining -= duration;
    enqueueArrivals();
    if (active.remaining > 0) {
      const nextLevel = duration === slice ? Math.min(level + 1, 2) : level;
      active.queue = nextLevel;
      queues[nextLevel].push(active);
    } else completed += 1;
  }
  return finish("mlfq", timeline, work);
}

export function simulateCpu(
  algorithm: AlgorithmId,
  inputs: ProcessInput[],
  config: SimulationConfig = { quantum: 2, mlfqQuantums: [2, 4, 8] },
): SimulationResult {
  const processes = normalize(inputs);
  const quantum = clampInt(config.quantum, 1);
  if (algorithm === "fcfs") return simulateNonPreemptive("fcfs", processes, ready => [...ready].sort(byArrival)[0]);
  if (algorithm === "sjf") return simulateNonPreemptive("sjf", processes, ready => [...ready].sort((a, b) => a.burst - b.burst || byArrival(a, b))[0]);
  if (algorithm === "priority") return simulateNonPreemptive("priority", processes, ready => [...ready].sort((a, b) => a.priority - b.priority || byArrival(a, b))[0]);
  if (algorithm === "srtf") return simulateSrtf(processes);
  if (algorithm === "rr") return simulateRoundRobin(processes, quantum);
  if (algorithm === "mlq") return simulateMultilevelQueue(processes, quantum);
  return simulateMlfq(processes, config.mlfqQuantums?.map(value => clampInt(value, 1)) ?? [2, 4, 8]);
}

export type PageAlgorithm = "fifo" | "lru" | "optimal";
export type PageStep = { page: number; frames: Array<number | null>; fault: boolean; evicted?: number };
export type PageResult = { algorithm: PageAlgorithm; steps: PageStep[]; faults: number; hits: number; faultRate: number };

export function simulatePages(algorithm: PageAlgorithm, references: number[], frameCount: number): PageResult {
  const frames: number[] = [];
  const steps: PageStep[] = [];
  const useOrder: number[] = [];
  const safeFrames = clampInt(frameCount, 1);
  let fifoCursor = 0;
  references.forEach((page, index) => {
    const existing = frames.indexOf(page);
    let evicted: number | undefined;
    let fault = existing === -1;
    if (!fault) {
      if (algorithm === "lru") {
        const orderIndex = useOrder.indexOf(page);
        if (orderIndex >= 0) useOrder.splice(orderIndex, 1);
        useOrder.push(page);
      }
    } else if (frames.length < safeFrames) {
      frames.push(page);
      useOrder.push(page);
    } else {
      let evictionIndex = 0;
      if (algorithm === "lru") {
        evictionIndex = frames.indexOf(useOrder[0]);
      } else if (algorithm === "fifo") {
        evictionIndex = fifoCursor;
        fifoCursor = (fifoCursor + 1) % safeFrames;
      } else if (algorithm === "optimal") {
        const future = references.slice(index + 1);
        const distances = frames.map(frame => {
          const nextUse = future.indexOf(frame);
          return nextUse === -1 ? Number.POSITIVE_INFINITY : nextUse;
        });
        evictionIndex = distances.indexOf(Math.max(...distances));
      }
      evicted = frames[evictionIndex];
      if (algorithm === "lru") useOrder.splice(useOrder.indexOf(evicted), 1);
      frames[evictionIndex] = page;
      useOrder.push(page);
    }
    steps.push({ page, frames: Array.from({ length: safeFrames }, (_, position) => frames[position] ?? null), fault, evicted });
  });
  const faults = steps.filter(step => step.fault).length;
  return { algorithm, steps, faults, hits: references.length - faults, faultRate: references.length ? (faults / references.length) * 100 : 0 };
}

export type AllocationStrategy = "first-fit" | "best-fit" | "worst-fit" | "next-fit";
export type AllocationRequest = { id: string; size: number; color?: string };
export type MemoryCell = { id: string; size: number; allocation?: AllocationRequest };
export type AllocationResult = { cells: MemoryCell[]; allocated: number; rejected: string[]; utilization: number };

export function simulateAllocation(
  strategy: AllocationStrategy,
  blockSizes: number[],
  requests: AllocationRequest[],
): AllocationResult {
  const cells: MemoryCell[] = blockSizes.map((size, index) => ({ id: `block-${index}`, size: clampInt(size, 1) }));
  const rejected: string[] = [];
  let cursor = 0;
  requests.forEach(request => {
    const size = clampInt(request.size, 1);
    const candidates = cells.map((cell, index) => ({ cell, index })).filter(({ cell }) => !cell.allocation && cell.size >= size);
    if (!candidates.length) {
      rejected.push(request.id);
      return;
    }
    let selected = candidates[0];
    if (strategy === "best-fit") selected = [...candidates].sort((a, b) => a.cell.size - b.cell.size || a.index - b.index)[0];
    if (strategy === "worst-fit") selected = [...candidates].sort((a, b) => b.cell.size - a.cell.size || a.index - b.index)[0];
    if (strategy === "next-fit") {
      selected = [...candidates].sort((a, b) => ((a.index - cursor + cells.length) % cells.length) - ((b.index - cursor + cells.length) % cells.length))[0];
    }
    const original = selected.cell;
    const allocated: MemoryCell = { id: `${original.id}-${request.id}`, size, allocation: { ...request, size } };
    const remainder = original.size - size;
    cells.splice(selected.index, 1, allocated, ...(remainder ? [{ id: `${original.id}-free-${request.id}`, size: remainder }] : []));
    cursor = (selected.index + 1) % cells.length;
  });
  const total = cells.reduce((sum, cell) => sum + cell.size, 0);
  const allocated = cells.filter(cell => cell.allocation).reduce((sum, cell) => sum + cell.size, 0);
  return { cells, allocated, rejected, utilization: total ? (allocated / total) * 100 : 0 };
}
