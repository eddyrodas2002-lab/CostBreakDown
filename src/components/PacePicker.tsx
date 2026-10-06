import type { Pace } from "../types";

const OPTIONS: { id: Pace; label: string }[] = [
  { id: "auto", label: "From my trips" },
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Monthly" },
];

export function PacePicker({ value, onChange }: { value: Pace; onChange: (pace: Pace) => void }) {
  return (
    <div className="segment" role="radiogroup" aria-label="How to guess the rest of the year">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? "segment-btn on" : "segment-btn"}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
