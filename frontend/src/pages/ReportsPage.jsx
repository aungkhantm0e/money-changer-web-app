// ReportsPage.jsx (copy-paste ready)
// ✅ TRUE line chart (SVG) starting from x=0 (no “couple inches” gap)
// ✅ Zero baseline included
// ✅ Hover shows the nearest month ONLY when inside the chart

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

function currentYear() {
  return new Date().getFullYear();
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? "—");
  return num.toLocaleString("en-US");
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function ReportsPage() {
  const [year, setYear] = useState(currentYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  async function load(y = year) {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`/api/reports/monthly?year=${encodeURIComponent(y)}`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Normalize to 12 months
  const chartData = useMemo(() => {
    const map = new Map(rows.map((r) => [String(r.month), r]));
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, "0");
      const key = `${year}-${mm}`;
      const r = map.get(key);
      const pl = r ? Number(r.profit_loss_mmk ?? 0) : 0;
      out.push({
        monthKey: key,
        label: mm,
        profitLoss: Number.isFinite(pl) ? pl : 0,
        totalTx: r ? Number(r.total_transactions ?? 0) : 0,
        received: r ? Number(r.total_mmk_received ?? 0) : 0,
        paidOut: r ? Number(r.total_mmk_paid_out ?? 0) : 0,
      });
    }
    return out;
  }, [rows, year]);

  const totalPL = useMemo(() => {
    const s = chartData.reduce((a, d) => a + Number(d.profitLoss || 0), 0);
    return Number(s.toFixed(2));
  }, [chartData]);

  const totals = useMemo(() => {
    const tx = chartData.reduce((a, d) => a + Number(d.totalTx || 0), 0);
    const received = chartData.reduce((a, d) => a + Number(d.received || 0), 0);
    const paidOut = chartData.reduce((a, d) => a + Number(d.paidOut || 0), 0);
    return { tx, received, paidOut };
  }, [chartData]);

  // --- SVG chart layout (NO left padding for plot area) ---
  const chart = useMemo(() => {
    const W = 920;
    const H = 320;

    // No left/right padding for the plot itself
    // Keep only top/bottom padding for labels
    const padT = 16;
    const padB = 44;

    const innerW = W; // full width
    const innerH = H - padT - padB;

    const ys = chartData.map((d) => d.profitLoss);
    const maxVal = Math.max(...ys, 0);
    const minVal = Math.min(...ys, 0);
    const span = Math.max(maxVal - minVal, 1);

    const yMin = minVal - span * 0.12;
    const yMax = maxVal + span * 0.12;

    const xStep = innerW / (12 - 1);

    const xAt = (i) => i * xStep; // ✅ starts from 0
    const yAt = (v) => {
      const t = (v - yMin) / (yMax - yMin);
      return padT + (1 - t) * innerH;
    };

    const y0 = yAt(0);

    const pts = chartData.map((d, i) => ({ x: xAt(i), y: yAt(d.profitLoss), d }));

    const pathD = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");

    const gridTicks = 5;
    const grid = [];
    for (let i = 0; i <= gridTicks; i++) {
      const t = i / gridTicks;
      const v = yMax - t * (yMax - yMin);
      const y = yAt(v);
      grid.push({ v, y });
    }

    return {
      W,
      H,
      padT,
      padB,
      innerW,
      innerH,
      xStep,
      xAt,
      yAt,
      y0,
      pts,
      pathD,
      grid,
      yMin,
      yMax,
    };
  }, [chartData]);

  function setHoverFromEvent(clientX, clientY) {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const rect = svgEl.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    // Convert to viewBox coords
    const scaleX = rect.width / chart.W;
    const scaleY = rect.height / chart.H;
    const x = mx / scaleX;
    const y = my / scaleY;

    // Only hover inside plot area (x: 0..W, y: padT..H-padB)
    const inPlot = x >= 0 && x <= chart.W && y >= chart.padT && y <= chart.H - chart.padB;
    if (!inPlot) {
      setHoverIdx(null);
      return;
    }

    const idx = clamp(Math.round(x / chart.xStep), 0, 11);
    setHoverIdx(idx);
  }

  function onMouseMove(e) {
    setHoverFromEvent(e.clientX, e.clientY);
  }

  function onTouchMove(e) {
    const t = e.touches?.[0];
    if (!t) return;
    setHoverFromEvent(t.clientX, t.clientY);
  }

  function onLeave() {
    setHoverIdx(null);
  }

  const hovered = hoverIdx == null ? null : chart.pts[hoverIdx];

  return (
    <div className="rp-page">
      {/* Header */}
      <div className="rp-header">
        <div>
          <h1 className="rp-title">Profit / Loss Chart</h1>
          <div className="rp-subtitle">Monthly profit/loss (MMK) for a selected year</div>
        </div>

        <div className="rp-controls">
          <label className="tx-date">
            <span>Year</span>
            <input
              className="tx-input"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 120 }}
            />
          </label>

          <button
            className="tx-btn tx-btn--ghost"
            type="button"
            onClick={() => load(year)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Couldn’t load report</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {/* KPI row */}
      <div className="rp-kpis rp-kpis--3">
        <div className="rp-kpi mc-card">
          <div className="rp-kpi__label">Year transactions</div>
          <div className="rp-kpi__value">{formatNumber(totals.tx)}</div>
        </div>

        <div className="rp-kpi mc-card">
          <div className="rp-kpi__label">Year MMK received</div>
          <div className="rp-kpi__value rp-kpi__value--sell">{formatNumber(totals.received)}</div>
        </div>

        <div className="rp-kpi mc-card">
          <div className="rp-kpi__label">Year MMK paid out</div>
          <div className="rp-kpi__value rp-kpi__value--buy">{formatNumber(totals.paidOut)}</div>
        </div>

        <div className="rp-kpi mc-card">
          <div className="rp-kpi__label">Total Profit / Loss</div>
          <div className={"rp-kpi__value " + (totalPL < 0 ? "rp-kpi__value--neg" : "rp-kpi__value--pos")}>
            {formatNumber(totalPL)}
          </div>
        </div>
      </div>

      {/* Chart */}
      <section className="mc-card rp-card">
        <div className="rp-card-head">
          <div>
            <div className="rp-card-title">{year} Profit / Loss (MMK)</div>
            <div className="rp-card-meta">Line starts from the real left edge (0). Hover inside the chart.</div>
          </div>
        </div>

        {loading ? (
          <div className="rp-empty">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="rp-empty">No data.</div>
        ) : (
          <div style={{ padding: 14 }}>
            <div className="mc-card" style={{ padding: 12, position: "relative", overflow: "hidden" }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${chart.W} ${chart.H}`}
                width="100%"
                height="320"
                style={{ display: "block" }}
                onMouseMove={onMouseMove}
                onMouseLeave={onLeave}
                onTouchMove={onTouchMove}
                onTouchEnd={onLeave}
              >
                {/* grid lines */}
                {chart.grid.map((g, i) => (
                  <line
                    key={i}
                    x1={0}
                    x2={chart.W}
                    y1={g.y}
                    y2={g.y}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="1"
                  />
                ))}

                {/* zero baseline */}
                <line
                  x1={0}
                  x2={chart.W}
                  y1={chart.y0}
                  y2={chart.y0}
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="1.6"
                />

                {/* x labels */}
                {chartData.map((d, i) => (
                  <text
                    key={d.monthKey}
                    x={chart.xAt(i)}
                    y={chart.H - 16}
                    textAnchor="middle"
                    fontSize="12"
                    fill="rgba(255,255,255,0.75)"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                  >
                    {d.label}
                  </text>
                ))}

                {/* main line */}
                <path
                  d={chart.pathD}
                  fill="none"
                  stroke="rgba(235,235,255,0.92)"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* points */}
                {chart.pts.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r="4.2"
                    fill={p.d.profitLoss < 0 ? "rgba(255,80,80,0.95)" : "rgba(80,220,140,0.95)"}
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth="1"
                  />
                ))}

                {/* hover crosshair */}
                {hovered ? (
                  <g>
                    <line
                      x1={hovered.x}
                      x2={hovered.x}
                      y1={chart.padT}
                      y2={chart.H - chart.padB}
                      stroke="rgba(255,255,255,0.20)"
                      strokeWidth="1"
                    />
                    <circle
                      cx={hovered.x}
                      cy={hovered.y}
                      r="7"
                      fill="rgba(255,255,255,0.12)"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="1"
                    />
                  </g>
                ) : null}
              </svg>

              {/* Tooltip */}
              {hovered ? (
                <div
                  className="mc-card"
                  style={{
                    position: "absolute",
                    left: clamp((hovered.x / chart.W) * 100, 2, 78) + "%",
                    top: 14,
                    transform: "translateX(-10%)",
                    padding: 10,
                    width: 220,
                    pointerEvents: "none",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
                  }}
                >
                  <div className="mono" style={{ opacity: 0.85, fontSize: 12 }}>
                    {hovered.d.monthKey}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>
                    <b>P/L:</b>{" "}
                    <span
                      className="mono"
                      style={{
                        color: hovered.d.profitLoss < 0 ? "rgba(255,80,80,0.95)" : "rgba(80,220,140,0.95)",
                      }}
                    >
                      {formatNumber(hovered.d.profitLoss)}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>
                    <div>
                      <b>Tx:</b> <span className="mono">{formatNumber(hovered.d.totalTx)}</span>
                    </div>
                    <div>
                      <b>Received:</b> <span className="mono">{formatNumber(hovered.d.received)}</span>
                    </div>
                    <div>
                      <b>Paid out:</b> <span className="mono">{formatNumber(hovered.d.paidOut)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* legend */}
            <div style={{ display: "flex", gap: 12, marginTop: 10, opacity: 0.9, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: "rgba(80,220,140,0.85)" }} />
                <span>Profit</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 4, background: "rgba(255,80,80,0.85)" }} />
                <span>Loss</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}