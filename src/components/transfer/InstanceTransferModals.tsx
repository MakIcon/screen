import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  ExportedItem,
  ImportInstanceResult,
  InstanceExportData,
  InstanceItem,
} from "../../types";
import {
  formatJavaArgsMeta,
  formatWindowSettingsMeta,
  hasJavaArgsData,
  hasJavaPathData,
  hasWindowSettingsData,
} from "../../utils/instanceTransfer";
import { OptionToggle } from "../inputs/OptionToggle";
import { ExportedItemIcon } from "./ExportedItemIcon";
import type { InstanceTransferOptions, TransferHoverTarget, TransferListPreview } from "./types";

type CommonPreviewProps = {
  altHoverRef: MutableRefObject<TransferHoverTarget | null>;
  altSourceHoveredRef: MutableRefObject<boolean>;
  listPreview: TransferListPreview | null;
  setListPreview: Dispatch<SetStateAction<TransferListPreview | null>>;
  getItemIconUrl: (item: ExportedItem) => string | null;
};

type InstanceTransferModalsProps = CommonPreviewProps & {
  instances: InstanceItem[];
  exportInstanceId: string | null;
  setExportInstanceId: Dispatch<SetStateAction<string | null>>;
  exportData: InstanceExportData | null;
  exportOptions: InstanceTransferOptions;
  setExportOptions: Dispatch<SetStateAction<InstanceTransferOptions>>;
  exportWorking: boolean;
  exportError: string;
  onExportSlbuild: () => void;
  onExportMrpack: () => void;
  importModalOpen: boolean;
  setImportModalOpen: Dispatch<SetStateAction<boolean>>;
  importData: InstanceExportData | null;
  setImportData: Dispatch<SetStateAction<InstanceExportData | null>>;
  importOptions: InstanceTransferOptions;
  setImportOptions: Dispatch<SetStateAction<InstanceTransferOptions>>;
  importCustomName: string;
  setImportCustomName: Dispatch<SetStateAction<string>>;
  importWorking: boolean;
  importError: string;
  importResult: ImportInstanceResult | null;
  setImportError: Dispatch<SetStateAction<string>>;
  setImportSourcePath: Dispatch<SetStateAction<string>>;
  importSourceFormat: "slbuild" | "mrpack";
  onImportConfirm: () => void;
  getItemIconUrl: (item: ExportedItem) => string | null;
};

function attachPreview(
  event: React.MouseEvent<HTMLElement>,
  items: ExportedItem[] | undefined,
  label: string,
  ownerId: string,
  preview: CommonPreviewProps,
) {
  if (!items?.length) return;
  preview.altSourceHoveredRef.current = true;
  preview.altHoverRef.current = { items, label, el: event.currentTarget, ownerId };
  if (event.altKey) {
    preview.setListPreview({
      items,
      label,
      rect: event.currentTarget.getBoundingClientRect(),
      ownerId,
    });
  }
}

function detachPreview(
  event: React.MouseEvent<HTMLElement>,
  ownerId: string,
  preview: CommonPreviewProps,
) {
  preview.altSourceHoveredRef.current = false;
  const next = event.relatedTarget;
  if (!(next instanceof Element) || !next.closest(`[data-list-preview-owner="${ownerId}"]`)) {
    preview.altHoverRef.current = null;
    preview.setListPreview(null);
  }
}

export function InstanceTransferModals(props: InstanceTransferModalsProps) {
  const previewProps: CommonPreviewProps = props;

  return (
    <>
      {props.exportInstanceId && <ExportModal {...props} previewProps={previewProps} />}
      {props.importModalOpen && <ImportModal {...props} previewProps={previewProps} />}
      <TransferPreview {...previewProps} />
    </>
  );
}

