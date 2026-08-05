import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={location.state?.from?.pathname || "/"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError("Could not sign in — check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pp-auth-screen">
      <form className="pp-auth-card" onSubmit={handleSubmit}>
        <h1>Sign in to Karamah Maps Admin</h1>
        <div className="pp-field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="pp-field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="pp-error-text">{error}</div>}
        <button className="pp-btn pp-btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <div className="pp-auth-switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </div>
      </form>
    </div>
  );
}
