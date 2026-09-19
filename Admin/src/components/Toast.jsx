import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icons, CloseIcon } from "../icons.jsx";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const showToast = useCallback((message, type = "info") => {
    clearTimeout(timerRef.current);
    setToast({ message, type });
    timerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className={`pp-toast${toast.type === "error" ? " pp-toast-error" : ""}`}
        >
          <Icons.check size={18} />
          {toast.message}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => {
              clearTimeout(timerRef.current);
              setToast(null);
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
