import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import useT from "../useT";
import { localISODate, toLocalDateTimeWithOffset, nowLocalWithOffset } from "../utils/formatters";
import { useForm } from "../hooks/useForm";


export default function NewTransactionPage() {
  const { t, lang } = useT();
  const [currencies, setCurrencies] = useState([]);
  const [type, setType] = useState("SELL");
  const [currencyCode, setCurrencyCode] = useState("");
  const [foreignAmount, setForeignAmount] = useState("");
  const [customerName, setCustomerName] = useState("Walk-in");
  
  const [inventory, setInventory] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");

  const [txDateTime, setTxDateTime] = useState(""); // OPTIONAL datetime-local

  const [dayClosed, setDayClosed] = useState(false);
  const [bizDate, setBizDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ✅ NEW: store balances for rule-check (openings)
  const [balance, setBalance] = useState(null);

  // saved transaction info
  const [savedTxId, setSavedTxId] = useState(null);
  const [savedAtISO, setSavedAtISO] = useState(null); // store the exact sent datetime string (local+offset)

  // tender controls
  const {values:tender, setField}=useForm({
    tenderMode:"CASH",
    cashMMK:"",
    mobileProvider:"",
    mobileRef:""
  });

  // Initial: set default bizDate to local today and check if closed

  async function loadInventory(forDate) {
    setInventoryLoading(true);
    setInventoryError("");

    try {
      const res = await axios.get(`/api/inventory?date=${encodeURIComponent(forDate)}`);
      setInventory(res.data || null);
    } catch (err) {
      setInventory(null);
      setInventoryError(err?.response?.data?.error || err.message);
    } finally {
      setInventoryLoading(false);
    }
  }

  useEffect(() => {
    const today = localISODate();
    setBizDate(today);

    axios
      .get(`/api/balances?date=${today}`)
      .then((res) => {
        setDayClosed(!!res.data.isClosed);
        setBalance(res.data || null);
      })
      .catch(() => {
        setDayClosed(false);
        setBalance(null);
      });

      loadInventory(today);
  }, []);

  // Load currencies
  useEffect(() => {
    axios
      .get("/api/currencies")
      .then((res) => {
        setCurrencies(res.data || []);
        if ((res.data || []).length > 0) setCurrencyCode(res.data[0].code);
      })
      .catch((err) => setError(err?.response?.data?.error || err.message));
  }, []);

  const selectedCurrency = useMemo(
    () => currencies.find((c) => c.code === currencyCode),
    [currencies, currencyCode]
  );

  const selectedFxAvailable = useMemo(() => {
    if (!inventory?.fx || !currencyCode) return null;
    return inventory.fx.find((x) => x.currency === currencyCode) || null;
  }, [inventory, currencyCode]);

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

  // derived split amounts
  const cashSplit = useMemo(() => {
    if (tender.tenderMode !== "SPLIT") return 0;
    const v = Number(tender.cashMMK);
    if (!Number.isFinite(v) || v < 0) return 0;
    return v;
  }, [tender.tenderMode, tender.cashMMK]);

  const mobileSplit = useMemo(() => {
    if (tender.tenderMode !== "SPLIT") return 0;
    const m = Number((mmkAmount - cashSplit).toFixed(2));
    return m > 0 ? m : 0;
  }, [tender.tenderMode, mmkAmount, cashSplit]);

  // ✅ NEW: does this transaction use mobile tender?
  const usesMobileTender = useMemo(() => {
    if (tender.tenderMode === "MOBILE") return true;
    if (tender.tenderMode === "SPLIT") return mobileSplit > 0;
    return false;
  }, [tender.tenderMode, mobileSplit]);

  function validate() {
    const fa = Number(foreignAmount);
    if (!currencyCode) return "Pick a currency.";
    if (!Number.isFinite(fa) || fa <= 0) return "Foreign amount must be more than 0.";
    if (!rate || rate <= 0) return "Rate is invalid.";

    if (tender.tenderMode === "SPLIT") {
      const c = Number(tender.cashMMK);
      if (!Number.isFinite(c) || c < 0) return "Cash MMK must be a number >= 0.";
      if (c > mmkAmount) return "Cash MMK cannot be more than total MMK.";
      if (mobileSplit <= 0) return "Split requires some Mobile amount (total must be covered).";
    }

    return "";
  }

  function buildPaymentsPayload() {
    if (mmkAmount <= 0) return [];

    if (tender.tenderMode === "CASH") {
      return [{ method: "CASH_MMK", amountMMK: mmkAmount }];
    }

    if (tender.tenderMode === "MOBILE") {
      return [
        {
          method: "MOBILE_BANKING",
          amountMMK: mmkAmount,
          provider: tender.mobileProvider || null,
          referenceNo: tender.mobileRef || null,
        },
      ];
    }

    // SPLIT
    const rows = [];
    if (cashSplit > 0) rows.push({ method: "CASH_MMK", amountMMK: cashSplit });
    if (mobileSplit > 0)
      rows.push({
        method: "MOBILE_BANKING",
        amountMMK: mobileSplit,
        provider: tender.mobileProvider || null,
        referenceNo: tender.mobileRef || null,
      });

    return rows;
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");

    const msg = validate();
    if (msg) return setError(msg);

    setLoading(true);
    try {
      const fa = Number(foreignAmount);

      // ✅ always determine the target datetime FIRST (local+offset)
      const dtLocalWithOffset = txDateTime
        ? toLocalDateTimeWithOffset(txDateTime) // chosen local time
        : nowLocalWithOffset(); // local now (AU/MM depending on device)

      // ✅ business date = local date part (no UTC shift)
      const d = txDateTime ? txDateTime.slice(0,10) : localISODate();
      setBizDate(d);

      // ✅ re-check balances + closed status for THAT date
      let balData = null;
      try {
        const balRes = await axios.get(`/api/balances?date=${d}`);
        balData = balRes.data || null;
        setBalance(balData);

        const isClosed = !!balData?.isClosed;
        setDayClosed(isClosed);
        if (isClosed) {
          setLoading(false);
          return setError(`Day ${d} is CLOSED. Cannot save transactions.`);
        }
      } catch {
        setDayClosed(false);
        setBalance(null);
      }

      // ✅ NEW RULES (blocking)
      // Rule 1: cash opening must exist for that date
      const openingCash = balData?.openingBalanceMMK;
      if (openingCash === null || openingCash === undefined) {
        setLoading(false);
        return setError(
          `Opening CASH balance is not set for ${d}. Please set opening balance first.`
        );
      }

      // Rule 2: if user uses mobile tender, mobile opening must exist
      const openingMobile = balData?.openingMobileMMK;
      if (usesMobileTender && (openingMobile === null || openingMobile === undefined)) {
        setLoading(false);
        return setError(
          `Opening MOBILE balance is not set for ${d}. Set mobile opening balance before using Mobile Banking.`
        );
      }

      const paymentsPayload = buildPaymentsPayload();

      const res = await axios.post("/api/transactions", {
        type,
        currencyCode,
        foreignAmount: fa,
        customerName,
        transactionDateTime: dtLocalWithOffset, // ✅ local time WITH OFFSET
        payments: paymentsPayload,
      });

      setSavedTxId(res.data.id);
      setSavedAtISO(dtLocalWithOffset);
      await loadInventory(d);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }

  function money(n) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function paymentSummaryText() {
    if (tender.tenderMode === "CASH") return `Payment: CASH MMK ${money(mmkAmount)}`;
    if (tender.tenderMode === "MOBILE") {
      const bits = [];
      bits.push(`Payment: MOBILE MMK ${money(mmkAmount)}`);
      if (tender.mobileProvider) bits.push(`Provider: ${tender.mobileProvider}`);
      if (tender.mobileRef) bits.push(`Ref: ${tender.mobileRef}`);
      return bits.join("\n");
    }
    const bits = [];
    bits.push("Payment: SPLIT");
    bits.push(`Cash  : MMK ${money(cashSplit)}`);
    bits.push(`Mobile: MMK ${money(mobileSplit)}`);
    if (tender.mobileProvider) bits.push(`Provider: ${tender.mobileProvider}`);
    if (tender.mobileRef) bits.push(`Ref: ${tender.mobileRef}`);
    return bits.join("\n");
  }

  async function printViaRawBT() {
    setError("");

    const msg = validate();
    if (msg) return setError(msg);
    if (!savedTxId) return setError("Please Save first, then Print.");

    const iso = savedAtISO || nowLocalWithOffset();
    const dt = new Date(iso).toLocaleString();

    const typeLabel =
      type === "SELL" ? "SELL (Customer buys foreign)" : "BUY (Customer sells foreign)";

    const receiptText = `Money Changer
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
${paymentSummaryText()}
--------------------------------
Thank you
`;

    if (!navigator.share) {
      setError(
        "Share not supported on this tablet browser. Please open in Chrome (not Mi Browser / not PWA)."
      );
      return;
    }

    try {
      await navigator.share({ title: `Receipt ${savedTxId}`, text: receiptText });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }

    try {
      const file = new File([receiptText], `receipt-${savedTxId}.txt`, {
        type: "text/plain",
      });

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

  function openSlipPrintWindow() {
    window.print();
  }

  const typeHint =
    type === "SELL"
      ? lang === "mm"
        ? "Customer က၀ယ်သည်"
        : "Customer buys foreign currency"
      : lang === "mm"
      ? "Customer ကရောင်းသည်"
      : "Customer sells foreign currency";

  return (
    <div className="nt-page">
      <div className="nt-header">
        <div>
          <h1 className="nt-title">{t("newTransaction")}</h1>
          <div className="nt-subtitle">
            {lang === "mm"
              ? "အရောင်းအ၀ယ်အသစ်ထည့်ရန် နှင့် print ထုတ်ရန်"
              : "Transaction Entry and Printing Slip"}
          </div>
        </div>

        <div className="nt-status">
          <div className="nt-chip">
            <span className="nt-chip__label">{t("date")}</span>
            <span className="nt-chip__value mono">{bizDate || "-"}</span>
          </div>

          <span className={"nt-pill " + (dayClosed ? "nt-pill--closed" : "nt-pill--open")}>
            {dayClosed ? "CLOSED" : "OPEN"}
          </span>
        </div>
      </div>

      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Can’t save transaction</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {dayClosed ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Day {bizDate} is CLOSED</div>
          <div className="tx-alert__body">
            New transactions are blocked. Ask admin to re-open the day.
          </div>
        </div>
      ) : null}

      <div className="mc-card nt-card" style={{ marginBottom: 16 }}>
        <div className="bal-section-head" style={{ marginBottom: 12 }}>
          <div>
            <div className="bal-section-title">
              {lang === "mm" ? "လက်ရှိလက်ကျန်ငွေ / Inventory" : "Live Inventory"}
            </div>
            <div className="bal-section-sub">
              {lang === "mm"
                ? "ရွေးထားသော ရက်စွဲအတွက် လက်ရှိလက်ကျန်"
                : "Current available balances for selected date"}
            </div>
          </div>
        </div>

        {inventoryError ? (
          <div className="tx-alert tx-alert--danger" style={{ marginBottom: 12 }}>
            <div className="tx-alert__title">Inventory Error</div>
            <div className="tx-alert__body">{inventoryError}</div>
          </div>
        ) : null}

        {inventoryLoading ? (
          <div className="bal-loading">
            <div className="bal-loading__title">Loading inventory…</div>
            <div className="bal-loading__sub">Checking MMK and foreign currency availability.</div>
          </div>
        ) : (
          <>
            <div className="bal-kpis" style={{ marginBottom: 14 }}>
              <div className="mc-card bal-kpi">
                <div className="bal-kpi__label">{lang === "mm" ? "Cash လက်ကျန်" : "Cash Available"}</div>
                <div className="bal-kpi__value">
                  {inventory?.mmk?.cash != null ? money(inventory.mmk.cash) : "-"}
                </div>
              </div>

              <div className="mc-card bal-kpi">
                <div className="bal-kpi__label">{lang === "mm" ? "Mobile လက်ကျန်" : "Mobile Available"}</div>
                <div className="bal-kpi__value">
                  {inventory?.mmk?.mobile != null ? money(inventory.mmk.mobile) : "-"}
                </div>
              </div>

              <div className="mc-card bal-kpi">
                <div className="bal-kpi__label">{lang === "mm" ? "ရွေးထားသော Currency" : "Selected Currency"}</div>
                <div className="bal-kpi__value">
                  {selectedFxAvailable
                    ? `${selectedFxAvailable.currency} ${money(selectedFxAvailable.available)}`
                    : currencyCode || "-"}
                </div>
              </div>
            </div>

            <div className="bal-fx-grid">
              {(inventory?.fx || []).map((fx) => {
                const isSelected = fx.currency === currencyCode;

                return (
                  <div
                    key={fx.currency}
                    className="mc-card bal-fx-card"
                    style={{
                      border: isSelected ? "1px solid rgba(255,255,255,0.22)" : undefined,
                      boxShadow: isSelected ? "0 0 0 2px rgba(255,255,255,0.06) inset" : undefined,
                    }}
                  >
                    <div className="bal-fx-top">
                      <div>
                        <div className="bal-fx-code">
                          {fx.currency} <span className="bal-fx-name">— {fx.name}</span>
                        </div>
                        <div className="bal-fx-meta">
                          {lang === "mm" ? "ရနိုင်သောပမာဏ" : "Available amount"}
                        </div>
                      </div>
                    </div>

                    <div className="bal-stat" style={{ marginTop: 10 }}>
                      <span>{lang === "mm" ? "လက်ကျန်" : "Available"}</span>
                      <b className="mono">{money(fx.available)}</b>
                    </div>

                    {isSelected ? (
                      <div className="bal-footnote">
                        {lang === "mm"
                          ? "လက်ရှိရွေးထားသော currency"
                          : "Currently selected currency"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="mc-card nt-card">
        <form onSubmit={handleSave} className="nt-form">
          <div className="nt-grid">
            <label className="nt-field">
              <span>{lang === "mm" ? "Buy/Sell ရွေးချယ်ရန်" : "Type (shop perspective)"}</span>
              <select
                className="tx-select"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="SELL">
                  {t("sell")}{" "}
                  {lang === "mm" ? "(customer က၀ယ်သည်)" : "(customer buys foreign currency)"}
                </option>
                <option value="BUY">
                  {t("buy")}{" "}
                  {lang === "mm" ? "(customer ကရောင်းသည်)" : "(customer sells foreign currency)"}
                </option>
              </select>
              <div className="nt-help">{typeHint}</div>
            </label>

            <label className="nt-field">
              <span>Currency (rates)</span>
              <select
                className="tx-select"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {t("buy")} {c.buy_rate} / {t("sell")} {c.sell_rate}
                  </option>
                ))}
              </select>
              <div className="nt-help">Switching type/currency updates the rate used.</div>
            </label>

            <label className="nt-field">
              <span>{lang === "mm" ? "နိုင်ငံခြားငွေ ပမာဏ" : "Foreign amount"}</span>
              <input
                className="tx-input mono"
                type="number"
                inputMode="decimal"
                value={foreignAmount}
                onChange={(e) => setForeignAmount(e.target.value)}
                placeholder="e.g. 100"
              />
              <div className="nt-help">
                {lang === "mm"
                  ? "၀ယ်ရောင်းသော နိုင်ငံခြားငွေပမာဏထည့်ရန်"
                  : "Enter the foreign amount the customer gives/receives."}
              </div>
            </label>

            <label className="nt-field">
              <span>{lang === "mm" ? "Customer နာမည်" : "Customer name (optional)"}</span>
              <input
                className="tx-input"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in"
              />
              <div className="nt-help">
                {lang === "mm" ? "Customer အမည်မသိရင်ဒီတိုင်းထားပါ" : "Leave as Walk-in if no name."}
              </div>
            </label>

            <label className="nt-field nt-span-2">
              <span>
                {lang === "mm"
                  ? "ရက်စွဲ နဲ့ အချိန်ရွေးချယ်ရန် (မရွေးချယ်ပါက ယခုရက်စွဲနဲ့အချိန် နှင့် သတ်မှတ်သွားမည်)"
                  : "Date & time (optional)"}
              </span>
              <input
                className="tx-input"
                type="datetime-local"
                value={txDateTime}
                onChange={(e) => {
                  setTxDateTime(e.target.value);
                    const nextDate = e.target.value ? e.target.value.slice(0, 10) : localISODate();
                    setBizDate(nextDate);
                    loadInventory(nextDate);
                }}
              />
              <div className="nt-help">Leave blank to use current date/time.</div>
            </label>

            <label className="nt-field nt-span-2">
              <span>{lang === "mm" ? "ငွေပေးချေမှုစနစ်  ရွေးရန်" : "Payment method (MMK)"}</span>
              <div className="nt-help">
                {lang === "mm" ? "Customer ငွေချေနည်း" : "Choose how the customer pays / receives MMK."}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <button
                  type="button"
                  className={"tx-btn " + (tender.tenderMode === "CASH" ? "tx-btn--primary" : "tx-btn--ghost")}
                  onClick={() => setField("tenderMode","CASH")}
                >
                  {lang === "mm" ? "ပိုက်ဆံ" : "Cash"}
                </button>

                <button
                  type="button"
                  className={"tx-btn " + (tender.tenderMode === "MOBILE" ? "tx-btn--primary" : "tx-btn--ghost")}
                  onClick={() => setField("tenderMode","MOBILE")}
                >
                  Mobile Banking
                </button>

                <button
                  type="button"
                  className={"tx-btn " + (tender.tenderMode === "SPLIT" ? "tx-btn--primary" : "tx-btn--ghost")}
                  onClick={() => setField("tenderMode","SPLIT")}
                >
                  {lang === "mm" ? "တစ်၀က်ဆီပေးမည်" : "Split"}
                </button>
              </div>
            </label>

            {tender.tenderMode === "SPLIT" ? (
              <label className="nt-field">
                <span>{lang === "mm" ? "တစ်၀က်ဆီပေးမည်( ပိုက်ဆံ + mobile banking )" : "Cash MMK (split)"}</span>
                <input
                  className="tx-input mono"
                  type="number"
                  inputMode="decimal"
                  value={tender.cashMMK}
                  onChange={(e) => setField("cashMMK",e.target.value)}
                  placeholder="e.g. 100000"
                />
                <div className="nt-help">
                  {lang === "mm"
                    ? "Mobile banking ပမာဏ auto ဖြည့်သွားလိမ့်မည်"
                    : "Mobile will auto-fill:"}{" "}
                  <span className="mono">MMK {money(mobileSplit)}</span>
                </div>
              </label>
            ) : null}

            {tender.tenderMode !== "CASH" ? (
              <label className={"nt-field " + (tender.tenderMode === "SPLIT" ? "" : "nt-span-2")}>
                <span>{lang === "mm" ? "ဘဏ်နာမည်ရေးရန်" : "Mobile provider & reference (optional)"}</span>
                <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                  <input
                    className="tx-input"
                    value={tender.mobileProvider}
                    onChange={(e) => setField("mobileProvider",e.target.value)}
                    placeholder="Provider (e.g. KBZPay, WavePay)"
                  />
                  <input
                    className="tx-input mono"
                    value={tender.mobileRef}
                    onChange={(e) => setField("mobileRef",e.target.value)}
                    placeholder="Reference No (optional)"
                  />
                </div>
                <div className="nt-help">For receipt/audit. Leave blank if not needed.</div>
              </label>
            ) : null}

            <div className="nt-field nt-span-2">
              <span>{lang === "mm" ? "ပေးချေရန်ငွေ" : "Payment breakdown"}</span>
              <div className="nt-help">
                Total MMK: <span className="mono">{money(mmkAmount)}</span>
              </div>

              <div className="mc-card" style={{ padding: 12, marginTop: 6 }}>
                {tender.tenderMode === "CASH" ? (
                  <div className="mono">
                    {lang === "mm" ? "မြန်မာငွေ ပမာဏ " : "CASH_MMK "}: {money(mmkAmount)}
                  </div>
                ) : tender.tenderMode === "MOBILE" ? (
                  <div className="mono">MOBILE_BANKING: {money(mmkAmount)}</div>
                ) : (
                  <>
                    <div className="mono">
                      {lang === "mm" ? "မြန်မာငွေ ပမာဏ " : "CASH_MMK "}: {money(cashSplit)}
                    </div>
                    <div className="mono">MOBILE_BANKING: {money(mobileSplit)}</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="nt-calc">
            <div className="nt-calc__item">
              <div className="nt-calc__label">{lang === "mm" ? "Buy/Sell နှုန်း" : "Buy/Sell Rate"}</div>
              <div className="nt-calc__value mono">{money(rate)}</div>
            </div>

            <div className="nt-calc__item">
              <div className="nt-calc__label">{lang === "mm" ? "စုစုပေါင်းပေးချေရန်ငွေ" : "Total MMK amount"}</div>
              <div className="nt-calc__value nt-calc__value--accent mono">{money(mmkAmount)}</div>
            </div>

            <div className="nt-calc__item nt-calc__meta">
              <div className="nt-calc__label">Receipt</div>
              <div className="nt-calc__value mono">{savedTxId ? `#${savedTxId}` : "—"}</div>
            </div>
          </div>

          <div className="nt-actions">
            <button
              className="tx-btn tx-btn--primary"
              type="submit"
              disabled={loading || dayClosed}
              title={dayClosed ? "Day is closed" : "Save transaction"}
            >
              {loading ? "Saving…" : savedTxId ? "Saved ✓ (Save Again)" : "Save"}
            </button>

            <button
              className="tx-btn tx-btn--ghost"
              type="button"
              onClick={() => {
                const isAndroid = /Android/i.test(navigator.userAgent);
                if (isAndroid) return printViaRawBT();
                return openSlipPrintWindow();
              }}
              disabled={dayClosed || !savedTxId}
              title={!savedTxId ? "Save first to enable printing" : "Print slip"}
            >
              Print
            </button>
          </div>

          {savedTxId ? <div className="nt-saved">Saved transaction successfully!</div> : null}
        </form>
      </div>
    </div>
  );
}