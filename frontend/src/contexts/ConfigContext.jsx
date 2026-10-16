import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    const loadConfig = async (attemptsLeft = 20) => {
      try {
        const res = await axios.get("/api/config", {
          timeout: 5000,
        });

        if (cancelled) return;

        setConfig(res.data);
        setLoading(false);
      } catch {
        if (cancelled) return;

        if (attemptsLeft <= 0) {
          setError("Unable to connect to the backend.");
          setLoading(false);
          return;
        }

        retryTimer = setTimeout(() => loadConfig(attemptsLeft - 1), 2000);
      }
    };

    loadConfig();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  async function refreshConfig() {
    const res = await axios.get("/api/config", { timeout: 5000 });
    setConfig(res.data);
  }

  return (
    <ConfigContext.Provider value={{ config, loading, error, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);

  if (!context) {
    throw new Error("useConfig must be used inside ConfigProvider");
  }

  return context;
}
