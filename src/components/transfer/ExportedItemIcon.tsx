import { useTranslation } from "../../i18n/locale";
import { useState } from "react";

export function fileBadge(title: string, source: string) {
  const extension = title
    .toLowerCase()
    .replace(/\.disabled$/, "")
    .match(/\.([a-z0-9]+)$/)?.[1];
  switch (extension) {
    case "json":
    case "json5":
    case "mcmeta":
      return { label: "J", kind: "json" };
    case "js":
    case "mjs":
    case "cjs":
      return { label: "JS", kind: "js" };
    case "ts":
      return { label: "TS", kind: "js" };
    case "tsx":
      return { label: "TSX", kind: "js" };
    case "txt":
    case "md":
    case "log":
      return { label: "T", kind: "text" };
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
      return { label: extension.toUpperCase(), kind: "image" };
    case "toml":
      return { label: "TML", kind: "config" };
    case "yml":
    case "yaml":
      return { label: "YML", kind: "config" };
    case "cfg":
    case "conf":
    case "properties":
    case "ini":
      return { label: "CFG", kind: "config" };
    case "zip":
      return { label: "ZIP", kind: "archive" };
    case "jar":
      return { label: "M", kind: "mod" };
    default:
      if (extension) return { label: extension.slice(0, 3).toUpperCase(), kind: "other" };
      return source === "modrinth" ? { label: "M", kind: "mod" } : { label: "FILE", kind: "other" };
  }
}

export function fileTypeLabel(title: string, source: string) {
  if (source === "local") return "LOCAL";
  if (/\.tsx?$/i.test(title)) return "TYPESCRIPT";
  switch (fileBadge(title, source).kind) {
    case "json":
      return "JSON";
    case "js":
      return "JAVASCRIPT";
    case "text":
      return "TEXT";
    case "image":
      return "IMAGE";
    case "config":
      return "CONFIG";
    case "archive":
      return "ZIP";
    case "other":
      return (
        title
          .toLowerCase()
          .match(/\.([a-z0-9]+)$/)?.[1]
          .toUpperCase() ?? "FILE"
      );
    default:
      return source.toUpperCase();
  }
}

export function ExportedItemIcon({
  src,
  title,
  source,
}: {
  src?: string | null;
  title: string;
  source: string;
}) {
  const tr = useTranslation();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const badge = fileBadge(title, source);

  if (src && src !== failedSrc) {
    return (
      <img
        className="eximp-list-preview-icon"
        crossOrigin="anonymous"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <span
      className={`eximp-list-preview-icon-fallback file-kind-${badge.kind}`}
      aria-label={tr("ui.fileType", { type: badge.label })}
    >
      {badge.label}
    </span>
  );
}
