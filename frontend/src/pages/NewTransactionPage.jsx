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

  // function escapeHtml(str) {
  //   return String(str ?? "")
  //     .replaceAll("&", "&amp;")
  //     .replaceAll("<", "&lt;")
  //     .replaceAll(">", "&gt;")
  //     .replaceAll('"', "&quot;")
  //     .replaceAll("'", "&#039;");
  // }

  function money(n) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }


//print via RawBT
async function printViaRawBT() {
  setError("");

  const msg = validate();
  if (msg) return setError(msg);
  if (!savedTxId) return setError("Please Save first, then Print.");

  const iso = savedAtISO || getFinalISODateTime();
  const dt = new Date(iso).toLocaleString();

  const typeLabel =
    type === "SELL"
      ? "SELL (Customer buys foreign)"
      : "BUY (Customer sells foreign)";

  const receiptText =
`Money Changer
${dt}
--------------------------------
Receipt #: ${savedTxId}
Business Date: ${bizDate}
Type: ${typeLabel}
Customer: ${customerName || "Walk-in"}
--------------------------------
Currency: ${currencyCode}
Foreign : ${money(foreignAmount)}
Rate    : ${money(rate)}
--------------------------------
MMK     : ${money(mmkAmount)}
--------------------------------
Thank you
`;

  // 1) Must be supported + secure context (https/localhost)
  if (!navigator.share) {
    setError("Share not supported on this tablet browser. Please open in Chrome (not Mi Browser / not PWA).");
    return;
  }

  try {
    // 2) Try share TEXT only first (works on more Xiaomi/MIUI builds)
    await navigator.share({
      title: `Receipt ${savedTxId}`,
      text: receiptText,
    });
    return;
  } catch (e) {
    // User cancel is fine
    if (e?.name === "AbortError") return;
    // If text-share failed, continue to file-share attempt
  }

  // 3) Try file share (only if supported)
  try {
    const file = new File([receiptText], `receipt-${savedTxId}.txt`, { type: "text/plain" });

    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      setError("This tablet can’t share files. Use Chrome, or print via RawBT app manually.");
      return;
    }

    await navigator.share({
      title: `Receipt ${savedTxId}`,
      text: "Send to RawBT to print",
      files: [file],
    });
  } catch (e) {
    if (e?.name === "AbortError") return;
    setError(e?.message || "Share failed on this tablet. Try Chrome or update system WebView.");
  }
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
            onClick={() => {
              const isAndroid = /Android/i.test(navigator.userAgent);
              if (isAndroid) return printViaRawBT();
              return openSlipPrintWindow();
            }}
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