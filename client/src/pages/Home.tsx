import * as d3 from "d3";
import {
  Activity,
  BarChart3,
  CircleGauge,
  Code2,
  Cpu,
  GitCompareArrows,
  Layers3,
  MemoryStick,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  algorithmCatalog,
  type AlgorithmId,
  type AllocationStrategy,
  type PageAlgorithm,
  type ProcessInput,
  type SimulationResult,
  simulateAllocation,
  simulateCpu,
  simulatePages,
} from "@/lib/simulations";

type LabView = "scheduler" | "memory" | "compare";

const PROCESS_COLORS = ["#1fb5b5", "#5067e8", "#fb7b68", "#9d71dd", "#e6ae4b", "#2a9d76"];

const PRESETS: Record<string, ProcessInput[]> = {
  "Interactive mix": [
    { id: "P1", arrival: 0, burst: 7, priority: 2, queue: 0, color: PROCESS_COLORS[0] },
    { id: "P2", arrival: 2, burst: 4, priority: 1, queue: 1, color: PROCESS_COLORS[1] },
    { id: "P3", arrival: 4, burst: 1, priority: 4, queue: 2, color: PROCESS_COLORS[2] },
    { id: "P4", arrival: 5, burst: 4, priority: 3, queue: 1, color: PROCESS_COLORS[3] },
  ],
  "I/O bursty": [
    { id: "P1", arrival: 0, burst: 2, priority: 1, queue: 0, color: PROCESS_COLORS[0] },
    { id: "P2", arrival: 1, burst: 10, priority: 4, queue: 2, color: PROCESS_COLORS[1] },
    { id: "P3", arrival: 3, burst: 2, priority: 2, queue: 0, color: PROCESS_COLORS[2] },
    { id: "P4", arrival: 5, burst: 3, priority: 2, queue: 1, color: PROCESS_COLORS[3] },
    { id: "P5", arrival: 6, burst: 1, priority: 1, queue: 0, color: PROCESS_COLORS[4] },
  ],
  "Compute heavy": [
    { id: "P1", arrival: 0, burst: 12, priority: 3, queue: 2, color: PROCESS_COLORS[0] },
    { id: "P2", arrival: 0, burst: 8, priority: 1, queue: 1, color: PROCESS_COLORS[1] },
    { id: "P3", arrival: 3, burst: 6, priority: 2, queue: 1, color: PROCESS_COLORS[2] },
    { id: "P4", arrival: 6, burst: 5, priority: 4, queue: 2, color: PROCESS_COLORS[3] },
  ],
};

function createFreshWorkload(runNumber: number): ProcessInput[] {
  const burstOffset = (runNumber - 1) % 3;
  return [
    { id: "P1", arrival: 0, burst: 4 + burstOffset, priority: 2, queue: 0, color: PROCESS_COLORS[0] },
    { id: "P2", arrival: 1, burst: 6 - burstOffset, priority: 1, queue: 1, color: PROCESS_COLORS[1] },
    { id: "P3", arrival: 3, burst: 2 + (burstOffset % 2), priority: 3, queue: 2, color: PROCESS_COLORS[2] },
    { id: "P4", arrival: 5, burst: 3 + burstOffset, priority: 4, queue: 1, color: PROCESS_COLORS[3] },
  ];
}

const cpuNav = [
  { id: "scheduler" as const, label: "CPU scheduler", icon: Cpu, eyebrow: "Algorithms · workloads" },
  { id: "memory" as const, label: "Memory lab", icon: MemoryStick, eyebrow: "Frames · allocation" },
  { id: "compare" as const, label: "Compare runs", icon: GitCompareArrows, eyebrow: "Shared workload" },
];

