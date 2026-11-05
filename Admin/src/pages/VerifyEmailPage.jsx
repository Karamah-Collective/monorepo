import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "../auth/AuthContext.jsx";
import { auth } from "../firebase.js";
import AuthLayout from "../components/AuthLayout.jsx";

export default function VerifyEmailPage() {
  const { user, reloadUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("");

  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/" replace />;

  async function handleResend() {
    setStatus("Sending...");
    try {
      await sendEmailVerification(auth.currentUser);
      setStatus("Verification email sent.");
    } catch {
      setStatus("Could not send email. Try again shortly.");
    }
  }

  async function handleCheck() {
    setStatus("Checking...");
    await reloadUser();
    if (auth.currentUser?.emailVerified) {
      navigate("/", { replace: true });
    } else {
      setStatus("Not verified yet. Check your inbox and click the link.");
    }
  }

  return (
    <AuthLayout>
      <div className="pp-auth-card">
        <h1>Verify your Collective email.</h1>
        <p
          style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}
        >
          We sent a verification link to{" "}
          <strong style={{ color: "var(--text)" }}>{user.email}</strong>. Click
          it, then return here to continue into the admin workspace.
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
    </AuthLayout>
  );
}
