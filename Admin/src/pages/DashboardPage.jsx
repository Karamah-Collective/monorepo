import { Link } from "react-router-dom";
import { useAdminStats, useAdminLog } from "../api/queries.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Icons } from "../icons.jsx";
import { LoadingState } from "../components/QueryState.jsx";

const QUEUES = [
  {
    key: "pendingNew",
    title: "New places",
    description: "Community submissions ready for a first look",
    icon: "plusCircle",
    to: "/submissions/new",
  },
  {
    key: "pendingEdits",
    title: "Place edits",
    description: "Updates to existing places on the map",
    icon: "pencil",
    to: "/submissions/edits",
  },
  {
    key: "pendingEvents",
    title: "Events",
    description: "Upcoming gatherings awaiting approval",
    icon: "calendar",
    to: "/events",
  },
  {
    key: "pendingEventEdits",
    title: "Event edits",
    description: "Changes to dates, times, and event details",
    icon: "calendar",
    to: "/events/edits",
  },
  {
    key: "pendingWishes",
    title: "Community wishes",
    description: "Ideas and requests from the community",
    icon: "heart",
    to: "/wishes",
  },
];
const TYPES = [
  { key: "restaurant", label: "Food & restaurants", icon: "utensils" },
  { key: "space", label: "Community spaces", icon: "building" },
  { key: "service", label: "Shops & services", icon: "bag" },
];
const number = (value) => Number(value || 0).toLocaleString();