function format(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

function MetricCard({ label, value, suffix, tint }: { label: string; value: string; suffix?: string; tint: "teal" | "blue" | "coral" | "violet" }) {
  return (
    <div className={cn("metric-card", `metric-${tint}`)}>
      <p>{label}</p>
      <div><strong>{value}</strong>{suffix ? <span>{suffix}</span> : null}</div>
    </div>
  );
}

export function GanttChart({ result, selectedProcess, onSelectProcess }: { result: SimulationResult; selectedProcess: string; onSelectProcess: (id: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{ id: string; start: number; end: number; left: number } | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const width = 850;
    const height = 158;
    const margin = { top: 24, right: 12, bottom: 32, left: 12 };
    const x = d3.scaleLinear().domain([0, Math.max(result.totalTime, 1)]).range([margin.left, width - margin.right]);
    const colors = new Map(result.processes.map(process => [process.id, process.color ?? "#1fb5b5"]));
    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "none");
    svg.selectAll("*").remove();
    const grid = svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`);
    grid.call(d3.axisBottom(x).ticks(Math.min(result.totalTime, 10)).tickSize(-(height - margin.top - margin.bottom)).tickFormat(d3.format("d")));
    grid.select(".domain").attr("stroke", "#dce7ee");
    grid.selectAll("line").attr("stroke", "#e8f0f4").attr("stroke-dasharray", "2 4");
    grid.selectAll("text").attr("fill", "#6e7f8a").attr("font-size", 11).attr("font-weight", 700);
    const rows = svg.append("g").attr("transform", `translate(0,${margin.top})`);
    result.timeline.forEach(segment => {
      const left = x(segment.start);
      const right = x(segment.end);
      const segmentWidth = Math.max(2, right - left);
      const interactive = !segment.idle;
      const rect = rows.append("rect")
        .attr("x", left).attr("y", 20).attr("width", segmentWidth).attr("height", 48).attr("rx", 8)
        .attr("fill", segment.idle ? "#e6edf1" : colors.get(segment.processId) ?? "#1fb5b5")
        .attr("opacity", segment.idle ? 1 : segment.processId === selectedProcess ? 1 : 0.74)
        .attr("stroke", segment.processId === selectedProcess ? "#15303e" : "transparent")
        .attr("stroke-width", segment.processId === selectedProcess ? 2 : 0)
        .style("cursor", interactive ? "pointer" : "default");
      if (interactive) {
        rect.on("mouseenter", () => setHovered({ id: segment.processId, start: segment.start, end: segment.end, left: ((left + segmentWidth / 2) / width) * 100 }))
          .on("mouseleave", () => setHovered(null))
          .on("click", () => onSelectProcess(segment.processId));
      }
      if (segmentWidth > 38) {
        rows.append("text")
          .attr("x", left + segmentWidth / 2).attr("y", 50).attr("text-anchor", "middle")
          .attr("fill", segment.idle ? "#69808c" : "#fff").attr("font-size", 12).attr("font-weight", 800)
          .text(segment.label);
      }
    });
  }, [result, selectedProcess, onSelectProcess]);

  return <div className="gantt-wrap"><svg ref={svgRef} className="gantt-chart" aria-label="Interactive CPU execution Gantt chart" role="img" />{hovered ? <div className="gantt-tooltip" style={{ left: `${hovered.left}%` }}><b>{hovered.id}</b><span>{hovered.start}–{hovered.end} ms</span></div> : null}</div>;
}

function ProcessTable({ processes, onChange, onAdd, onDelete }: { processes: ProcessInput[]; onChange: (index: number, field: keyof ProcessInput, value: number) => void; onAdd: () => void; onDelete: (index: number) => void }) {
  return (
    <div className="process-table-wrap">
      <table className="process-table">
        <thead><tr><th>Process</th><th>Arrival</th><th>CPU burst</th><th>Priority</th><th>Queue</th><th /></tr></thead>
        <tbody>
          {processes.map((process, index) => (
            <tr key={process.id}>
              <td><span className="process-dot" style={{ background: process.color }} />{process.id}</td>
              {(["arrival", "burst", "priority", "queue"] as const).map(field => (
                <td key={field}><Input aria-label={`${process.id} ${field}`} type="number" min={field === "arrival" ? 0 : 1} value={process[field] ?? 0} onChange={event => onChange(index, field, Number(event.target.value))} /></td>
              ))}
              <td><button onClick={() => onDelete(index)} className="icon-button" aria-label={`Delete ${process.id}`}><Trash2 size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add-process" onClick={onAdd}><Plus size={15} /> Add process</button>
    </div>
  );
}

function SchedulerLab({ processes, setProcesses, algorithm, setAlgorithm, quantum, setQuantum, runNumber }: {
  processes: ProcessInput[]; setProcesses: (processes: ProcessInput[]) => void; algorithm: AlgorithmId; setAlgorithm: (algorithm: AlgorithmId) => void; quantum: number; setQuantum: (value: number) => void; runNumber: number;
}) {
  const result = useMemo(() => simulateCpu(algorithm, processes, { quantum, mlfqQuantums: [quantum, quantum * 2, quantum * 4] }), [algorithm, processes, quantum]);
  const [saved, setSaved] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(processes[0]?.id ?? "P1");
  useEffect(() => {
    if (!processes.some(process => process.id === selectedProcess)) setSelectedProcess(processes[0]?.id ?? "");
  }, [processes, selectedProcess]);
  const inspected = result.processes.find(process => process.id === selectedProcess) ?? result.processes[0];
  const updateProcess = (index: number, field: keyof ProcessInput, value: number) => setProcesses(processes.map((process, processIndex) => processIndex === index ? { ...process, [field]: value } : process));
  const addProcess = () => setProcesses([...processes, { id: `P${processes.length + 1}`, arrival: processes.length + 1, burst: 3, priority: 2, queue: 1, color: PROCESS_COLORS[processes.length % PROCESS_COLORS.length] }]);
  const loadPreset = (name: string) => setProcesses(PRESETS[name]);
  const saveExperiment = () => {
    localStorage.setItem("simuos:last-cpu-experiment", JSON.stringify({ algorithm, quantum, processes, result }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="lab-flow">
      <section className="lab-hero panel">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> Live simulation workspace</div>
          <h1>Schedule with clarity,<br /><span>reason from evidence.</span></h1>
          <p>Compose a workload, tune dispatch rules, and trace every unit of processor time through a shared analytical surface.</p>
          <div className="hero-meta"><span><Activity size={14} /> Deterministic runs</span><span><Code2 size={14} /> Typed simulation core</span></div>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="plane plane-a" /><div className="plane plane-b" /><div className="plane plane-c" /><div className="orbit-orb" /><div className="mini-grid" /></div>
      </section>

      <section className="control-rail panel">
        <div className="control-heading"><div><p className="section-kicker">01 / configure run</p><h2>Dispatch policy</h2></div><div className="run-indicator" aria-live="polite"><i /> Run #{runNumber} ready</div></div>
        <div className="algorithm-grid">
          {(Object.keys(algorithmCatalog) as AlgorithmId[]).map(id => <button key={id} className={cn("algorithm-option", algorithm === id && "selected")} onClick={() => setAlgorithm(id)}><strong>{algorithmCatalog[id].label}</strong><span>{algorithmCatalog[id].description}</span></button>)}
        </div>
        <div className="parameter-row">
          <div className="parameter-label"><SlidersHorizontal size={17} /><div><strong>Time quantum</strong><span>Round Robin & queue slices</span></div></div>
          <div className="slider-group"><Slider value={[quantum]} min={1} max={8} step={1} onValueChange={value => setQuantum(value[0] ?? 2)} /><b>{quantum} ms</b></div>
          <div className="parameter-note">MLFQ demotes work across <b>{quantum}</b>, <b>{quantum * 2}</b>, and <b>{quantum * 4}</b> ms queues.</div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel workload-panel">
          <div className="panel-heading"><div><p className="section-kicker">02 / construct</p><h2>Process workload</h2></div><Select onValueChange={loadPreset}><SelectTrigger className="preset-select"><SelectValue placeholder="Load a preset" /></SelectTrigger><SelectContent>{Object.keys(PRESETS).map(name => <SelectItem value={name} key={name}>{name}</SelectItem>)}</SelectContent></Select></div>
          <ProcessTable processes={processes} onChange={updateProcess} onAdd={addProcess} onDelete={index => setProcesses(processes.filter((_, processIndex) => processIndex !== index))} />
          <div className="workload-actions"><Button variant="outline" onClick={() => loadPreset("Interactive mix")}><RotateCcw size={15} /> Reset workload</Button><Button onClick={saveExperiment} className="save-button"><Save size={15} /> {saved ? "Saved locally" : "Save experiment"}</Button></div>
        </div>
        <div className="panel result-panel">
          <div className="panel-heading"><div><p className="section-kicker">03 / evaluate</p><h2>{algorithmCatalog[algorithm].label} execution</h2></div><div className="execution-badge"><Play size={13} fill="currentColor" /> {result.totalTime} ms</div></div>
          <GanttChart result={result} selectedProcess={inspected?.id ?? ""} onSelectProcess={setSelectedProcess} />
          {inspected ? <div className="trace-inspector"><div><span>Trace inspector</span><b><i style={{ background: inspected.color }} />{inspected.id} selected</b></div><p>First response at <strong>{inspected.response} ms</strong> · {result.timeline.filter(segment => segment.processId === inspected.id).length} execution slice{result.timeline.filter(segment => segment.processId === inspected.id).length === 1 ? "" : "s"} · completes at <strong>{inspected.completion} ms</strong></p></div> : null}
          <div className="metrics-row"><MetricCard label="Avg. waiting" value={format(result.averages.waiting)} suffix="ms" tint="teal" /><MetricCard label="Avg. turnaround" value={format(result.averages.turnaround)} suffix="ms" tint="blue" /><MetricCard label="CPU utilization" value={format(result.cpuUtilization, 0)} suffix="%" tint="coral" /><MetricCard label="Throughput" value={format(result.throughput)} suffix="p/ms" tint="violet" /></div>
        </div>
      </section>

      <section className="panel timings-panel">
        <div className="panel-heading"><div><p className="section-kicker">Timing evidence</p><h2>Per-process analysis</h2></div><p className="muted-copy">Every aggregate is derived from the execution trace above.</p></div>
        <table className="analysis-table"><thead><tr><th>Process</th><th>Start</th><th>Complete</th><th>Waiting</th><th>Turnaround</th><th>Response</th></tr></thead><tbody>{result.processes.map(process => <tr key={process.id} className={cn("analysis-row", selectedProcess === process.id && "selected")}><td><button className="process-pick" onClick={() => setSelectedProcess(process.id)}><span className="process-dot" style={{ background: process.color }} />{process.id}</button></td><td>{process.start} ms</td><td>{process.completion} ms</td><td>{process.waiting} ms</td><td>{process.turnaround} ms</td><td>{process.response} ms</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}

function ComparisonLab({ processes, quantum }: { processes: ProcessInput[]; quantum: number }) {
  const selected: AlgorithmId[] = ["fcfs", "sjf", "srtf", "rr", "priority", "mlfq"];
  const results = useMemo(() => selected.map(algorithm => simulateCpu(algorithm, processes, { quantum, mlfqQuantums: [quantum, quantum * 2, quantum * 4] })), [processes, quantum]);
  const fastestWaiting = Math.min(...results.map(result => result.averages.waiting));
  return <div className="lab-flow">
    <section className="compare-hero panel"><div><p className="eyebrow"><GitCompareArrows size={14} /> Shared workload analysis</p><h1>Compare policy<br /><span>against the same clock.</span></h1><p>Six dispatch policies, one workload, and the same measurement contracts. Scan trade-offs without changing the experiment.</p></div><div className="comparison-symbol"><div className="symbol-layer one" /><div className="symbol-layer two" /><div className="symbol-layer three" /><strong>6</strong><span>runs</span></div></section>
    <section className="panel comparison-panel"><div className="panel-heading"><div><p className="section-kicker">Algorithm scorecard</p><h2>Shared workload comparison</h2></div><div className="run-indicator"><i /> {processes.length} processes under test</div></div><div className="comparison-grid">{results.map(result => <article key={result.algorithm} className={cn("compare-card", result.averages.waiting === fastestWaiting && "winner")}><div className="compare-card-head"><div><p>{algorithmCatalog[result.algorithm].label}</p><span>{algorithmCatalog[result.algorithm].description}</span></div>{result.averages.waiting === fastestWaiting ? <b>Best wait</b> : null}</div><div className="score"><span>Avg. waiting</span><strong>{format(result.averages.waiting)}<small> ms</small></strong></div><div className="compare-stat"><span>Turnaround</span><b>{format(result.averages.turnaround)} ms</b></div><div className="compare-stat"><span>Response</span><b>{format(result.averages.response)} ms</b></div><div className="compare-stat"><span>Utilization</span><b>{format(result.cpuUtilization, 0)}%</b></div><div className="micro-timeline">{result.timeline.filter(segment => !segment.idle).map((segment, index) => <span key={`${segment.processId}-${index}`} style={{ flex: segment.end - segment.start, background: result.processes.find(process => process.id === segment.processId)?.color }} />)}</div></article>)}</div></section>
  </div>;
}

function MemoryLab() {
  const [pageAlgorithm, setPageAlgorithm] = useState<PageAlgorithm>("lru");
  const [referenceText, setReferenceText] = useState("7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2");
  const [frameCount, setFrameCount] = useState(3);
  const [allocationStrategy, setAllocationStrategy] = useState<AllocationStrategy>("best-fit");
  const references = useMemo(() => referenceText.split(/[^0-9]+/).filter(Boolean).map(Number).slice(0, 18), [referenceText]);
  const pageResult = useMemo(() => simulatePages(pageAlgorithm, references, frameCount), [pageAlgorithm, references, frameCount]);
  const allocation = useMemo(() => simulateAllocation(allocationStrategy, [120, 280, 160, 220], [{ id: "A", size: 92, color: PROCESS_COLORS[0] }, { id: "B", size: 155, color: PROCESS_COLORS[1] }, { id: "C", size: 118, color: PROCESS_COLORS[2] }, { id: "D", size: 70, color: PROCESS_COLORS[3] }]), [allocationStrategy]);
  return <div className="lab-flow">
    <section className="memory-hero panel"><div><p className="eyebrow"><Layers3 size={14} /> Stateful memory experiments</p><h1>Trace every miss.<br /><span>Place every block.</span></h1><p>Move through frame replacement and contiguous allocation as visible system state, not abstract output.</p></div><div className="memory-art"><div className="memory-cube cube-one" /><div className="memory-cube cube-two" /><div className="memory-cube cube-three" /></div></section>
    <section className="memory-grid">
      <div className="panel page-panel"><div className="panel-heading"><div><p className="section-kicker">Virtual memory</p><h2>Page replacement</h2></div><Select value={pageAlgorithm} onValueChange={value => setPageAlgorithm(value as PageAlgorithm)}><SelectTrigger className="compact-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fifo">FIFO</SelectItem><SelectItem value="lru">LRU</SelectItem><SelectItem value="optimal">Optimal</SelectItem></SelectContent></Select></div><div className="page-setup"><div><Label>Reference string</Label><Input value={referenceText} onChange={event => setReferenceText(event.target.value)} /></div><div><Label>Frames</Label><div className="frame-control"><Slider value={[frameCount]} min={1} max={5} step={1} onValueChange={value => setFrameCount(value[0] ?? 3)} /><b>{frameCount}</b></div></div></div><div className="reference-strip">{pageResult.steps.map((step, index) => <div key={`${step.page}-${index}`} className={cn("reference-cell", step.fault && "fault")}><span>{step.page}</span><i>{step.fault ? "fault" : "hit"}</i></div>)}</div><div className="frame-matrix"><div className="frame-label">Frame state</div>{pageResult.steps.map((step, index) => <div key={index} className="frame-column">{step.frames.map((frame, frameIndex) => <span key={frameIndex} className={frame === null ? "empty" : ""}>{frame ?? "—"}</span>)}</div>)}</div><div className="metrics-row three"><MetricCard label="Page faults" value={String(pageResult.faults)} tint="coral" /><MetricCard label="Page hits" value={String(pageResult.hits)} tint="teal" /><MetricCard label="Fault rate" value={format(pageResult.faultRate, 0)} suffix="%" tint="blue" /></div></div>
      <div className="panel allocation-panel"><div className="panel-heading"><div><p className="section-kicker">Contiguous memory</p><h2>Allocation strategies</h2></div><Select value={allocationStrategy} onValueChange={value => setAllocationStrategy(value as AllocationStrategy)}><SelectTrigger className="compact-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="first-fit">First fit</SelectItem><SelectItem value="best-fit">Best fit</SelectItem><SelectItem value="worst-fit">Worst fit</SelectItem><SelectItem value="next-fit">Next fit</SelectItem></SelectContent></Select></div><div className="allocation-caption"><span>Physical memory map</span><b>{format(allocation.utilization, 0)}% utilized</b></div><div className="memory-map">{allocation.cells.map(cell => <div key={cell.id} className={cn("memory-block", cell.allocation ? "allocated" : "free")} style={{ flex: cell.size, ...(cell.allocation ? { background: cell.allocation.color } : {}) }}><span>{cell.allocation?.id ?? "Free"}</span><small>{cell.size} KB</small></div>)}</div><div className="allocation-legend">{["A", "B", "C", "D"].map((id, index) => <span key={id}><i style={{ background: PROCESS_COLORS[index] }} /> Process {id}</span>)}<span><i className="free-swatch" /> Free space</span></div><div className="allocation-summary"><div><span>Allocated</span><strong>{allocation.allocated} KB</strong></div><div><span>Rejected requests</span><strong>{allocation.rejected.length}</strong></div><div><span>Strategy</span><strong>{allocationStrategy.replace("-", " ")}</strong></div></div><div className="alloc-callout"><CircleGauge size={17} /><p><b>Placement insight:</b> {allocationStrategy === "best-fit" ? "Best fit preserves the largest contiguous blocks, but may increase small-fragment pressure." : "Rerun the workload with another strategy to inspect fragmentation and capacity trade-offs."}</p></div></div>
    </section>
  </div>;
}

export default function Home() {
  const [view, setView] = useState<LabView>("scheduler");
  const [processes, setProcesses] = useState<ProcessInput[]>(PRESETS["Interactive mix"]);
  const [algorithm, setAlgorithm] = useState<AlgorithmId>("rr");
  const [quantum, setQuantum] = useState(2);
  const [runNumber, setRunNumber] = useState(1);
  const activeNav = cpuNav.find(item => item.id === view) ?? cpuNav[0];
  const startNewRun = () => {
    const nextRun = runNumber + 1;
    setProcesses(createFreshWorkload(nextRun));
    setAlgorithm("rr");
    setQuantum(2);
    setRunNumber(nextRun);
    setView("scheduler");
  };

  return <div className="simuos-shell">
    <aside className="app-sidebar"><div className="brand"><div className="brand-mark"><span /><span /><span /></div><div><b>SimuOS</b><small>Systems lab</small></div></div><div className="sidebar-section"><p>Laboratory</p>{cpuNav.map(item => <button key={item.id} onClick={() => setView(item.id)} className={cn("nav-item", view === item.id && "active")}><item.icon size={18} /><span>{item.label}</span>{view === item.id ? <i /> : null}</button>)}</div><div className="sidebar-section lower"><p>Environment</p><button className="nav-item"><BarChart3 size={18} /><span>Experiment log</span></button><button className="nav-item"><Settings2 size={18} /><span>Lab settings</span></button></div><div className="sidebar-status"><div className="pulse-core"><span /></div><div><strong>Simulation core</strong><p>Ready for input</p></div></div></aside>
    <main className="app-main"><header className="topbar"><div><p className="crumb">SimuOS / <span>{activeNav.label}</span></p><div className="mobile-brand">Systems laboratory</div></div><div className="top-actions"><div className="build-chip"><i /> Core v0.1</div><Button size="sm" onClick={startNewRun}><Play size={14} fill="currentColor" /> New run</Button></div></header><div className="main-scroll">{view === "scheduler" ? <SchedulerLab processes={processes} setProcesses={setProcesses} algorithm={algorithm} setAlgorithm={setAlgorithm} quantum={quantum} setQuantum={setQuantum} runNumber={runNumber} /> : null}{view === "memory" ? <MemoryLab /> : null}{view === "compare" ? <ComparisonLab processes={processes} quantum={quantum} /> : null}</div></main>
  </div>;
}
