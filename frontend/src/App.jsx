import { useEffect, useState } from "react";
import "./App.css";
import { Routes, Route, Link, useNavigate, NavLink, Navigate, useLocation } from "react-router-dom";
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
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
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
  <div className="app-shell">
    {/* LEFT SIDE: page content */}
    <main className="app-content">
     <Routes>
      <Route
        path="/login"
        element={me ? <Navigate to="/" replace /> : <LoginPage onLoggedIn={setMe} />}
      />

      <Route
        path="/"
        element={
          <RequireAuth me={me}>
            <NewTransactionPage />
          </RequireAuth>
        }
      />

      <Route
        path="/receipt/:id"
        element={
          <RequireAuth me={me}>
            <ReceiptPage />
          </RequireAuth>
        }
      />

      <Route
        path="/rates"
        element={
          me?.role === "admin" ? <RatesPage /> : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/transactions"
        element={
          <RequireAuth me={me}>
            <TransactionsPage />
          </RequireAuth>
        }
      />

      <Route
        path="/reports"
        element={
          <RequireAuth me={me}>
            <ReportsPage />
          </RequireAuth>
        }
      />

      <Route
        path="/balances"
        element={
          me?.role === "admin" ? <BalancesPage /> : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/daily-report"
        element={
          <RequireAuth me={me}>
            <DailyReportPage />
          </RequireAuth>
        }
      />

      <Route
        path="/monthly-report"
        element={
          <RequireAuth me={me}>
            <MonthlyReportPage />
          </RequireAuth>
        }
      />

      <Route
        path="/yearly-report"
        element={
          <RequireAuth me={me}>
            <YearlyReportPage />
          </RequireAuth>
        }
      />
    </Routes>
    </main>

    {/* RIGHT SIDE: stacked nav */}
    {me && !isLoginPage ? (
      <aside className="app-nav">
        <div className="nav-top">
          <h2 className="brand">Money Changer</h2>
          <div className="me">
            {me.fullName} ({me.role})
          </div>
        </div>

        <NavLink to="/" className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}>
          New Transaction
        </NavLink>
        <NavLink
          to="/transactions"
          className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
        >
          Transactions
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
        >
          Reports
        </NavLink>

        {me.role === "admin" && (
          <>
            <div className="nav-divider" />

            <NavLink
              to="/daily-report"
              className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
            >
              Daily Report
            </NavLink>
            <NavLink
              to="/monthly-report"
              className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
            >
              Monthly Report
            </NavLink>
            <NavLink
              to="/yearly-report"
              className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
            >
              Yearly Report
            </NavLink>
            <NavLink
              to="/rates"
              className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
            >
              Rates
            </NavLink>
            <NavLink
              to="/balances"
              className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
            >
              Balances
            </NavLink>
          </>
        )}

        <div className="nav-footer">
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>
    ) : null}
  </div>
);
}

function RequireAuth({ me, children }) {
  if (!me) {
    return <Navigate to="/login" replace />;
  }
  return children;
}