import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import useT from "../useT";
import { formatNumber, todayISO } from "../utils/formatters";
import { useApi } from "../hooks/useApi";
import { useForm } from "../hooks/useForm";


function PaymentCell({ cash, mobile }) {
  const c = Number(cash ?? 0);
  const m = Number(mobile ?? 0);

  const hasCash = Number.isFinite(c) && c > 0;
  const hasMobile = Number.isFinite(m) && m > 0;

  if (!hasCash && !hasMobile) return <span className="tx-muted">—</span>;

  return (
    <div className="tx-pay">
      {hasCash ? (
        <div className="tx-pay__row">
          <span className="tx-pay__tag">CASH: </span>
          <span className="mono">{formatNumber(c)}</span>
        </div>
      ) : null}

      {hasMobile ? (
        <div className="tx-pay__row">
          <span className="tx-pay__tag tx-pay__tag--mobile">MOBILE: </span>
          <span className="mono">{formatNumber(m)}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function TransactionsPage() {
  const { t,lang } = useT();
  const [date, setDate] = useState(todayISO());
  const [currencySearchInput,setCurrencySearchInput]=useState("");
  const [currencyFilter,setCurrencyFilter]=useState("");
  const [me, setMe] = useState(null);
  const [currencies, setCurrencies] = useState([]);

  // useApi for data fetching - refetches when date changes
  const { data: apiData, loading, error, execute: refresh } = useApi(
    () => {
      const txParams=new URLSearchParams({date});
      if(currencyFilter) txParams.set("currency",currencyFilter);
      
       return Promise.all([
        axios.get(`/api/transactions?${txParams.toString()}`),
        axios.get(`/api/reports/daily?date=${encodeURIComponent(date)}`),
        axios.get(`/api/balances?date=${encodeURIComponent(date)}`),
      ]).then(([txRes, sumRes, balRes]) => ({
        rows: txRes.data,
        summary: sumRes.data,
        balance: balRes.data,
      }));
    },
    { immediate: true, deps: [date, currencyFilter] }
  );

  const rows = apiData?.rows || [];
  const summary = apiData?.summary || null;
  const balance = apiData?.balance || null;

  // useForm for edit
  const { values: edit, setField, reset: resetEdit } = useForm({
    type: "SELL",
    currency_code: "USD",
    foreign_amount: "",
    rate: "",
    customer_name: "",
  });
  const [editingId, setEditingId] = useState(null);

  function applyCurrencySearch() {
    setCurrencyFilter(currencySearchInput.trim().toUpperCase());
  }
  function clearCurrencySearch() {
    setCurrencySearchInput("");
    setCurrencyFilter("");
  }

  function startEdit(row) {
    setEditingId(row.id);
    setField({
      type: row.type,
      currency_code: row.currency_code,
      foreign_amount: String(row.foreign_amount ?? ""),
      rate: String(row.rate ?? ""),
      customer_name: row.customer_name || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    resetEdit();
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
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  async function deleteTx(id) {
    const ok = confirm(`Delete transaction #${id}? This cannot be undone.`);
    if (!ok) return;

    try {
      await axios.delete(`/api/transactions/${id}`);
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.error || e.message);
    }
  }

  useEffect(() => {
    axios.get("/api/auth/me").then((res) => setMe(res.data)).catch(() => setMe(null));

    axios
      .get("/api/currencies")
      .then((res) => setCurrencies(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCurrencies([]));
  }, []);

  useEffect(() => {
    if (!editingId) return;

    const cur = currencies.find((c) => c.code === edit.currency_code);
    if (!cur) return;

    const newRate = edit.type === "BUY" ? cur.buy_rate : cur.sell_rate;
    setField("rate", String(newRate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit.currency_code, edit.type, editingId, currencies]);

  useEffect(() => {
    refresh();
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

  // tender totals (IN/OUT/NET) based on type BUY/SELL (fallback if summary missing)
  const tenderTotals = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let mobileIn = 0;
    let mobileOut = 0;

    for (const r of rows) {
      const c = Number(r.cash_amount ?? 0);
      const m = Number(r.mobile_amount ?? 0);

      if (r.type === "SELL") {
        cashIn += c;
        mobileIn += m;
      } else if (r.type === "BUY") {
        cashOut += c;
        mobileOut += m;
      }
    }

    const cashNet = Number((cashIn - cashOut).toFixed(2));
    const mobileNet = Number((mobileIn - mobileOut).toFixed(2));

    return { cashIn, cashOut, cashNet, mobileIn, mobileOut, mobileNet };
  }, [rows]);

  const totalTx = summary?.total_transactions ?? rows.length;
  const mmkPaidOut = summary?.total_mmk_paid_out ?? totals.paidOut;
  const mmkReceived = summary?.total_mmk_received ?? totals.received;

  // ✅ prefer backend-calculated tender totals
  const cashIn = summary?.tenders?.cashIn ?? tenderTotals.cashIn;
  const cashOut = summary?.tenders?.cashOut ?? tenderTotals.cashOut;
  const mobileIn = summary?.tenders?.mobileIn ?? tenderTotals.mobileIn;
  const mobileOut = summary?.tenders?.mobileOut ?? tenderTotals.mobileOut;

  // ✅ “cash left / mobile left” = opening + in - out
  const openingCash = balance?.openingBalanceMMK ?? null;
  const openingMobile = balance?.openingMobileMMK ?? null;

  const cashLeft =
    balance?.suggestedClosingMMK ??
    (openingCash === null || openingCash === undefined
      ? null
      : Number((Number(openingCash) + Number(cashIn) - Number(cashOut)).toFixed(2)));

  const mobileLeft =
    balance?.suggestedClosingMobileMMK ??
    (openingMobile === null || openingMobile === undefined
      ? null
      : Number((Number(openingMobile) + Number(mobileIn) - Number(mobileOut)).toFixed(2)));

  return (
    <div className="tx-page">
      {/* PAGE HEADER */}
      <div className="tx-pagehead">
        <div className="tx-pagehead__left">
          <h1 className="tx-title">{t("transactions")}</h1>
          <p className="tx-subtitle">Daily transaction log • Inline edit (admin) • Audit-friendly records</p>
        </div>

        <div className="tx-pagehead__right">
          <div className="tx-controls">
            <label className="tx-date">
              <span>Date</span>
              <input
                className="tx-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>

            <label className="tx-date">
              <span>Currency Search</span>
              <input
                className="tx-input"
                type="text"
                placeholder="e.g. USD"
                value={currencySearchInput}
                onChange={(e) => setCurrencySearchInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyCurrencySearch();
                }}
              />
            </label>
            <button
                onClick={applyCurrencySearch}
                className="tx-btn tx-btn--primary"
                type="button"
                disabled={loading}
            >
                Search
            </button>

            <button
                onClick={clearCurrencySearch}
                className="tx-btn tx-btn--ghost"
                type="button"
                disabled={loading}
            >
                Clear
            </button>

            <button
              onClick={refresh}
              className="tx-btn tx-btn--ghost"
              type="button"
              disabled={loading}
              title="Refresh"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="tx-hintline">Tip: switch type/currency to auto-pull default rate.</div>
        </div>
      </div>

      {/* ERROR */}
      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Couldn’t load transactions</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {/* KPI ROW */}
      <div className="tx-kpis">
        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{t("totaltransactions")}</div>
          <div className="tx-kpi__value">{formatNumber(totalTx)}</div>
        </div>
        

        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{t("mmkpaidout")}</div>
          <div className="tx-kpi__value tx-kpi__value--buy">{formatNumber(mmkPaidOut)}</div>
        </div>

        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{t("mmkreceived")}</div>
          <div className="tx-kpi__value tx-kpi__value--sell">{formatNumber(mmkReceived)}</div>
        </div>       

        {/* ✅ NEW: Mobile OUT */}
        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{lang === "mm" ? "Mobile ထွက်ငွေ" : "Mobile OUT"}</div>
          <div className="tx-kpi__value tx-kpi__value--buy">{formatNumber(mobileOut)}</div>
        </div>

         {/* ✅ NEW: Mobile IN */}
        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{lang === "mm" ? "Mobile ၀င်ငွေ" : "Mobile IN"}</div>
          <div className="tx-kpi__value tx-kpi__value--sell">{formatNumber(mobileIn)}</div>
        </div>

        {/* ✅ Cash Left */}
        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{t("cashLeft")}</div>
          <div className="tx-kpi__value">{formatNumber(cashLeft)}</div>
          <div className="tx-muted" style={{ marginTop: 6, fontSize: 12 }}>
            {lang === "mm" ? "ဖွင့်ငွေ" : "Open"} : <span className="mono">{formatNumber(openingCash)}</span>
            {" + "}{lang === "mm" ? "၀င်ငွေ" : "IN"}: <span className="mono">{formatNumber(cashIn)}</span>
            {" - "}{lang === "mm" ? "ထွက်ငွေ" : "OUT"}: <span className="mono">{formatNumber(cashOut)}</span>
          </div>
        </div>

        {/* ✅ Mobile Left */}
        <div className="tx-kpi mc-card">
          <div className="tx-kpi__label">{t("mobileLeft")}</div>
          <div className="tx-kpi__value">{formatNumber(mobileLeft)}</div>
          <div className="tx-muted" style={{ marginTop: 6, fontSize: 12 }}>
            {lang === "mm" ? "ဖွင်ငွေ" : "Open"}: <span className="mono">{formatNumber(openingMobile)}</span>
            {" + "}{lang === "mm" ? "၀င်ငွေ" : "IN"}: <span className="mono">{formatNumber(mobileIn)}</span>
            {" - "}{lang === "mm" ? "ထွက်ငွေ" : "OUT"}: <span className="mono">{formatNumber(mobileOut)}</span>
          </div>
        </div>
      </div>

      {/* TABLE CARD */}
      <div className="mc-card tx-table-card">
        <div className="tx-table-head">
          <div>
            <div className="tx-table-title">
              {date ? new Date(date + "T00:00:00").toLocaleDateString("en-GB") : ""} {t("dailyLog")}
            </div>
            <div className="tx-table-meta">
              {loading
                ? "Loading…"
                : currencyFilter
                  ? `${rows.length} row(s) for ${currencyFilter}`
                  : `${rows.length} row(s)`}
            </div>
          </div>
        </div>

        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Currency</th>
                <th>Foreign Amt</th>
                <th>Rate</th>
                <th>Total MMK</th>
                <th>Payment</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="tx-empty">
                    <div className="tx-empty__icon">🧾</div>
                    <div className="tx-empty__title">
                      {currencyFilter ? `No ${currencyFilter} transactions for this date` : "No transactions for this date"}
                    </div>
                    <div className="tx-empty__sub">
                      {currencyFilter
                        ? "Try another currency code or clear the search."
                        : "Try selecting another date or create a new transaction."}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isEditing = editingId === r.id;
                  const canAdmin = me?.role === "admin";

                  return (
                    <tr key={r.id}>
                      <td className="mono">
                        {new Date(r.date_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>

                      <td className="tx-center">
                        {isEditing ? (
                          <select
                            className="tx-select"
                            value={edit.type}
                            onChange={(e) => setField("type", e.target.value)}
                          >
                            <option value="BUY">BUY</option>
                            <option value="SELL">SELL</option>
                          </select>
                        ) : (
                          <span className={"tx-badge " + (r.type === "BUY" ? "tx-badge--buy" : "tx-badge--sell")}>
                            {r.type}
                          </span>
                        )}
                      </td>

                      <td className="tx-center">
                        {isEditing ? (
                          <select
                            className="tx-select"
                            value={edit.currency_code}
                            onChange={(e) => setField("currency_code", e.target.value)}
                          >
                            {currencies.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="tx-currency">{r.currency_code}</span>
                        )}
                      </td>

                      <td className="mono">
                        {isEditing ? (
                          <input
                            className="tx-input tx-input--sm mono"
                            type="number"
                            value={edit.foreign_amount}
                            onChange={(e) => setField("foreign_amount", e.target.value)}
                          />
                        ) : (
                          formatNumber(r.foreign_amount)
                        )}
                      </td>

                      <td className="mono">
                        {isEditing ? (
                          <input
                            className="tx-input tx-input--sm mono"
                            type="number"
                            value={edit.rate}
                            onChange={(e) => setField("rate", e.target.value)}
                          />
                        ) : (
                          formatNumber(r.rate)
                        )}
                      </td>

                      <td className="mono tx-mmk">{formatNumber(r.mmk_amount)}</td>

                      <td>
                        <PaymentCell cash={r.cash_amount} mobile={r.mobile_amount} />
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="tx-input tx-input--sm"
                            value={edit.customer_name}
                            onChange={(e) => setField("customer_name", e.target.value)}
                            placeholder="Customer name"
                          />
                        ) : (
                          r.customer_name || <span className="tx-muted">—</span>
                        )}
                      </td>

                      <td>{r.created_by || <span className="tx-muted">—</span>}</td>

                      <td>
                        {canAdmin ? (
                          isEditing ? (
                            <div className="tx-actions">
                              <button onClick={() => saveEdit(r.id)} className="tx-btn tx-btn--primary" type="button">
                                Save
                              </button>
                              <button onClick={cancelEdit} className="tx-btn tx-btn--ghost" type="button">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="tx-actions">
                              <button onClick={() => startEdit(r)} className="tx-btn tx-btn--ghost" type="button">
                                Edit
                              </button>
                              <button onClick={() => deleteTx(r.id)} className="tx-btn tx-btn--danger" type="button">
                                Delete
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="tx-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="tx-skel">
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-md" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-md" /></td>
      <td><div className="skel skel-lg" /></td>
      <td><div className="skel skel-md" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-lg" /></td>
    </tr>
  );
}