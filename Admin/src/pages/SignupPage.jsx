import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { ADMIN_EMAIL_DOMAIN } from "../firebase.js";
import PasswordInput from "../components/PasswordInput.jsx";
import AuthLayout from "../components/AuthLayout.jsx";
function GoogleMark() { return <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.5h3.2c1.9-1.8 3.1-4.3 3.1-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 .9-3.5.9-2.7 0-5-1.8-5.8-4.3H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.2 13.7A6 6 0 0 1 5.9 12c0-.6.1-1.1.3-1.7V7.7H2.9A10 10 0 0 0 2 12c0 1.6.4 3.1.9 4.3l3.3-2.6Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.9.5 3.9 1.5l2.9-2.9C17 2.9 14.8 2 12 2a10 10 0 0 0-9.1 5.7l3.3 2.6C7 7.8 9.3 6 12 6Z"/></svg>; }

export default function SignupPage() {
  const { user, access, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user && access?.roleId) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail.endsWith(ADMIN_EMAIL_DOMAIN)) {
      setError(
        `Please use your ${ADMIN_EMAIL_DOMAIN} email address to sign up.`,
      );
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signUp(name.trim(), trimmedEmail, password);
      navigate("/verify-email", { replace: true });
    } catch (err) {
      setError(err.message || "Could not create your account.");
    } finally {
      setSubmitting(false);
    }
  }
  async function handleGoogle() {
    setError(""); setSubmitting(true);
    try { await signInWithGoogle(); navigate("/", { replace: true }); }
    catch (err) { setError(err.message || "We could not continue with Google."); }
    finally { setSubmitting(false); }
  }

  return (
    <AuthLayout>
      <form className="pp-auth-card" onSubmit={handleSubmit}>
        <div className="eyebrow">JOIN THE ADMIN TEAM</div>
        <h1>Create your Collective account.</h1>
        <p className="auth-description">
          Use your Karamah Collective email to request access to the admin
          workspace.
        </p>
        <button className="pp-btn pp-btn-primary auth-google" type="button" onClick={handleGoogle} disabled={submitting}>
          <GoogleMark /> Continue with Google
        </button>
        <div className="auth-divider"><span>or create an email password</span></div>
        <div className="pp-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="pp-field">
          <label htmlFor="email">Email ({ADMIN_EMAIL_DOMAIN})</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="pp-field">
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="pp-error-text">{error}</div>}
        <button
          className="pp-btn"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Creating account..." : "Sign up"}
        </button>
        <div className="pp-auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
