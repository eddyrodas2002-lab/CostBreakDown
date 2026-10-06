import { useState } from "react";

export function ToggleRow({
  on,
  title,
  detail,
  info,
  onChange,
}: {
  on: boolean;
  title: string;
  detail: string;
  info?: string[];
  onChange: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="toggle-block">
      <div
        className={on ? "toggle-row on" : "toggle-row"}
        onClick={() => onChange(!on)}
      >
        <div className="toggle-copy">
          <span className="toggle-title">
            <strong>{title}</strong>
            {info && info.length > 0 && (
              <button
                type="button"
                className={open ? "info-btn open" : "info-btn"}
                aria-expanded={open}
                aria-label={`About the ${title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen((value) => !value);
                }}
              >
                i
              </button>
            )}
          </span>
          <small>{detail}</small>
        </div>
        <button
          type="button"
          className="switch-hit"
          role="switch"
          aria-checked={on}
          aria-label={`${title}. ${detail}`}
          onClick={(event) => {
            event.stopPropagation();
            onChange(!on);
          }}
        >
          <span className="switch" aria-hidden="true">
            <span className="switch-knob" />
          </span>
        </button>
      </div>
      {open && info && (
        <div className="callout" role="region" aria-label={`About the ${title}`}>
          {info.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  );
}
