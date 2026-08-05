import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function AuthGuard() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="pp-loading-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;

  return <Outlet />;
}
