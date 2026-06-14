import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as skinview3d from "skinview3d";
import type {
  MinecraftCape,
  MinecraftProfile,
  MinecraftSkin,
  MicrosoftAccount,
} from "../../types";

type SkinVariant = "CLASSIC" | "SLIM";
type PreviewMotion = "STILL" | "IDLE" | "WALK" | "RUN" | "WAVE";
type ProfileAction = "skin" | "skin-reset" | "cape" | "cape-hide" | null;

type SkinDraft = {
  fileName: string;
  bytes: number[];
  dataUrl: string;
};

const PREVIEW_ZOOM = 0.82;
const PREVIEW_MIN_DISTANCE = 26;
const PREVIEW_MAX_DISTANCE = 96;

interface Props {
  accounts: MicrosoftAccount[];
  activeAccountId: string | null;
  onSelect: (id: string | null) => void;
  onAccountsChange: (accounts: MicrosoftAccount[]) => void;
  onClose: () => void;
}

function isActiveState(state?: string | null) {
  return state?.toUpperCase() === "ACTIVE";
}

function getActiveSkin(profile: MinecraftProfile | null) {
  return profile?.skins.find((skin) => isActiveState(skin.state)) ?? profile?.skins[0] ?? null;
}

function getActiveCape(profile: MinecraftProfile | null) {
  return profile?.capes.find((cape) => isActiveState(cape.state)) ?? null;
}

function getSkinVariant(skin: MinecraftSkin | null): SkinVariant {
  return skin?.variant?.toUpperCase() === "SLIM" ? "SLIM" : "CLASSIC";
}

function getCapeLabel(cape: MinecraftCape | null) {
  return cape?.alias || cape?.id || "NO CAPE";
}

function toViewerModel(variant: SkinVariant) {
  return (variant === "SLIM" ? "slim" : "default") as "slim" | "default";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read skin preview"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read skin file"));
    reader.readAsDataURL(file);
  });
}

function makePreviewAnimation(mode: PreviewMotion) {
  if (mode === "STILL") return null;

  const animation =
    mode === "WALK"
      ? new skinview3d.WalkingAnimation()
      : mode === "RUN"
        ? new skinview3d.RunningAnimation()
        : mode === "WAVE"
          ? new skinview3d.WaveAnimation("right")
          : new skinview3d.IdleAnimation();

  animation.speed = mode === "RUN" ? 0.82 : mode === "WALK" ? 0.7 : mode === "WAVE" ? 0.9 : 0.6;
  return animation;
}

function resetPreviewCamera(viewer: skinview3d.SkinViewer) {
  viewer.camera.position.set(0, 0, 1);
  viewer.camera.rotation.set(0, 0, 0);
  viewer.zoom = PREVIEW_ZOOM;
  viewer.controls.target.set(0, 0, 0);
  viewer.controls.minDistance = PREVIEW_MIN_DISTANCE;
  viewer.controls.maxDistance = PREVIEW_MAX_DISTANCE;
  viewer.controls.update();
  viewer.controls.saveState();
  viewer.render();
}

