import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
function GoogleMark() { return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.2c1.9-1.8 3.1-4.3 3.1-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 .9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.7A6 6 0 0 1 5.9 12c0-.6.1-1.1.3-1.7V7.7H2.9A10 10 0 0 0 2 12c0 1.6.4 3.1.9 4.3l3.3-2.6Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.9.5 3.9 1.5l2.9-2.9C17 2.9 14.8 2 12 2a10 10 0 0 0-9.1 5.7l3.3 2.6C7 7.8 9.3 6 12 6Z"/></svg>; }

export default function LoginPage() {
  const { user, access, signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const accessMessage = location.state?.accessDenied ? "Your account is signed in, but an administrator has not assigned it a workspace role yet." : "";

  if (user && access?.roleId)
    return <Navigate to={location.state?.from?.pathname || "/"} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err?.message === "Email not verified" ? "Verify your email address before entering the admin panel." : "We could not sign you in. Check your email and password.");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleGoogle() {
    setError(""); setSubmitting(true);
    try { await signInWithGoogle(); navigate(location.state?.from?.pathname || "/", { replace: true }); }
    catch (err) { setError(err.message || "We could not sign you in with Google."); }
    finally { setSubmitting(false); }
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
        <button className="pp-btn pp-btn-primary auth-google" type="button" onClick={handleGoogle} disabled={submitting}>
          <GoogleMark /> Continue with Google
        </button>
        <div className="auth-divider"><span>or use email and password</span></div>
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
        {(error || accessMessage) && <div className="pp-error-text">{error || accessMessage}</div>}
        <button
          className="pp-btn"
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
