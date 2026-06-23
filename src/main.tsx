import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  BuildLogsWindowApp,
  readBuildLogsWindowRoute,
} from "./components/builds/BuildLogsWindowApp";
import {
  InstallProgressWindowApp,
  readInstallProgressWindowRoute,
} from "./components/builds/InstallProgressWindowApp";

// The detached build-log window and the main launcher are two separate React
// trees. Decide which one to mount here, before either component's hooks run,
// so neither has to branch on the route internally.
const logWindowRoute = readBuildLogsWindowRoute();
const isInstallProgressWindow = readInstallProgressWindowRoute();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isInstallProgressWindow ? (
      <InstallProgressWindowApp />
    ) : logWindowRoute ? (
      <BuildLogsWindowApp {...logWindowRoute} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
