import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInbox } from "../api/queries.js";
import { NAV_LINKS } from "../layout/navigation.js";
import { Icons, CloseIcon } from "../icons.jsx";

export default function CommandMenu({ onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialog = useRef(null);
  const { data: inboxData, isLoading: inboxLoading } = useInbox("all", { staleTime: 30_000 });
  const pageResults = NAV_LINKS.filter((link) => !link.hidden &&
    `${link.label} ${link.group} ${link.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const mailResults = normalizedQuery.length > 1 ? (inboxData?.threads || [])
    .filter(thread => `${thread.subject || ""} ${thread.participantName || ""} ${thread.participantEmail || ""} ${thread.preview || ""}`.toLowerCase().includes(normalizedQuery))
    .slice(0, 8)
    .map(thread => ({ kind: "mail", thread })) : [];
  const results = [...pageResults.map(link => ({ kind: "page", link })), ...mailResults];
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    dialog.current
      ?.querySelector(".selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <dialog
      className="command-dialog"
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-label="Search workspace"
    >
      <div className="command-search">
        <Icons.search size={21} />
        <input
          aria-label="Search workspace"
          placeholder="Search pages and email…"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(i + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && results[selected]) {
              e.preventDefault();
              dialog.current?.querySelector(".selected")?.click();
            }
          }}
        />
        <button
          className="icon-button"
          aria-label="Close search"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="command-results pp-scroll">
        {results.length ? (
          results.map((result, i) => {
            if (result.kind === "mail") {
              const thread = result.thread;
              return <Link className={i === selected ? "selected" : ""} key={`mail-${thread.id}`} to={{ pathname: "/contacts", search: `?folder=all&search=${encodeURIComponent(query.trim())}` }} onClick={onClose}>
                <Icons.mail />
                <span>{thread.subject || "(No subject)"}<small>{thread.participantName || thread.participantEmail || "Email"} · Email</small></span>
                <Icons.arrowRight />
              </Link>;
            }
            const link = result.link;
            const Icon = Icons[link.icon];
            return <Link className={i === selected ? "selected" : ""} key={`page-${link.to}`} to={link.to} onClick={onClose}>
              <Icon />
              <span>{link.label}<small>{link.group}</small></span>
              <Icons.arrowRight />
            </Link>;
          })
        ) : (
          <div className="inline-empty">
            No pages found. Try “places” or “settings”.
          </div>
        )}
      </div>
      <div className="command-footer">
        Navigate with ↑ ↓ <span>Enter to open · Esc to close</span>
      </div>
    </dialog>
  );
}
