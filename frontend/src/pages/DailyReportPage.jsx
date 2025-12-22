import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function DailyReportPage() {
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get("date") || todayISO());
  const [bal, setBal] = useState(null);
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const autoPrint = params.get("print") === "1";

  async function load() {
    setError("");
    try {
      const [meRes, balRes, txRes] = await Promise.all([
        axios.get("/api/auth/me"),
        axios.get(`/api/balances?date=${encodeURIComponent(date)}`),
        axios.get(`/api/transactions?date=${encodeURIComponent(date)}`),
      ]);
      setMe(meRes.data);
      setBal(balRes.data);
      setRows(Array.isArray(txRes.data) ? txRes.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setBal(null);
      setRows([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Auto print when loaded
  useEffect(() => {
    if (!autoPrint) return;
    if (!bal) return;
    // small delay so DOM finishes rendering
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, bal, rows.length]);

  const profitLoss = useMemo(() => {
    if (!bal) return null;
    const opening = bal.openingBalanceMMK == null ? null : Number(bal.openingBalanceMMK);
    const closing = bal.closingBalanceMMK == null ? null : Number(bal.closingBalanceMMK);
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return null;
    return Number((closing - opening).toFixed(2)); // ✅ profit positive, loss negative
  }, [bal]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Daily Report</h3>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Date:
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <button onClick={load} style={btn}>Refresh</button>
        <button onClick={() => window.print()} style={btn}>Print</button>
      </div>

      {error ? <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div> : null}

      {bal ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Money Changer Daily Report</div>
              <div style={{ opacity: 0.8 }}>Date: <b>{date}</b></div>
              <div style={{ opacity: 0.8 }}>Printed by: <b>{me?.fullName || me?.username || "-"}</b></div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ opacity: 0.8 }}>Status</div>
              <div style={{ fontWeight: 800, color: bal.isClosed ? "crimson" : "green" }}>
                {bal.isClosed ? "CLOSED" : "OPEN"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Box title="Opening (MMK)" value={bal.openingBalanceMMK ?? "-"} />
            <Box title="Received (SELL) (MMK)" value={bal.totals.totalMMKReceived} />
            <Box title="Paid Out (BUY) (MMK)" value={bal.totals.totalMMKPaidOut} />
            <Box title="Suggested Closing (MMK)" value={bal.suggestedClosingMMK ?? "-"} />
            <Box title="Closing (MMK)" value={bal.closingBalanceMMK ?? "-"} />
            <Box
              title="Profit / Loss (Closing - Opening)"
              value={profitLoss == null ? "-" : profitLoss}
              valueStyle={{
                color: profitLoss == null ? "inherit" : profitLoss < 0 ? "crimson" : "green",
              }}
            />
          </div>

          <h4 style={{ margin: "12px 0 8px" }}>Transactions</h4>

          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Foreign</th>
                <th>Rate</th>
                <th>MMK</th>
                <th>Customer</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={{ opacity: 0.7 }}>No transactions for this date.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.date_time).toLocaleTimeString()}</td>
                    <td><b>{r.type}</b></td>
                    <td>{r.currency_code}</td>
                    <td>{r.foreign_amount}</td>
                    <td>{r.rate}</td>
                    <td><b>{r.mmk_amount}</b></td>
                    <td>{r.customer_name || "-"}</td>
                    <td>{r.created_by || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", opacity: 0.8 }}>
            <div>Signature (Admin): ____________________</div>
            <div>Signature (Cashier): ____________________</div>
          </div>
        </>
      ) : null}
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