import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import useT from "../useT";

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? "-");
  return num.toLocaleString("en-US");
}

export default function YearlyReportPage() {
  const {t}=useT();
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get("/api/reports/yearly");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, rows.length]);

  const totals = useMemo(() => {
    const tx = rows.reduce((a, r) => a + Number(r.total_transactions || 0), 0);

    const cashIn = rows.reduce((a, r) => a + Number(r.cash_in || 0), 0);
    const cashOut = rows.reduce((a, r) => a + Number(r.cash_out || 0), 0);

    const mobileIn = rows.reduce((a, r) => a + Number(r.mobile_in || 0), 0);
    const mobileOut = rows.reduce((a, r) => a + Number(r.mobile_out || 0), 0);

    const cashNet = rows.reduce((a, r) => {
      const v = r.profit_loss_cash_mmk;
      if (v === undefined || v === null) return a + (Number(r.cash_in || 0) - Number(r.cash_out || 0));
      return a + Number(v || 0);
    }, 0);

    const mobileNet = rows.reduce((a, r) => {
      const v = r.profit_loss_mobile_mmk;
      if (v === undefined || v === null) return a + (Number(r.mobile_in || 0) - Number(r.mobile_out || 0));
      return a + Number(v || 0);
    }, 0);

    const totalNet = Number((cashNet + mobileNet).toFixed(2));

    return {
      tx,
      cashIn,
      cashOut,
      mobileIn,
      mobileOut,
      cashNet: Number(cashNet.toFixed(2)),
      mobileNet: Number(mobileNet.toFixed(2)),
      totalNet,
    };
  }, [rows]);

  return (
    <div className="yr-page">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff !important; }
          .mc-card { box-shadow: none !important; }
          .yr-page { padding: 0 !important; max-width: none !important; }
          .yr-table thead th { background: #fff !important; }
        }
      `}</style>

      {/* Header */}
      <div className="yr-header no-print">
        <div>
          <h1 className="yr-title">{t("yearlyReport")}</h1>
          <div className="yr-subtitle">Cash vs Mobile summary • Print-ready</div>
        </div>

        <div className="yr-controls">
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
          >
            Print
          </button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Couldn’t load yearly report</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {/* Meta */}
      <div className="mc-card yr-meta">
        <div className="yr-meta-left">
          <div className="yr-meta-title">{t("yearlyReport")}</div>
          <div className="yr-meta-line">
            Years shown: <b>{rows.length}</b>
          </div>
        </div>

        <div className="yr-meta-right">
          <div className="yr-pl-label">{t("totalpl")} (Cash + Mobile)</div>
          <div className={"yr-pl " + (totals.totalNet < 0 ? "yr-pl--neg" : "yr-pl--pos")}>
            {formatNumber(totals.totalNet)}
          </div>
        </div>
      </div>

      {/* KPIs (detailed, but only up top) */}
      <div className="yr-kpis">
        <Kpi label={t("totaltransactions")} value={formatNumber(totals.tx)} />

        <Kpi label={t("mmkreceived")} value={formatNumber(totals.cashIn)} />
        <Kpi label={t("mmkpaidout")} value={formatNumber(totals.cashOut)} />
        <Kpi label={t("cashNet")} value={formatNumber(totals.cashNet)} tone={totals.cashNet < 0 ? "neg" : "pos"} />

        <Kpi label={t("mmkreceivedmobile")} value={formatNumber(totals.mobileIn)} />
        <Kpi label={t("mmkpaidoutmobile")} value={formatNumber(totals.mobileOut)} />
        <Kpi label={t("mobileNet")} value={formatNumber(totals.mobileNet)} tone={totals.mobileNet < 0 ? "neg" : "pos"} />

        <Kpi label={t("totalpl")} value={formatNumber(totals.totalNet)} tone={totals.totalNet < 0 ? "neg" : "pos"} />
      </div>

      {/* Table (simple for employees) */}
      <div className="mc-card yr-table-card">
        <div className="yr-table-head">
          <div>
            <div className="yr-table-title">Yearly breakdown</div>
            <div className="yr-table-meta">
              {loading ? "Loading…" : `${rows.length} row(s)`}
            </div>
          </div>
        </div>

        <div className="yr-table-wrap">
          <table className="yr-table">
            <thead>
              <tr>
                <th>Year</th>
                <th>Transactions</th>
                <th>Cash Net</th>
                <th>Mobile Net</th>
                <th>Total Net</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <>
                  <SkeletonRowSimple />
                  <SkeletonRowSimple />
                  <SkeletonRowSimple />
                </>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="yr-empty">
                    <div className="yr-empty__icon">📈</div>
                    <div className="yr-empty__title">No yearly data yet</div>
                    <div className="yr-empty__sub">Once you have daily balances, this will populate.</div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const cashNet =
                    r.profit_loss_cash_mmk === undefined || r.profit_loss_cash_mmk === null
                      ? Number(r.cash_in || 0) - Number(r.cash_out || 0)
                      : Number(r.profit_loss_cash_mmk || 0);

                  const mobileNet =
                    r.profit_loss_mobile_mmk === undefined || r.profit_loss_mobile_mmk === null
                      ? Number(r.mobile_in || 0) - Number(r.mobile_out || 0)
                      : Number(r.profit_loss_mobile_mmk || 0);

                  const totalNet = Number((cashNet + mobileNet).toFixed(2));

                  return (
                    <tr key={r.year}>
                      <td><b>{r.year}</b></td>
                      <td className="mono">{formatNumber(r.total_transactions)}</td>

                      <td className={"mono yr-plcell " + (cashNet < 0 ? "yr-plcell--neg" : "yr-plcell--pos")}>
                        {formatNumber(cashNet)}
                      </td>

                      <td className={"mono yr-plcell " + (mobileNet < 0 ? "yr-plcell--neg" : "yr-plcell--pos")}>
                        {formatNumber(mobileNet)}
                      </td>

                      <td className={"mono yr-plcell " + (totalNet < 0 ? "yr-plcell--neg" : "yr-plcell--pos")}>
                        {formatNumber(totalNet)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signatures */}
      <div className="yr-signatures">
        <div>Signature (Admin): ____________________</div>
        <div>Date: ____________________</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }) {
  return (
    <div className="mc-card yr-kpi">
      <div className="yr-kpi__label">{label}</div>
      <div
        className={
          "yr-kpi__value " +
          (tone === "pos" ? "yr-kpi__value--pos" : tone === "neg" ? "yr-kpi__value--neg" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function SkeletonRowSimple() {
  return (
    <tr className="tx-skel">
      <td><div className="skel skel-md" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-sm" /></td>
      <td><div className="skel skel-sm" /></td>
    </tr>
  );
}