function MinecraftSkinPreview({
  skinUrl,
  capeUrl,
  variant,
  autoRotate,
  secondLayerVisible,
  motion,
  zoomEnabled,
  resetKey,
}: {
  skinUrl: string | null;
  capeUrl: string | null;
  variant: SkinVariant;
  autoRotate: boolean;
  secondLayerVisible: boolean;
  motion: PreviewMotion;
  zoomEnabled: boolean;
  resetKey: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<skinview3d.SkinViewer | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    const rect = parent.getBoundingClientRect();
    const viewer = new skinview3d.SkinViewer({
      canvas,
      width: Math.max(260, Math.round(rect.width || 320)),
      height: Math.max(300, Math.round(rect.height || 360)),
      fov: 52,
      zoom: PREVIEW_ZOOM,
      enableControls: true,
    });

    viewer.autoRotate = autoRotate;
    viewer.autoRotateSpeed = 0.7;
    viewer.globalLight.intensity = 2.35;
    viewer.cameraLight.intensity = 0.65;
    viewer.controls.enablePan = false;
    viewer.controls.enableZoom = zoomEnabled;
    viewer.controls.zoomSpeed = 0.85;
    viewer.controls.minDistance = PREVIEW_MIN_DISTANCE;
    viewer.controls.maxDistance = PREVIEW_MAX_DISTANCE;
    viewer.playerObject.skin.setOuterLayerVisible(secondLayerVisible);
    resetPreviewCamera(viewer);

    viewerRef.current = viewer;
    setViewerReady(true);

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      viewer.setSize(
        Math.max(240, Math.round(entry.contentRect.width)),
        Math.max(280, Math.round(entry.contentRect.height)),
      );
    });

    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
      viewer.dispose();
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    viewer.autoRotate = autoRotate;
  }, [autoRotate, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    viewer.playerObject.skin.setOuterLayerVisible(secondLayerVisible);
    viewer.render();
  }, [secondLayerVisible, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    viewer.controls.enableZoom = zoomEnabled;
  }, [zoomEnabled, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    viewer.animation = makePreviewAnimation(motion);
  }, [motion, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || resetKey === 0) return;

    viewer.playerObject.rotation.set(0, 0, 0);
    resetPreviewCamera(viewer);
  }, [resetKey, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    setViewerError("");
    if (!skinUrl) {
      viewer.loadSkin(null);
      return;
    }

    const result = viewer.loadSkin(skinUrl, { model: toViewerModel(variant) });
    if (result instanceof Promise) {
      void result
        .then(() => {
          viewer.playerObject.skin.setOuterLayerVisible(secondLayerVisible);
        })
        .catch((error) => setViewerError(String(error)));
    }
  }, [skinUrl, variant, secondLayerVisible, viewerReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;

    setViewerError("");
    if (!capeUrl) {
      viewer.loadCape(null);
      return;
    }

    const result = viewer.loadCape(capeUrl, { backEquipment: "cape" });
    if (result instanceof Promise) {
      void result.catch((error) => setViewerError(String(error)));
    }
  }, [capeUrl, viewerReady]);

  return (
    <div className="ms-preview-canvas-shell">
      <canvas ref={canvasRef} className="ms-preview-canvas" />
      {!skinUrl && <div className="ms-preview-empty">NO SKIN DATA</div>}
      {viewerError && <div className="ms-preview-error">{viewerError}</div>}
    </div>
  );
}

function MinecraftCapeThumb({ url }: { url: string | null }) {
  if (!url) {
    return <span className="ms-cape-thumb ms-cape-thumb-empty" />;
  }

  const capeStyle = { backgroundImage: `url(${JSON.stringify(url)})` };
  return (
    <span className="ms-cape-thumb ms-cape-thumb-cape">
      <span className="ms-cape-face ms-cape-face-front" style={capeStyle} />
      <span className="ms-cape-face ms-cape-face-back" style={capeStyle} />
    </span>
  );
}

