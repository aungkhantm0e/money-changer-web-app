import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

export default function YearlyReportPage() {
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const res = await axios.get("/api/reports/yearly");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, rows.length]);

  const totals = useMemo(() => {
    const tx = rows.reduce((a, r) => a + Number(r.total_transactions || 0), 0);
    const paid = rows.reduce((a, r) => a + Number(r.total_mmk_paid_out || 0), 0);
    const rec = rows.reduce((a, r) => a + Number(r.total_mmk_received || 0), 0);
    const pl = rows.reduce((a, r) => a + Number(r.profit_loss_mmk || 0), 0);
    return { tx, paid, rec, pl };
  }, [rows]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { margin: 0; } }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Yearly Report</h3>
        <button onClick={load} style={btn}>Refresh</button>
        <button onClick={() => window.print()} style={btn}>Print</button>
      </div>

      {error ? <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div> : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Money Changer Yearly Report</div>
          <div style={{ opacity: 0.8 }}>Years shown: <b>{rows.length}</b></div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ opacity: 0.8 }}>Profit / Loss (Closing - Opening)</div>
          <div style={{ fontWeight: 800, color: totals.pl < 0 ? "crimson" : "green" }}>
            {totals.pl}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Box title="Transactions" value={totals.tx} />
        <Box title="MMK Paid Out (BUY)" value={totals.paid} />
        <Box title="MMK Received (SELL)" value={totals.rec} />
        <Box
          title="Profit / Loss"
          value={totals.pl}
          valueStyle={{ color: totals.pl < 0 ? "crimson" : "green" }}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Transactions</th>
            <th>MMK Paid Out (BUY)</th>
            <th>MMK Received (SELL)</th>
            <th>Profit / Loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ opacity: 0.7 }}>No yearly data yet.</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.year}>
                <td><b>{r.year}</b></td>
                <td>{r.total_transactions}</td>
                <td>{r.total_mmk_paid_out}</td>
                <td>{r.total_mmk_received}</td>
                <td style={{ fontWeight: 800, color: Number(r.profit_loss_mmk) < 0 ? "crimson" : "green" }}>
                  {r.profit_loss_mmk}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", opacity: 0.8 }}>
        <div>Signature (Admin): ____________________</div>
        <div>Date: ____________________</div>
      </div>
    </div>
  );
}

function Box({ title, value, valueStyle }) {
  return (
    <div style={box}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, ...valueStyle }}>{value}</div>
    </div>
  );
}

const btn = { padding: "8px 10px", cursor: "pointer" };
const box = { border: "1px solid #ddd", borderRadius: 10, padding: 12, minWidth: 220 };