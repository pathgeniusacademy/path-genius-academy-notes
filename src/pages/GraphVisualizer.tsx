import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import toast from "react-hot-toast";
import {
  compileImplicitEquation,
  compileInequality,
  compileMathExpression,
  evaluateConstant,
  stripEquationPrefix,
} from "@/lib/mathExpression";

type GraphMode = "cartesian" | "polar" | "parametric" | "implicit" | "inequality";

type EquationRow = {
  id: number;
  expression: string;
  xExpression: string;
  yExpression: string;
  visible: boolean;
};

type Viewport = { xmin: number; xmax: number; ymin: number; ymax: number };

type Transform = {
  scale: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  worldToCanvas: (x: number, y: number) => [number, number];
  canvasToWorld: (px: number, py: number) => [number, number];
};

const COLORS = ["#2E6EEA", "#FF7A00", "#0A9D84", "#7C5CE5", "#E03B65", "#0B91B5", "#C58A08", "#475569"];
const DEFAULT_VIEW: Viewport = { xmin: -10, xmax: 10, ymin: -10, ymax: 10 };
const MAX_EQUATIONS = 8;

const MODE_META: Record<GraphMode, { label: string; hint: string; example: string }> = {
  cartesian: { label: "Cartesian", hint: "Plot y = f(x)", example: "y = x^2" },
  polar: { label: "Polar", hint: "Plot r = f(theta)", example: "r = 2*sin(3*theta)" },
  parametric: { label: "Parametric", hint: "Plot x(t), y(t)", example: "x=3*cos(t), y=2*sin(t)" },
  implicit: { label: "Implicit", hint: "Plot F(x,y) = 0", example: "x^2 + y^2 = 25" },
  inequality: { label: "Inequality", hint: "Shade a 2D region", example: "x^2 + y^2 <= 25" },
};

function makeDefaultRow(mode: GraphMode, id = Date.now()): EquationRow {
  if (mode === "parametric") {
    return { id, expression: "", xExpression: "3*cos(t)", yExpression: "2*sin(t)", visible: true };
  }
  const examples: Record<Exclude<GraphMode, "parametric">, string> = {
    cartesian: "y = x^2",
    polar: "r = 2*sin(3*theta)",
    implicit: "x^2 + y^2 = 25",
    inequality: "x^2 + y^2 <= 25",
  };
  return { id, expression: examples[mode], xExpression: "", yExpression: "", visible: true };
}

function niceStep(range: number) {
  const rough = Math.max(range / 10, 1e-9);
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10;
  return nice * power;
}

