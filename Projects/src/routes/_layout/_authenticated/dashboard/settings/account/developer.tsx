import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/developer",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({
      to: "/dashboard/settings/account/security",
      replace: true,
    });
  }, [navigate]);

  return null;
}
