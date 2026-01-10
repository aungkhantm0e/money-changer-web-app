import { useEffect, useMemo, useState } from "react";
import axios from "axios";

export default function NewTransactionPage() {
  const [currencies, setCurrencies] = useState([]);
  const [type, setType] = useState("SELL");
  const [currencyCode, setCurrencyCode] = useState("");
  const [foreignAmount, setForeignAmount] = useState("");
  const [customerName, setCustomerName] = useState("Walk-in");

  const [txDateTime, setTxDateTime] = useState(""); // OPTIONAL datetime-local

  const [dayClosed, setDayClosed] = useState(false);
  const [bizDate, setBizDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // saved transaction info
  const [savedTxId, setSavedTxId] = useState(null);
  const [savedAtISO, setSavedAtISO] = useState(null); // ISO string for printing

  // Initial: set default bizDate to today and check if closed
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setBizDate(today);

    axios
      .get(`/api/balances?date=${today}`)
      .then((res) => setDayClosed(!!res.data.isClosed))
      .catch(() => setDayClosed(false));
  }, []);

  // Load currencies
  useEffect(() => {
    axios
      .get("/api/currencies")
      .then((res) => {
        setCurrencies(res.data);
        if (res.data.length > 0) setCurrencyCode(res.data[0].code);
      })
      .catch((err) => setError(err?.response?.data?.error || err.message));
  }, []);

  const selectedCurrency = useMemo(
    () => currencies.find((c) => c.code === currencyCode),
    [currencies, currencyCode]
  );

  const rate = useMemo(() => {
    if (!selectedCurrency) return 0;
    return type === "BUY"
      ? Number(selectedCurrency.buy_rate)
      : Number(selectedCurrency.sell_rate);
  }, [selectedCurrency, type]);

  const mmkAmount = useMemo(() => {
    const fa = Number(foreignAmount);
    if (!Number.isFinite(fa) || fa <= 0) return 0;
    return Number((fa * rate).toFixed(2));
  }, [foreignAmount, rate]);

  function validate() {
    const fa = Number(foreignAmount);
    if (!currencyCode) return "Pick a currency.";
    if (!Number.isFinite(fa) || fa <= 0) return "Foreign amount must be more than 0.";
    if (!rate || rate <= 0) return "Rate is invalid.";
    return "";
  }

  function getFinalISODateTime() {
    // If user selected datetime-local, convert to ISO, else use now
    const iso = txDateTime ? new Date(txDateTime).toISOString() : new Date().toISOString();
    return iso;
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");

    const msg = validate();
    if (msg) return setError(msg);

    if (dayClosed) return setError(`Day ${bizDate} is CLOSED. Cannot save transactions.`);

    setLoading(true);
    try {
      const fa = Number(foreignAmount);
      const isoDateTime = getFinalISODateTime();

      // Update displayed business date based on selected datetime (or now)
      const d = isoDateTime.slice(0, 10);
      setBizDate(d);

      // OPTIONAL: re-check day closed status if user picked a different date
      try {
        const balRes = await axios.get(`/api/balances?date=${d}`);
        const isClosed = !!balRes.data.isClosed;
        setDayClosed(isClosed);
        if (isClosed) {
          setLoading(false);
          return setError(`Day ${d} is CLOSED. Cannot save transactions.`);
        }
      } catch {
        // if no opening record etc, treat as open (same as your original logic)
        setDayClosed(false);
      }

      const res = await axios.post("/api/transactions", {
        type,
        currencyCode,
        foreignAmount: fa,
        customerName,
        transactionDateTime: isoDateTime, // backend should use if provided
      });

      setSavedTxId(res.data.id);
      setSavedAtISO(isoDateTime);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(n) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function openSlipPrintWindow() {
    setError("");

    const msg = validate();
    if (msg) return setError(msg);

    if (!savedTxId) return setError("Please Save first, then Print.");

    // Use saved time if available (so the slip matches the saved record)
    const iso = savedAtISO || getFinalISODateTime();
    const dt = new Date(iso).toLocaleString();

    const typeLabel =
      type === "SELL"
        ? "SELL (Customer buys foreign)"
        : "BUY (Customer sells foreign)";

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${savedTxId}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    html, body { padding: 0; margin: 0; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slip { width: 76mm; margin: 0 auto; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .muted { opacity: 0.85; }
    .hr { border-top: 1px dashed #000; margin: 8px 0; }
    .big { font-size: 14px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="slip">
    <div class="center big">Money Changer</div>
    <div class="center muted">${dt}</div>
    <div class="hr"></div>

    <div class="row"><div>Receipt #</div><div><b>${savedTxId}</b></div></div>
    <div class="row"><div>Business Date</div><div>${bizDate}</div></div>
    <div class="row"><div>Type</div><div>${escapeHtml(typeLabel)}</div></div>
    <div class="row"><div>Customer</div><div>${escapeHtml(customerName || "Walk-in")}</div></div>

    <div class="hr"></div>

    <div class="row"><div>Currency</div><div><b>${escapeHtml(currencyCode)}</b></div></div>
    <div class="row"><div>Foreign</div><div><b>${money(foreignAmount)}</b></div></div>
    <div class="row"><div>Rate</div><div>${money(rate)}</div></div>

    <div class="hr"></div>

    <div class="row big"><div>MMK</div><div>${money(mmkAmount)}</div></div>

    <div class="hr"></div>
    <div class="center muted">Thank you</div>
  </div>

  <script>
    window.focus();
    window.print();
    window.onafterprint = () => window.close();
  </script>
</body>
</html>`;

    const w = window.open("", "_blank", "width=420,height=640");
    if (!w) {
      setError("Popup blocked. Allow popups to print slips.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h3 style={{ marginTop: 0 }}>New Transaction</h3>

      <form onSubmit={handleSave} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Type (shop perspective)
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: 10 }}>
            <option value="SELL">SELL (customer buys foreign currency)</option>
            <option value="BUY">BUY (customer sells foreign currency)</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Buy/Sell Rate
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            style={{ padding: 10 }}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — buy {c.buy_rate} / sell {c.sell_rate}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Foreign Amount
          <input
            type="number"
            inputMode="decimal"
            value={foreignAmount}
            onChange={(e) => setForeignAmount(e.target.value)}
            placeholder="e.g. 100"
            style={{ padding: 10 }}
          />
        </label>

        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <div>
            Rate used: <b>{rate}</b>
          </div>
          <div>
            MMK Amount: <b>{mmkAmount}</b>
          </div>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Customer Name (optional)
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Date & Time (optional)
          <input
            type="datetime-local"
            value={txDateTime}
            onChange={(e) => {
              setTxDateTime(e.target.value);
              // also update business date display immediately when user changes it
              if (e.target.value) setBizDate(e.target.value.slice(0, 10));
            }}
            style={{ padding: 10 }}
          />
          <small style={{ opacity: 0.8 }}>
            Leave blank to use current date/time.
          </small>
        </label>

        <label style={{ display: "grid", gap: 6 }}>Cashier</label>

        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}

        {dayClosed ? (
          <div
            style={{
              padding: 10,
              border: "1px solid #e00016ff",
              background: "#e00016ff",
              borderRadius: 10,
              color: "#fff",
            }}
          >
            <b>Day {bizDate} is CLOSED.</b> New transactions are blocked. Ask admin to re-open.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={loading || dayClosed}
            style={{ padding: 12, fontSize: 16, cursor: "pointer", flex: 1 }}
          >
            {loading ? "Saving..." : savedTxId ? "Saved ✓ (Save Again)" : "Save"}
          </button>

          <button
            type="button"
            onClick={openSlipPrintWindow}
            disabled={dayClosed || !savedTxId}
            style={{ padding: 12, fontSize: 16, cursor: "pointer", flex: 1 }}
            title={!savedTxId ? "Save first to enable printing" : "Print slip"}
          >
            Print
          </button>
        </div>

        {savedTxId ? (
          <div style={{ padding: 10, border: "1px solid #1a7f37", borderRadius: 10 }}>
            Saved transaction successfully!
          </div>
        ) : null}
      </form>
    </div>
  );
}