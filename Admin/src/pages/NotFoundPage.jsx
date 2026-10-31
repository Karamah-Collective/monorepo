import { Link } from "react-router-dom";
export default function NotFoundPage() { return <main className="admin-not-found"><p className="page-eyebrow">404 · ADMIN</p><h1>That workspace page is not available.</h1><p>Return to the dashboard, or use the navigation to continue your work.</p><Link className="pp-btn pp-btn-primary" to="/">Open dashboard</Link></main>; }
