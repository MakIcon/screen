import { useEffect, useState } from "react";

type ModrinthProjectIconProps = {
  iconUrl?: string | null;
  title: string;
  className?: string;
};

export function ModrinthProjectIcon({ iconUrl, title, className = "" }: ModrinthProjectIconProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(iconUrl) && !imageFailed;

  useEffect(() => setImageFailed(false), [iconUrl]);

  return (
    <div className={`modrinth-project-icon ${className}`.trim()} aria-hidden="true">
      {hasImage ? (
        <img
          crossOrigin="anonymous"
          src={iconUrl ?? undefined}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{title.trim().charAt(0).toUpperCase() || "M"}</span>
      )}
    </div>
  );
}
