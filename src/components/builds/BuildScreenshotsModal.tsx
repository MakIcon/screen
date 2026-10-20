import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { toErrorMessage } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { ActionResult, InstanceItem, ScreenshotImage, ScreenshotItem } from "../../types";
import {
  useLocale,
  useTranslation,
  type Locale,
  intlLocale,
  translateFor,
} from "../../i18n/locale";

interface Props {
  instance: InstanceItem;
  onClose: () => void;
}

function formatScreenshotDate(timestamp: number, locale: Locale) {
  if (!timestamp) return translateFor(locale, "buildScreenshots.unknownDate");

  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BuildScreenshotsModal({ instance, onClose }: Props) {
  const locale = useLocale();
  const tr = useTranslation();
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedDataUrl, setSelectedDataUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedScreenshot = useMemo(
    () => screenshots.find((item) => item.fileName === selectedFileName) ?? null,
    [screenshots, selectedFileName],
  );

  const refreshScreenshots = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await invoke<ScreenshotItem[]>("list_instance_screenshots", {
        instanceId: instance.id,
      });

      setScreenshots(items);
      setSelectedFileName((current) => {
        if (current && items.some((item) => item.fileName === current)) {
          return current;
        }
        return items[0]?.fileName ?? null;
      });
    } catch (err) {
      logger.error(err);
      setScreenshots([]);
      setSelectedFileName(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    void refreshScreenshots();
  }, [refreshScreenshots]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!selectedFileName) {
      setSelectedDataUrl("");
      setPreviewLoading(false);
      return;
    }

    let alive = true;
    setPreviewLoading(true);
    setSelectedDataUrl("");

    invoke<ScreenshotImage>("load_instance_screenshot", {
      instanceId: instance.id,
      fileName: selectedFileName,
    })
      .then((image) => {
        if (!alive || image.fileName !== selectedFileName) return;
        setSelectedDataUrl(image.dataUrl);
      })
      .catch((err) => {
        if (!alive) return;
        logger.error(err);
        setError(toErrorMessage(err));
      })
      .finally(() => {
        if (alive) setPreviewLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [instance.id, selectedFileName]);

  const openScreenshotsFolder = async () => {
    try {
      setError("");
      await invoke<ActionResult>("open_instance_screenshots_folder", {
        instanceId: instance.id,
      });
    } catch (err) {
      logger.error(err);
      setError(toErrorMessage(err));
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="screenshots-modal" onClick={(event) => event.stopPropagation()}>
        <button
          className="bce-hdr-close screenshots-modal-close"
          type="button"
          onClick={onClose}
          aria-label={tr("common.close2")}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 11 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="10" y2="10" />
            <line x1="10" y1="1" x2="1" y2="10" />
          </svg>
        </button>

        <div className="screenshots-modal-head">
          <span className="confirm-label">{tr("buildScreenshots.screenshots")}</span>
          <h2 className="screenshots-modal-name">{instance.name}</h2>
        </div>

        {error && <div className="screenshots-error">{error}</div>}

        {loading ? (
          <div className="screenshots-empty">{tr("buildScreenshots.loadingScreenshots")}</div>
        ) : screenshots.length === 0 ? (
          <div className="screenshots-empty">
            <strong>{tr("buildScreenshots.noScreenshotsYet")}</strong>
            <span>{tr("buildScreenshots.theyWillAppearHere")}</span>
          </div>
        ) : (
          <div className="screenshots-layout">
            <CustomScrollArea
              className="screenshots-list"
              onWheel={(event) => event.stopPropagation()}
            >
              {screenshots.map((item) => (
                <button
                  key={item.fileName}
                  className={`screenshot-row${item.fileName === selectedFileName ? " active" : ""}`}
                  type="button"
                  onClick={() => setSelectedFileName(item.fileName)}
                >
                  <span className="screenshot-row-name">{item.fileName}</span>
                  <span className="screenshot-row-meta">
                    {formatScreenshotDate(item.modifiedAt, locale)}
                  </span>
                  <span className="screenshot-row-meta">{formatBytes(item.sizeBytes)}</span>
                </button>
              ))}
            </CustomScrollArea>

            <div className="screenshots-preview">
              {previewLoading ? (
                <div className="screenshots-preview-empty">
                  {tr("buildScreenshots.loadingImage")}
                </div>
              ) : selectedDataUrl ? (
                <img
                  src={selectedDataUrl}
                  alt={selectedScreenshot?.fileName ?? tr("buildScreenshots.screenshot")}
                  className="screenshots-preview-image"
                />
              ) : (
                <div className="screenshots-preview-empty">
                  {tr("buildScreenshots.selectScreenshot")}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="screenshots-actions">
          <button className="primary-action" type="button" onClick={openScreenshotsFolder}>
            {tr("buildScreenshots.openFolder")}
          </button>
          <button className="ghost-action" type="button" onClick={refreshScreenshots}>
            {tr("common.refresh")}
          </button>
          <button className="ghost-action" type="button" onClick={onClose}>
            {tr("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
