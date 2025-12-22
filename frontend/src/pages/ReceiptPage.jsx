import { useEffect, useState } from "react";
import axios from "axios";
import { useParams, Link } from "react-router-dom";

export default function ReceiptPage() {
  const { id } = useParams();
  const [tx, setTx] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get(`/api/transactions/${id}`)
      .then((res) => setTx(res.data))
      .catch((err) => setError(err?.response?.data?.error || err.message));
  }, [id]);

  // auto print once loaded
  useEffect(() => {
    if (tx) {
      setTimeout(() => window.print(), 300);
    }
  }, [tx]);

  if (error) return <div style={{ color: "crimson" }}>{error}</div>;
  if (!tx) return <div>Loading receipt…</div>;

  const typeText =
    tx.type === "SELL"
      ? "SELL (customer buys foreign currency)"
      : "BUY (customer sells foreign currency)";

  return (
    <div style={{ maxWidth: 400 }}>
      <div style={{ marginBottom: 12 }}>
        <Link to="/">← New Transaction</Link>
      </div>

      <div style={{ border: "1px solid #000", padding: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>Money Changer</h3>
        <div style={{ fontSize: 13 }}>Receipt ID: {tx.id}</div>
        <div style={{ fontSize: 13 }}>Date: {new Date(tx.date_time).toLocaleString()}</div>
        <hr />

        <div>Type: <b>{typeText}</b></div>
        <div>Currency: <b>{tx.currency_code}</b></div>
        <div>Foreign Amount: <b>{tx.foreign_amount}</b></div>
        <div>Rate: <b>{tx.rate}</b> MMK</div>
        <div style={{ marginTop: 8, fontSize: 16 }}>
          Total MMK: <b>{tx.mmk_amount}</b>
        </div>

        <hr />
        <div style={{ fontSize: 13 }}>Customer: {tx.customer_name || "-"}</div>
        <div style={{ fontSize: 13 }}>Cashier: {tx.created_by || "-"}</div>
      </div>

      {/* Print-only tips could go later */}
    </div>
  );
}