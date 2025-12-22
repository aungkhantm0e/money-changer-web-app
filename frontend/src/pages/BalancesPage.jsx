import { useEffect, useMemo, useState } from "react";
import axios from "axios";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function BalancesPage() {
  const [date, setDate] = useState(todayISO());
  const [me, setMe] = useState(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [openingInput, setOpeningInput] = useState("");
  const [closingInput, setClosingInput] = useState("");

  async function load() {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`/api/balances?date=${encodeURIComponent(date)}`);
      setData(res.data);

      // prefill inputs if values exist
      setOpeningInput(res.data.openingBalanceMMK ?? "");
      setClosingInput(res.data.closingBalanceMMK ?? "");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    axios.get("/api/auth/me").then((res) => setMe(res.data)).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const isAdmin = me?.role === "admin";

  // Profit/Loss = Actual Closing - Opening (green profit, red loss)
  const profitLoss = useMemo(() => {
    if (!data) return null;
    const opening = data.openingBalanceMMK === null ? null : Number(data.openingBalanceMMK);
    const closing = data.closingBalanceMMK === null ? null : Number(data.closingBalanceMMK);
    if (opening === null || closing === null) return null;
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return null;
    return Number((closing - opening).toFixed(2));
  }, [data]);

  async function setOpening() {
    setError("");
    const opening = Number(openingInput);
    if (!Number.isFinite(opening)) return setError("Opening must be a number");

    try {
      await axios.post("/api/balances/open", { date, openingBalanceMMK: opening });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  async function closeDay() {
    setError("");

    if (!data) return setError("No balance data loaded");
    if (data.openingBalanceMMK === null) return setError("Set opening balance first.");

    // If closingInput is empty, use suggested closing automatically
    const useSuggested = String(closingInput).trim() === "";
    const closingValue = useSuggested ? Number(data.suggestedClosingMMK) : Number(closingInput);

    if (!Number.isFinite(closingValue)) {
      return setError(useSuggested ? "Suggested closing is not available." : "Closing must be a number");
    }

    try {
      await axios.post("/api/balances/close", { date, closingBalanceMMK: closingValue });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  async function reopenDay() {
    setError("");
    try {
      await axios.post("/api/balances/reopen", { date });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h3 style={{ marginTop: 0 }}>Balances</h3>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Date:
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <button onClick={load} style={{ padding: "8px 10px", cursor: "pointer" }}>
          Refresh
        </button>

        {data?.isClosed ? (
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "red",color:"white" }}>
            <b>CLOSED</b>
          </span>
        ) : (
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "#00fd1eff", color:"black" }}>
            <b>OPEN</b>
          </span>
        )}
      </div>

      {error ? <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div> : null}
      {loading ? <div>Loading…</div> : null}

      {data ? (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={card}>
              <div style={small}>Opening Balance (MMK)</div>
              <div style={big}>{data.openingBalanceMMK ?? "-"}</div>
            </div>

            <div style={card}>
              <div style={small}>MMK Received (SELL)</div>
              <div style={big}>{data.totals.totalMMKReceived}</div>
            </div>

            <div style={card}>
              <div style={small}>MMK Paid Out (BUY)</div>
              <div style={big}>{data.totals.totalMMKPaidOut}</div>
            </div>

            <div style={card}>
              <div style={small}>Suggested Closing (MMK)</div>
              <div style={big}>{data.suggestedClosingMMK ?? "-"}</div>
            </div>

            <div style={card}>
              <div style={small}>Actual Closing (MMK)</div>
              <div style={big}>{data.closingBalanceMMK ?? "-"}</div>
            </div>

            <div style={card}>
              <div style={small}>Profit / Loss (Closing − Opening)</div>
              <div style={{ ...big, color: profitLoss === null ? "inherit" : profitLoss < 0 ? "crimson" : "green" }}>
                {profitLoss === null ? "-" : profitLoss}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                green = profit, red = loss
              </div>
            </div>
          </div>

          {/* Admin actions */}
          {isAdmin ? (
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
              <h4 style={{ marginTop: 0 }}>Admin Actions</h4>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
                <label style={lbl}>
                  Set opening (MMK)
                  <input
                    type="number"
                    value={openingInput}
                    onChange={(e) => setOpeningInput(e.target.value)}
                    style={inp}
                  />
                </label>

                <button onClick={setOpening} style={btn}>
                  Save Opening
                </button>

                <div style={{ width: 16 }} />

                <label style={lbl}>
                  Close day (MMK)
                  <input
                    type="number"
                    value={closingInput}
                    onChange={(e) => setClosingInput(e.target.value)}
                    style={inp}
                  />
                </label>

                <button onClick={closeDay} style={btn} disabled={!!data.isClosed}>
                  Close Day
                </button>

                <button onClick={reopenDay} style={btn} disabled={!data.isClosed}>
                  Re-open Day
                </button>
              </div>
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>Only admin can set opening/closing balances.</div>
          )}
        </>
      ) : null}
    </div>
  );
}

const card = { border: "1px solid #ddd", borderRadius: 10, padding: 12, minWidth: 220 };
const small = { fontSize: 12, opacity: 0.7 };
const big = { fontSize: 18, fontWeight: 700 };
const lbl = { display: "grid", gap: 6 };
const inp = { padding: 8, width: 260 };
const btn = { padding: "10px 12px", cursor: "pointer" };