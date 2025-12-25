import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function NewTransactionPage() {
  const navigate = useNavigate();

  const [currencies, setCurrencies] = useState([]);
  const [type, setType] = useState("SELL"); // default: customer buys from shop
  const [currencyCode, setCurrencyCode] = useState("");
  const [foreignAmount, setForeignAmount] = useState("");
  const [customerName, setCustomerName] = useState("Walk-in");
  const [dayClosed, setDayClosed] = useState(false);
  const [bizDate, setBizDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = new Date().toISOString().slice(0, 10); 

    setBizDate(d);

    axios
      .get(`/api/balances?date=${d}`)
      .then((res) => setDayClosed(!!res.data.isClosed))
      .catch(() => setDayClosed(false)); // if no opening record yet, treat as open
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
    return type === "BUY" ? Number(selectedCurrency.buy_rate) : Number(selectedCurrency.sell_rate);
  }, [selectedCurrency, type]);

  const mmkAmount = useMemo(() => {
    const fa = Number(foreignAmount);
    if (!Number.isFinite(fa) || fa <= 0) return 0;
    return Number((fa * rate).toFixed(2));
  }, [foreignAmount, rate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const fa = Number(foreignAmount);
    if (!currencyCode) return setError("Pick a currency.");
    if (!Number.isFinite(fa) || fa <= 0) return setError("Foreign amount must be more than 0.");

    setLoading(true);
    try {
      const res = await axios.post("/api/transactions", {
        type,
        currencyCode,
        foreignAmount: fa,
        customerName,     
      });

      // Go to receipt page and print
      navigate(`/receipt/${res.data.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <h3 style={{ marginTop: 0 }}>New Transaction</h3>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
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
          <div>Rate used: <b>{rate}</b></div>
          <div>MMK Amount: <b>{mmkAmount}</b></div>
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
          Cashier     
        </label>

        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}

        {dayClosed ? (
          <div style={{ padding: 10, border: "1px solid #e00016ff", background: "#e00016ff", borderRadius: 10 }}>
            <b>Day {bizDate} is CLOSED.</b> New transactions are blocked. Ask admin to re-open.
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading || dayClosed}
          style={{ padding: 12, fontSize: 16, cursor: "pointer" }}
        >
          {loading ? "Saving..." : "Save & Print Receipt"}
        </button>
      </form>
    </div>
  );
}