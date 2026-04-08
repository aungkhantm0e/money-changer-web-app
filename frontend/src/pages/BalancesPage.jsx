import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import useT from "../useT";
import { todayISO,formatNumber } from "../utils/formatters";
import { useApi } from "../hooks/useApi";
import { useForm } from "../hooks/useForm";

export default function BalancesPage() {
  const { t, lang } = useT();
  const [date, setDate] = useState(todayISO());
  const [me, setMe] = useState(null);

  // useApi for data fetching - refetches when date changes
  const { data, loading, error: apiError, execute: refresh } = useApi(
    () => axios.get(`/api/balances?date=${encodeURIComponent(date)}`),
    { immediate: true, deps: [date] }
  );

  // useForm for MMK inputs
  const { values: mmkInputs, setField, setFields } = useForm({
    openingInput: "",
    closingInput: "",
    openingMobileInput: "",
    closingMobileInput: ""
  });

  // Active currencies
  const [currencies, setCurrencies] = useState([]);

  // FX errors + per-currency inputs
  const [fxError, setFxError] = useState("");
  const [fxOpeningInputs, setFxOpeningInputs] = useState({});
  const [fxClosingInputs, setFxClosingInputs] = useState({});

  // ✅ per-section success messages (no top)
  const [cashOpenMsg, setCashOpenMsg] = useState(""); // under cash opening card
  const [cashCloseMsg, setCashCloseMsg] = useState(""); // under cash closing card
  const [fxMsgByCur, setFxMsgByCur] = useState({}); // under each FX card {USD:"...", ...}

  const [error, setError] = useState("");

  function clearMsgs() {
    setCashOpenMsg("");
    setCashCloseMsg("");
    setFxMsgByCur({});
  }

  function flashCashOpenMsg(text) {
    setCashOpenMsg(text);
    window.clearTimeout(flashCashOpenMsg._t);
    flashCashOpenMsg._t = window.setTimeout(() => setCashOpenMsg(""), 2200);
  }

  function flashCashCloseMsg(text) {
    setCashCloseMsg(text);
    window.clearTimeout(flashCashCloseMsg._t);
    flashCashCloseMsg._t = window.setTimeout(() => setCashCloseMsg(""), 2200);
  }

  function flashFxMsg(currency, text) {
    setFxMsgByCur((p) => ({ ...p, [currency]: text }));
    flashFxMsg._t = flashFxMsg._t || {};
    window.clearTimeout(flashFxMsg._t[currency]);
    flashFxMsg._t[currency] = window.setTimeout(() => {
      setFxMsgByCur((p) => {
        const next = { ...p };
        delete next[currency];
        return next;
      });
    }, 2200);
  }

  function parseOptionalNumber(raw) {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  // Update mmkInputs when data loads
  useEffect(() => {
    if (!data) return;
    setFields({
      openingInput: data.openingBalanceMMK ?? "",
      closingInput: data.closingBalanceMMK ?? "",
      openingMobileInput: data.openingMobileMMK ?? "",
      closingMobileInput: data.closingMobileMMK ?? "",
    });

    // prefill FX inputs from API rows
    const list = data?.fxBalances ?? [];
    const openMap = {};
    const closeMap = {};
    for (const fx of list) {
      openMap[fx.currency] = fx.openingAmount ?? "";
      closeMap[fx.currency] = fx.closingAmount ?? "";
    }
    setFxOpeningInputs(openMap);
    setFxClosingInputs(closeMap);
  }, [data]);

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

  const isAdmin = me?.role === "admin";

  const cashIn = Number(data?.tenders?.cashIn ?? 0);
  const cashOut = Number(data?.tenders?.cashOut ?? 0);
  const mobileIn = Number(data?.tenders?.mobileIn ?? 0);
  const mobileOut = Number(data?.tenders?.mobileOut ?? 0);

  // CASH Profit/Loss = Actual Closing - Opening
  const profitLossCash = useMemo(() => {
    if (!data) return null;
    const opening = data.openingBalanceMMK == null ? null : Number(data.openingBalanceMMK);
    const closing = data.closingBalanceMMK == null ? null : Number(data.closingBalanceMMK);
    if (opening === null || closing === null) return null;
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return null;
    return Number((closing - opening).toFixed(2));
  }, [data]);

  // MOBILE Profit/Loss = Actual Closing - Opening
  const profitLossMobile = useMemo(() => {
    if (!data) return null;
    const opening = data.openingMobileMMK == null ? null : Number(data.openingMobileMMK);
    const closing = data.closingMobileMMK == null ? null : Number(data.closingMobileMMK);
    if (opening === null || closing === null) return null;
    if (!Number.isFinite(opening) || !Number.isFinite(closing)) return null;
    return Number((closing - opening).toFixed(2));
  }, [data]);

  // ===== CASH actions =====
  async function setOpening() {
    setError("");
    setFxError("");
    setCashCloseMsg(""); // only show under correct card

    const openingCash = Number(mmkInputs.openingInput);
    if (!Number.isFinite(openingCash) || openingCash < 0) {
      return setError("Opening CASH must be a number >= 0");
    }

    const openingMobile = parseOptionalNumber(mmkInputs.openingMobileInput);
    if (Number.isNaN(openingMobile) || (openingMobile !== null && openingMobile < 0)) {
      return setError("Opening MOBILE must be a number >= 0 (or leave blank)");
    }

    try {
      await axios.post("/api/balances/open", {
        date,
        openingBalanceMMK: openingCash,
        openingMobileMMK: openingMobile, // null ok
      });
      await refresh();
      flashCashOpenMsg("✅ Opening saved");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  async function closeDay() {
    setError("");
    setFxError("");
    setCashOpenMsg("");

    if (!data) return setError("No balance data loaded");
    if (data.openingBalanceMMK == null) return setError("Set opening CASH first.");

    // ✅ If blank => use suggested closing
    const closingCashParsed = parseOptionalNumber(mmkInputs.closingInput);
    const suggestedCash = data?.suggestedClosingMMK ?? null;
    const closingCash =
      closingCashParsed === null ? (suggestedCash == null ? NaN : Number(suggestedCash)) : closingCashParsed;

    if (!Number.isFinite(closingCash) || closingCash < 0) {
      return setError(
        suggestedCash == null
          ? "Closing CASH is required (no suggested cash closing available)."
          : "Closing CASH must be a number >= 0 (or leave blank to use suggested)."
      );
    }

    // ✅ Mobile: blank => suggested mobile (if exists), otherwise null
    const closingMobileParsed = parseOptionalNumber(mmkInputs.closingMobileInput);
    const suggestedMobile = data?.suggestedClosingMobileMMK ?? null;
    const closingMobile =
      closingMobileParsed === null
        ? suggestedMobile == null
          ? null
          : Number(suggestedMobile)
        : closingMobileParsed;

    if (Number.isNaN(closingMobile) || (closingMobile !== null && closingMobile < 0)) {
      return setError("Closing MOBILE must be a number >= 0 (or leave blank to use suggested/empty).");
    }

    try {
      await axios.post("/api/balances/close", {
        date,
        closingBalanceMMK: closingCash,
        closingMobileMMK: closingMobile, // null ok
      });
      await refresh();
      flashCashCloseMsg("✅ Day closed (closing saved)");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  async function reopenDay() {
    setError("");
    setFxError("");
    try {
      await axios.post("/api/balances/reopen", { date });
      await refresh();
      flashCashCloseMsg("✅ Day re-opened");
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  }

  // ===== FX actions =====
  async function saveFxOpening(currency) {
    setFxError("");
    setError("");

    const raw = fxOpeningInputs[currency];
    const amount = Number(raw);

    if (!Number.isFinite(amount) || amount < 0) {
      return setFxError("Opening must be a number >= 0");
    }

    try {
      await axios.post("/api/balances/open-fx", { date, currency, openingAmount: amount });
      await refresh();
      flashFxMsg(currency, "✅ Opening saved");
    } catch (e) {
      setFxError(e?.response?.data?.error || e.message);
    }
  }

  async function saveFxClosing(currency) {
    setFxError("");
    setError("");

    // ✅ if blank => use suggestedClosingAmount (if exists)
    const parsed = parseOptionalNumber(fxClosingInputs[currency]);
    const fx = (data?.fxBalances ?? []).find((x) => x.currency === currency);
    const suggested = fx?.suggestedClosingAmount ?? null;

    const amount = parsed === null ? (suggested == null ? NaN : Number(suggested)) : parsed;

    if (!Number.isFinite(amount) || amount < 0) {
      return setFxError(
        suggested == null
          ? `No suggested closing for ${currency}. Enter a closing amount first.`
          : "Closing must be a number >= 0 (or leave blank to use suggested)."
      );
    }

    try {
      await axios.post("/api/balances/close-fx", { date, currency, closingAmount: amount });
      await refresh();
      flashFxMsg(currency, "✅ Closing saved");
    } catch (e) {
      setFxError(e?.response?.data?.error || e.message);
    }
  }

  // ===== Build cards for ALL active currencies =====
  const fxBalances = data?.fxBalances ?? [];

  const fxCards = currencies.map((c) => {
    const existing = fxBalances.find((x) => x.currency === c.code);

    const openingAmount = existing?.openingAmount ?? 0;
    const closingAmount = existing?.closingAmount ?? null;

    const foreignIn = existing?.foreignIn ?? 0;
    const foreignOut = existing?.foreignOut ?? 0;
    const buyMMK=existing?.buyMMK ?? 0;
    const sellMMK=existing?.sellMMK ?? 0;

    const suggestedClosingAmount = existing?.suggestedClosingAmount ?? null;

    return {
      currency: c.code,
      name: c.name,
      openingAmount,
      closingAmount,
      foreignIn,
      foreignOut,
      buyMMK,
      sellMMK,
      suggestedClosingAmount,
    };
  });

  return (
    <div className="bal-page">
      {/* Header */}
      <div className="bal-header">
        <div>
          <h1 className="bal-title">{t("balances")}</h1>
          <div className="bal-subtitle">Daily open/close</div>
        </div>

        <div className="bal-controls">
          <label className="bal-date">
            <span>{t("date")}</span>
            <input className="tx-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <button onClick={refresh} className="tx-btn tx-btn--ghost" type="button" disabled={loading} title="Refresh">
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          {data?.isClosed ? (
            <span className="bal-pill bal-pill--closed">
              <b>CLOSED</b>
            </span>
          ) : (
            <span className="bal-pill bal-pill--open">
              <b>OPEN</b>
            </span>
          )}
        </div>
      </div>

      {/* Alerts (errors only) */}
      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Couldn’t load / save balances</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {loading ? (
        <div className="bal-loading mc-card">
          <div className="bal-loading__title">Loading…</div>
          <div className="bal-loading__sub">Fetching balances and FX positions.</div>
        </div>
      ) : null}

      {data ? (
        <>
          {/* MMK KPIs (CASH + MOBILE) */}
          <div className="bal-kpis">
            {/* CASH */}
            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("openingMMK")}</div>
              <div className="bal-kpi__value">{formatNumber(data.openingBalanceMMK ?? "-")}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("mmkreceived")}</div>
              <div className="bal-kpi__value">{formatNumber(cashIn)}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("mmkpaidout")}</div>
              <div className="bal-kpi__value">{formatNumber(cashOut)}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("closingMMK")}</div>
              <div className="bal-kpi__value">{formatNumber(data.closingBalanceMMK ?? "-")}</div>
            </div>

            {/* MOBILE */}
            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("openingMMKmobile")}</div>
              <div className="bal-kpi__value">{formatNumber(data.openingMobileMMK ?? "-")}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("mmkreceivedmobile")}</div>
              <div className="bal-kpi__value">{formatNumber(mobileIn)}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("mmkpaidoutmobile")}</div>
              <div className="bal-kpi__value">{formatNumber(mobileOut)}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("closingMMKmobile")}</div>
              <div className="bal-kpi__value">{formatNumber(data.closingMobileMMK ?? "-")}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("pl")}</div>
              <div className={"bal-kpi__value " + (profitLossCash == null ? "" : profitLossCash < 0 ? "bal-neg" : "bal-pos")}>
                {profitLossCash == null ? "-" : formatNumber(profitLossCash)}
              </div>
              <div className="bal-kpi__hint">{t("greenP")}, {t("redL")}</div>
            </div>

            <div className="mc-card bal-kpi">
              <div className="bal-kpi__label">{t("plmobile")}</div>
              <div className={"bal-kpi__value " + (profitLossMobile == null ? "" : profitLossMobile < 0 ? "bal-neg" : "bal-pos")}>
                {profitLossMobile == null ? "-" : formatNumber(profitLossMobile)}
              </div>
              <div className="bal-kpi__hint">{t("greenP")}, {t("redL")}</div>
            </div>
          </div>

          {/* FX Balances */}
          <div className="bal-section">
            <div className="bal-section-head">
              <div>
                <div className="bal-section-title">{t("fx_balances")}</div>
                <div className="bal-section-sub">Track foreign openings/closings and movement.</div>
              </div>
            </div>

            {fxError ? (
              <div className="tx-alert tx-alert--danger">
                <div className="tx-alert__title">FX Error</div>
                <div className="tx-alert__body">{fxError}</div>
              </div>
            ) : null}

            <div className="bal-fx-grid">
              {fxCards.map((fx) => {
                return (
                  <div key={fx.currency} className="mc-card bal-fx-card">
                    <div className="bal-fx-top">
                      <div>
                        <div className="bal-fx-code">
                          {fx.currency} <span className="bal-fx-name">— {fx.name}</span>
                        </div>
                        <div className="bal-fx-meta">Daily buy/sell totals for this currency.</div>
                      </div>
                    </div>

                    <div className="bal-fx-inputs">
                      <label className="bal-field">
                        <span>Opening</span>
                        <input
                          className="tx-input tx-input--sm mono"
                          type="number"
                          value={fxOpeningInputs[fx.currency] ?? fx.openingAmount}
                          onChange={(e) => setFxOpeningInputs((p) => ({ ...p, [fx.currency]: e.target.value }))}
                          disabled={!isAdmin || !!data.isClosed}
                        />
                      </label>

                      <label className="bal-field">
                        <span>Closing</span>
                        <input
                          className="tx-input tx-input--sm mono"
                          type="number"
                          value={fxClosingInputs[fx.currency] ?? (fx.closingAmount ?? "")}
                          onChange={(e) => setFxClosingInputs((p) => ({ ...p, [fx.currency]: e.target.value }))}
                          placeholder={fx.suggestedClosingAmount == null ? "" : `Suggested: ${fx.suggestedClosingAmount}`}
                          disabled={!isAdmin || !!data.isClosed}
                        />
                      </label>
                    </div>

                    {/* suggested hint */}
                    {fx.suggestedClosingAmount != null ? (
                      <div className="bal-footnote">
                        Suggested closing: <b className="mono">{formatNumber(fx.suggestedClosingAmount)}</b>
                        {" "}• leave blank to use suggested
                      </div>
                    ) : (
                      <div className="bal-footnote">Record opening and closing carefully.</div>
                    )}

                    {isAdmin ? (
                      <div className="bal-fx-actions">
                        <button
                          onClick={() => saveFxOpening(fx.currency)}
                          className="tx-btn tx-btn--ghost"
                          type="button"
                          disabled={!!data.isClosed}
                        >
                          {t("saveOpening")}
                        </button>

                        <button
                          onClick={() => saveFxClosing(fx.currency)}
                          className="tx-btn tx-btn--primary"
                          type="button"
                          disabled={!!data.isClosed}
                        >
                          {t("saveClosing")}
                        </button>

                        {/* ✅ per-card success */}
                        {fxMsgByCur[fx.currency] ? (
                          <div style={{ marginTop: 10 }} className="rp-alert rp-alert--ok">
                            <div className="rp-alert__body">{fxMsgByCur[fx.currency]}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="bal-fx-stats">
                      <div className="bal-stat">
                        <span>In (BUY)</span>
                        <b className="mono">{formatNumber(fx.foreignIn)}</b>
                      </div>
                      <div className="bal-stat">
                        <span>Out (SELL)</span>
                        <b className="mono">{formatNumber(fx.foreignOut)}</b>
                      </div>                 
                        <div className="bal-stat">
                        <span>BUY MMK</span>
                        <b className="mono bal-neg">{formatNumber(fx.buyMMK)}</b>
                      </div>
                      <div className="bal-stat">
                        <span>SELL MMK</span>
                        <b className="mono bal-pos">{formatNumber(fx.sellMMK)}</b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin actions */}
          {isAdmin ? (
            <div className="mc-card bal-admin">
              <div className="bal-admin-head">
                <div>
                  <div className="bal-section-title">Admin Actions</div>
                  <div className="bal-section-sub">Set opening & close/re-open day (Cash + Mobile).</div>
                </div>

                {data?.isClosed ? (
                  <span className="bal-pill bal-pill--closed"><b>CLOSED</b></span>
                ) : (
                  <span className="bal-pill bal-pill--open"><b>OPEN</b></span>
                )}
              </div>

              <div className="bal-admin-grid">
                {/* OPENING */}
                <div className="bal-admin-block">
                  <label className="bal-field">
                    <span>{lang === "mm" ? "ယနေ့အတွက် အဖွင့်ငွေ" : "Set opening CASH (MMK)"}</span>
                    <input
                      className="tx-input mono"
                      type="number"
                      value={mmkInputs.openingInput}
                      onChange={(e) => setField("openingInput", e.target.value)}
                      placeholder="e.g. 12000000"
                      disabled={!!data.isClosed}
                    />
                  </label>

                  <label className="bal-field">
                    <span>{lang === "mm" ? "Mobile banking အတွက်အဖွင့်ငွေ" : "Set opening mobile (MMK)"}</span>
                    <input
                      className="tx-input mono"
                      type="number"
                      value={mmkInputs.openingMobileInput}
                      onChange={(e) => setField("openingMobileInput", e.target.value)}
                      placeholder={lang === "mm" ? "Blank ထားလို့ရပါတယ် mobile banking အတွက် မထည့်ဖြစ်ဘူးဆိုရင်" : "Leave blank if not tracking"}
                      disabled={!!data.isClosed}
                    />
                  </label>

                  <button onClick={setOpening} className="tx-btn tx-btn--primary" type="button" disabled={!!data.isClosed}>
                    {t("saveOpening")}
                  </button>

                  {/* ✅ success under opening card */}
                  {cashOpenMsg ? (
                    <div style={{ marginTop: 10 }} className="rp-alert rp-alert--ok">
                      <div className="rp-alert__body">{cashOpenMsg}</div>
                    </div>
                  ) : null}
                </div>

                {/* CLOSING */}
                <div className="bal-admin-block">
                  <label className="bal-field">
                    <span>{lang === "mm" ? "ယနေ့အတွက်အပိတ်ငွေ" : "Close day CASH (MMK)"}</span>
                    <input
                      className="tx-input mono"
                      type="number"
                      value={mmkInputs.closingInput}
                      onChange={(e) => setField("closingInput", e.target.value)}
                      placeholder={
                        data?.suggestedClosingMMK == null
                          ? "e.g. 13000000"
                          : `Suggested: ${data.suggestedClosingMMK}`
                      }
                      disabled={!!data.isClosed}
                    />
                  </label>

                  <label className="bal-field">
                    <span>{lang === "mm" ? "Mobile banking အတွက်အပိတ်ငွေ" : "Close day MOBILE (MMK) (optional)"}</span>
                    <input
                      className="tx-input mono"
                      type="number"
                      value={mmkInputs.closingMobileInput}
                      onChange={(e) => setField("closingMobileInput", e.target.value)}
                      placeholder={
                        data?.suggestedClosingMobileMMK == null
                          ? (lang === "mm" ? "Blank ထားလို့ရပါတယ် mobile banking အတွက် မထည့်ဖြစ်ဘူးဆိုရင်" : "Leave blank if not tracking")
                          : `Suggested: ${data.suggestedClosingMobileMMK}`
                      }
                      disabled={!!data.isClosed}
                    />
                  </label>

                  <div className="bal-admin-actions">
                    <button onClick={closeDay} className="tx-btn tx-btn--danger" type="button" disabled={!!data.isClosed}>
                      {t("closeDay")}
                    </button>

                    <button onClick={reopenDay} className="tx-btn tx-btn--ghost" type="button" disabled={!data.isClosed}>
                      {t("reopenDay")}
                    </button>
                  </div>

                  <div className="bal-hint">
                    {lang === "mm"
                      ? "Closing ကို Blank ထားရင် Suggested closing နဲ့ပိတ်ပေးပါမယ်"
                      : "If Closing is blank, it will close using the Suggested Closing (if available)."}
                  </div>

                  {/* ✅ success under closing card */}
                  {cashCloseMsg ? (
                    <div style={{ marginTop: 10 }} className="rp-alert rp-alert--ok">
                      <div className="rp-alert__body">{cashCloseMsg}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="bal-muted">Only admin can set opening/closing balances.</div>
          )}
        </>
      ) : null}
    </div>
  );
}