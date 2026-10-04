import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Props = {
  instanceId: string;
  worldName: string;
  backupId?: string;
  revision?: string;
};

export function WorldPreview({ instanceId, worldName, backupId, revision }: Props) {
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
          Нет
          <br />
          превью
        </span>
      )}
    </span>
  );
}
