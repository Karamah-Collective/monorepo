import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BrandLoadingScreen } from "../components/BrandLoadingScreen.jsx";
import { useAuth } from "./AuthContext.jsx";
import { can, canRoute } from "./permissions.js";

export default function AuthGuard() {
  const { user, loading, access } = useAuth();
  const location = useLocation();

  if (loading) return <BrandLoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  const providerId = user.providerData?.[0]?.providerId;
  if ((!providerId || providerId === "password") && !user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!access?.roleId) return <Navigate to="/login" state={{ accessDenied: true }} replace />;
  const requiredPath = location.pathname;
  if (!canRoute(access, requiredPath) && !(requiredPath.startsWith("/forms/") && can(access, "forms.create"))) return <Navigate to="/" replace />;

  return <Outlet />;
}
