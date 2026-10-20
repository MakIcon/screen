import type { CSSProperties, Dispatch, KeyboardEvent, PointerEvent, SetStateAction } from "react";
import { useRef, useState } from "react";
import "./BuildCardEditor.css";
import { ElementSlider } from "../inputs/ElementSlider";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { BuildCardContentView, resolveBuildCardTags } from "./BuildCardContentView";
import { BuildCardVerticalBody } from "./BuildCardVerticalBody";
import { BuildCardPin } from "./BuildCardPin";
import {
  BUILD_CARD_GRID_SIZE,
  BUILD_CARD_PIN_ELEMENT_ID,
  getBuildCardAppearanceStyle,
  getBuildCardBadgeStyle,
  getBuildCardBadgeText,
  getBuildCardElementScale,
  getBuildCardElementStyle,
  hasBuildCardBackgroundImage,
  shouldShowBuildCardBadge,
  type BuildCardAppearance,
  type BuildCardElementOffset,
  type BuildCardPreviewSize,
} from "./BuildCardSettingsPopup";
import { EditorSection, EditorRow } from "./BuildCardEditorSection";
import { BackgroundSection } from "./BuildCardEditorBackground";
import { BadgeSection } from "./BuildCardEditorBadge";
import { ContentSection } from "./BuildCardEditorContent";
import { BuildCardDrawingCanvas } from "./BuildCardDrawingCanvas";
import { BuildCardResizeHandle } from "./BuildCardResizeHandle";
import { getBuildCardResizeLimit, getBuildCardResizedScale } from "./buildCardResize";
import {
  createPlaceholderAppearanceAttributes,
  createPlaceholderValueAttributes,
} from "../../utils/placeholders";
import { useTranslation } from "../../i18n/locale";

type DragSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  bounds: GridBounds;
  lastX: number;
  lastY: number;
};

type GridBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ResizeSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  startScale: number;
  width: number;
  height: number;
  maxScale: number;
  lastScale: number;
};

function getResizeMaxScale(card: HTMLDivElement, element: HTMLElement, scale: number) {
  const cardRect = card.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const cardStyle = getComputedStyle(card);
  return getBuildCardResizeLimit({
    width: elementRect.width,
    height: elementRect.height,
    scale,
    availableWidth: cardRect.right - parseFloat(cardStyle.borderRightWidth) - elementRect.left,
    availableHeight: cardRect.bottom - parseFloat(cardStyle.borderBottomWidth) - elementRect.top,
  });
}

function getGridBounds(
  card: HTMLDivElement,
  element: HTMLElement,
  offset: BuildCardElementOffset,
): GridBounds {
  const cardRect = card.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const cardStyle = getComputedStyle(card);
  const innerLeft = cardRect.left + parseFloat(cardStyle.borderLeftWidth);
  const innerTop = cardRect.top + parseFloat(cardStyle.borderTopWidth);
  const innerRight = cardRect.right - parseFloat(cardStyle.borderRightWidth);
  const innerBottom = cardRect.bottom - parseFloat(cardStyle.borderBottomWidth);
  const naturalLeft = elementRect.left - offset.x;
  const naturalTop = elementRect.top - offset.y;

  return {
    minX: Math.min(0, Math.ceil((innerLeft - naturalLeft) / BUILD_CARD_GRID_SIZE)),
    maxX: Math.max(
      0,
      Math.floor((innerRight - elementRect.width - naturalLeft) / BUILD_CARD_GRID_SIZE),
    ),
    minY: Math.min(0, Math.ceil((innerTop - naturalTop) / BUILD_CARD_GRID_SIZE)),
    maxY: Math.max(
      0,
      Math.floor((innerBottom - elementRect.height - naturalTop) / BUILD_CARD_GRID_SIZE),
    ),
  };
}

