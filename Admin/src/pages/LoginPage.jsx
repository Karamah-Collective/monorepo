import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import AuthLayout from "../components/AuthLayout.jsx";

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user)
    return <Navigate to={location.state?.from?.pathname || "/"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError("We could not sign you in. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <form className="pp-auth-card" onSubmit={handleSubmit}>
        <div className="eyebrow">SECURE ADMIN ACCESS</div>
        <h1>Welcome back to the Collective.</h1>
        <p className="auth-description">
          Sign in to manage the map, website content, team profiles, and
          update signups.
        </p>
        <div className="pp-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>
        <div className="pp-field">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="pp-error-text">{error}</div>}
        <button
          className="pp-btn pp-btn-primary"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <div className="pp-auth-switch">
          Don't have an account? <Link to="/signup">Sign up</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
