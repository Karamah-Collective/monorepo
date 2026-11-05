import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function PageHeaderActions({ children }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setTarget(document.getElementById("topbar-page-actions"));
  }, []);

  if (!target || !children) return null;
  return createPortal(children, target);
}
