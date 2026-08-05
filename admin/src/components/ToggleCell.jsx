export default function ToggleCell({ checked, onChange, disabled, label }) {
  return (
    <label className="pp-toggle-cell">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
