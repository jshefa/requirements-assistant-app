import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import UploadPage from "./pages/UploadPage";
import ReviewPage from "./pages/ReviewPage";
import DownloadPage from "./pages/DownloadPage";
import SessionSetupPage from "./pages/SessionSetupPage";
import ConsensusPage from "./pages/ConsensusPage";
import AccessGate from "./components/AccessGate";
import "./App.css";
import { useConfig } from "./contexts/ConfigContext";
import StartPage from "./pages/research/StartPage.jsx";
import StudySession from "./pages/research/StudySession.jsx";

function Header() {
  const location = useLocation();
  const path = location.pathname;

  const steps = [
    { label: "Upload", match: "/" },
    { label: "Setup", match: "/setup" },
    { label: "Review", match: "/review" },
    { label: "Consensus", match: "/consensus" },
    { label: "Download", match: "/download" },
  ];

  const isActive = (step) =>
    path.startsWith(step.match) && (step.match !== "/" || path === "/");

  // Steps before the current one are complete — shown with a check rather
  // than just dimmed, so progress through the flow is legible at a glance.
  const activeIndex = steps.findIndex(isActive);

  return (
    <header className="app-header">
      <h1>INCOSE Requirements Analyzer</h1>
      <nav className="step-nav" aria-label="Progress">
        {steps.map((step, i) => {
          const active = isActive(step);
          const done = activeIndex > -1 && i < activeIndex;
          return (
            <span
              key={step.match}
              className={`step${active ? " active" : ""}${done ? " done" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="step-marker" aria-hidden="true">
                {done ? "✓" : i + 1}
              </span>
              <span className="step-label">{step.label}</span>
            </span>
          );
        })}
      </nav>
    </header>
  );
}

// this is the normal prototype, not the research flow
function PrototypeApp() {
  return (
    <>
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/setup/:sessionId" element={<SessionSetupPage />} />
          <Route path="/review/:sessionId" element={<ReviewPage />} />
          <Route path="/consensus/:sessionId" element={<ConsensusPage />} />
          <Route path="/download/:sessionId" element={<DownloadPage />} />
        </Routes>
      </main>
    </>
  );
}

// The routing specifically for the research path
function ResearchApp() {
  return (
    <main className="app-main">
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/session/:sessionId" element={<StudySession />} />
      </Routes>
    </main>
  );
}

export default function App() {
  const { config, loading, error } = useConfig();

  if (loading) return <div>Connecting, please wait</div>;
  if (error) return <div>{String(error)}</div>;

  if (!["prototype", "research"].includes(config?.app_mode))
    return <div>Invalid App Mode or Backend Offline</div>;

  return (
    <BrowserRouter>
      <AccessGate>
        {config.app_mode === "research" ? <ResearchApp /> : <PrototypeApp />}
      </AccessGate>
    </BrowserRouter>
  );
}
