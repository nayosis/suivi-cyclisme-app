import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./theme-context";
import { HeatmapColorProvider } from "./heatmap-color-context";
import { OrsApiKeyProvider } from "./ors-context";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <HeatmapColorProvider>
        <OrsApiKeyProvider>
          <App />
        </OrsApiKeyProvider>
      </HeatmapColorProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
