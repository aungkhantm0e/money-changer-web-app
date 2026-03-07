import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import useT from "../useT";

function currentYear() {
  return new Date().getFullYear();
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? "-");
  return num.toLocaleString("en-US");
}

export default function MonthlyReportPage() {
  const {t}=useT();
  const [params] = useSearchParams();
  const autoPrint = params.get("print") === "1";

  const [year, setYear] = useState(Number(params.get("year")) || currentYear());
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(y = year) {
    setError("");
    setLoading(true);
    try {
      const res = await axios.get(`/api/reports/monthly?year=${encodeURIComponent(y)}`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [autoPrint, rows.length]);

  // ===== TOTALS (Year summary) =====
  const totals = useMemo(() => {
    const tx = rows.reduce((a, r) => a + Number(r.total_transactions || 0), 0);

    const cashIn = rows.reduce((a, r) => a + Number(r.cash_in || 0), 0);
    const cashOut = rows.reduce((a, r) => a + Number(r.cash_out || 0), 0);

    const mobileIn = rows.reduce((a, r) => a + Number(r.mobile_in || 0), 0);
    const mobileOut = rows.reduce((a, r) => a + Number(r.mobile_out || 0), 0);

    // prefer backend P/L fields if available; otherwise compute net
    const cashPL = rows.reduce((a, r) => {
      const v = r.profit_loss_cash_mmk;
      if (v === undefined || v === null) return a + (Number(r.cash_in || 0) - Number(r.cash_out || 0));
      return a + Number(v || 0);
    }, 0);

    const mobilePL = rows.reduce((a, r) => {
      const v = r.profit_loss_mobile_mmk;
      if (v === undefined || v === null) return a + (Number(r.mobile_in || 0) - Number(r.mobile_out || 0));
      return a + Number(v || 0);
    }, 0);

    const totalPL = Number((cashPL + mobilePL).toFixed(2));

    return {
      tx,
      cashIn,
      cashOut,
      mobileIn,
      mobileOut,
      cashPL: Number(cashPL.toFixed(2)),
      mobilePL: Number(mobilePL.toFixed(2)),
      totalPL,
    };
  }, [rows]);

  return (
    <div className="mr-page">
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff !important; }
          .mc-card { box-shadow: none !important; }
          .mr-page { padding: 0 !important; max-width: none !important; }
          .mr-table thead th { background: #fff !important; }
        }
      `}</style>

      {/* Header */}
      <div className="mr-header no-print">
        <div>
          <h1 className="mr-title">{t("monthlyReport")}</h1>
          <div className="mr-subtitle">Cash vs Mobile totals • Print-ready</div>
        </div>

        <div className="mr-controls">
          <label className="mr-year">
            <span>Year</span>
            <input
              className="tx-input mono"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ width: 120 }}
            />
          </label>

          <button
            onClick={() => load(year)}
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
          <div className="tx-alert__title">Couldn’t load monthly report</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {/* Meta */}
      <div className="mc-card mr-meta">
        <div className="mr-meta-left">
          <div className="mr-meta-title">{t("monthlyReport")}</div>
          <div className="mr-meta-line">
            Year: <b>{year}</b>
          </div>
        </div>

        <div className="mr-meta-right">
          <div className="mr-pl-label">{t("totalpl")} (Cash + Mobile)</div>
          <div className={"mr-pl " + (totals.totalPL < 0 ? "mr-pl--neg" : "mr-pl--pos")}>
            {formatNumber(totals.totalPL)}
          </div>
        </div>
      </div>

      {/* KPIs (no suggested closing) */}
      <div className="mr-kpis">
        <Kpi label={t("totaltransactions")} value={formatNumber(totals.tx)} />

        <Kpi label={t("mmkreceived")}value={formatNumber(totals.cashIn)} />
        <Kpi label={t("mmkpaidout")} value={formatNumber(totals.cashOut)} />
        <Kpi label={t("pl")} value={formatNumber(totals.cashPL)} tone={totals.cashPL < 0 ? "neg" : "pos"} />

        <Kpi label={t("mmkreceivedmobile")} value={formatNumber(totals.mobileIn)} />
        <Kpi label={t("mmkpaidoutmobile")} value={formatNumber(totals.mobileOut)} />
        <Kpi label={t("plmobile")} value={formatNumber(totals.mobilePL)} tone={totals.mobilePL < 0 ? "neg" : "pos"} />

        <Kpi label={t("totalpl")} value={formatNumber(totals.totalPL)} tone={totals.totalPL < 0 ? "neg" : "pos"} />
      </div>

      {/* Table */}
      <div className="mc-card mr-table-card">
        <div className="mr-table-head">
          <div>
            <div className="mr-table-title">{year} {t("monthlyReport")}</div>
            <div className="mr-table-meta">
              {loading ? "Loading…" : `${rows.length} row(s)`}
            </div>
          </div>

          <div className="mr-table-note">Cash/Mobile shown separately.</div>
        </div>

        <div className="mr-table-wrap">
          <table className="mr-table">
            <thead>
              <tr>
                <th>Month</th>
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
                  <td colSpan={5} className="mr-empty">
                    <div className="mr-empty__icon">📅</div>
                    <div className="mr-empty__title">No data for {year}</div>
                    <div className="mr-empty__sub">Try another year.</div>
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
                    <tr key={r.month}>
                      <td><b>{r.month}</b></td>
                      <td className="mono">{formatNumber(r.total_transactions)}</td>

                      <td className={"mono mr-plcell " + (cashNet < 0 ? "mr-plcell--neg" : "mr-plcell--pos")}>
                        {formatNumber(cashNet)}
                      </td>

                      <td className={"mono mr-plcell " + (mobileNet < 0 ? "mr-plcell--neg" : "mr-plcell--pos")}>
                        {formatNumber(mobileNet)}
                      </td>

                      <td className={"mono mr-plcell " + (totalNet < 0 ? "mr-plcell--neg" : "mr-plcell--pos")}>
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
      <div className="mr-signatures">
        <div>Signature (Admin): ____________________</div>
        <div>Date: ____________________</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "neutral" }) {
  return (
    <div className="mc-card mr-kpi">
      <div className="mr-kpi__label">{label}</div>
      <div
        className={
          "mr-kpi__value " +
          (tone === "pos" ? "mr-kpi__value--pos" : tone === "neg" ? "mr-kpi__value--neg" : "")
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