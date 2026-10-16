import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import ApiKeyModal from "../components/ApiKeyModal";
import "./UploadPage.css";
import { useConfig } from "../contexts/ConfigContext";

function ProgressBar({ active, pct }) {
  if (!active) return null;
  return (
    <div
      className="upload-progress-track"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Analysis progress"
    >
      <div className="upload-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const { config, refreshConfig } = useConfig();

  const [provider, setProvider] = useState("");
  const allProviders = config?.providers ?? [];
  const providers = allProviders.filter((p) => p.isAvailable);
  const keyedProviders = allProviders.filter((p) => p.requiresKey);

  const [reqFile, setReqFile] = useState(null);
  const [ctxFile, setCtxFile] = useState(null);
  const [conopsFile, setConopsFile] = useState(null);
  const [conopsImg, setConopsImg] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [sessionResult, setSessionResult] = useState(null);
  const [barPct, setBarPct] = useState(0);
  const timerRef = useRef(null);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  useEffect(() => {
    if (config) {
      setProvider(
        (current) => current || config.provider || providers[0]?.value || "",
      );
    }
  }, [config]);

  // No configured provider means the deployment is missing its API keys —
  // an operator problem, not something the user can fix by typing a key.
  const serviceReady = providers.length > 0;

  // Progress bar animation
  useEffect(() => {
    if (loading) {
      setBarPct(5);
      let pct = 5;
      timerRef.current = setInterval(() => {
        pct += pct < 60 ? 6 : pct < 80 ? 2 : 0.5;
        if (pct >= 88) pct = 88;
        setBarPct(pct);
      }, 600);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reqFile) {
      setError("Please select a requirements file.");
      return;
    }
    if (!serviceReady) {
      setError(
        "There are no available AI providers. Add your API keys in order to use providers.",
      );
      return;
    }

    setLoading(true);
    setError("");
    setProgress("Analyzing requirements against A2–A10 criteria...");

    const formData = new FormData();
    formData.append("requirements_file", reqFile);
    if (ctxFile) formData.append("context_file", ctxFile);
    if (conopsFile) formData.append("conops_file", conopsFile);
    if (conopsImg) formData.append("conops_img", conopsImg);

    try {
      const res = await axios.post("/api/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "X-AI-Provider": provider,
        },
        timeout: 1800000,
      });

      setBarPct(100);
      clearInterval(timerRef.current);
      const violated = res.data.violations_count;
      setProgress(
        `Done! ${violated} criteria violated across ${res.data.requirements_count} requirements${res.data.failed_count ? ` with ${res.data.failed_count} errors.` : ""}`,
      );
      setTimeout(() => setSessionResult(res.data.session_id), 400);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Upload failed";
      setError(msg);
      setBarPct(0);
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <div className="upload-page">
      <div className="upload-card">
        <div className="upload-card-header">
          <h2>Upload Requirements</h2>
          <button
            className="key-modal-btn"
            onClick={() => setIsKeyModalOpen(!isKeyModalOpen)}
          >
            Change API Keys
          </button>
        </div>

        <p className="subtitle">
          Analyze requirements against INCOSE quality criteria using AI. Upload
          your requirements document and optional context file.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Provider selector — only shown when there is a real choice to make */}
          {providers.length > 1 ? (
            <div className="form-group">
              <label>Analysis Model</label>
              <div
                className="segmented"
                role="group"
                aria-label="Analysis model"
              >
                {providers.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    disabled={loading}
                    aria-pressed={provider === p.value}
                    onClick={() => setProvider(p.value)}
                    className={`segmented-option${provider === p.value ? " selected" : ""}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            providers.length == 1 && <p>Using {providers[0].label}</p>
          )}

          {!serviceReady && (
            <div className="error-msg">
              No providers available. Set your API keys to use providers.
            </div>
          )}

          {/* Requirements file */}
          <div className="form-group">
            <label htmlFor="req-file">Requirements File (.txt, .oml) *</label>
            <input
              id="req-file"
              type="file"
              accept=".txt, .oml"
              onChange={(e) => setReqFile(e.target.files[0])}
              disabled={loading}
            />
            <p className="hint">
              .txt format: "1. The system shall...", "REQ-001: The system
              shall...", "MR-C1.1: The system shall..."
              <br />
              .oml format: req:Requirement, tlo:hasName, tlo:hasID,
              tlo:hasNaturalLanguageDescription
            </p>
          </div>

          {/* Context file */}
          <div className="form-group">
            <label htmlFor="ctx-file">Context File (.txt, optional)</label>
            <input
              id="ctx-file"
              type="file"
              accept=".txt"
              onChange={(e) => setCtxFile(e.target.files[0])}
              disabled={loading}
            />
            <p className="hint">
              Describe the system (e.g., "This system is a UAV flight control
              system for...")
            </p>
          </div>

          {/* ConOps File*/}
          <div className="form-group">
            <label htmlFor="conops-file">ConOps File (.txt, optional)</label>
            <input
              id="conops-file"
              type="file"
              accept=".txt"
              onChange={(e) => setConopsFile(e.target.files[0])}
              disabled={loading}
            />
          </div>

          {/* ConOps Img */}
          <div className="form-group">
            <label htmlFor="conops-image">
              ConOps Image (.png, .jpg, .webp, optional)
            </label>
            <input
              id="conops-image"
              type="file"
              accept=".png, .jpg, .jpeg, .webp"
              onChange={(e) => setConopsImg(e.target.files[0])}
              disabled={loading}
            />
          </div>

          {error && <div className="error-msg">{error}</div>}
          <ProgressBar active={loading} pct={barPct} />
          {progress && <div className="progress-msg">{progress}</div>}

          {!sessionResult ? (
            <button
              type="submit"
              disabled={loading || !reqFile || !serviceReady}
              className="btn-primary"
            >
              {loading ? "Analyzing..." : "Upload & Analyze"}
            </button>
          ) : (
            <div className="button-stack">
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate(`/review/${sessionResult}`)}
              >
                Review Solo
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate(`/setup/${sessionResult}`)}
              >
                Set Up Multi-Reviewer
              </button>
            </div>
          )}
        </form>
      </div>
      {isKeyModalOpen && (
        <ApiKeyModal
          onClose={() => setIsKeyModalOpen(false)}
          onKeySaved={refreshConfig}
          providers={keyedProviders}
        />
      )}
    </div>
  );
}
