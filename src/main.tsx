import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CustomTooltip } from "./components/display/CustomTooltip";
import {
  BuildLogsWindowApp,
  readBuildLogsWindowRoute,
} from "./components/builds/BuildLogsWindowApp";
import {
  InstallProgressWindowApp,
  readInstallProgressWindowRoute,
} from "./components/builds/InstallProgressWindowApp";
import { isAppearanceStudioRoute } from "./appearance/window";
import { isBuildPlaceholdersWindowRoute } from "./components/builds/buildPlaceholdersWindow";

const AppearanceStudioApp = lazy(() =>
  import("./appearance/AppearanceStudioApp").then((module) => ({
    default: module.AppearanceStudioApp,
  })),
);

const BuildPlaceholdersWindowApp = lazy(() =>
  import("./components/builds/BuildPlaceholdersWindowApp").then((module) => ({
    default: module.BuildPlaceholdersWindowApp,
  })),
);

// The detached build-log window and the main launcher are two separate React
// trees. Decide which one to mount here, before either component's hooks run,
// so neither has to branch on the route internally.
const logWindowRoute = readBuildLogsWindowRoute();
const isInstallProgressWindow = readInstallProgressWindowRoute();
const isAppearanceStudioWindow = isAppearanceStudioRoute();
const isBuildPlaceholdersWindow = isBuildPlaceholdersWindowRoute(window.location.search);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CustomTooltip />
    {isBuildPlaceholdersWindow ? (
      <Suspense fallback={null}>
        <BuildPlaceholdersWindowApp />
      </Suspense>
    ) : isAppearanceStudioWindow ? (
      <Suspense fallback={null}>
        <AppearanceStudioApp />
      </Suspense>
    ) : isInstallProgressWindow ? (
      <InstallProgressWindowApp />
    ) : logWindowRoute ? (
      <BuildLogsWindowApp {...logWindowRoute} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
