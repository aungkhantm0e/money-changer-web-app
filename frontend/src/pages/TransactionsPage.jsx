import { useEffect, useMemo, useState } from "react";
import axios from "axios";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TransactionsPage() {
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [currencies, setCurrencies]=useState([]);

  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({
    type: "SELL",
    currency_code: "USD",
    foreign_amount: "",
    rate: "",
    customer_name: "",
  });

  async function load() {
    setError("");
    try {
      const [txRes, sumRes] = await Promise.all([
        axios.get(`/api/transactions?date=${encodeURIComponent(date)}`),
        axios.get(`/api/reports/daily?date=${encodeURIComponent(date)}`),
      ]);

      if (!Array.isArray(txRes.data)) {
        throw new Error("Transactions API did not return an array. Check backend error.");
      }

      setRows(txRes.data);
      setSummary(sumRes.data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setRows([]); // prevent stale UI
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setEdit({
      type: row.type,
      currency_code: row.currency_code,
      foreign_amount: String(row.foreign_amount ?? ""),
      rate: String(row.rate ?? ""),
      customer_name: row.customer_name || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEdit({ type: "SELL", currency_code: "USD", foreign_amount: "", rate: "", customer_name: "" });
  }

  async function saveEdit(id) {
    try {
      const foreignAmount = Number(edit.foreign_amount);
      const rate = Number(edit.rate);

      if (!Number.isFinite(foreignAmount) || foreignAmount <= 0) {
        return alert("Foreign amount must be > 0");
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        return alert("Rate must be > 0");
      }
      if (!edit.currency_code) return alert("Currency code required");

      await axios.put(`/api/transactions/${id}`, {
        type: edit.type,
        currencyCode: edit.currency_code,
        foreignAmount,
        rate,
        customerName: edit.customer_name,
      });

      cancelEdit();
      await load();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function deleteTx(id) {
    const ok = confirm(`Delete transaction #${id}? This cannot be undone.`);
    if (!ok) return;

    try {
      await axios.delete(`/api/transactions/${id}`);
      await load();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    axios.get("/api/auth/me").then((res) => setMe(res.data)).catch(() => setMe(null));

    axios.get("/api/currencies")
    .then((res)=>setCurrencies(Array.isArray(res.data)? res.data:[]))
    .catch(()=>setCurrencies([]));

  }, []);

  useEffect(() => {
    if (!editingId) return;

    const cur = currencies.find((c) => c.code === edit.currency_code);
    if (!cur) return;

    const newRate = edit.type === "BUY" ? cur.buy_rate : cur.sell_rate;

    // only auto-set if rate is empty OR matches the old default style
    setEdit((p) => ({ ...p, rate: String(newRate) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [edit.currency_code, edit.type, editingId, currencies]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const totals = useMemo(() => {
    const paidOut = rows
      .filter((r) => r.type === "BUY")
      .reduce((acc, r) => acc + Number(r.mmk_amount), 0);
    const received = rows
      .filter((r) => r.type === "SELL")
      .reduce((acc, r) => acc + Number(r.mmk_amount), 0);
    return { paidOut, received };
  }, [rows]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <h3 style={{ marginTop: 0 }}>Transactions</h3>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Date:
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <button onClick={load} style={{ padding: "8px 10px", cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      {error ? <div style={{ color: "crimson", marginBottom: 8 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={card}>
          <div style={label}>Total transactions</div>
          <div style={value}>{summary?.total_transactions ?? rows.length}</div>
        </div>
        <div style={card}>
          <div style={label}>MMK Paid Out (BUY)</div>
          <div style={value}>{(summary?.total_mmk_paid_out ?? totals.paidOut).toString()}</div>
        </div>
        <div style={card}>
          <div style={label}>MMK Received (SELL)</div>
          <div style={value}>{(summary?.total_mmk_received ?? totals.received).toString()}</div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Time</th>
              <th style={th}>Type</th>
              <th style={th}>Currency</th>
              <th style={th}>Foreign</th>
              <th style={th}>Rate</th>
              <th style={th}>MMK</th>
              <th style={th}>Customer</th>
              <th style={th}>Cashier</th>
              <th style={th}>Edit</th>
              <th style={th}>Delete</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>{new Date(r.date_time).toLocaleTimeString()}</td>

                <td style={td}>
                  {editingId === r.id ? (
                    <select
                      value={edit.type}
                      onChange={(e) => setEdit((p) => ({ ...p, type: e.target.value }))}
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  ) : (
                    <b>{r.type}</b>
                  )}
                </td>

                <td style={td}>
                 {editingId === r.id ? (
                    <select
                        value={edit.currency_code}
                        onChange={(e) => setEdit((p) => ({ ...p, currency_code: e.target.value }))}
                        style={{ padding: 6 }}
                    >
                        {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                            {c.code}
                        </option>
                        ))}
                    </select>
                    ) : (
                    r.currency_code
                    )}
                </td>

                <td style={td}>
                  {editingId === r.id ? (
                    <input
                      type="number"
                      value={edit.foreign_amount}
                      onChange={(e) => setEdit((p) => ({ ...p, foreign_amount: e.target.value }))}
                      style={{ width: 110, padding: 6 }}
                    />
                  ) : (
                    r.foreign_amount
                  )}
                </td>

                <td style={td}>
                  {editingId === r.id ? (
                    <input
                      type="number"
                      value={edit.rate}
                      onChange={(e) => setEdit((p) => ({ ...p, rate: e.target.value }))}
                      style={{ width: 120, padding: 6 }}
                    />
                  ) : (
                    r.rate
                  )}
                </td>

                <td style={td}><b>{r.mmk_amount}</b></td>

                <td style={td}>
                  {editingId === r.id ? (
                    <input
                      value={edit.customer_name}
                      onChange={(e) => setEdit((p) => ({ ...p, customer_name: e.target.value }))}
                      style={{ width: 160, padding: 6 }}
                    />
                  ) : (
                    r.customer_name || "-"
                  )}
                </td>

                <td style={td}>{r.created_by || "-"}</td>

                <td style={td}>
                  {me?.role === "admin" ? (
                    editingId === r.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => saveEdit(r.id)} style={{ padding: "6px 10px" }}>
                          Save
                        </button>
                        <button onClick={cancelEdit} style={{ padding: "6px 10px" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(r)} style={{ padding: "6px 10px" }}>
                        Edit
                      </button>
                    )
                  ) : (
                    "-"
                  )}
                </td>

                <td style={td}>
                  {me?.role === "admin" ? (
                    <button onClick={() => deleteTx(r.id)} style={{ padding: "6px 10px" }}>
                      Delete
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td style={td} colSpan={10}>No transactions for this date.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card = { border: "1px solid #ddd", borderRadius: 10, padding: 12, minWidth: 220 };
const label = { fontSize: 12, opacity: 0.7 };
const value = { fontSize: 18, fontWeight: 700 };

const th = { textAlign: "left", borderBottom: "1px solid #ddd", padding: 10, whiteSpace: "nowrap" };
const td = { borderBottom: "1px solid #eee", padding: 10, whiteSpace: "nowrap" };