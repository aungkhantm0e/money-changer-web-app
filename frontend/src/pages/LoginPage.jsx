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
  <div className="login-wrapper">
    <div className="login-card">
      <h3>Login</h3>

      <form onSubmit={handleLogin} className="login-form">
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit">Login</button>
      </form>
    </div>
  </div>
);
}