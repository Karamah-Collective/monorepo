import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { ADMIN_EMAIL_DOMAIN } from "../firebase.js";
import PasswordInput from "../components/PasswordInput.jsx";
import AuthLayout from "../components/AuthLayout.jsx";

export default function SignupPage() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

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

  return (
    <AuthLayout>
      <form className="pp-auth-card" onSubmit={handleSubmit}>
        <div className="eyebrow">JOIN THE ADMIN TEAM</div>
        <h1>Create your Collective account.</h1>
        <p className="auth-description">
          Use your Karamah Collective email to request access to the admin
          workspace.
        </p>
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
          className="pp-btn pp-btn-primary"
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
