import { useState } from "react";

export function ExportedItemIcon({
  src,
  title,
  source,
}: {
  src?: string | null;
  title: string;
  source: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallbackLabel =
    source === "modrinth"
      ? "M"
      : source.trim().slice(0, 1).toUpperCase() || title.trim().slice(0, 1).toUpperCase() || "?";

  if (src && !imageFailed) {
    return (
      <img
        className="eximp-list-preview-icon"
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return <span className="eximp-list-preview-icon-fallback">{fallbackLabel}</span>;
}
