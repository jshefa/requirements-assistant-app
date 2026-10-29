// All values for this matrix are stored as one JSONB answer under "education".
export default function EducationMatrix({ question, value, onChange, onBlur, disabled = false }) {
  const rows = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  function changeRow(row, key, next) {
    onChange({
      ...rows,
      [row]: { ...(rows[row] ?? {}), [key]: next },
    }, key === "completed");
  }

  return (
    <section className="confidence-survey__question confidence-survey__education" aria-labelledby="confidence-education-heading">
      <h3 id="confidence-education-heading" className="confidence-survey__question-label">
        {question.number} {question.question}
      </h3>
      <p className="confidence-survey__hint">{question.instructions}</p>
      <div className="confidence-survey__education-scroller">
        <table className="confidence-survey__education-table">
          <thead>
            <tr>
              {question.columns.map((column) => <th scope="col" key={column}>{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {question.rows.map((row) => {
              const rowAnswer = rows[row] ?? {};
              const isOther = row === "Other (Please Specify)";
              return (
                <tr key={row}>
                  <th scope="row">
                    <span>{row}</span>
                    {isOther && (
                      <input
                        className="confidence-survey__education-text"
                        type="text"
                        aria-label="Specify other education"
                        placeholder={question.placeholder}
                        value={rowAnswer.other_specify ?? ""}
                        onChange={(event) => changeRow(row, "other_specify", event.target.value)}
                        onBlur={onBlur}
                        disabled={disabled}
                      />
                    )}
                  </th>
                  <td>
                    <div className="confidence-survey__education-completion" role="group" aria-label={`${row} completed`}>
                      {question.completion_options.map((option) => (
                        <label key={option}>
                          <input
                            type="radio"
                            name={`confidence-education-${question.rows.indexOf(row)}`}
                            value={option}
                            checked={rowAnswer.completed === option}
                            onChange={() => changeRow(row, "completed", option)}
                            disabled={disabled}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                      <button
                        type="button"
                        className="confidence-survey__clear"
                        onClick={() => changeRow(row, "completed", null)}
                        disabled={disabled || !rowAnswer.completed}
                        style={{ visibility: rowAnswer.completed ? "visible" : "hidden" }}
                        aria-label={`Clear ${row} completion selection`}
                      >
                        Clear
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      className="confidence-survey__education-text"
                      type="text"
                      aria-label={`${row} subject area`}
                      placeholder={question.placeholder}
                      value={rowAnswer.subject_area ?? ""}
                      onChange={(event) => changeRow(row, "subject_area", event.target.value)}
                      onBlur={onBlur}
                      disabled={disabled}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
