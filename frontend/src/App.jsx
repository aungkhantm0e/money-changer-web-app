import { useEffect, useMemo, useState } from "react";
import "./App.css";
import Logo from "./assets/money-changer-icon.svg";
import {
  Routes,
  Route,
  NavLink,
  Navigate,
  useNavigate,
  Outlet,
  useLocation,
} from "react-router-dom";
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
import LanguageButton from "./components/LanguageButton.jsx";
import useT from "./useT.js"

function useIsSmallScreen() {
  const [small, setSmall] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e) => setSmall(e.matches);

    // Safari fallback
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    setSmall(mq.matches);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  return small;
}

/** inline SVG icons (no deps) */
function Icon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    history: <path d="M12 8v4l3 3M21 12a9 9 0 1 1-9-9" />,
    report: <path d="M4 19V5M4 19h16M8 15V9M12 19V7M16 13v-4" />,
    calendar: <path d="M7 3v3M17 3v3M4 8h16M5 8v13h14V8" />,
    rates: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    wallet: <path d="M3 7h18v12H3zM17 11h4" />,
    logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  };

  return <svg {...common}>{paths[name] || null}</svg>;
}

export default function App() {
  const {t,lang}=useT();
  const [me, setMe] = useState(null);
  const [booting, setBooting] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    setBooting(true);

    axios
      .get("/api/auth/me")
      .then((res) => {
        if (!alive) return;
        setMe(res.data);
      })
      .catch(() => {
        if (!alive) return;
        setMe(null);
      })
      .finally(() => {
        if (!alive) return;
        setBooting(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    await axios.post("/api/auth/logout");
    setMe(null);
    navigate("/login");
  }

  const navItems = useMemo(() => {   
    const base = [
      { to: "/", label: t("newTransaction"), icon: "plus" },
      { to: "/transactions", label: t("transactions"), icon: "history" },
      { to: "/reports", label: t("reports"), icon: "report" },
    ];

    if (me?.role === "admin") {
      base.push(
        { to: "/daily-report", label: t("dailyReport"), icon: "calendar" },
        { to: "/monthly-report", label: t("monthlyReport"), icon: "calendar" },
        { to: "/yearly-report", label: t("yearlyReport"), icon: "calendar" },
        { to: "/rates", label: t("foreign_currencies"), icon: "rates" },
        { to: "/balances", label: t("balances"), icon: "wallet" }
      );
    }
    return base;
  }, [me?.role, lang, t]);

  if (booting) {
    return (
      <div className="boot">
        <div className="boot-card">
          <div className="brand-mark">💱</div>
          <div className="boot-title">Money Changer</div>
          <div className="boot-sub">Loading…</div>
          <div className="boot-bar" />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={me ? <Navigate to="/" replace /> : <LoginPage onLoggedIn={setMe} />}
      />

      <Route
        element={
          <RequireAuth me={me}>
            <AppShell me={me} navItems={navItems} onLogout={logout} />
          </RequireAuth>
        }
      >
        <Route path="/" element={<NewTransactionPage />} />
        <Route path="/receipt/:id" element={<ReceiptPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/balances" element={<BalancesPage />} />
        <Route path="/rates" element={<RatesPage />} />
        <Route path="/daily-report" element={<DailyReportPage />} />
        <Route path="/monthly-report" element={<MonthlyReportPage />} />
        <Route path="/yearly-report" element={<YearlyReportPage />} />
      </Route>
    </Routes>
  );
}

function AppShell({ me, navItems, onLogout }) {
  const {t}=useT();
  const isSmall = useIsSmallScreen();
  const location = useLocation();

  // ONE state for all devices:
  // collapsed=true => icons-only rail
  // collapsed=false => expanded sidebar (mobile shows overlay + slides over content)
  const [collapsed, setCollapsed] = useState(true);

  // When entering small screen, default to collapsed rail (icons)
  useEffect(() => {
    if (isSmall) setCollapsed(true);
  }, [isSmall]);

  // On route change: on mobile/tablet, auto-collapse back to icons
  useEffect(() => {
    if (isSmall) setCollapsed(true);
  }, [location.pathname, isSmall]);

  const expanded = !collapsed;

  function toggleSidebar() {
    setCollapsed((v) => !v);
  }

  return (
    <div className={"shell" + (collapsed ? " is-collapsed" : " is-expanded")}>
      {/* overlay ONLY on mobile/tablet and ONLY when expanded */}
      <div
        className={"overlay" + (isSmall && expanded ? " show" : "")}
        onClick={() => setCollapsed(true)}
      />

      <aside className="sidebar">
        <button className="logo-btn" type="button" onClick={toggleSidebar}>
          <div className="logo">
            <div className="logo-mark"><img src={Logo} alt="Logo" style={{width:42,height:42}}/></div>
            <div className="logo-text">
              <div className="logo-name">Money Changer</div>
              <div className="logo-sub">{me?.role === "admin" ? "Admin Desk" : "Exchange Desk"}</div>
            </div>
          </div>
        </button>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            >
              <span className="nav-icon">
                <Icon name={item.icon} />
              </span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="ghost-btn" type="button" onClick={onLogout}>
            <span className="btn-icon">
              <Icon name="logout" />
            </span>
            <span>{t("logout")}</span>
          </button>
          <LanguageButton/>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function RequireAuth({ me, children }) {
  if (!me) return <Navigate to="/login" replace />;
  return children;
}