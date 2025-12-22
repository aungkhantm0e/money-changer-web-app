import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function LoginPage({ onLoggedIn }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await axios.post("/api/auth/login", { username, password });
      onLoggedIn(res.data);
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    }
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <h3 style={{ marginTop: 0 }}>Login</h3>
      <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: 10 }} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 10 }} />
        </label>
        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}
        <button style={{ padding: 12, fontSize: 16 }}>Login</button>
      </form>
    </div>
  );
}