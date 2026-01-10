import { useEffect, useState } from "react";
import axios from "axios";

export default function RatesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [deletingCode, setDeletingCode] = useState("");

  // New currency form
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newBuy, setNewBuy] = useState("");
  const [newSell, setNewSell] = useState("");

  async function load() {
    setError("");
    setMsg("");
    setLoading(true);
    try {
      const res = await axios.get("/api/currencies");
      // add local editable fields
      setRows(
        res.data.map((r) => ({
          ...r,
          _buy: String(r.buy_rate),
          _sell: String(r.sell_rate),
          _active: !!r.is_active,
          _dirty: false,
        }))
      );
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateRow(code, patch) {
    setRows((prev) =>
      prev.map((r) => (r.code === code ? { ...r, ...patch, _dirty: true } : r))
    );
  }

  async function saveRow(code) {
    setError("");
    setMsg("");
    const row = rows.find((r) => r.code === code);
    if (!row) return;

    const buy = Number(row._buy);
    const sell = Number(row._sell);
    if (!Number.isFinite(buy) || buy <= 0) return setError("Buy rate must be > 0");
    if (!Number.isFinite(sell) || sell <= 0) return setError("Sell rate must be > 0");

    setSavingCode(code);
    try {
      await axios.put(`/api/admin/currencies/${code}`, {
        buy_rate: buy,
        sell_rate: sell,
        is_active: row._active,
      });
      setMsg(`Saved ${code}`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSavingCode("");
    }
  }

  async function deleteRow(code) {
  setError("");
  setMsg("");

  const ok = window.confirm(`Delete currency ${code}? This cannot be undone.`);
  if (!ok) return;

  setDeletingCode(code);
  try {
    await axios.delete(`/api/admin/currencies/${code}`);
    setMsg(`Deleted ${code}`);
    await load();
  } catch (e) {
    setError(e?.response?.data?.error || e.message);
  } finally {
    setDeletingCode("");
  }
}

  async function createCurrency(e) {
    e.preventDefault();
    setError("");
    setMsg("");

    const code = newCode.trim().toUpperCase();
    const name = newName.trim();
    const buy = Number(newBuy);
    const sell = Number(newSell);

    if (!code) return setError("Currency code is required (e.g. USD)");
    if (!name) return setError("Currency name is required");
    if (!Number.isFinite(buy) || buy <= 0) return setError("Buy rate must be > 0");
    if (!Number.isFinite(sell) || sell <= 0) return setError("Sell rate must be > 0");

    try {
      await axios.post("/api/admin/currencies", {
        code,
        name,
        buy_rate: buy,
        sell_rate: sell,
        is_active: true,
      });
      setMsg(`Created ${code}`);
      setNewCode("");
      setNewName("");
      setNewBuy("");
      setNewSell("");
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.error || e2.message);
    }
  }

  if (loading) return <div>Loading rates…</div>;

  return (
    <div style={{ maxWidth: 900 }}>
      <h3 style={{ marginTop: 0 }}>Rates (Admin)</h3>

      <form
        onSubmit={createCurrency}
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr 140px 140px 140px",
          gap: 8,
          alignItems: "end",
          marginBottom: 16,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          Code
          <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="USD" />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Name
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="US Dollar"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Buy rate
          <input value={newBuy} onChange={(e) => setNewBuy(e.target.value)} placeholder="3300" />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Sell rate
          <input value={newSell} onChange={(e) => setNewSell(e.target.value)} placeholder="3350" />
        </label>

        <button type="submit" style={{ padding: 10, cursor: "pointer" }}>
          Add Currency
        </button>
      </form>

      {error ? <div style={{ color: "crimson", marginBottom: 8 }}>{error}</div> : null}
      {msg ? <div style={{ color: "green", marginBottom: 8 }}>{msg}</div> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Code</th>
              <th style={th}>Name</th>
              <th style={th}>Buy</th>
              <th style={th}>Sell</th>
              <th style={th}>Active</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td style={td}><b>{r.code}</b></td>
                <td style={td}>{r.name}</td>

                <td style={td}>
                  <input
                    style={inp}
                    value={r._buy}
                    onChange={(e) => updateRow(r.code, { _buy: e.target.value })}
                  />
                </td>

                <td style={td}>
                  <input
                    style={inp}
                    value={r._sell}
                    onChange={(e) => updateRow(r.code, { _sell: e.target.value })}
                  />
                </td>

                <td style={td}>
                  <input
                    type="checkbox"
                    checked={r._active}
                    onChange={(e) => updateRow(r.code, { _active: e.target.checked })}
                  />
                </td>
                
                <td style={td}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => saveRow(r.code)}
                      disabled={!r._dirty || savingCode === r.code}
                      style={{ padding: "8px 10px", cursor: "pointer" }}
                    >
                      {savingCode === r.code ? "Saving…" : "Save"}
                    </button>

                    <button
                      onClick={() => deleteRow(r.code)}
                      disabled={deletingCode === r.code}
                      style={{
                        padding: "8px 10px",
                        cursor: "pointer",
                        background: "#ff0707ff"
                      }}
                    >
                      {deletingCode === r.code ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  padding: 10,
  whiteSpace: "nowrap",
};
const td = { borderBottom: "1px solid #eee", padding: 10, whiteSpace: "nowrap" };
const inp = { padding: 8, width: 120 };