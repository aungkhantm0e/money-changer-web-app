import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import useT from "../useT";

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? "");
  return num.toLocaleString("en-US");
}

export default function RatesPage() {
  const {t,lang}=useT();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [deletingCode, setDeletingCode] = useState("");

  // New currency form
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newBuy, setNewBuy] = useState("");
  const [newSell, setNewSell] = useState("");

  async function load() {
    setError("");
    setMsg("");
    setLoading(true);
    try {
      const res = await axios.get("/api/currencies");
      setRows(
        (res.data || []).map((r) => ({
          ...r,
          _buy: String(r.buy_rate),
          _sell: String(r.sell_rate),
          _active: !!r.is_active,
          _dirty: false,
        }))
      );
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateRow(code, patch) {
    setRows((prev) =>
      prev.map((r) => (r.code === code ? { ...r, ...patch, _dirty: true } : r))
    );
  }

  async function saveRow(code) {
    setError("");
    setMsg("");
    const row = rows.find((r) => r.code === code);
    if (!row) return;

    const buy = Number(row._buy);
    const sell = Number(row._sell);
    if (!Number.isFinite(buy) || buy <= 0) return setError("Buy rate must be > 0");
    if (!Number.isFinite(sell) || sell <= 0) return setError("Sell rate must be > 0");

    setSavingCode(code);
    try {
      await axios.put(`/api/admin/currencies/${code}`, {
        buy_rate: buy,
        sell_rate: sell,
        is_active: row._active,
      });
      setMsg(`Saved ${code}`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setSavingCode("");
    }
  }

  async function deleteRow(code) {
    setError("");
    setMsg("");

    const ok = window.confirm(`Delete currency ${code}? This cannot be undone.`);
    if (!ok) return;

    setDeletingCode(code);
    try {
      await axios.delete(`/api/admin/currencies/${code}`);
      setMsg(`Deleted ${code}`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setDeletingCode("");
    }
  }

  async function createCurrency(e) {
    e.preventDefault();
    setError("");
    setMsg("");

    const code = newCode.trim().toUpperCase();
    const name = newName.trim();
    const buy = Number(newBuy);
    const sell = Number(newSell);

    if (!code) return setError("Currency code is required (e.g. USD)");
    if (!name) return setError("Currency name is required");
    if (!Number.isFinite(buy) || buy <= 0) return setError("Buy rate must be > 0");
    if (!Number.isFinite(sell) || sell <= 0) return setError("Sell rate must be > 0");

    try {
      await axios.post("/api/admin/currencies", {
        code,
        name,
        buy_rate: buy,
        sell_rate: sell,
        is_active: true,
      });
      setMsg(`Created ${code}`);
      setNewCode("");
      setNewName("");
      setNewBuy("");
      setNewSell("");
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.error || e2.message);
    }
  }

  const dirtyCount = useMemo(() => rows.filter((r) => r._dirty).length, [rows]);

  if (loading) {
    return (
      <div className="rates-page">
        <div className="mc-card rates-loading">
          <div className="rates-loading__title">Loading rates…</div>
          <div className="rates-loading__sub">Fetching currencies and editable rates.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rates-page">
      {/* Header */}
      <div className="rates-header">
        <div>
          <h1 className="rates-title">{t("foreign_currencies")}</h1>
          <div className="rates-subtitle">
            {lang==="mm"?"Currency အသစ်ထည့်ရန် နှင့် Foreign Currency များ ရဲ့ Buy/Sell သတ်မှတ်ရန်":"Admin panel • Edit buy/sell • Toggle active • Add / delete currencies"}
          </div>
        </div>

        <div className="rates-header-right">
          <div className="rates-meta">
            <div className="rates-meta__label">{t("editableRows")}</div>
            <div className="rates-meta__value">{formatNumber(rows.length)}</div>
          </div>
          <div className="rates-meta">
            <div className="rates-meta__label">{t("unsavedChanges")}</div>
            <div className={"rates-meta__value " + (dirtyCount ? "rates-warn" : "")}>
              {formatNumber(dirtyCount)}
            </div>
          </div>

          <button onClick={load} className="tx-btn tx-btn--ghost" type="button" title="Refresh">
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error ? (
        <div className="tx-alert tx-alert--danger">
          <div className="tx-alert__title">Action failed</div>
          <div className="tx-alert__body">{error}</div>
        </div>
      ) : null}

      {msg ? (
        <div className="tx-alert tx-alert--ok">
          <div className="tx-alert__title">Success</div>
          <div className="tx-alert__body">{msg}</div>
        </div>
      ) : null}

      {/* Create card */}
      <div className="mc-card rates-create">
        <div className="rates-create-head">
          <div>
            <div className="rates-section-title">{t("addCurrency")}</div>
          </div>
        </div>

        <form onSubmit={createCurrency} className="rates-form">
          <label className="rates-field">
            <span>Code</span>
            <input
              className="tx-input"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="USD"
              maxLength={10}
            />
          </label>

          <label className="rates-field">
            <span>Name</span>
            <input
              className="tx-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="US Dollar"
            />
          </label>

          <label className="rates-field">
            <span>Buy rate</span>
            <input
              className="tx-input mono"
              value={newBuy}
              onChange={(e) => setNewBuy(e.target.value)}
              placeholder="3300"
              inputMode="decimal"
            />
          </label>

          <label className="rates-field">
            <span>Sell rate</span>
            <input
              className="tx-input mono"
              value={newSell}
              onChange={(e) => setNewSell(e.target.value)}
              placeholder="3350"
              inputMode="decimal"
            />
          </label>

          <button className="tx-btn tx-btn--primary rates-add" type="submit">
            Add Currency
          </button>
        </form>
      </div>

      {/* Table card */}
      <div className="mc-card rates-table-card">
        <div className="rates-table-head">
          <div>
            <div className="rates-section-title">{t("foreign_currencies")}</div>
            <div className="rates-section-sub">Edit inline, then save per-row.</div>
          </div>
          <div className="rates-hint">Tip: “Save” is enabled only after you change something.</div>
        </div>

        <div className="rates-table-wrap">
          <table className="rates-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Buy</th>
                <th>Sell</th>
                <th>Active</th>
                <th className="rates-actions-col">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const isSaving = savingCode === r.code;
                const isDeleting = deletingCode === r.code;

                return (
                  <tr key={r.code} className={r._dirty ? "rates-dirty" : ""}>
                    <td className="mono">
                      <b>{r.code}</b>
                    </td>

                    <td>{r.name}</td>

                    <td className="mono">
                      <input
                        className="tx-input tx-input--sm mono rates-num"
                        value={r._buy}
                        onChange={(e) => updateRow(r.code, { _buy: e.target.value })}
                      />
                    </td>

                    <td className="mono">
                      <input
                        className="tx-input tx-input--sm mono rates-num"
                        value={r._sell}
                        onChange={(e) => updateRow(r.code, { _sell: e.target.value })}
                      />
                    </td>

                    <td>
                      <label className="rates-check">
                        <input
                          type="checkbox"
                          checked={r._active}
                          onChange={(e) => updateRow(r.code, { _active: e.target.checked })}
                        />
                        <span>{r._active ? "Active" : "Inactive"}</span>
                      </label>
                    </td>

                    <td className="rates-actions">
                      <button
                        onClick={() => saveRow(r.code)}
                        disabled={!r._dirty || isSaving || isDeleting}
                        className="tx-btn tx-btn--primary"
                        type="button"
                        title={!r._dirty ? "Make a change first" : "Save row"}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </button>

                      <button
                        onClick={() => deleteRow(r.code)}
                        disabled={isDeleting || isSaving}
                        className="tx-btn tx-btn--danger"
                        type="button"
                        title="Delete currency"
                      >
                        {isDeleting ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}