function ExportModal(props: InstanceTransferModalsProps & { previewProps: CommonPreviewProps }) {
  type ExportKey = keyof InstanceTransferOptions;
  type ExportRow = { key: ExportKey; label: string; meta?: string; items?: ExportedItem[] };
  const instance = props.instances.find((item) => item.id === props.exportInstanceId);
  const rows: ExportRow[] = [
    { key: "name", label: "BUILD NAME", meta: props.exportData?.name },
    {
      key: "ram",
      label: "RAM SETTINGS",
      meta: props.exportData ? `${props.exportData.ram} GB` : undefined,
    },
    { key: "javaArgs", label: "JAVA ARGUMENTS", meta: formatJavaArgsMeta(props.exportData) },
    { key: "javaPath", label: "JAVA PATH", meta: props.exportData?.javaPath || undefined },
    { key: "window", label: "WINDOW SIZE", meta: formatWindowSettingsMeta(props.exportData) },
    {
      key: "mods",
      label: "MODS",
      meta: props.exportData ? `${props.exportData.mods.length}` : "...",
      items: props.exportData?.mods ?? [],
    },
    {
      key: "shaders",
      label: "SHADERS",
      meta: props.exportData ? `${props.exportData.shaders.length}` : "...",
      items: props.exportData?.shaders ?? [],
    },
    {
      key: "resourcePacks",
      label: "RESOURCE PACKS",
      meta: props.exportData ? `${props.exportData.resourcePacks.length}` : "...",
      items: props.exportData?.resourcePacks ?? [],
    },
  ];
  const toggle = (key: ExportKey) =>
    props.setExportOptions((current) => ({ ...current, [key]: !current[key] }));
  const close = () => {
    if (props.exportWorking) return;
    props.setExportInstanceId(null);
    props.setListPreview(null);
  };

  return (
    <div className="confirm-overlay" onClick={close}>
      <div className="confirm-dialog eximp-dialog" onClick={(event) => event.stopPropagation()}>
        <span className="confirm-label">EXPORT BUILD</span>
        <p className="confirm-title">{instance?.name ?? ""}</p>
        <div className="eximp-options">
          {rows.map(({ key, label, meta, items }) => {
            const ownerId = `export-${key}`;
            return (
              <div
                key={key}
                className="eximp-option"
                data-list-preview-owner={ownerId}
                onClick={() => toggle(key)}
                onMouseEnter={(event) =>
                  attachPreview(event, items, label, ownerId, props.previewProps)
                }
                onMouseLeave={(event) => detachPreview(event, ownerId, props.previewProps)}
              >
                <OptionToggle enabled={props.exportOptions[key]} onToggle={() => toggle(key)} />
                <span className="eximp-option-label">{label}</span>
                <span className="eximp-option-meta">
                  {items && items.length > 0 && <span className="eximp-alt-hint">alt </span>}
                  {meta}
                </span>
              </div>
            );
          })}
        </div>
        <p className="eximp-notice">
          .SLBUILD stores the project list. .MRPACK also includes local mods, configs, and other
          user files through OVERRIDES.
        </p>
        {props.exportError && (
          <p className="panel-text" style={{ marginTop: 12, color: "var(--accent)" }}>
            {props.exportError}
          </p>
        )}
        {props.exportWorking && <p className="eximp-working">CREATING .MRPACK...</p>}
        <div className="confirm-actions" style={{ marginTop: 24 }}>
          <button
            className="primary-action"
            type="button"
            disabled={!props.exportData || props.exportWorking}
            onClick={props.onExportSlbuild}
          >
            .SLBUILD
          </button>
          <button
            className="ghost-action"
            type="button"
            disabled={!props.exportData || props.exportWorking}
            onClick={props.onExportMrpack}
          >
            .MRPACK
          </button>
          <button
            className="ghost-action"
            type="button"
            disabled={props.exportWorking}
            onClick={close}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportModal(props: InstanceTransferModalsProps & { previewProps: CommonPreviewProps }) {
  type ImportKey = keyof InstanceTransferOptions;
  type ImportRow = {
    key: ImportKey;
    label: string;
    meta?: string;
    disabled?: boolean;
    items?: ExportedItem[];
  };
  const rows: ImportRow[] = [
    { key: "name", label: "BUILD NAME", meta: props.importData?.name || undefined },
    {
      key: "ram",
      label: "RAM SETTINGS",
      meta: props.importData?.ram ? `${props.importData.ram} GB` : undefined,
    },
    {
      key: "javaArgs",
      label: "JAVA ARGUMENTS",
      meta: formatJavaArgsMeta(props.importData),
      disabled: !hasJavaArgsData(props.importData),
    },
    {
      key: "javaPath",
      label: "JAVA PATH",
      meta: props.importData?.javaPath || undefined,
      disabled: !hasJavaPathData(props.importData),
    },
    {
      key: "window",
      label: "WINDOW SIZE",
      meta: formatWindowSettingsMeta(props.importData),
      disabled: !hasWindowSettingsData(props.importData),
    },
    {
      key: "mods",
      label: "MODS",
      meta: props.importData ? `${props.importData.mods?.length ?? 0}` : undefined,
      disabled: !props.importData?.mods?.length,
      items: props.importData?.mods ?? [],
    },
    {
      key: "shaders",
      label: "SHADERS",
      meta: props.importData ? `${props.importData.shaders?.length ?? 0}` : undefined,
      disabled: !props.importData?.shaders?.length,
      items: props.importData?.shaders ?? [],
    },
    {
      key: "resourcePacks",
      label: "RESOURCE PACKS",
      meta: props.importData ? `${props.importData.resourcePacks?.length ?? 0}` : undefined,
      disabled: !props.importData?.resourcePacks?.length,
      items: props.importData?.resourcePacks ?? [],
    },
  ];
  const toggle = (key: ImportKey) =>
    props.setImportOptions((current) => ({ ...current, [key]: !current[key] }));
  const close = () => {
    if (props.importWorking) return;
    props.setImportModalOpen(false);
    props.setImportData(null);
    props.setImportSourcePath("");
    props.setImportError("");
    props.setListPreview(null);
  };

  return (
    <div className="confirm-overlay" onClick={close}>
      <div className="confirm-dialog eximp-dialog" onClick={(event) => event.stopPropagation()}>
        <span className="confirm-label">IMPORT BUILD</span>
        <p className="confirm-title">{props.importData?.name || "НОВАЯ СБОРКА"}</p>
        {props.importData ? (
          <>
            {!props.importResult && (
              <div className="eximp-options">
                {rows.map(({ key, label, meta, disabled, items }) => {
                  const ownerId = `import-${key}`;
                  return (
                    <div key={key}>
                      <div
                        className={`eximp-option${disabled ? " disabled" : ""}`}
                        data-list-preview-owner={ownerId}
                        onClick={() => !disabled && toggle(key)}
                        onMouseEnter={(event) =>
                          attachPreview(event, items, label, ownerId, props.previewProps)
                        }
                        onMouseLeave={(event) => detachPreview(event, ownerId, props.previewProps)}
                      >
                        <OptionToggle
                          enabled={props.importOptions[key] && !disabled}
                          onToggle={() => !disabled && toggle(key)}
                          disabled={disabled}
                        />
                        <span className="eximp-option-label">{label}</span>
                        <span className="eximp-option-meta">
                          {items && items.length > 0 && (
                            <span className="eximp-alt-hint">alt </span>
                          )}
                          {meta}
                        </span>
                      </div>
                      {key === "name" && !props.importOptions.name && (
                        <div className="eximp-name-input-wrap">
                          <input
                            placeholder="Введите название сборки"
                            value={props.importCustomName}
                            onChange={(event) => props.setImportCustomName(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {!props.importResult && (
              <p className="eximp-notice">
                {props.importSourceFormat === "mrpack"
                  ? "Files from the .mrpack will be downloaded and unpacked into the build folders."
                  : "Version and loader come from the file. Modrinth projects will be downloaded again."}
              </p>
            )}
            {props.importResult && (
              <div className="eximp-import-results" role="status">
                <p className="eximp-notice">
                  Сборка создана. Установлено{" "}
                  {props.importResult.items.filter((item) => item.success).length}
                  {" / "}
                  {props.importResult.items.length} компонентов.
                </p>
                {props.importResult.items.map((result, index) => (
                  <div
                    className={`eximp-import-result ${result.success ? "success" : "error"}`}
                    key={`${result.category}-${result.item.projectId ?? result.item.title}-${index}`}
                  >
                    <strong>
                      {result.success ? "✓" : "!"} {result.item.title}
                    </strong>
                    <span>
                      {result.category === "resourcePacks"
                        ? "PACKS"
                        : result.category.toUpperCase()}{" "}
                      · {result.success ? "Установлено" : result.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {props.importError && (
              <p className="panel-text" style={{ marginTop: 12, color: "var(--accent)" }}>
                {props.importError}
              </p>
            )}
            {props.importWorking && <p className="eximp-working">ИМПОРТ...</p>}
            <div className="confirm-actions" style={{ marginTop: 24 }}>
              <button
                className="primary-action"
                type="button"
                disabled={
                  props.importWorking ||
                  (!props.importResult &&
                    !props.importOptions.name &&
                    !props.importCustomName.trim())
                }
                onClick={props.onImportConfirm}
              >
                {props.importWorking
                  ? "WORKING..."
                  : props.importResult
                    ? props.importResult.items.some(
                        (item) =>
                          !item.success && item.item.source === "modrinth" && !!item.item.projectId,
                      )
                      ? "RETRY FAILED"
                      : "DONE"
                    : "IMPORT"}
              </button>
              <button
                className="ghost-action"
                type="button"
                onClick={close}
                disabled={props.importWorking}
              >
                CANCEL
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="confirm-body" style={{ color: "var(--accent)" }}>
              {props.importError || "Ошибка чтения файла."}
            </p>
            <div className="confirm-actions" style={{ marginTop: 8 }}>
              <button className="ghost-action" type="button" onClick={close}>
                CLOSE
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TransferPreview(props: CommonPreviewProps) {
  const { listPreview } = props;
  if (!listPreview?.items.length) return null;
  const gap = 10;
  const bridgeOverlap = 2;
  const previewWidth = 280;
  const previewHeight = Math.min(listPreview.items.length * 46 + 46, 320);
  const opensRight = window.innerWidth - listPreview.rect.right - gap >= previewWidth;
  const left = opensRight
    ? listPreview.rect.right + gap
    : listPreview.rect.left - previewWidth - gap;
  const top = Math.max(8, Math.min(listPreview.rect.top, window.innerHeight - previewHeight - 8));
  const bridgeTop = Math.min(listPreview.rect.top, top);
  const bridgeBottom = Math.max(listPreview.rect.bottom, top + previewHeight);
  const bridgeLeft = opensRight
    ? listPreview.rect.right - bridgeOverlap
    : left + previewWidth - bridgeOverlap;
  const handleMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest(`[data-list-preview-owner="${listPreview.ownerId}"]`)
    ) {
      return;
    }
    props.altHoverRef.current = null;
    props.setListPreview(null);
  };

  return (
    <>
      <div
        className="eximp-list-preview-bridge"
        data-list-preview-owner={listPreview.ownerId}
        style={{
          left: bridgeLeft,
          top: bridgeTop,
          width: gap + bridgeOverlap * 2,
          height: bridgeBottom - bridgeTop,
        }}
        onMouseLeave={handleMouseLeave}
      />
      <div
        className="eximp-list-preview"
        data-list-preview-owner={listPreview.ownerId}
        style={{ left, top, width: previewWidth }}
        onMouseLeave={handleMouseLeave}
      >
        <div className="eximp-list-preview-head">
          <span>{listPreview.label}</span>
          <span className="eximp-list-preview-count">{listPreview.items.length}</span>
        </div>
        {listPreview.items.map((item, index) => (
          <div key={`${item.projectId ?? item.title}-${index}`} className="eximp-list-preview-item">
            <ExportedItemIcon
              src={props.getItemIconUrl(item)}
              title={item.title}
              source={item.source}
            />
            <span className="eximp-list-preview-title">{item.title}</span>
            <span className="eximp-list-preview-src">{item.source}</span>
          </div>
        ))}
      </div>
    </>
  );
}