export function MicrosoftAccountsModal({
  accounts,
  activeAccountId,
  onSelect,
  onAccountsChange,
  onClose,
}: Props) {
  const skinFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? accounts[0] ?? null,
    [accounts, activeAccountId],
  );

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profile, setProfile] = useState<MinecraftProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileAction, setProfileAction] = useState<ProfileAction>(null);
  const [skinVariant, setSkinVariant] = useState<SkinVariant>("CLASSIC");
  const [skinDraft, setSkinDraft] = useState<SkinDraft | null>(null);
  const [previewSkinUrl, setPreviewSkinUrl] = useState<string | null>(null);
  const [previewCapeId, setPreviewCapeId] = useState<string | null>(null);
  const [previewCapeUrl, setPreviewCapeUrl] = useState<string | null>(null);
  const [previewAutoRotate, setPreviewAutoRotate] = useState(true);
  const [previewSecondLayer, setPreviewSecondLayer] = useState(true);
  const [previewMotion, setPreviewMotion] = useState<PreviewMotion>("IDLE");
  const [previewZoomEnabled, setPreviewZoomEnabled] = useState(true);
  const [previewResetKey, setPreviewResetKey] = useState(0);

  const activeSkin = useMemo(() => getActiveSkin(profile), [profile]);
  const activeCape = useMemo(() => getActiveCape(profile), [profile]);
  const activeCapeId = activeCape?.id ?? null;
  const capeDirty = previewCapeId !== activeCapeId;

  const syncPreviewFromProfile = (nextProfile: MinecraftProfile | null) => {
    const nextSkin = getActiveSkin(nextProfile);
    const nextCape = getActiveCape(nextProfile);

    setProfile(nextProfile);
    setSkinDraft(null);
    setSkinVariant(getSkinVariant(nextSkin));
    setPreviewSkinUrl(nextSkin?.url ?? null);
    setPreviewCapeId(nextCape?.id ?? null);
    setPreviewCapeUrl(nextCape?.url ?? null);
  };

  useEffect(() => {
    if (!selectedAccount) {
      syncPreviewFromProfile(null);
      setProfileLoading(false);
      setProfileError("");
      return undefined;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError("");
    setSkinDraft(null);

    invoke<MinecraftProfile>("get_minecraft_profile", { accountId: selectedAccount.id })
      .then((nextProfile) => {
        if (!cancelled) syncPreviewFromProfile(nextProfile);
      })
      .catch((error) => {
        if (!cancelled) {
          syncPreviewFromProfile(null);
          setProfileError(String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAccount?.id]);

  const handleAdd = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const account = await invoke<MicrosoftAccount>("start_microsoft_auth");
      const updated = [...accounts.filter((a) => a.uuid !== account.uuid), account];
      onAccountsChange(updated);
      onSelect(account.id);
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("cancelled")) setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await invoke("remove_microsoft_account", { id });
      const updated = accounts.filter((a) => a.id !== id);
      onAccountsChange(updated);
      if (activeAccountId === id) {
        onSelect(updated[0]?.id ?? null);
      }
    } catch (e) {
      setAuthError(String(e));
    }
  };

  const handlePickSkin = async (file: File | null) => {
    if (!file) return;
    setProfileError("");

    try {
      if (!file.name.toLowerCase().endsWith(".png")) {
        throw new Error("Skin file must be a PNG");
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error("Skin file is too large");
      }

      const [arrayBuffer, dataUrl] = await Promise.all([
        file.arrayBuffer(),
        readFileAsDataUrl(file),
      ]);
      const bytes = Array.from(new Uint8Array(arrayBuffer));
      const draft = { fileName: file.name, bytes, dataUrl };
      setSkinDraft(draft);
      setPreviewSkinUrl(draft.dataUrl);
    } catch (error) {
      setProfileError(String(error));
    }
  };

  const handleApplySkin = async () => {
    if (!selectedAccount || !skinDraft) return;

    setProfileAction("skin");
    setProfileError("");
    try {
      const nextProfile = await invoke<MinecraftProfile>("upload_minecraft_skin", {
        accountId: selectedAccount.id,
        variant: skinVariant,
        fileName: skinDraft.fileName,
        data: skinDraft.bytes,
      });
      syncPreviewFromProfile(nextProfile);
    } catch (error) {
      setProfileError(String(error));
    } finally {
      setProfileAction(null);
    }
  };

  const handleResetSkin = async () => {
    if (!selectedAccount) return;

    setProfileAction("skin-reset");
    setProfileError("");
    try {
      const nextProfile = await invoke<MinecraftProfile>("reset_minecraft_skin", {
        accountId: selectedAccount.id,
      });
      syncPreviewFromProfile(nextProfile);
    } catch (error) {
      setProfileError(String(error));
    } finally {
      setProfileAction(null);
    }
  };

  const handleApplyCape = async () => {
    if (!selectedAccount) return;

    setProfileAction("cape");
    setProfileError("");
    try {
      const nextProfile = previewCapeId
        ? await invoke<MinecraftProfile>("set_minecraft_cape", {
            accountId: selectedAccount.id,
            capeId: previewCapeId,
          })
        : await invoke<MinecraftProfile>("hide_minecraft_cape", {
            accountId: selectedAccount.id,
          });
      syncPreviewFromProfile(nextProfile);
    } catch (error) {
      setProfileError(String(error));
    } finally {
      setProfileAction(null);
    }
  };

  const handleHideCape = async () => {
    if (!selectedAccount) return;

    setProfileAction("cape-hide");
    setProfileError("");
    try {
      const nextProfile = await invoke<MinecraftProfile>("hide_minecraft_cape", {
        accountId: selectedAccount.id,
      });
      syncPreviewFromProfile(nextProfile);
    } catch (error) {
      setProfileError(String(error));
    } finally {
      setProfileAction(null);
    }
  };

  return (
    <div className="confirm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ms-modal ms-modal-manager" onClick={(e) => e.stopPropagation()}>
        <div className="ms-modal-head">
          <span className="ms-modal-tag">ACCOUNT</span>
          <span className="ms-modal-title">Microsoft Profile Manager</span>
          <button className="ms-modal-close" onClick={onClose} title="Close" type="button">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ms-manager-body">
          <aside className="ms-account-pane">
            <div className="ms-manager-kicker">ACCOUNTS</div>

            <div className="ms-account-list">
              {accounts.length === 0 && !authLoading && (
                <div className="ms-modal-empty ms-modal-empty-compact">
                  <span>No Microsoft accounts added yet.</span>
                  <span className="ms-modal-empty-sub">Sign in to load Minecraft profile data.</span>
                </div>
              )}

              {accounts.map((acc) => {
                const isActive = acc.id === selectedAccount?.id;
                return (
                  <div
                    key={acc.id}
                    className={`ms-account-row${isActive ? " active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(acc.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onSelect(acc.id);
                    }}
                  >
                    <div className="ms-account-avatar">
                      <img
                        src={`https://mc-heads.net/avatar/${acc.uuid}/32`}
                        alt={acc.username}
                        width={32}
                        height={32}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div className="ms-account-info">
                      <span className="ms-account-name">{acc.username}</span>
                      <span className="ms-account-uuid">{acc.uuid}</span>
                    </div>
                    <div className="ms-account-actions">
                      {isActive && <span className="ms-account-badge">ACTIVE</span>}
                      <button
                        className="ms-account-remove"
                        title="Remove account"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRemove(acc.id);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M1.5 3H10.5M4.5 3V2H7.5V3M2.5 3L3 10H9L9.5 3"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {authLoading && (
                <div className="ms-auth-loading">
                  <div className="ms-auth-spinner" />
                  <span>Waiting for sign-in...</span>
                  <span className="ms-auth-loading-sub">Complete login in the Microsoft window</span>
                </div>
              )}
            </div>

            {authError && <div className="ms-auth-error">{authError}</div>}

            <button className="ms-add-btn" onClick={handleAdd} disabled={authLoading} type="button">
              {authLoading ? (
                <>
                  <div className="ms-add-spinner" />
                  Signing in...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  ADD MICROSOFT ACCOUNT
                </>
              )}
            </button>
          </aside>

          <section className="ms-profile-pane">
            {!selectedAccount ? (
              <div className="ms-profile-empty">
                <span>NO ACCOUNT SELECTED</span>
              </div>
            ) : (
              <>
                <div className="ms-profile-head">
                  <div>
                    <span className="ms-profile-tag">MINECRAFT PROFILE</span>
                    <strong>{profile?.name ?? selectedAccount.username}</strong>
                  </div>
                  <span className="ms-profile-uuid">{selectedAccount.uuid}</span>
                </div>

                {profileLoading ? (
                  <div className="ms-profile-loading">
                    <div className="ms-auth-spinner" />
                    <span>LOADING PROFILE...</span>
                  </div>
                ) : (
                  <div className="ms-profile-grid">
                    <div className="ms-preview-panel">
                      <MinecraftSkinPreview
                        skinUrl={previewSkinUrl}
                        capeUrl={previewCapeUrl}
                        variant={skinVariant}
                        autoRotate={previewAutoRotate}
                        secondLayerVisible={previewSecondLayer}
                        motion={previewMotion}
                        zoomEnabled={previewZoomEnabled}
                        resetKey={previewResetKey}
                      />
                      <div className="ms-preview-meta">
                        <span>
                          {skinDraft ? "LOCAL PREVIEW" : activeSkin?.variant ?? "DEFAULT"} /{" "}
                          {previewSecondLayer ? "LAYER 2" : "BASE"}
                        </span>
                        <strong>{previewCapeUrl ? getCapeLabel(profile?.capes.find((cape) => cape.id === previewCapeId) ?? activeCape) : "NO CAPE"}</strong>
                      </div>
                    </div>

                    <div className="ms-editor-panel">
                      <section className="ms-editor-section ms-viewer-section">
                        <div className="ms-editor-head">
                          <span>VIEWER</span>
                          <strong>{previewAutoRotate ? "ROTATING" : "PAUSED"}</strong>
                        </div>

                        <div className="ms-motion-grid" role="tablist" aria-label="Preview animation">
                          {(["STILL", "IDLE", "WALK", "RUN", "WAVE"] as PreviewMotion[]).map((motion) => (
                            <button
                              key={motion}
                              className={previewMotion === motion ? "active" : ""}
                              type="button"
                              onClick={() => setPreviewMotion(motion)}
                            >
                              {motion}
                            </button>
                          ))}
                        </div>

                        <div className="ms-viewer-controls">
                          <button
                            className={`ghost-action ms-toggle-action${previewAutoRotate ? " active" : ""}`}
                            type="button"
                            onClick={() => setPreviewAutoRotate((value) => !value)}
                          >
                            {previewAutoRotate ? "PAUSE ROTATE" : "AUTO ROTATE"}
                          </button>
                          <button
                            className={`ghost-action ms-toggle-action${previewSecondLayer ? " active" : ""}`}
                            type="button"
                            onClick={() => setPreviewSecondLayer((value) => !value)}
                          >
                            {previewSecondLayer ? "HIDE LAYER 2" : "SHOW LAYER 2"}
                          </button>
                          <button
                            className={`ghost-action ms-toggle-action${previewZoomEnabled ? " active" : ""}`}
                            type="button"
                            onClick={() => setPreviewZoomEnabled((value) => !value)}
                          >
                            {previewZoomEnabled ? "ZOOM OFF" : "ZOOM ON"}
                          </button>
                          <button
                            className="ghost-action ms-toggle-action"
                            type="button"
                            onClick={() => setPreviewResetKey((value) => value + 1)}
                          >
                            RESET VIEW
                          </button>
                        </div>
                      </section>

                      <section className="ms-editor-section">
                        <div className="ms-editor-head">
                          <span>SKIN</span>
                          <strong>{skinDraft?.fileName ?? activeSkin?.alias ?? activeSkin?.variant ?? "DEFAULT"}</strong>
                        </div>

                        <div className="ms-segmented" role="tablist" aria-label="Skin model">
                          {(["CLASSIC", "SLIM"] as SkinVariant[]).map((variant) => (
                            <button
                              key={variant}
                              className={skinVariant === variant ? "active" : ""}
                              type="button"
                              onClick={() => setSkinVariant(variant)}
                            >
                              {variant}
                            </button>
                          ))}
                        </div>

                        <div className="ms-action-pair">
                          <button
                            className="ghost-action"
                            type="button"
                            onClick={() => skinFileInputRef.current?.click()}
                            disabled={profileAction !== null}
                          >
                            PICK SKIN
                          </button>
                          <button
                            className="primary-action ms-compact-primary"
                            type="button"
                            onClick={handleApplySkin}
                            disabled={!skinDraft || profileAction !== null}
                          >
                            {profileAction === "skin" ? "APPLYING..." : "APPLY SKIN"}
                          </button>
                        </div>

                        <button
                          className="ms-inline-danger"
                          type="button"
                          onClick={handleResetSkin}
                          disabled={profileAction !== null}
                        >
                          {profileAction === "skin-reset" ? "RESETTING..." : "RESET SKIN"}
                        </button>
                      </section>

                      <section className="ms-editor-section ms-editor-section-fill">
                        <div className="ms-editor-head">
                          <span>CAPES</span>
                          <strong>{profile?.capes.length ?? 0}</strong>
                        </div>

                        <div className="ms-cape-list">
                          <button
                            className={`ms-cape-row${previewCapeId === null ? " active" : ""}`}
                            type="button"
                            onClick={() => {
                              setPreviewCapeId(null);
                              setPreviewCapeUrl(null);
                            }}
                          >
                            <MinecraftCapeThumb url={null} />
                            <span>NO CAPE</span>
                            {activeCapeId === null && <strong>ACTIVE</strong>}
                          </button>

                          {profile?.capes.map((cape) => {
                            const capeId = cape.id ?? "";
                            const isPreviewed = capeId !== "" && capeId === previewCapeId;
                            const isActive = capeId !== "" && capeId === activeCapeId;

                            return (
                              <button
                                key={capeId || cape.url || cape.alias}
                                className={`ms-cape-row${isPreviewed ? " active" : ""}`}
                                type="button"
                                disabled={!capeId || !cape.url}
                                onClick={() => {
                                  setPreviewCapeId(capeId);
                                  setPreviewCapeUrl(cape.url ?? null);
                                }}
                              >
                                <MinecraftCapeThumb url={cape.url ?? null} />
                                <span>{getCapeLabel(cape)}</span>
                                {isActive && <strong>ACTIVE</strong>}
                              </button>
                            );
                          })}
                        </div>

                        <div className="ms-action-pair ms-cape-actions">
                          <button
                            className="primary-action ms-compact-primary"
                            type="button"
                            onClick={handleApplyCape}
                            disabled={!capeDirty || profileAction !== null}
                          >
                            {profileAction === "cape" ? "SAVING..." : "APPLY CAPE"}
                          </button>
                          <button
                            className="ghost-action"
                            type="button"
                            onClick={handleHideCape}
                            disabled={!activeCapeId || profileAction !== null}
                          >
                            {profileAction === "cape-hide" ? "HIDING..." : "HIDE CAPE"}
                          </button>
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {profileError && <div className="ms-auth-error ms-profile-error">{profileError}</div>}
              </>
            )}
          </section>
        </div>

        <input
          ref={skinFileInputRef}
          className="ms-hidden-file-input"
          type="file"
          accept="image/png,.png"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = "";
            void handlePickSkin(file);
          }}
        />
      </div>
    </div>
  );
}
