import { useState, useEffect, useRef } from "react";

export function useApi(apiFn, { immediate = false, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState("");
  
  const apiFnRef = useRef(apiFn);
  apiFnRef.current = apiFn;

  async function execute(...args) {
    setLoading(true);
    setError("");
    try {
      const response = await apiFnRef.current(...args);
      const rawData = response?.data !== undefined ? response.data : response;
      setData(rawData);
      return rawData;
    } catch (err) {
      const message = err?.response?.data?.error || err.message;
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setData(null);
    setError("");
    setLoading(false);
  }

  // Initial fetch and refetch when deps change
  useEffect(() => {
    if (immediate) {
      execute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, execute, reset };
}
