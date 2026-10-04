import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BrandLoadingScreen } from "../components/BrandLoadingScreen.jsx";
import { useAuth } from "./AuthContext.jsx";
import { can, ROUTE_PERMISSION } from "./permissions.js";

export default function AuthGuard() {
  const { user, loading, access } = useAuth();
  const location = useLocation();

  if (loading) return <BrandLoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace />;
  if (!access?.roleId) return <Navigate to="/login" state={{ accessDenied: true }} replace />;
  const requiredPermission = ROUTE_PERMISSION[location.pathname] || (location.pathname.startsWith("/forms/") ? "forms.create" : "dashboard.view");
  if (!can(access, requiredPermission)) return <Navigate to="/" replace />;

  return <Outlet />;
}
