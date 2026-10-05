export default function DropdownCell({ value, options, onChange, disabled }) {
  return (
    <select
      className="pp-dropdown-cell"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
