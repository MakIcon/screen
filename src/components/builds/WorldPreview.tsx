import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "../../i18n/locale";

type Props = {
  instanceId: string;
  worldName: string;
  backupId?: string;
  revision?: string;
};

export function WorldPreview({ instanceId, worldName, backupId, revision }: Props) {
  const tr = useTranslation();
  const [source, setSource] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSource("");
    invoke<number[] | null>("load_world_preview", {
      instanceId,
      worldName,
      backupId: backupId ?? null,
    })
      .then((bytes) => {
        if (!active || !bytes) return;
        objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
        setSource(objectUrl);
      })
      .catch(() => {
        /* A world can still be backed up without a preview. */
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [instanceId, worldName, backupId, revision]);

  return (
    <span className="wb-world-preview" aria-hidden="true">
      {source ? (
        <img src={source} alt="" draggable={false} onError={() => setSource("")} />
      ) : (
        <span>
          {tr("worldPreview.no")}
          <br />
          {tr("worldPreview.preview")}
        </span>
      )}
    </span>
  );
}