function clampGridUnit(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type Props = {
  buildName: string;
  buildVersion: string;
  buildLoader: string;
  buildRamGb: number;
  lastPlayedLabel: string;
  badgePreviewText: string;
  resolvePreviewText: (template: string) => string;
  previewCardSize: BuildCardPreviewSize | null;
  draft: BuildCardAppearance;
  onDraftChange: Dispatch<SetStateAction<BuildCardAppearance>>;
  onUploadImage: (file: File | null) => void;
  onResetAll: () => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  showHeader?: boolean;
};

export function BuildCardEditor({
  badgePreviewText,
  resolvePreviewText,
  previewCardSize,
  draft,
  onDraftChange,
  onUploadImage,
  onResetAll,
  onClose,
  onSave,
  showHeader = true,
}: Props) {
  const tr = useTranslation();
  const [layoutOpen, setLayoutOpen] = useState(true);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  function updateElementScale(id: string, scale: number) {
    onDraftChange((prev) => {
      const elementScales = { ...prev.elementScales };
      if (scale === 1) delete elementScales[id];
      else elementScales[id] = scale;
      return { ...prev, elementScales };
    });
  }

  function handleGridPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!gridEnabled || event.button !== 0) return;
    if (dragSessionRef.current || resizeSessionRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const element = target.closest<HTMLElement>("[data-card-move-id]");
    const card = event.currentTarget;
    if (!element || !card.contains(element)) {
      setSelectedElementId(null);
      return;
    }

    const id = element.dataset.cardMoveId;
    if (!id) return;
    setSelectedElementId(id);

    const resizeHandle = target.closest<HTMLElement>("[data-card-resize-id]");
    if (resizeHandle) {
      const scale = getBuildCardElementScale(draft, id);
      const rect = element.getBoundingClientRect();
      resizeSessionRef.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScale: scale,
        width: rect.width,
        height: rect.height,
        maxScale: getResizeMaxScale(card, element, scale),
        lastScale: scale,
      };
      resizeHandle.focus({ preventScroll: true });
      card.setPointerCapture(event.pointerId);
      setResizingId(id);
      event.preventDefault();
      return;
    }

    element.focus({ preventScroll: true });
    const currentOffset = draft.layoutOffsets[id] ?? { x: 0, y: 0 };

    dragSessionRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: currentOffset.x,
      startOffsetY: currentOffset.y,
      bounds: getGridBounds(card, element, currentOffset),
      lastX: currentOffset.x,
      lastY: currentOffset.y,
    };
    card.setPointerCapture(event.pointerId);
    setDraggingId(id);
    event.preventDefault();
  }

  function handleGridPointerMove(event: PointerEvent<HTMLDivElement>) {
    const resizeSession = resizeSessionRef.current;
    if (resizeSession && resizeSession.pointerId === event.pointerId) {
      const dx = event.clientX - resizeSession.startX;
      const dy = event.clientY - resizeSession.startY;
      if (
        Math.abs(dx) < 3 &&
        Math.abs(dy) < 3 &&
        resizeSession.lastScale === resizeSession.startScale
      )
        return;
      const scale = getBuildCardResizedScale(
        resizeSession.startScale,
        resizeSession.width,
        resizeSession.height,
        dx,
        dy,
        resizeSession.maxScale,
      );
      if (scale === resizeSession.lastScale) return;
      resizeSession.lastScale = scale;
      updateElementScale(resizeSession.id, scale);
      return;
    }

    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (
      Math.abs(dx) < 3 &&
      Math.abs(dy) < 3 &&
      session.lastX === session.startOffsetX &&
      session.lastY === session.startOffsetY
    )
      return;

    const x =
      clampGridUnit(
        Math.round((session.startOffsetX + dx) / BUILD_CARD_GRID_SIZE),
        session.bounds.minX,
        session.bounds.maxX,
      ) * BUILD_CARD_GRID_SIZE;
    const y =
      clampGridUnit(
        Math.round((session.startOffsetY + dy) / BUILD_CARD_GRID_SIZE),
        session.bounds.minY,
        session.bounds.maxY,
      ) * BUILD_CARD_GRID_SIZE;
    if (x === session.lastX && y === session.lastY) return;
    session.lastX = x;
    session.lastY = y;
    onDraftChange((prev) => ({
      ...prev,
      layoutOffsets: { ...prev.layoutOffsets, [session.id]: { x, y } },
    }));
  }

  function handleGridPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const session = resizeSessionRef.current ?? dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSessionRef.current = null;
    resizeSessionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingId(null);
    setResizingId(null);
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!gridEnabled) return;
    if (event.key === "Escape") {
      setSelectedElementId(null);
      return;
    }
    const step = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key];
    if (!step) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const resizeId = target.dataset.cardResizeId;
    if (resizeId) {
      const element = target.closest<HTMLElement>("[data-card-move-id]");
      if (!element) return;
      event.preventDefault();
      const scale = getBuildCardElementScale(draft, resizeId);
      const rect = element.getBoundingClientRect();
      const change = (step.x || step.y) * (event.shiftKey ? 0.1 : 0.05);
      const nextScale = getBuildCardResizedScale(
        scale,
        rect.width,
        rect.height,
        (rect.width / scale) * change,
        (rect.height / scale) * change,
        getResizeMaxScale(event.currentTarget, element, scale),
      );
      if (nextScale !== scale) updateElementScale(resizeId, nextScale);
      return;
    }
    const id = target.dataset.cardMoveId;
    if (!id) return;
    event.preventDefault();

    const currentOffset = draft.layoutOffsets[id] ?? { x: 0, y: 0 };
    const bounds = getGridBounds(event.currentTarget, target, currentOffset);
    const x =
      step.x === 0
        ? currentOffset.x
        : clampGridUnit(
            Math.round(currentOffset.x / BUILD_CARD_GRID_SIZE) + step.x,
            bounds.minX,
            bounds.maxX,
          ) * BUILD_CARD_GRID_SIZE;
    const y =
      step.y === 0
        ? currentOffset.y
        : clampGridUnit(
            Math.round(currentOffset.y / BUILD_CARD_GRID_SIZE) + step.y,
            bounds.minY,
            bounds.maxY,
          ) * BUILD_CARD_GRID_SIZE;
    if (x === currentOffset.x && y === currentOffset.y) return;
    onDraftChange((prev) => ({
      ...prev,
      layoutOffsets: { ...prev.layoutOffsets, [id]: { x, y } },
    }));
  }

  const previewContentTags = resolveBuildCardTags(draft, resolvePreviewText);
  const badgeTemplate = getBuildCardBadgeText(draft);
  const basePreviewHeight = previewCardSize?.height ?? 86;
  const heightValue = draft.cardHeight > 0 ? draft.cardHeight : basePreviewHeight;
  const drawingWidth = Math.max(1, Math.round(previewCardSize?.width ?? 356));
  const drawingHeight = Math.max(1, Math.round(heightValue));
  const layoutStyle = previewCardSize
    ? ({
        ["--bce-preview-card-width" as string]: `${previewCardSize.width}px`,
        ["--bce-preview-card-height" as string]: `${heightValue}px`,
        ["--bce-preview-shell-width" as string]: `${previewCardSize.width}px`,
      } satisfies CSSProperties)
    : ({
        ["--bce-preview-card-height" as string]: `${heightValue}px`,
      } satisfies CSSProperties);

  return (
    <div className="bce-editor" {...createPlaceholderValueAttributes(resolvePreviewText)}>
      {showHeader && (
        <div className="bce-header">
          <span className="bce-header-title">{tr("buildCard.cardAppearance")}</span>
          <div className="bce-header-actions">
            <button className="bce-hdr-btn" type="button" onClick={onResetAll}>
              {tr("buildCard.reset")}
            </button>
            <button
              className="bce-hdr-btn bce-hdr-btn--save"
              type="button"
              onClick={() => void onSave()}
            >
              {tr("buildCard.save")}
            </button>
            <button
              className="bce-hdr-close"
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
          </div>
        </div>
      )}

      <div className="bce-layout" style={layoutStyle}>
        <div className="bce-preview-col">
          <span className="bce-preview-label">
            {draft.backgroundMode === "draw" && !gridEnabled
              ? tr("ui.drawingCanvas")
              : tr("ui.preview")}
          </span>
          <div className="bce-preview-stage">
            {draft.backgroundMode === "draw" && !gridEnabled ? (
              <BuildCardDrawingCanvas
                width={drawingWidth}
                height={drawingHeight}
                image={draft.drawingImage}
                onImageChange={(drawingImage) =>
                  onDraftChange((prev) => ({ ...prev, drawingImage }))
                }
              />
            ) : (
              <div
                className={`instance-card bce-preview-card ${hasBuildCardBackgroundImage(draft) ? "instance-card-with-image" : ""} ${gridEnabled ? "bce-preview-card--grid" : ""} ${draggingId ? "bce-preview-card--dragging" : ""} ${resizingId ? "bce-preview-card--resizing" : ""}`}
                style={getBuildCardAppearanceStyle(draft)}
                onPointerDown={handleGridPointerDown}
                onPointerMove={handleGridPointerMove}
                onPointerUp={handleGridPointerEnd}
                onPointerCancel={handleGridPointerEnd}
                onLostPointerCapture={handleGridPointerEnd}
                onKeyDown={handleGridKeyDown}
                onFocusCapture={(event) => {
                  if (!gridEnabled || !(event.target instanceof Element)) return;
                  const element = event.target.closest<HTMLElement>("[data-card-move-id]");
                  if (element?.dataset.cardMoveId) setSelectedElementId(element.dataset.cardMoveId);
                }}
              >
                <BuildCardVerticalBody
                  appearance={draft}
                  freeze={draggingId !== null || resizingId !== null}
                >
                  <div className="instance-card-top">
                    <span
                      className={`instance-name ${gridEnabled ? "build-card-movable" : ""} ${gridEnabled && selectedElementId === "title" ? "build-card-movable--selected" : ""}`}
                      data-card-layout-element
                      data-card-move-id={gridEnabled ? "title" : undefined}
                      tabIndex={gridEnabled ? 0 : undefined}
                      style={getBuildCardElementStyle(draft, "title")}
                      {...createPlaceholderAppearanceAttributes("%build_name%", resolvePreviewText)}
                    >
                      {resolvePreviewText("%build_name%")}
                      {gridEnabled && selectedElementId === "title" && (
                        <BuildCardResizeHandle appearance={draft} id="title" />
                      )}
                    </span>
                    <BuildCardPin
                      appearance={draft}
                      movable={gridEnabled}
                      selected={selectedElementId === BUILD_CARD_PIN_ELEMENT_ID}
                      onAnchorChange={(pinAnchor) =>
                        onDraftChange((prev) => ({ ...prev, pinAnchor }))
                      }
                    />
                    {shouldShowBuildCardBadge(draft, true) && (
                      <span
                        className={`instance-running-badge ${gridEnabled ? "build-card-movable" : ""} ${gridEnabled && selectedElementId === "badge" ? "build-card-movable--selected" : ""}`}
                        data-card-layout-element
                        data-card-move-id={gridEnabled ? "badge" : undefined}
                        tabIndex={gridEnabled ? 0 : undefined}
                        style={{
                          ...getBuildCardBadgeStyle(draft),
                          ...getBuildCardElementStyle(draft, "badge"),
                        }}
                        {...createPlaceholderAppearanceAttributes(
                          badgeTemplate,
                          resolvePreviewText,
                        )}
                      >
                        {badgePreviewText}
                        {gridEnabled && selectedElementId === "badge" && (
                          <BuildCardResizeHandle appearance={draft} id="badge" />
                        )}
                      </span>
                    )}
                  </div>
                  <div className="instance-card-meta instance-card-meta--content">
                    <BuildCardContentView
                      mode={draft.contentMode}
                      align={draft.contentTextAlign}
                      tags={previewContentTags}
                      strokeEnabled={draft.contentTextStrokeEnabled}
                      appearance={draft}
                      movable={gridEnabled}
                      selectedElementId={selectedElementId}
                    />
                  </div>
                </BuildCardVerticalBody>
              </div>
            )}
          </div>
        </div>

        <CustomScrollArea className="bce-controls-scroll" style={{ minHeight: 0 }}>
          <div className="bce-controls-col">
            <BackgroundSection
              draft={draft}
              onDraftChange={onDraftChange}
              onUploadImage={onUploadImage}
            />

            <EditorSection
              title={tr("buildCard.layout")}
              open={layoutOpen}
              onToggle={() => setLayoutOpen((prev) => !prev)}
            >
              <EditorRow label={tr("buildCard.height")}>
                <div className="bce-slider-field">
                  <span className="bce-slider-value">{heightValue}px</span>
                  <div className="bce-slider">
                    <ElementSlider
                      showHeader={false}
                      min={72}
                      max={260}
                      step={4}
                      value={heightValue}
                      tickMode="custom"
                      customTicks={[72, 96, 120, 144, 168, 192, 224, 260]}
                      onChange={(value) =>
                        onDraftChange((prev) => ({ ...prev, cardHeight: Number(value) }))
                      }
                    />
                  </div>
                </div>
              </EditorRow>
              <EditorRow label={tr("buildCard.vertical")}>
                <div className="bce-mode-switch">
                  {(["top", "center", "bottom"] as const).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className={`bce-mode-pill ${draft.contentVerticalAlign === align ? "bce-mode-pill--active" : ""}`}
                      onClick={() =>
                        onDraftChange((prev) => ({ ...prev, contentVerticalAlign: align }))
                      }
                    >
                      {align === "top"
                        ? tr("buildCard.top")
                        : align === "center"
                          ? tr("buildCard.center")
                          : tr("buildCard.bottom")}
                    </button>
                  ))}
                </div>
              </EditorRow>
              <EditorRow label={tr("buildCard.grid")}>
                <div className="bce-mode-switch">
                  <button
                    type="button"
                    className={`bce-mode-pill ${gridEnabled ? "bce-mode-pill--active" : ""}`}
                    onClick={() => setGridEnabled(true)}
                  >
                    {tr("buildCard.onEdit")}
                  </button>
                  <button
                    type="button"
                    className={`bce-mode-pill ${!gridEnabled ? "bce-mode-pill--active" : ""}`}
                    onClick={() => {
                      setGridEnabled(false);
                      setSelectedElementId(null);
                    }}
                  >
                    {tr("buildCard.offLock")}
                  </button>
                </div>
              </EditorRow>
              <EditorRow label={tr("buildCard.positions")}>
                <button
                  type="button"
                  className="bce-mini-btn"
                  onClick={() => onDraftChange((prev) => ({ ...prev, layoutOffsets: {} }))}
                  disabled={Object.keys(draft.layoutOffsets).length === 0}
                >
                  {tr("buildCard.resetPositions")}
                </button>
              </EditorRow>
              <EditorRow label={tr("buildCard.sizes")}>
                <button
                  type="button"
                  className="bce-mini-btn"
                  onClick={() => onDraftChange((prev) => ({ ...prev, elementScales: {} }))}
                  disabled={Object.keys(draft.elementScales).length === 0}
                >
                  {tr("buildCard.resetSizes")}
                </button>
              </EditorRow>
              <p className="bce-grid-hint">
                {tr("buildCard.turnOnTheGrid", { gridSize: BUILD_CARD_GRID_SIZE })}
                {draft.backgroundMode === "draw" && ` ${tr("buildCard.turnItOffTo")}`}
              </p>
            </EditorSection>

            <BadgeSection draft={draft} onDraftChange={onDraftChange} />

            <ContentSection
              draft={draft}
              onDraftChange={onDraftChange}
              resolvePreviewText={resolvePreviewText}
            />
          </div>
        </CustomScrollArea>
      </div>
    </div>
  );
}