function Activity() {
  const { data, isLoading, error, refetch } = useAdminLog();
  const entries = data?.entries?.slice(0, 5) || [];
  return (
    <section className="dashboard-panel activity-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">TEAM WORKSPACE</span>
          <h2>Recent activity</h2>
        </div>
        <Link className="text-link" to="/log">
          View log <Icons.arrowUpRight size={15} />
        </Link>
      </div>
      {isLoading ? (
        <LoadingState compact />
      ) : error ? (
        <div className="inline-empty" role="alert">
          Could not load activity.{" "}
          <button className="pp-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : entries.length ? (
        <div className="activity-list">
          {entries.map((entry) => {
            const name = entry.actorName || entry.actorEmail || "Administrator";
            const date = new Date(entry.createdAt);
            return (
              <div className="activity-row" key={entry.id}>
                <span className="activity-avatar">
                  {name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{name}</strong>
                  <span>
                    {String(entry.action).replace(/[-_]/g, " ")}
                    {entry.targetId ? ` · ${entry.targetId}` : ""}
                  </span>
                </div>
                <span
                  className={`activity-result${entry.success ? "" : " failed"}`}
                >
                  {entry.success ? <Icons.check size={15} /> : "Failed"}
                </span>
                <time
                  dateTime={entry.createdAt}
                  title={
                    Number.isNaN(date.getTime())
                      ? entry.createdAt
                      : date.toLocaleString()
                  }
                >
                  {Number.isNaN(date.getTime())
                    ? "—"
                    : date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                </time>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="inline-empty">
          <Icons.list size={26} />
          <strong>A fresh start</strong>
          <span>
            Approvals and updates will appear here as your team works.
          </span>
        </div>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } =
    useAdminStats();
  const { user } = useAuth();
  const pending = QUEUES.reduce(
    (sum, item) => sum + Number(data?.[item.key] || 0),
    0,
  );
  const reviewTarget =
    QUEUES.find((item) => data?.[item.key] > 0)?.to || "/submissions/new";
  const typeTotal = TYPES.reduce(
    (sum, type) => sum + Number(data?.byType?.[type.key] || 0),
    0,
  );
  const other = Math.max(0, Number(data?.totalPlaces || 0) - typeTotal);
  const categories = other
    ? [...TYPES, { key: "other", label: "Other places", icon: "pin" }]
    : TYPES;
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="pp-page dashboard-page">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">YOUR COMMUNITY, AT A GLANCE</div>
          <h1 className="pp-page-title">
            Workspace overview<span className="heading-dot">.</span>
          </h1>
          <p>
            Welcome back
            {user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}.
            Here’s what’s happening on your map.
          </p>
        </div>
        <div className="dashboard-heading-actions">
          <span className="date-label">
            <Icons.calendar size={16} />
            {date}
          </span>
          <button
            className="pp-btn"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <Icons.refresh />
            {isFetching ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
      {isLoading && <LoadingState />}
      {error && (
        <div className="query-error" role="alert">
          <strong>Overview could not be loaded</strong>
          <p>{error.message}</p>
          <button className="pp-btn" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      )}
      {data && (
        <>
          <div className="overview-metrics">
            {[
              {
                label: "Places in your directory",
                value: data.totalPlaces,
                icon: "pin",
                to: "/places",
                note: "Across all place categories",
              },
              {
                label: "Awaiting review",
                value: pending,
                icon: "rows",
                to: reviewTarget,
                note: pending
                  ? "Ready for your attention"
                  : "Your review queue is clear",
              },
              {
                label: "Open conversations",
                value: data.unrepliedContacts,
                icon: "mail",
                to: "/contacts",
                note: "Community messages to reply to",
              },
              {
                label: "Community wishes",
                value: data.totalWishes,
                icon: "heart",
                to: "/wishes",
                note: `${number(data.pendingWishes)} awaiting a decision`,
              },
            ].map((metric, i) => {
              const Icon = Icons[metric.icon];
              return (
                <Link
                  className="overview-metric"
                  to={metric.to}
                  key={metric.label}
                  style={{ "--index": i }}
                >
                  <div className="metric-label">
                    {metric.label}
                    <Icon size={18} />
                  </div>
                  <div className="metric-value">
                    {number(metric.value)}
                    <Icons.arrowUpRight size={18} />
                  </div>
                  <span className="metric-note">{metric.note}</span>
                </Link>
              );
            })}
          </div>
          <div className="dashboard-grid">
            <section className="dashboard-panel review-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">MAKE AN IMPACT</span>
                  <h2>
                    Your review queue{" "}
                    <span className="count-pill">{number(pending)}</span>
                  </h2>
                </div>
                <span className="quiet-label">Awaiting action</span>
              </div>
              <div className="queue-intro">
                <span className="queue-intro-icon">
                  <Icons.shield size={23} />
                </span>
                <div>
                  <strong>
                    {pending
                      ? "A little attention. A better map."
                      : "You’re all caught up."}
                  </strong>
                  <p>
                    {pending
                      ? "Help keep community information useful and reliable."
                      : "New submissions will appear here when they arrive."}
                  </p>
                </div>
                <Link to={reviewTarget} className="pp-btn pp-btn-primary">
                  Review <Icons.arrowRight size={16} />
                </Link>
              </div>
              <div className="queue-list">
                {QUEUES.map((item, i) => {
                  const Icon = Icons[item.icon];
                  return (
                    <Link
                      className="queue-row"
                      key={item.key}
                      to={item.to}
                      style={{ "--index": i }}
                    >
                      <span className="queue-icon">
                        <Icon size={19} />
                      </span>
                      <div className="queue-copy">
                        <strong>{item.title}</strong>
                        <span>{item.description}</span>
                      </div>
                      <span
                        className={`queue-count${data[item.key] ? " has-items" : ""}`}
                      >
                        {number(data[item.key])}
                      </span>
                      <Icons.right size={15} />
                    </Link>
                  );
                })}
              </div>
              <div className="panel-bottom">
                <Icons.check size={15} />
                <span>Every decision is recorded in your activity log.</span>
              </div>
            </section>
            <section className="dashboard-panel coverage-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">THE BIGGER PICTURE</span>
                  <h2>Places by category</h2>
                </div>
                <Icons.globe size={22} />
              </div>
              <div className="coverage-summary">
                <span className="coverage-total">
                  {number(data.totalPlaces)}
                </span>
                <div>
                  places in the directory<small>Built by your community</small>
                </div>
              </div>
              <div
                className="category-stack"
                role="img"
                aria-label={categories
                  .map(
                    (type) =>
                      `${type.label}: ${type.key === "other" ? other : data.byType?.[type.key] || 0}`,
                  )
                  .join(", ")}
              >
                {categories.map((type, i) => (
                  <span
                    key={type.key}
                    className={`category-color category-color-${i}`}
                    style={{
                      flex:
                        (type.key === "other"
                          ? other
                          : data.byType?.[type.key]) || 0,
                    }}
                  />
                ))}
              </div>
              <div className="category-list">
                {categories.map((type, i) => {
                  const value = Number(
                    type.key === "other" ? other : data.byType?.[type.key] || 0,
                  );
                  const Icon = Icons[type.icon];
                  return (
                    <Link to="/places" className="category-row" key={type.key}>
                      <span className={`category-dot category-color-${i}`} />
                      <Icon size={17} />
                      <span>{type.label}</span>
                      <strong>{number(value)}</strong>
                      <small>
                        {data.totalPlaces
                          ? Math.round((value / data.totalPlaces) * 100)
                          : 0}
                        %
                      </small>
                    </Link>
                  );
                })}
              </div>
              <div className="coverage-note">
                <Icons.pin size={20} />
                <p>
                  Every place helps someone
                  <br />
                  feel more at home.
                </p>
              </div>
              <Link to="/places" className="coverage-link">
                Explore your directory <Icons.arrowUpRight size={17} />
              </Link>
            </section>
            <Activity />
            <section className="dashboard-panel shortcuts-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">WITHIN REACH</span>
                  <h2>Workspace tools</h2>
                </div>
                <Icons.command size={21} />
              </div>
              {[
                {
                  to: "/type-styles",
                  icon: "palette",
                  title: "Shape your map",
                  text: "Marker icons and category colors",
                },
                {
                  to: "/app-settings",
                  icon: "settings",
                  title: "Fine-tune the experience",
                  text: "Visitor features and app settings",
                },
                {
                  to: "/social-videos",
                  icon: "play",
                  title: "Bring places to life",
                  text: "Manage community video content",
                },
              ].map((item) => {
                const Icon = Icons[item.icon];
                return (
                  <Link className="shortcut-row" to={item.to} key={item.to}>
                    <span className="queue-icon">
                      <Icon />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </div>
                    <Icons.arrowUpRight size={17} />
                  </Link>
                );
              })}
              <div className="shortcut-hint">
                <kbd>Ctrl K</kbd>
                <span>Jump to any page in your workspace</span>
              </div>
            </section>
          </div>
          <div className="dashboard-updated">
            <span className="live-dot" />
            Overview updated{" "}
            {new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </>
      )}
    </div>
  );
}
