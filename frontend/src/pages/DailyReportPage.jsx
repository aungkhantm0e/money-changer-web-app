import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import useT from "../useT";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? "-");
  return num.toLocaleString("en-US");
}

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

export default function DailyReportPage() {
  const {t}=useT();
  const [params] = useSearchParams();
  const [date, setDate] = useState(params.get("date") || todayISO());
  const [bal, setBal] = useState(null);
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const autoPrint = params.get("print") === "1";

  async function load() {
    setError("");
    setLoading(true);
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
    } finally {
      setLoading(false);
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
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, bal, rows.length]);

  // Cash P/L
  const profitLossCash = useMemo(() => {
    if (!bal) return null;
    const opening = bal.openingBalanceMMK == null ? null : Number(bal.openingBalanceMMK);
    const closing = bal.closingBalanceMMK == null ? null : Number(bal.closingBalanceMMK);
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return null;
    return Number((closing - opening).toFixed(2));
  }, [bal]);

  // Mobile P/L
  const profitLossMobile = useMemo(() => {
    if (!bal) return null;
    const opening = bal.openingMobileMMK == null ? null : Number(bal.openingMobileMMK);
    const closing = bal.closingMobileMMK == null ? null : Number(bal.closingMobileMMK);
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return null;
    return Number((closing - opening).toFixed(2));
  }, [bal]);

  const tenders = bal?.tenders || {};
  const cashIn = tenders.cashIn ?? 0;
  const cashOut = tenders.cashOut ?? 0;
  const mobileIn = tenders.mobileIn ?? 0;
  const mobileOut = tenders.mobileOut ?? 0;

  return (
    <div className="dr-page">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff !important; }
          .mc-card { box-shadow: none !important; }
          .dr-page { padding: 0 !important; }
          .dr-table thead th { background: #fff !important; }
        }
      `}</style>

      {/* Header */}
      <div className="dr-header no-print">
        <div>
          <h1 className="dr-title">{t("dailyReport")}</h1>
          <div className="dr-subtitle">
            End-of-day summary • Cash vs Mobile • Print-ready
          </div>
        </div>

        <div className="dr-controls">
          <label className="dr-date">
            <span>Date</span>
            <input
              className="tx-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <button
            onClick={load}
            className="tx-btn tx-btn--ghost"
            type="button"
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button
            onClick={() => window.print()}
            className="tx-btn tx-btn--primary"
            type="button"
            disabled={!bal}
            title={!bal ? "Load report first" : "Print"}
          >
            Print
          </button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Couldn’t load daily report</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {/* Report */}
      {bal ? (
        <>
          {/* Report meta */}
          <div className="mc-card dr-meta">
            <div className="dr-meta-left">
              <div className="dr-meta-title">{t("dailyReport")}</div>
              <div className="dr-meta-line">
                Date: <b>{date}</b>
              </div>
              <div className="dr-meta-line">
                Role: <b>{me?.fullName || me?.username || "-"}</b>
              </div>
            </div>

            <div className="dr-meta-right">
              <div className="dr-status-label">Status</div>
              <div className={"dr-status " + (bal.isClosed ? "dr-status--closed" : "dr-status--open")}>
                {bal.isClosed ? "CLOSED" : "OPEN"}
              </div>
            </div>
          </div>

          {/* KPI cards (Cash + Mobile separated) */}
         {/* KPI cards (Cash + Mobile separated, no suggested closing) */}
          <div className="dr-kpis">
            {/* CASH */}
            <Kpi label={t("openingMMK")} value={formatNumber(bal.openingBalanceMMK ?? "-")} />
            <Kpi label={t("mmkreceived")} value={formatNumber(cashIn)} />
            <Kpi label={t("mmkpaidout")} value={formatNumber(cashOut)} />
            <Kpi label={t("closingMMK")} value={formatNumber(bal.closingBalanceMMK ?? "-")} />
            

            {/* MOBILE */}
            <Kpi label={t("openingMMKmobile")} value={formatNumber(bal.openingMobileMMK ?? "-")} />
            <Kpi label={t("mmkreceivedmobile")} value={formatNumber(mobileIn)} />
            <Kpi label={t("mmkpaidoutmobile")} value={formatNumber(mobileOut)} />
            <Kpi label={t("closingMMKmobile")} value={formatNumber(bal.closingMobileMMK ?? "-")} />
            <Kpi
              label={t("plmobile")}
              value={profitLossMobile == null ? "-" : formatNumber(profitLossMobile)}
              tone={profitLossMobile == null ? "neutral" : profitLossMobile < 0 ? "neg" : "pos"}
            />
            <Kpi
              label={t("pl")}
              value={profitLossCash == null ? "-" : formatNumber(profitLossCash)}
              tone={profitLossCash == null ? "neutral" : profitLossCash < 0 ? "neg" : "pos"}
            />
          </div>

          {/* Transactions table */}
          <div className="mc-card dr-table-card">
            <div className="dr-table-head">
              <div>
                <div className="dr-table-title">Transactions</div>
                <div className="dr-table-meta">{rows.length} row(s)</div>
              </div>

              <div className="dr-table-note">
                Times reflect local device timezone.
              </div>
            </div>

            <div className="dr-table-wrap">
              <table className="dr-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Currency</th>
                    <th>Foreign</th>
                    <th>Rate</th>
                    <th>MMK</th>
                    <th>Payment</th>
                    <th>Customer</th>
                    <th>Cashier</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="dr-empty">
                        <div className="dr-empty__icon">🧾</div>
                        <div className="dr-empty__title">No transactions for this date</div>
                        <div className="dr-empty__sub">Select another date to view records.</div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.id}>
                        <td className="mono">
                          {new Date(r.date_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td>
                          <span className={"tx-badge " + (r.type === "BUY" ? "tx-badge--buy" : "tx-badge--sell")}>
                            {r.type}
                          </span>
                        </td>
                        <td className="tx-currency">{r.currency_code}</td>
                        <td className="mono">{formatNumber(r.foreign_amount)}</td>
                        <td className="mono">{formatNumber(r.rate)}</td>
                        <td className="mono tx-mmk">{formatNumber(r.mmk_amount)}</td>
                        <td>
                          <PaymentCell cash={r.cash_amount} mobile={r.mobile_amount} />
                        </td>
                        <td>{r.customer_name || <span className="tx-muted">—</span>}</td>
                        <td>{r.created_by || <span className="tx-muted">—</span>}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures */}
          <div className="dr-signatures">
            <div>Signature (Admin): ____________________</div>
            <div>Signature (Cashier): ____________________</div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }) {
  return (
    <div className="mc-card dr-kpi">
      <div className="dr-kpi__label">{label}</div>
      <div className={"dr-kpi__value " + (tone === "pos" ? "dr-kpi__value--pos" : tone === "neg" ? "dr-kpi__value--neg" : "")}>
        {value}
      </div>
    </div>
  );
}