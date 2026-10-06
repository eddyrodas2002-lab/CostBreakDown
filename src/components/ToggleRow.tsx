export function ToggleRow({
  on,
  title,
  detail,
  onChange,
}: {
  on: boolean;
  title: string;
  detail: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={on ? "toggle-row on" : "toggle-row"}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="switch" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
