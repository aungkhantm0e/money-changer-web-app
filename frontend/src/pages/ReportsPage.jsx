import { useEffect, useMemo, useState } from "react";
import axios from "axios";

function currentYear() {
  return new Date().getFullYear();
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function firstDayOfThisMonthISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function ReportsPage() {
  const [year, setYear] = useState(currentYear());
  const [monthly, setMonthly] = useState([]);
  const [yearly, setYearly] = useState([]);

  const [rangeStart, setRangeStart] = useState(firstDayOfThisMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [rangeSummary, setRangeSummary] = useState(null);

  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingYearly, setLoadingYearly] = useState(false);
  const [loadingRange, setLoadingRange] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function loadYearly() {
    setError("");
    setMsg("");
    setLoadingYearly(true);
    try {
      const res = await axios.get("/api/reports/yearly");
      setYearly(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoadingYearly(false);
    }
  }

  async function loadMonthly(y) {
    setError("");
    setMsg("");
    setLoadingMonthly(true);
    try {
      const res = await axios.get(`/api/reports/monthly?year=${y}`);
      setMonthly(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoadingMonthly(false);
    }
  }

  async function loadRange() {
    setError("");
    setMsg("");
    setLoadingRange(true);
    try {
      const res = await axios.get(`/api/reports/range?start=${rangeStart}&end=${rangeEnd}`);
      setRangeSummary(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoadingRange(false);
    }
  }

  useEffect(() => {
    loadYearly();
    loadMonthly(year);
    loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMonthly(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const monthlyTotals = useMemo(() => {
    const totalTx = monthly.reduce((a, r) => a + Number(r.total_transactions || 0), 0);
    const paidOut = monthly.reduce((a, r) => a + Number(r.total_mmk_paid_out || 0), 0);
    const received = monthly.reduce((a, r) => a + Number(r.total_mmk_received || 0), 0);
    return { totalTx, paidOut, received };
  }, [monthly]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h3 style={{ marginTop: 0 }}>Reports</h3>

      {error ? <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div> : null}
      {msg ? <div style={{ color: "green", marginBottom: 10 }}>{msg}</div> : null}

      {/* Range summary */}
      <section style={section}>
        <h4 style={{ marginTop: 0 }}>Date Range Summary</h4>

        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <label style={lbl}>
            Start
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </label>

          <label style={lbl}>
            End
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </label>

          <button onClick={loadRange} style={btn}>
            {loadingRange ? "Loading…" : "Run"}
          </button>
        </div>

        {rangeSummary ? (
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <div style={card}>
              <div style={small}>Transactions</div>
              <div style={big}>{rangeSummary.total_transactions}</div>
            </div>
            <div style={card}>
              <div style={small}>MMK Paid Out (BUY)</div>
              <div style={big}>{rangeSummary.total_mmk_paid_out}</div>
            </div>
            <div style={card}>
              <div style={small}>MMK Received (SELL)</div>
              <div style={big}>{rangeSummary.total_mmk_received}</div>
            </div>
            <div style={card}>
                <div style={small}>Profit / Loss (Opening - Closing)</div>
                <div
                    style={{
                    ...big,
                    color: Number(rangeSummary.profit_loss_mmk) < 0 ? "crimson" : "green",
                    }}
                >
                    {rangeSummary.profit_loss_mmk}
                </div>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, opacity: 0.7 }}>
            {loadingRange ? "Loading…" : "Run a range to see totals."}
          </div>
        )}
      </section>

      {/* Monthly */}
      <section style={section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h4 style={{ marginTop: 0 }}>Monthly Report</h4>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Year:
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 100 }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={card}>
            <div style={small}>Year Transactions</div>
            <div style={big}>{monthlyTotals.totalTx}</div>
          </div>
          <div style={card}>
            <div style={small}>Year MMK Paid Out</div>
            <div style={big}>{monthlyTotals.paidOut.toFixed(2)}</div>
          </div>
          <div style={card}>
            <div style={small}>Year MMK Received</div>
            <div style={big}>{monthlyTotals.received.toFixed(2)}</div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Month</th>
                <th style={th}>Transactions</th>
                <th style={th}>MMK Paid Out (BUY)</th>
                <th style={th}>MMK Received (SELL)</th>
                <th style={th}>Profit/Loss</th>
              </tr>
            </thead>
            <tbody>
              {loadingMonthly ? (
                <tr>
                  <td style={td} colSpan={4}>Loading…</td>
                </tr>
              ) : monthly.length === 0 ? (
                <tr>
                  <td style={td} colSpan={4}>No data for {year}.</td>
                </tr>
              ) : (
                monthly.map((r) => (
                  <tr key={r.month}>
                    <td style={td}><b>{r.month}</b></td>
                    <td style={td}>{r.total_transactions}</td>
                    <td style={td}>{r.total_mmk_paid_out}</td>
                    <td style={td}>{r.total_mmk_received}</td>
                    <td style={{ ...td, color: Number(r.profit_loss_mmk) < 0 ? "crimson" : "green", fontWeight: 700 }}> 
                        {r.profit_loss_mmk}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Yearly */}
      <section style={section}>
        <h4 style={{ marginTop: 0 }}>Yearly Report</h4>

        <button onClick={loadYearly} style={btn}>
          {loadingYearly ? "Loading…" : "Refresh"}
        </button>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Year</th>
                <th style={th}>Transactions</th>
                <th style={th}>MMK Paid Out (BUY)</th>
                <th style={th}>MMK Received (SELL)</th>
                <th style={th}>Profit/Loss</th>
              </tr>
            </thead>
            <tbody>
              {loadingYearly ? (
                <tr>
                  <td style={td} colSpan={4}>Loading…</td>
                </tr>
              ) : yearly.length === 0 ? (
                <tr>
                  <td style={td} colSpan={4}>No yearly data yet.</td>
                </tr>
              ) : (
                yearly.map((r) => (
                  <tr key={r.year}>
                    <td style={td}><b>{r.year}</b></td>
                    <td style={td}>{r.total_transactions}</td>
                    <td style={td}>{r.total_mmk_paid_out}</td>
                    <td style={td}>{r.total_mmk_received}</td>
                    <td style={{ ...td, color: Number(r.profit_loss_mmk) < 0 ? "crimson" : "green", fontWeight: 700 }}>
                        {r.profit_loss_mmk}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const section = { border: "1px solid #ddd", borderRadius: 12, padding: 14, marginBottom: 14 };
const lbl = { display: "grid", gap: 6 };
const btn = { padding: "10px 12px", cursor: "pointer" };
const card = { border: "1px solid #eee", borderRadius: 10, padding: 12, minWidth: 220 };
const small = { fontSize: 12, opacity: 0.7 };
const big = { fontSize: 18, fontWeight: 700 };

const th = { textAlign: "left", borderBottom: "1px solid #ddd", padding: 10, whiteSpace: "nowrap" };
const td = { borderBottom: "1px solid #eee", padding: 10, whiteSpace: "nowrap" };