import { useTranslation } from "../../i18n/locale";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import { getTextSearchMatches } from "../../utils/textSearch";
import "./JavaArgsEditor.css";

type JavaArgsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  searchQuery?: string;
  activeSearchMatchIndex?: number;
  searchFocusToken?: number;
  textEditRequest?: JavaArgsTextEditRequest | null;
};

const ROW_HEIGHT = 42;

export type JavaArgsTextEditRequest = {
  id: number;
  start: number;
  end: number;
  replacement: string;
};

type ProgrammaticUndoEntry = {
  before: string;
  after: string;
  selectionStart: number;
  selectionEnd: number;
};

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toLines(value: string) {
  return normalizeNewlines(value).split("\n");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function JavaArgsEditor({
  value,
  onChange,
  className = "",
  ariaLabel,
  searchQuery = "",
  activeSearchMatchIndex = -1,
  searchFocusToken = 0,
  textEditRequest = null,
}: JavaArgsEditorProps) {
  const tr = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handledSearchFocusToken = useRef(0);
  const handledTextEditRequestId = useRef(0);
  const programmaticUndoStack = useRef<ProgrammaticUndoEntry[]>([]);
  const normalizedValue = useMemo(() => normalizeNewlines(value), [value]);
  const lines = useMemo(() => toLines(value), [value]);
  const lineCount = Math.max(lines.length, 1);
  const contentHeight = `${lineCount * ROW_HEIGHT}px`;
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const visibleActiveLine = activeLine === null ? null : Math.min(activeLine, lineCount - 1);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const searchMatches = useMemo(
    () => getTextSearchMatches(normalizedValue, searchQuery),
    [normalizedValue, searchQuery],
  );
  const searchMatchIndexes = useMemo(
    () => searchMatches.map((match) => match.line),
    [searchMatches],
  );
  const searchMatchSet = useMemo(() => new Set(searchMatchIndexes), [searchMatchIndexes]);
  const visibleSearchMatchIndex =
    activeSearchMatchIndex >= 0 && searchMatches.length > 0
      ? clamp(activeSearchMatchIndex, 0, searchMatches.length - 1)
      : 0;
  const activeSearchMatch = searchMatches[visibleSearchMatchIndex] ?? null;
  const activeSearchLine = activeSearchMatch?.line ?? null;

  useEffect(() => {
    if (!hasSearchQuery || !activeSearchMatch) return;

    const scrollRoot = textareaRef.current?.closest(".csa-content");
    if (!(scrollRoot instanceof HTMLElement)) return;

    const nextTop = Math.max(0, activeSearchMatch.line * ROW_HEIGHT - ROW_HEIGHT);
    if (Math.abs(scrollRoot.scrollTop - nextTop) <= ROW_HEIGHT) return;

    scrollRoot.scrollTo({ top: nextTop, behavior: "smooth" });
  }, [activeSearchMatch, hasSearchQuery]);

  const updateActiveLine = (textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart ?? 0;
    const nextLine = normalizeNewlines(textarea.value.slice(0, caret)).split("\n").length - 1;

    setActiveLine(clamp(nextLine, 0, lineCount - 1));
  };

  const updateActiveLineFromPointer = (textarea: HTMLTextAreaElement, clientY: number) => {
    const rect = textarea.getBoundingClientRect();
    const nextLine = Math.floor((clientY - rect.top + textarea.scrollTop) / ROW_HEIGHT);

    setActiveLine(clamp(nextLine, 0, lineCount - 1));
  };

  const updateActiveLineAfterSelection = (textarea: HTMLTextAreaElement) => {
    requestAnimationFrame(() => updateActiveLine(textarea));
  };

  useEffect(() => {
    if (!textEditRequest || textEditRequest.id <= handledTextEditRequestId.current) {
      return;
    }

    handledTextEditRequestId.current = textEditRequest.id;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const source = normalizeNewlines(textarea.value);
    const start = clamp(textEditRequest.start, 0, source.length);
    const end = clamp(textEditRequest.end, start, source.length);
    const replacement = normalizeNewlines(textEditRequest.replacement);
    const nextValue = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
    const nextCaret = start + replacement.length;

    if (nextValue === source) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(start, end);
      updateActiveLine(textarea);
      return;
    }

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, end);

    let appliedWithNativeUndo: boolean;
    try {
      appliedWithNativeUndo = document.execCommand("insertText", false, replacement);
    } catch {
      appliedWithNativeUndo = false;
    }

    if (appliedWithNativeUndo && normalizeNewlines(textarea.value) === nextValue) {
      onChange(nextValue);
      updateActiveLine(textarea);
      return;
    }

    textarea.value = source;
    textarea.setSelectionRange(start, end);
    textarea.setRangeText(replacement, start, end, "end");
    textarea.setSelectionRange(nextCaret, nextCaret);
    programmaticUndoStack.current.push({
      before: source,
      after: nextValue,
      selectionStart: start,
      selectionEnd: end,
    });
    if (programmaticUndoStack.current.length > 30) {
      programmaticUndoStack.current.shift();
    }

    onChange(nextValue);
    updateActiveLine(textarea);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on a new edit request; updateActiveLine is stable enough here
  }, [onChange, textEditRequest]);

  useEffect(() => {
    if (
      !hasSearchQuery ||
      !activeSearchMatch ||
      searchFocusToken <= handledSearchFocusToken.current
    ) {
      return;
    }

    handledSearchFocusToken.current = searchFocusToken;

    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(activeSearchMatch.start, activeSearchMatch.end);
    updateActiveLine(textarea);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus on a new search token; updateActiveLine is stable enough here
  }, [activeSearchMatch, hasSearchQuery, searchFocusToken]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(normalizeNewlines(event.currentTarget.value));
    updateActiveLine(event.currentTarget);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const wantsUndo =
      (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";

    if (!wantsUndo) return;

    const textarea = event.currentTarget;
    const currentValue = normalizeNewlines(textarea.value);
    const lastUndo = programmaticUndoStack.current[programmaticUndoStack.current.length - 1];

    if (!lastUndo || currentValue !== lastUndo.after) return;

    event.preventDefault();
    programmaticUndoStack.current.pop();
    textarea.value = lastUndo.before;
    textarea.setSelectionRange(lastUndo.selectionStart, lastUndo.selectionEnd);
    onChange(lastUndo.before);
    updateActiveLine(textarea);
  };

  return (
    <CustomScrollArea className={`java-args-editor ${className}`.trim()} style={{ minHeight: 0 }}>
      <div
        className="jae-editor"
        style={{ "--jae-content-height": contentHeight } as CSSProperties}
      >
        <div className="jae-gutter" aria-hidden="true">
          {lines.map((_, index) => (
            <span
              key={index}
              className={[
                "jae-line-number",
                visibleActiveLine === index ? "jae-line-number--active" : "",
                searchMatchSet.has(index) ? "jae-line-number--search-match" : "",
                activeSearchLine === index ? "jae-line-number--search-current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {index + 1}
            </span>
          ))}
        </div>

        <div className="jae-text-cell">
          {searchMatches.length > 0 && (
            <div className="jae-search-lines" aria-hidden="true">
              {searchMatches.map((match, index) => (
                <span
                  key={index}
                  className={[
                    "jae-search-line",
                    index === visibleSearchMatchIndex ? "jae-search-line--current" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ transform: `translateY(${match.line * ROW_HEIGHT}px)` }}
                />
              ))}
            </div>
          )}

          {visibleActiveLine !== null && (
            <span
              className="jae-active-line"
              style={{
                transform: `translateY(${visibleActiveLine * ROW_HEIGHT}px)`,
              }}
              aria-hidden="true"
            />
          )}

          <div className="jae-placeholder-lines" aria-hidden="true">
            {lines.map((line, index) => {
              const isLast = index === lines.length - 1;
              const placeholder = isLast ? "NEW ARGUMENT" : "EMPTY LINE";

              return (
                <span key={index} className="jae-placeholder-line">
                  {line ? "" : placeholder}
                </span>
              );
            })}
          </div>

          <textarea
            ref={textareaRef}
            className="jae-textarea"
            value={normalizedValue}
            rows={lineCount}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={ariaLabel ?? tr("ui.javaArguments")}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPointerDown={(event) =>
              updateActiveLineFromPointer(event.currentTarget, event.clientY)
            }
            onClick={(event) => updateActiveLine(event.currentTarget)}
            onFocus={(event) => updateActiveLineAfterSelection(event.currentTarget)}
            onKeyUp={(event) => updateActiveLine(event.currentTarget)}
            onSelect={(event) => updateActiveLine(event.currentTarget)}
            onBlur={() => setActiveLine(null)}
          />
        </div>
      </div>
    </CustomScrollArea>
  );
}
