import { Icons } from "../icons.jsx";
import { websiteOrigin } from "../api/website-client.js";

export default function WebsitePageHeader({ title, description, children }) {
  return (
    <div className="website-page-heading">
      <div>
        <h1 className="pp-page-title">{title}</h1>
        <p className="pp-page-lead">{description}</p>
      </div>
      <div className="website-header-actions">
        {children}
        <a
          href={websiteOrigin}
          target="_blank"
          rel="noreferrer"
          className="pp-btn"
        >
          View website <Icons.arrowUpRight size={15} />
        </a>
      </div>
    </div>
  );
}

export function WebsiteError({ query }) {
  if (!query.error) return null;
  const message = query.error.message || "Website data could not be loaded.";
  const isSetup = /DB D1 binding|Website data is not connected/i.test(
    message,
  );

  return (
    <div className="query-error" role="alert">
      <strong>Website data could not be loaded</strong>
      <p>{message}</p>
      {isSetup && (
        <p className="setup-hint">
          Add the <code>DB</code> D1 binding to the Website Cloudflare Pages
          project, then redeploy it.
        </p>
      )}
      <button className="pp-btn" onClick={() => query.refetch()}>
        Try again
      </button>
    </div>
  );
}
