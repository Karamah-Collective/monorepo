// A real styled switch, not a native checkbox — native checkboxes barely
// theme in dark mode (browsers mostly ignore custom styling on them), which
// read as a jarring unstyled white box against a dark table.
export default function ToggleCell({
  checked,
  onChange,
  disabled,
  label,
  ariaLabel = "Toggle status",
  tone = "success",
}) {
  return (
    <label className="pp-toggle-cell">
      <span
        className={`pp-switch${checked ? " pp-switch-on" : ""} pp-switch-${tone}`}
        role="switch"
        aria-label={ariaLabel}
        aria-checked={!!checked}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === " " || e.key === "Enter")) {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        aria-disabled={disabled || undefined}
      >
        <span className="pp-switch-dot" />
      </span>
      {label}
    </label>
  );
}
