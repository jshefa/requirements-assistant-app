import './CriteriaErrorCard.css'

export default function CriterionErrorCard({ errorMsg }) {

  return (
    <div className="error-card">
      {/* Header */}
      <div className="criterion-header">
        <span className="error-title">ERROR</span>
        <span className="criterion-status">
          ✗ ERROR
        </span>
      </div>

      {/* Error msg */}
      <p className="criteria-error-msg">{errorMsg}</p>
    </div>
  )
}
