import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { NAV_LINKS } from "../layout/navigation.js";
import { Icons, CloseIcon } from "../icons.jsx";

export default function CommandMenu({ onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialog = useRef(null);
  const results = NAV_LINKS.filter((link) =>
    `${link.label} ${link.group} ${link.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
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
      aria-label="Find a page"
    >
      <div className="command-search">
        <Icons.search size={21} />
        <input
          aria-label="Find a page"
          placeholder="Where would you like to go?"
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
          results.map((link, i) => {
            const Icon = Icons[link.icon];
            return (
              <Link
                className={i === selected ? "selected" : ""}
                key={link.to}
                to={link.to}
                onClick={onClose}
              >
                <Icon />
                <span>
                  {link.label}
                  <small>{link.group}</small>
                </span>
                <Icons.arrowRight />
              </Link>
            );
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
