import { useEffect, useRef, useState } from "react";
import * as skinview3d from "skinview3d";
import { toErrorMessage } from "../../utils/errors";

export type SkinVariant = "CLASSIC" | "SLIM";
export type PreviewMotion = "STILL" | "IDLE" | "WALK" | "RUN" | "WAVE";

const PREVIEW_ZOOM = 0.82;
const PREVIEW_MIN_DISTANCE = 26;
const PREVIEW_MAX_DISTANCE = 96;

function toViewerModel(variant: SkinVariant) {
  return (variant === "SLIM" ? "slim" : "default") as "slim" | "default";
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

export function MinecraftSkinPreview({
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create the viewer once; prop changes are applied by the effects below
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
        .catch((error) => setViewerError(toErrorMessage(error)));
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
      void result.catch((error) => setViewerError(toErrorMessage(error)));
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
