import { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import axios from "axios";
import NewTransactionPage from "./pages/NewTransactionPage.jsx";
import ReceiptPage from "./pages/ReceiptPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RatesPage from "./pages/RatesPage.jsx";
import TransactionsPage from "./pages/TransactionsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import BalancesPage from "./pages/BalancesPage.jsx";
import DailyReportPage from "./pages/DailyReportPage.jsx";
import MonthlyReportPage from "./pages/MonthlyReportPage.jsx";
import YearlyReportPage from "./pages/YearlyReportPage.jsx";

export default function App() {
  const [me, setMe] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get("/api/auth/me")
      .then((res) => setMe(res.data))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    await axios.post("/api/auth/logout");
    setMe(null);
    navigate("/login");
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Money Changer</h2>

        {me ? (
          <>
            <nav style={{ display: "flex", gap: 12 }}>
              <Link to="/">New Transaction</Link>
              <Link to="/transactions">Transactions</Link>
              <Link to="/reports">Reports</Link>
              {me?.role === "admin" ? <Link to="/daily-report">Daily Report</Link> : null}
              {me?.role === "admin" ?<Link to="/monthly-report">Monthly Print</Link> : null}
              {me?.role === "admin" ?<Link to="/yearly-report">Yearly Print</Link> : null}
              {me?.role === "admin" ? <Link to="/rates">Rates</Link> : null}
              {me?.role === "admin" ? <Link to="/balances">Balances</Link> : null}
            </nav>
            <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
              <span>
                {me.fullName} ({me.role})
              </span>
              <button onClick={logout}>Logout</button>
            </div>
          </>
        ) : (
          <div style={{ marginLeft: "auto" }}>
            <Link to="/login">Login</Link>
          </div>
        )}
        
      </header>

      <Routes>
        <Route path="/login" element={<LoginPage onLoggedIn={setMe} />} />
        <Route path="/" element={me ? <NewTransactionPage /> : <LoginGate />} />
        <Route path="/receipt/:id" element={me ? <ReceiptPage /> : <LoginGate />} />
        <Route path="/rates" element={me?.role === "admin" ? <RatesPage /> : <LoginGate />} />
        <Route path="/transactions" element={me ? <TransactionsPage /> : <LoginGate />} />
        <Route path="/reports" element={me ? <ReportsPage /> : <LoginGate />} />
        <Route path="/balances" element={me?.role === "admin" ? <BalancesPage /> : <LoginGate />} />
        <Route path="/daily-report" element={me ? <DailyReportPage /> : <LoginGate />} />
        <Route path="/monthly-report" element={me ? <MonthlyReportPage /> : <LoginGate />} />
        <Route path="/yearly-report" element={me ? <YearlyReportPage /> : <LoginGate />} />
      </Routes>
    </div>
  );
}

function LoginGate() {
  return (
    <div>
      Please <Link to="/login">login</Link>.
    </div>
  );
}