function formatTick(value: number, step: number) {
  const digits = step < 1 ? Math.min(5, Math.max(1, Math.ceil(-Math.log10(step)))) : 0;
  const rounded = Number(value.toFixed(digits));
  return Math.abs(rounded) < 1e-10 ? "0" : String(rounded);
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createTransform(width: number, height: number, view: Viewport): Transform {
  const marginX = width < 520 ? 38 : 50;
  const marginY = 28;
  const availableW = Math.max(50, width - marginX * 2);
  const availableH = Math.max(50, height - marginY * 2);
  const scale = Math.min(availableW / (view.xmax - view.xmin), availableH / (view.ymax - view.ymin));
  const plotW = (view.xmax - view.xmin) * scale;
  const plotH = (view.ymax - view.ymin) * scale;
  const left = (width - plotW) / 2;
  const top = (height - plotH) / 2;
  const right = left + plotW;
  const bottom = top + plotH;
  return {
    scale,
    left,
    top,
    right,
    bottom,
    worldToCanvas: (x, y) => [left + (x - view.xmin) * scale, bottom - (y - view.ymin) * scale],
    canvasToWorld: (px, py) => [view.xmin + (px - left) / scale, view.ymin + (bottom - py) / scale],
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, view: Viewport, tr: Transform, enabled: boolean, polar: boolean) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(tr.left, tr.top, tr.right - tr.left, tr.bottom - tr.top);
  ctx.clip();

  if (enabled) {
    const xStep = niceStep(view.xmax - view.xmin);
    const yStep = niceStep(view.ymax - view.ymin);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e8eef6";

    for (let x = Math.ceil(view.xmin / xStep) * xStep; x <= view.xmax + xStep * 0.01; x += xStep) {
      const [px] = tr.worldToCanvas(x, 0);
      ctx.beginPath();
      ctx.moveTo(px, tr.top);
      ctx.lineTo(px, tr.bottom);
      ctx.stroke();
    }
    for (let y = Math.ceil(view.ymin / yStep) * yStep; y <= view.ymax + yStep * 0.01; y += yStep) {
      const [, py] = tr.worldToCanvas(0, y);
      ctx.beginPath();
      ctx.moveTo(tr.left, py);
      ctx.lineTo(tr.right, py);
      ctx.stroke();
    }

    if (polar) {
      const maxRadius = Math.max(Math.abs(view.xmin), Math.abs(view.xmax), Math.abs(view.ymin), Math.abs(view.ymax));
      const radialStep = niceStep(maxRadius);
      ctx.strokeStyle = "rgba(61,93,143,.10)";
      const [ox, oy] = tr.worldToCanvas(0, 0);
      for (let r = radialStep; r <= maxRadius; r += radialStep) {
        ctx.beginPath();
        ctx.arc(ox, oy, r * tr.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const [ex, ey] = tr.worldToCanvas(maxRadius * Math.cos(a), maxRadius * Math.sin(a));
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }
  }

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#8fa0b8";
  if (view.ymin <= 0 && view.ymax >= 0) {
    const [, py] = tr.worldToCanvas(0, 0);
    ctx.beginPath();
    ctx.moveTo(tr.left, py);
    ctx.lineTo(tr.right, py);
    ctx.stroke();
  }
  if (view.xmin <= 0 && view.xmax >= 0) {
    const [px] = tr.worldToCanvas(0, 0);
    ctx.beginPath();
    ctx.moveTo(px, tr.top);
    ctx.lineTo(px, tr.bottom);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "#d8e2ef";
  ctx.lineWidth = 1;
  ctx.strokeRect(tr.left, tr.top, tr.right - tr.left, tr.bottom - tr.top);

  if (!enabled) return;
  const xStep = niceStep(view.xmax - view.xmin);
  const yStep = niceStep(view.ymax - view.ymin);
  ctx.fillStyle = "#7a879a";
  ctx.font = width < 500 ? "9px system-ui" : "10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = Math.ceil(view.xmin / xStep) * xStep; x <= view.xmax + xStep * 0.01; x += xStep) {
    if (Math.abs(x) < xStep * 0.01) continue;
    const [px] = tr.worldToCanvas(x, 0);
    ctx.fillText(formatTick(x, xStep), px, Math.min(height - 14, tr.bottom + 5));
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = Math.ceil(view.ymin / yStep) * yStep; y <= view.ymax + yStep * 0.01; y += yStep) {
    if (Math.abs(y) < yStep * 0.01) continue;
    const [, py] = tr.worldToCanvas(0, y);
    ctx.fillText(formatTick(y, yStep), Math.max(28, tr.left - 6), py);
  }
}

function safeValue(fn: (scope: Record<string, number>) => number, scope: Record<string, number>) {
  try {
    const value = fn(scope);
    return Number.isFinite(value) && Math.abs(value) < 1e10 ? value : NaN;
  } catch {
    return NaN;
  }
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number] | null>,
  tr: Transform,
  color: string,
  view: Viewport,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(tr.left, tr.top, tr.right - tr.left, tr.bottom - tr.top);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let started = false;
  let previous: [number, number] | null = null;
  const maxJump = (view.ymax - view.ymin) * 0.7;
  for (const point of points) {
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      started = false;
      previous = null;
      continue;
    }
    if (previous && Math.abs(point[1] - previous[1]) > maxJump) started = false;
    const [px, py] = tr.worldToCanvas(point[0], point[1]);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else ctx.lineTo(px, py);
    previous = point;
  }
  ctx.stroke();
  ctx.restore();
}

function drawMarchingSquares(
  ctx: CanvasRenderingContext2D,
  fn: (x: number, y: number) => number,
  view: Viewport,
  tr: Transform,
  color: string,
  resolution: number,
) {
  const nx = resolution;
  const ny = resolution;
  const dx = (view.xmax - view.xmin) / nx;
  const dy = (view.ymax - view.ymin) / ny;
  const values: number[][] = Array.from({ length: ny + 1 }, () => Array(nx + 1).fill(NaN));

  for (let j = 0; j <= ny; j += 1) {
    const y = view.ymin + j * dy;
    for (let i = 0; i <= nx; i += 1) {
      const x = view.xmin + i * dx;
      try {
        const value = fn(x, y);
        values[j][i] = Number.isFinite(value) ? value : NaN;
      } catch {
        values[j][i] = NaN;
      }
    }
  }

  const interpolate = (p1: [number, number], p2: [number, number], v1: number, v2: number): [number, number] => {
    const denom = v1 - v2;
    const ratio = Math.abs(denom) < 1e-12 ? 0.5 : Math.max(0, Math.min(1, v1 / denom));
    return [p1[0] + (p2[0] - p1[0]) * ratio, p1[1] + (p2[1] - p1[1]) * ratio];
  };

  const cases: Record<number, Array<[number, number]>> = {
    1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
    5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
    9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[1, 3]],
    13: [[0, 1]], 14: [[3, 0]],
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(tr.left, tr.top, tr.right - tr.left, tr.bottom - tr.top);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.beginPath();

  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const v0 = values[j][i];
      const v1 = values[j][i + 1];
      const v2 = values[j + 1][i + 1];
      const v3 = values[j + 1][i];
      if (![v0, v1, v2, v3].every(Number.isFinite)) continue;
      const index = (v0 >= 0 ? 1 : 0) | (v1 >= 0 ? 2 : 0) | (v2 >= 0 ? 4 : 0) | (v3 >= 0 ? 8 : 0);
      const segments = cases[index];
      if (!segments) continue;
      const x0 = view.xmin + i * dx;
      const y0 = view.ymin + j * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      const p: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const edgePoints: Array<[number, number]> = [
        interpolate(p[0], p[1], v0, v1),
        interpolate(p[1], p[2], v1, v2),
        interpolate(p[2], p[3], v2, v3),
        interpolate(p[3], p[0], v3, v0),
      ];
      for (const [a, b] of segments) {
        const [ax, ay] = tr.worldToCanvas(edgePoints[a][0], edgePoints[a][1]);
        const [bx, by] = tr.worldToCanvas(edgePoints[b][0], edgePoints[b][1]);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawInequalityFill(
  ctx: CanvasRenderingContext2D,
  test: (x: number, y: number) => boolean,
  view: Viewport,
  tr: Transform,
  color: string,
  resolution: number,
) {
  const nx = resolution;
  const ny = resolution;
  const dx = (view.xmax - view.xmin) / nx;
  const dy = (view.ymax - view.ymin) / ny;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tr.left, tr.top, tr.right - tr.left, tr.bottom - tr.top);
  ctx.clip();
  ctx.fillStyle = hexToRgba(color, 0.16);
  const cellW = dx * tr.scale + 1;
  const cellH = dy * tr.scale + 1;
  for (let j = 0; j < ny; j += 1) {
    const y = view.ymin + (j + 0.5) * dy;
    for (let i = 0; i < nx; i += 1) {
      const x = view.xmin + (i + 0.5) * dx;
      if (!test(x, y)) continue;
      const [px, py] = tr.worldToCanvas(view.xmin + i * dx, view.ymin + (j + 1) * dy);
      ctx.fillRect(px, py, cellW, cellH);
    }
  }
  ctx.restore();
}

export default function GraphVisualizer() {
  const [mode, setMode] = useState<GraphMode>("cartesian");
  const [rows, setRows] = useState<EquationRow[]>([makeDefaultRow("cartesian")]);
  const [plottedRows, setPlottedRows] = useState<EquationRow[]>([makeDefaultRow("cartesian", 1)]);
  const [plottedMode, setPlottedMode] = useState<GraphMode>("cartesian");
  const [view, setView] = useState<Viewport>(DEFAULT_VIEW);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [parameterStart, setParameterStart] = useState("0");
  const [parameterEnd, setParameterEnd] = useState("2*pi");
  const [plottedParameterRange, setPlottedParameterRange] = useState<[number, number]>([0, Math.PI * 2]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: Viewport } | null>(null);

  const activeRows = useMemo(() => plottedRows.filter((row) => row.visible), [plottedRows]);

  const changeMode = (next: GraphMode) => {
    setMode(next);
    const nextRows = [makeDefaultRow(next)];
    setRows(nextRows);
    setPlottedRows(nextRows.map((row) => ({ ...row })));
    setPlottedMode(next);
    setView(DEFAULT_VIEW);
    setParameterStart("0");
    setParameterEnd("2*pi");
    setPlottedParameterRange([0, Math.PI * 2]);
  };

  const updateRow = (id: number, patch: Partial<EquationRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addEquation = () => {
    if (rows.length >= MAX_EQUATIONS) {
      toast.error(`Maximum ${MAX_EQUATIONS} equations can be plotted together.`);
      return;
    }
    setRows((current) => [
      ...current,
      { id: Date.now() + current.length, expression: "", xExpression: "", yExpression: "", visible: true },
    ]);
  };

  const removeEquation = (id: number) => {
    setRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== id));
  };

  const plot = () => {
    try {
      const nonEmptyRows = rows.filter((row) => mode === "parametric" ? row.xExpression.trim() && row.yExpression.trim() : row.expression.trim());
      if (nonEmptyRows.length === 0) throw new Error("Enter at least one equation.");

      for (const row of nonEmptyRows) {
        if (mode === "cartesian") compileMathExpression(stripEquationPrefix(row.expression, "y"));
        if (mode === "polar") compileMathExpression(stripEquationPrefix(row.expression, "r"));
        if (mode === "parametric") {
          compileMathExpression(stripEquationPrefix(row.xExpression, "x"));
          compileMathExpression(stripEquationPrefix(row.yExpression, "y"));
        }
        if (mode === "implicit") compileImplicitEquation(row.expression);
        if (mode === "inequality") compileInequality(row.expression);
      }

      let parameterRange: [number, number] = [0, Math.PI * 2];
      if (mode === "polar" || mode === "parametric") {
        const start = evaluateConstant(parameterStart);
        const end = evaluateConstant(parameterEnd);
        if (!(end > start)) throw new Error("Parameter end must be greater than start.");
        if (end - start > 1000) throw new Error("Parameter range is too large.");
        parameterRange = [start, end];
      }

      setPlottedRows(nonEmptyRows.map((row) => ({ ...row })));
      setPlottedMode(mode);
      setPlottedParameterRange(parameterRange);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Please check the equation.");
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = canvasWrapRef.current;
    if (!canvas || !wrapper) return;

    const draw = () => {
      const cssWidth = Math.max(300, wrapper.clientWidth);
      const cssHeight = cssWidth < 560 ? 390 : 520;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tr = createTransform(cssWidth, cssHeight, view);
      drawGrid(ctx, cssWidth, cssHeight, view, tr, gridEnabled, plottedMode === "polar");

      activeRows.forEach((row, index) => {
        const color = COLORS[index % COLORS.length];
        try {
          if (plottedMode === "cartesian") {
            const fn = compileMathExpression(stripEquationPrefix(row.expression, "y"));
            const samples = Math.max(700, Math.floor(cssWidth * 1.5));
            const points: Array<[number, number] | null> = [];
            for (let i = 0; i <= samples; i += 1) {
              const x = view.xmin + (i / samples) * (view.xmax - view.xmin);
              const y = safeValue(fn, { x });
              points.push(Number.isFinite(y) ? [x, y] : null);
            }
            drawPolyline(ctx, points, tr, color, view);
          }

          if (plottedMode === "polar") {
            const fn = compileMathExpression(stripEquationPrefix(row.expression, "r"));
            const samples = 1200;
            const [start, end] = plottedParameterRange;
            const points: Array<[number, number] | null> = [];
            for (let i = 0; i <= samples; i += 1) {
              const theta = start + (i / samples) * (end - start);
              const r = safeValue(fn, { theta });
              points.push(Number.isFinite(r) ? [r * Math.cos(theta), r * Math.sin(theta)] : null);
            }
            drawPolyline(ctx, points, tr, color, view);
          }

          if (plottedMode === "parametric") {
            const xFn = compileMathExpression(stripEquationPrefix(row.xExpression, "x"));
            const yFn = compileMathExpression(stripEquationPrefix(row.yExpression, "y"));
            const samples = 1200;
            const [start, end] = plottedParameterRange;
            const points: Array<[number, number] | null> = [];
            for (let i = 0; i <= samples; i += 1) {
              const t = start + (i / samples) * (end - start);
              const x = safeValue(xFn, { t });
              const y = safeValue(yFn, { t });
              points.push(Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null);
            }
            drawPolyline(ctx, points, tr, color, view);
          }

          if (plottedMode === "implicit") {
            const fn = compileImplicitEquation(row.expression);
            drawMarchingSquares(ctx, fn, view, tr, color, cssWidth < 600 ? 100 : 140);
          }

          if (plottedMode === "inequality") {
            const { difference, test } = compileInequality(row.expression);
            const resolution = cssWidth < 600 ? 90 : 120;
            drawInequalityFill(ctx, test, view, tr, color, resolution);
            drawMarchingSquares(ctx, difference, view, tr, color, Math.max(80, resolution));
          }
        } catch {
          // Validation happens before plotting. Keep one bad trace from breaking the canvas.
        }
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [activeRows, plottedMode, plottedParameterRange, view, gridEnabled]);

  const zoom = (factor: number) => {
    setView((current) => {
      const cx = (current.xmin + current.xmax) / 2;
      const cy = (current.ymin + current.ymax) / 2;
      const halfW = ((current.xmax - current.xmin) * factor) / 2;
      const halfH = ((current.ymax - current.ymin) * factor) / 2;
      return { xmin: cx - halfW, xmax: cx + halfW, ymin: cy - halfH, ymax: cy + halfH };
    });
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, view };
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const tr = createTransform(cssWidth, cssHeight, drag.view);
    const dx = (event.clientX - drag.x) / tr.scale;
    const dy = (event.clientY - drag.y) / tr.scale;
    setView({
      xmin: drag.view.xmin - dx,
      xmax: drag.view.xmax - dx,
      ymin: drag.view.ymin + dy,
      ymax: drag.view.ymax + dy,
    });
  };

  const pointerUp = () => {
    dragRef.current = null;
  };

  const wheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tr = createTransform(canvas.clientWidth, canvas.clientHeight, view);
    const [wx, wy] = tr.canvasToWorld(event.clientX - rect.left, event.clientY - rect.top);
    const factor = event.deltaY < 0 ? 0.86 : 1.16;
    setView((current) => ({
      xmin: wx + (current.xmin - wx) * factor,
      xmax: wx + (current.xmax - wx) * factor,
      ymin: wy + (current.ymin - wy) * factor,
      ymax: wy + (current.ymax - wy) * factor,
    }));
  };

  return (
    <div className="graph-page">
      <section className="graph-hero">
        <div>
          <span className="graph-kicker">PATH GENIUS 2D GRAPH LAB</span>
          <h2>Visualize mathematics instantly.</h2>
          <p>Plot and compare up to {MAX_EQUATIONS} equations on one interactive 2D graph — directly inside your Notes Vault.</p>
        </div>
        <div className="graph-hero-badge"><strong>2D</strong><span>No server required</span></div>
      </section>

      <section className="panel premium-panel graph-builder-panel">
        <div className="section-head premium-section-head graph-section-head">
          <div><span className="eyebrow">GRAPH TYPE</span><h2>Choose a coordinate form</h2><p>Switch between the most useful 2D representations for school, graduation and competitive mathematics.</p></div>
        </div>

        <div className="graph-mode-tabs" role="tablist" aria-label="Graph type">
          {(Object.keys(MODE_META) as GraphMode[]).map((item) => (
            <button key={item} className={mode === item ? "active" : ""} onClick={() => changeMode(item)}>
              <strong>{MODE_META[item].label}</strong><span>{MODE_META[item].hint}</span>
            </button>
          ))}
        </div>

        <div className="graph-equation-list">
          {rows.map((row, index) => (
            <div className="graph-equation-row" key={row.id}>
              <div className="graph-equation-number" style={{ background: COLORS[index % COLORS.length] }}>{index + 1}</div>
              <div className="graph-equation-inputs">
                {mode === "parametric" ? (
                  <div className="parametric-inputs">
                    <label><span>x(t)</span><input value={row.xExpression} onChange={(e: ChangeEvent<HTMLInputElement>) => updateRow(row.id, { xExpression: e.target.value })} placeholder="3*cos(t)" /></label>
                    <label><span>y(t)</span><input value={row.yExpression} onChange={(e: ChangeEvent<HTMLInputElement>) => updateRow(row.id, { yExpression: e.target.value })} placeholder="2*sin(t)" /></label>
                  </div>
                ) : (
                  <input
                    value={row.expression}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateRow(row.id, { expression: e.target.value })}
                    placeholder={MODE_META[mode].example}
                    aria-label={`Equation ${index + 1}`}
                  />
                )}
              </div>
              <button className="equation-remove" onClick={() => removeEquation(row.id)} disabled={rows.length === 1} aria-label="Remove equation">×</button>
            </div>
          ))}
        </div>

        <div className="graph-builder-actions">
          <button className="graph-add-btn" onClick={addEquation} disabled={rows.length >= MAX_EQUATIONS}>+ Add Equation</button>
          {(mode === "polar" || mode === "parametric") && (
            <div className="parameter-range">
              <span>{mode === "polar" ? "θ range" : "t range"}</span>
              <input value={parameterStart} onChange={(e: ChangeEvent<HTMLInputElement>) => setParameterStart(e.target.value)} aria-label="Parameter start" />
              <b>to</b>
              <input value={parameterEnd} onChange={(e: ChangeEvent<HTMLInputElement>) => setParameterEnd(e.target.value)} aria-label="Parameter end" />
            </div>
          )}
          <button className="graph-plot-btn" onClick={plot}>Plot Graph →</button>
        </div>
      </section>

      <section className="panel premium-panel graph-output-panel">
        <div className="graph-output-head">
          <div><span className="eyebrow">LIVE CANVAS</span><h2>{MODE_META[plottedMode].label} Graph</h2><p>Drag to pan • use +/− or mouse wheel to zoom • each equation gets its own color.</p></div>
          <div className="graph-controls">
            <button onClick={() => zoom(0.8)} title="Zoom in">＋</button>
            <button onClick={() => zoom(1.25)} title="Zoom out">−</button>
            <button onClick={() => setView(DEFAULT_VIEW)}>Reset</button>
            <button className={gridEnabled ? "active" : ""} onClick={() => setGridEnabled((value) => !value)}>Grid</button>
          </div>
        </div>

        <div className="graph-canvas-shell" ref={canvasWrapRef}>
          <canvas
            ref={canvasRef}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onWheel={wheel}
          />
        </div>

        <div className="graph-legend">
          {activeRows.map((row, index) => (
            <span key={row.id}><i style={{ background: COLORS[index % COLORS.length] }} />{plottedMode === "parametric" ? `x=${row.xExpression}, y=${row.yExpression}` : row.expression}</span>
          ))}
        </div>
      </section>

      <section className="graph-help-grid">
        <div className="graph-help-card"><span>01</span><strong>Cartesian</strong><p><code>y=x^2</code>, <code>sin(x)</code>, <code>1/x</code>, <code>abs(x)</code></p></div>
        <div className="graph-help-card"><span>02</span><strong>Polar</strong><p><code>r=2*sin(theta)</code>, <code>r=1+cos(theta)</code></p></div>
        <div className="graph-help-card"><span>03</span><strong>Parametric</strong><p><code>x=3*cos(t)</code>, <code>y=2*sin(t)</code></p></div>
        <div className="graph-help-card"><span>04</span><strong>Implicit & regions</strong><p><code>x^2+y^2=25</code>, <code>y&gt;=x^2</code></p></div>
      </section>

      <div className="graph-syntax-note">
        <strong>Input tips:</strong> Use <code>^</code> for powers, <code>pi</code> for π, <code>theta</code> for θ, and functions such as <code>sin()</code>, <code>cos()</code>, <code>tan()</code>, <code>sqrt()</code>, <code>log()</code>, <code>exp()</code> and <code>abs()</code>. Inputs are evaluated locally in your browser.
      </div>
    </div>
  );
}
