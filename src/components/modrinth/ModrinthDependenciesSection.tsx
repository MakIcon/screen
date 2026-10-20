import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { InstanceItem, ModrinthModDependencies } from "../../types";
import { toErrorMessage } from "../../utils/errors";
import { ModrinthProjectIcon } from "./ModrinthProjectIcon";
import { useTranslation } from "../../i18n/locale";

type Props = {
  projectId: string;
  target: InstanceItem | null;
  busy: boolean;
};

export function ModrinthDependenciesSection({ projectId, target, busy }: Props) {
  const tr = useTranslation();
  const [details, setDetails] = useState<ModrinthModDependencies | null>(null);
  const [loading, setLoading] = useState(Boolean(target));
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const instanceId = target?.id;

  useEffect(() => {
    if (!instanceId || busy) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void invoke<ModrinthModDependencies>("get_modrinth_mod_dependencies", { instanceId, projectId })
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(toErrorMessage(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instanceId, projectId, busy, retry]);

  return (
    <section
      className="modrinth-detail-dependencies"
      aria-label={tr("modrinthDependencies.requiredModDependencies")}
      aria-busy={loading}
    >
      <div className="modrinth-dependencies-heading">
        <span className="modrinth-detail-section-label">
          {tr("modrinthDependencies.requiredDependencies")}
        </span>
        {!loading && !error && details && (
          <span className="modrinth-dependencies-count">{details.dependencies.length}</span>
        )}
      </div>
      {target && (
        <p className="modrinth-dependencies-context">
          Minecraft {target.version} · {target.loader}
          {!loading &&
            !error &&
            details &&
            ` · ${tr("modrinthDependencies.modVersion")} ${details.versionNumber}`}
        </p>
      )}
      {!target ? (
        <p className="modrinth-dependencies-note">{tr("modrinthDependencies.chooseABuildTo")}</p>
      ) : loading ? (
        <div className="modrinth-dependencies-loading" role="status">
          <span className="catalog-loading-spinner" aria-hidden="true" />
          {tr("modrinthDependencies.checkingRequiredDependencies")}
        </div>
      ) : error ? (
        <div className="modrinth-dependencies-error" role="alert">
          <p>
            {tr("modrinthDependencies.couldNotCheckDependencies")}: {error}
          </p>
          <button
            className="modrinth-detail-secondary"
            type="button"
            disabled={busy}
            onClick={() => setRetry((value) => value + 1)}
          >
            {tr("common.retry")}
          </button>
        </div>
      ) : details?.dependencies.length === 0 ? (
        <p className="modrinth-dependencies-note">{tr("modrinthDependencies.thisModVersionHas")}</p>
      ) : details ? (
        <>
          <p className="modrinth-dependencies-note">
            {tr("modrinthDependencies.theseInstallAutomaticallyWith")}
          </p>
          <ul className="modrinth-dependencies-list">
            {details.dependencies.map((dependency) => (
              <li className="modrinth-dependency-row" key={dependency.projectId}>
                <ModrinthProjectIcon
                  iconUrl={dependency.iconUrl}
                  title={dependency.title}
                  className="modrinth-dependency-icon"
                />
                <div className="modrinth-dependency-copy">
                  <strong>{dependency.title}</strong>
                  <span>
                    {tr("modrinthDependencies.version")} {dependency.versionNumber}
                    {!dependency.direct && tr("modrinthDependencies.transitiveDependency")}
                  </span>
                </div>
                <span
                  className={`modrinth-dependency-status modrinth-dependency-status--${dependency.status}`}
                >
                  {tr(`modrinthDependencies.status.${dependency.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
