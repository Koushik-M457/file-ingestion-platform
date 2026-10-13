import { useEffect, useState } from "react";

import { API } from "./Dashboardconfig";


// POST `body` to `${API}/${path}` whenever it changes (debounced).
export default function useApi(path, body, enabled) {

  const [state, setState] = useState({
    data: null,
    loading: false,
    error: "",
  });

  const key = JSON.stringify([path, body, enabled]);

  useEffect(() => {

    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return undefined;
    }

    const controller = new AbortController();

    setState((previous) => ({ ...previous, loading: true, error: "" }));

    const timer = setTimeout(async () => {

      try {

        const response = await fetch(`${API}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Request failed.");
        }

        setState({ data, loading: false, error: "" });

      } catch (err) {

        if (err.name !== "AbortError") {
          setState({ data: null, loading: false, error: err.message });
        }

      }

    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;

}