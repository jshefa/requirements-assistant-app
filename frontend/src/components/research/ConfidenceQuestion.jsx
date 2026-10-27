// Renders the ordinary question types used by the confidence survey.
// Education is handled separately because it has multiple fields per row.
export default function ConfidenceQuestion({
  question,
  type = question.type,
  scaleInstructions,
  value,
  validationError,
  onChange,
  onBlur,
  disabled = false,
}) {
  const questionLabel = `${question.number ? `${question.number} ` : ""}${question.question}`;
  // Scale labels come from the study's backend survey definition.
  const scaleOptions = (scaleInstructions ?? "")
    .split(";")
    .map((part) => part.trim().match(/^([1-5])\s*=\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({ rating: Number(match[1]), label: match[2] }));

  if (type === "integer" || type === "decimal") {
    return (
      <div className="confidence-survey__question">
        <label className="confidence-survey__question-label" htmlFor={`confidence-${question.id}`}>
          {questionLabel}
        </label>
        {question.answer_prompt && (
          <p className="confidence-survey__hint">{question.answer_prompt}</p>
        )}
        <input
          id={`confidence-${question.id}`}
          className={`confidence-survey__number${validationError ? " confidence-survey__number--invalid" : ""}`}
          aria-invalid={Boolean(validationError)}
          aria-describedby={validationError ? `confidence-${question.id}-error` : undefined}
          type={type === "decimal" ? "text" : "number"}
          min={type === "integer" ? "0" : undefined}
          max={type === "integer" ? "120" : undefined}
          step={type === "integer" ? "1" : undefined}
          inputMode={type === "integer" ? "numeric" : "decimal"}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value, false)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={type === "integer" ? "Age" : "Years"}
        />
        {validationError && (
          <p id={`confidence-${question.id}-error`} className="confidence-survey__field-error" role="alert">
            {validationError}
          </p>
        )}
      </div>
    );
  }

  if (type === "single_choice") {
    return (
      <fieldset className="confidence-survey__question confidence-survey__fieldset">
        <legend className="confidence-survey__question-label">{questionLabel}</legend>
        <div className="confidence-survey__choices">
          {question.options.map((option) => (
            <label className="confidence-survey__choice" key={option}>
              <input
                type="radio"
                name={`confidence-${question.id}`}
                value={option}
                checked={value === option}
                onChange={() => onChange(option, true)}
                disabled={disabled}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {value != null && value !== "" && (
          <button type="button" className="confidence-survey__clear" onClick={() => onChange(null, true)} disabled={disabled}>
            Clear answer
          </button>
        )}
      </fieldset>
    );
  }

  if (type === "likert") {
    return (
      <fieldset className="confidence-survey__question confidence-survey__fieldset confidence-survey__likert-question">
        <legend className="confidence-survey__question-label">{questionLabel}</legend>
        <div className="confidence-survey__likert-options" role="group" aria-label="Choose a rating from 1 to 5">
          {scaleOptions.map(({ rating, label }) => (
            <label className="confidence-survey__likert-option" key={rating}>
              <input
                type="radio"
                name={`confidence-${question.id}`}
                value={rating}
                checked={Number(value) === rating && value !== null && value !== undefined && value !== ""}
                onChange={() => onChange(rating, true)}
                disabled={disabled}
              />
              <span>{rating} - {label}</span>
            </label>
          ))}
          <button
            type="button"
            className="confidence-survey__clear confidence-survey__likert-clear"
            onClick={() => onChange(null, true)}
            disabled={disabled || value == null || value === ""}
            style={{ visibility: value != null && value !== "" ? "visible" : "hidden" }}
          >
            Clear answer
          </button>
        </div>
      </fieldset>
    );
  }

  return <p role="alert">Unsupported survey question type: {type}</p>;
}
