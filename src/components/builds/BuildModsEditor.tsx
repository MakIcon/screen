import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import type { InstalledModView } from "../../types";
import { toErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import "./BuildModsEditor.css";
import { useTranslation } from "../../i18n/locale";

type Props = {
  instanceId: string | null;
  loader: string;
};

function ModIcon({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  const fallback = title.trim().slice(0, 1).toUpperCase() || "M";

  if (src && !failed) {
    return (
      <img
        className="bme-icon"
        crossOrigin="anonymous"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return <span className="bme-icon bme-icon--fallback">{fallback}</span>;
}

export function BuildModsEditor({ instanceId, loader }: Props) {
  const tr = useTranslation();
  const [mods, setMods] = useState<InstalledModView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  const isVanilla = loader.trim().toLowerCase() === "vanilla";

  useEffect(() => {
    if (!instanceId || isVanilla) {
      setMods([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const result = await invoke<InstalledModView[]>("list_installed_mods", { instanceId });
        if (!cancelled) setMods(result);
      } catch (e) {
        if (!cancelled) {
          setError(toErrorMessage(e));
          setMods([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [instanceId, isVanilla]);

  const toggleMod = async (filename: string, enabled: boolean) => {
    if (!instanceId || toggleBusy) return;

    try {
      setToggleBusy(filename);
      setError("");
      await invoke("set_mod_enabled", { instanceId, filename, enabled });
      const result = await invoke<InstalledModView[]>("list_installed_mods", { instanceId });
      setMods(result);
    } catch (e) {
      logger.error(e);
      setError(toErrorMessage(e));
    } finally {
      setToggleBusy(null);
    }
  };

  const enabledCount = mods.filter((mod) => mod.enabled).length;

  const renderBody = () => {
    if (!instanceId) {
      return (
        <div className="bme-empty">
          <strong>{tr("buildMods.noBuildYet")}</strong>
          <p>{tr("buildMods.saveTheBuildTo")}</p>
        </div>
      );
    }

    if (isVanilla) {
      return (
        <div className="bme-empty">
          <strong>{tr("buildMods.vanilla")}</strong>
          <p>{tr("buildMods.vanillaBuildsDontUse")}</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="bme-empty">
          <strong>{tr("buildMods.loading")}</strong>
          <p>{tr("buildMods.readingInstalledMods")}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bme-empty">
          <strong>{tr("buildMods.error")}</strong>
          <p>{error}</p>
        </div>
      );
    }

    if (mods.length === 0) {
      return (
        <div className="bme-empty">
          <strong>{tr("buildMods.empty")}</strong>
          <p>{tr("buildMods.thisBuildHasNo")}</p>
        </div>
      );
    }

    return (
      <CustomScrollArea className="bme-scroll" style={{ minHeight: 0 }}>
        <div className="bme-list">
          {mods.map((mod) => {
            const busy = toggleBusy === mod.filename;
            return (
              <div
                className={`bme-row ${mod.enabled ? "" : "bme-row--off"}`}
                key={`${mod.filename}-${mod.projectId ?? "local"}`}
              >
                <ModIcon src={mod.iconUrl} title={mod.title} />
                <div className="bme-row-info">
                  <strong>{mod.title}</strong>
                  <span>{mod.versionNumber || mod.filename}</span>
                </div>
                <div className="bme-row-actions">
                  <em className="bme-source">
                    {mod.enabled ? mod.source.toUpperCase() : tr("common.offCaps")}
                  </em>
                  <button
                    type="button"
                    className={`bme-toggle ${mod.enabled ? "enabled" : ""}`}
                    data-tooltip={
                      mod.enabled ? tr("buildMods.disableMod") : tr("buildMods.enableMod")
                    }
                    aria-label={
                      mod.enabled ? tr("buildMods.disableMod") : tr("buildMods.enableMod")
                    }
                    aria-pressed={mod.enabled}
                    disabled={busy}
                    onClick={() => void toggleMod(mod.filename, !mod.enabled)}
                  >
                    <span className="bme-toggle-knob" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </CustomScrollArea>
    );
  };

  return (
    <div className="bme-editor">
      <div className="bme-panel">
        <div className="bme-panel-head">
          <div className="bme-panel-title">
            <span className="brs-panel-kicker">{tr("common.modsCaps")}</span>
            <strong>{tr("buildMods.installed")}</strong>
          </div>
          {instanceId && !isVanilla && (
            <span className="bme-count">
              {enabledCount}/{mods.length} {tr("common.onCaps")}
            </span>
          )}
        </div>
        {renderBody()}
      </div>
    </div>
  );
}
