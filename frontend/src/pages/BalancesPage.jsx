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

  // Active currencies (for showing ALL cards)
  const [currencies, setCurrencies] = useState([]);

  // FX errors + per-currency inputs
  const [fxError, setFxError] = useState("");
  const [fxOpeningInputs, setFxOpeningInputs] = useState({});
  const [fxClosingInputs, setFxClosingInputs] = useState({});

  async function load() {
    setError("");
    setFxError("");
    setLoading(true);

    try {
      const res = await axios.get(`/api/balances?date=${encodeURIComponent(date)}`);
      setData(res.data);

      // prefill MMK inputs if values exist
      setOpeningInput(res.data.openingBalanceMMK ?? "");
      setClosingInput(res.data.closingBalanceMMK ?? "");

      // prefill FX inputs from API rows
      const list = res.data?.fxBalances ?? [];
      const openMap = {};
      const closeMap = {};
      for (const fx of list) {
        openMap[fx.currency] = fx.openingAmount ?? 0;
        closeMap[fx.currency] = fx.closingAmount ?? 0;
      }

      setFxOpeningInputs(openMap);
      setFxClosingInputs(closeMap);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  // auth/me
  useEffect(() => {
    axios.get("/api/auth/me").then((res) => setMe(res.data)).catch(() => setMe(null));
  }, []);

  // currencies list (active only)
  useEffect(() => {
    axios
      .get("/api/currencies")
      .then((res) => {
        const active = (res.data || []).filter((c) => c.is_active);
        setCurrencies(active);
      })
      .catch(() => setCurrencies([]));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const isAdmin = me?.role === "admin";

  // Profit/Loss = Actual Closing - Opening (MMK)
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

  // ===== FX card actions =====

  async function saveFxOpening(currency) {
    setFxError("");
    const raw = fxOpeningInputs[currency] ?? 0;
    const amount = Number(raw);

    if (!Number.isFinite(amount) || amount < 0) {
      return setFxError("Opening must be a number >= 0");
    }

    try {
      await axios.post("/api/balances/open-fx", { date, currency, openingAmount: amount });
      await load();
    } catch (e) {
      setFxError(e?.response?.data?.error || e.message);
    }
  }

  async function saveFxClosing(currency) {
    setFxError("");
    const raw = fxClosingInputs[currency] ?? 0;
    const amount = Number(raw);

    if (!Number.isFinite(amount) || amount < 0) {
      return setFxError("Closing must be a number >= 0");
    }

    try {
      await axios.post("/api/balances/close-fx", { date, currency, closingAmount: amount });
      await load();
    } catch (e) {
      setFxError(e?.response?.data?.error || e.message);
    }
  }

  // ===== Build cards for ALL currencies =====
  const fxBalances = data?.fxBalances ?? [];

  const fxCards = currencies.map((c) => {
    const existing = fxBalances.find((x) => x.currency === c.code);

    const openingAmount = existing?.openingAmount ?? 0;
    const closingAmount = existing?.closingAmount ?? 0;
    const foreignIn = existing?.foreignIn ?? 0;
    const foreignOut = existing?.foreignOut ?? 0;
    const netForeign = existing?.netForeign ?? Number((foreignIn - foreignOut).toFixed(2));
    const suggestedClosingAmount =
      existing?.suggestedClosingAmount ?? Number((openingAmount + netForeign).toFixed(2));
    const diffAmount =
      existing?.diffAmount ?? Number((closingAmount - suggestedClosingAmount).toFixed(2));

    return {
      currency: c.code,
      name: c.name,
      openingAmount,
      closingAmount,
      foreignIn,
      foreignOut,
      netForeign,
      suggestedClosingAmount,
      diffAmount,
    };
  });

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
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "red", color: "white" }}>
            <b>CLOSED</b>
          </span>
        ) : (
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "#00fd1eff", color: "black" }}>
            <b>OPEN</b>
          </span>
        )}
      </div>

      {error ? <div style={{ color: "crimson", marginBottom: 10 }}>{error}</div> : null}
      {loading ? <div>Loading…</div> : null}

      {data ? (
        <>
          {/* FX Cards - ALL currencies */}
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ marginTop: 0 }}>FX Balances</h4>
            {fxError ? <div style={{ color: "crimson", marginBottom: 10 }}>{fxError}</div> : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {fxCards.map((fx) => (
                <div key={fx.currency} style={{ ...card, minWidth: 300 }}>
                  <div style={small}>
                    {fx.currency} — {fx.name}
                  </div>

                  {/* Opening / Closing inputs */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <label style={{ ...lbl, width: 130 }}>
                      Opening
                      <input
                        type="number"
                        value={fxOpeningInputs[fx.currency] ?? fx.openingAmount}
                        onChange={(e) =>
                          setFxOpeningInputs((p) => ({ ...p, [fx.currency]: e.target.value }))
                        }
                        style={{ ...inp, width: 130 }}
                        disabled={!isAdmin || !!data.isClosed}
                      />
                    </label>

                    <label style={{ ...lbl, width: 130 }}>
                      Closing
                      <input
                        type="number"
                        value={fxClosingInputs[fx.currency] ?? fx.closingAmount}
                        onChange={(e) =>
                          setFxClosingInputs((p) => ({ ...p, [fx.currency]: e.target.value }))
                        }
                        style={{ ...inp, width: 130 }}
                        disabled={!isAdmin || !!data.isClosed}
                      />
                    </label>
                  </div>

                  {/* Buttons */}
                  {isAdmin ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={() => saveFxOpening(fx.currency)} style={btn} disabled={!!data.isClosed}>
                        Save Opening
                      </button>
                      <button onClick={() => saveFxClosing(fx.currency)} style={btn} disabled={!!data.isClosed}>
                        Save Closing
                      </button>
                    </div>
                  ) : null}

                  {/* Totals */}
                  <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10 }}>
                    <div style={small}>
                      In (BUY): <b>{fx.foreignIn}</b>
                    </div>
                    <div style={small}>
                      Out (SELL): <b>{fx.foreignOut}</b>
                    </div>
                    <div style={small}>
                      Suggested Closing: <b>{fx.suggestedClosingAmount}</b>
                    </div>
                    <div style={small}>
                      Difference:{" "}
                      <b style={{ color: fx.diffAmount < 0 ? "crimson" : fx.diffAmount > 0 ? "green" : "inherit" }}>
                        {fx.diffAmount}
                      </b>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>green = over, red = short</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MMK cards */}
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
              <div style={{ fontSize: 12, opacity: 0.7 }}>green = profit, red = loss</div>
            </div>
          </div>

          {/* Admin actions (MMK only now) */}
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