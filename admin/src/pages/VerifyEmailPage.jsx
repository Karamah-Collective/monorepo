import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "../auth/AuthContext.jsx";
import { auth } from "../firebase.js";

export default function VerifyEmailPage() {
  const { user, reloadUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");

  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/" replace />;

  async function handleResend() {
    setStatus("Sending…");
    try {
      await sendEmailVerification(auth.currentUser);
      setStatus("Verification email sent.");
    } catch {
      setStatus("Could not send email — try again shortly.");
    }
  }

  async function handleCheck() {
    setStatus("Checking…");
    await reloadUser();
    if (auth.currentUser?.emailVerified) {
      navigate("/", { replace: true });
    } else {
      setStatus("Not verified yet — check your inbox and click the link.");
    }
  }

  return (
    <div className="pp-auth-screen">
      <div className="pp-auth-card">
        <h1>Verify your email</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
          We sent a verification link to <strong style={{ color: "var(--text)" }}>{user.email}</strong>. Click it,
          then come back and press "I've verified."
        </p>
        {status && <div className="pp-error-text">{status}</div>}
        <button className="pp-btn pp-btn-primary" onClick={handleCheck}>
          I've verified, continue
        </button>
        <div className="pp-auth-switch">
          <button className="pp-btn pp-btn-text" onClick={handleResend}>
            Resend verification email
          </button>
        </div>
      </div>
    </div>
  );
}
