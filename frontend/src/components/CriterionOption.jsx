import "./CriterionOption.css";

export default function CriterionOption({
  criterionId,
  label,
  selected,
  notes,
  disabled = false,
  onSelectedChange,
  onNotesChange,
  onNotesFocus,
  onNotesBlur,
}) {
  const divider = label.indexOf(":");
  const name =
    criterionId === "A1"
      ? "No issues found"
      : divider >= 0
        ? label.slice(0, divider)
        : label;
  const description =
    criterionId === "A1"
      ? label
      : divider >= 0
        ? label.slice(divider + 1).trim()
        : "";

  return (
    <div
      className={`criterion-option${selected ? " criterion-option--selected" : ""}`}
    >
      <label className="criterion-option__heading">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={(event) => onSelectedChange(event.target.checked)}
        />
        <span className="criterion-option__body">
          <span className="criterion-option__title-row">
            <span className="criterion-option__code">{criterionId}</span>
            <span className="criterion-option__name">{name}</span>
          </span>
          {description && (
            <span className="criterion-option__description">{description}</span>
          )}
        </span>
      </label>

      {selected && criterionId !== "A1" && (
        <div className="criterion-option__reasoning">
          <label htmlFor={`reasoning-${criterionId}`}>
            Why does this requirement violate {name.toLowerCase()}?
          </label>
          <textarea
            id={`reasoning-${criterionId}`}
            value={notes ?? ""}
            onChange={(event) => onNotesChange(event.target.value)}
            onFocus={onNotesFocus}
            onBlur={onNotesBlur}
            placeholder="Explain the issue with this requirement..."
            disabled={disabled}
            rows={3}
          />
          <span className="criterion-option__hint">
            Saved when you leave this field or navigate.
          </span>
        </div>
      )}
    </div>
  );
}
