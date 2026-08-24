import { createRoot } from "react-dom/client";
import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import App from "./App.jsx";
import "./styles.css";

// ?minimal — bare SDK component only, for isolating SDK-vs-shell issues.
const minimal = new URLSearchParams(location.search).has("minimal");

createRoot(document.getElementById("root")).render(
  minimal ? (
    <div style={{ height: "100dvh" }}>
      <TrueForgeUI server={{ type: "trueforge", baseUrl: "" }} layout="sidebar" />
    </div>
  ) : (
    <App />
  )
);
