import { Outlet } from "react-router-dom";
import Nav from "./Nav.jsx";

export default function AppLayout() {
  return (
    <div className="pp-app-shell">
      <Nav />
      <main className="pp-main">
        <Outlet />
      </main>
    </div>
  );
}
