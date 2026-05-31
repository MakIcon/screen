import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import "./JavaArgsEditor.css";

type JavaArgsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  searchQuery?: string;
};

const ROW_HEIGHT = 42;

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
  ariaLabel = "Java arguments",
  searchQuery = "",
}: JavaArgsEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const normalizedValue = useMemo(() => normalizeNewlines(value), [value]);
  const lines = useMemo(() => toLines(value), [value]);
  const lineCount = Math.max(lines.length, 1);
  const contentHeight = `${lineCount * ROW_HEIGHT}px`;
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const visibleActiveLine =
    activeLine === null ? null : Math.min(activeLine, lineCount - 1);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searchMatchIndexes = useMemo(() => {
    if (!normalizedSearch) return [] as number[];

    return lines.reduce<number[]>((acc, line, index) => {
      if (line.toLowerCase().includes(normalizedSearch)) acc.push(index);
      return acc;
    }, []);
  }, [lines, normalizedSearch]);
  const searchMatchSet = useMemo(
    () => new Set(searchMatchIndexes),
    [searchMatchIndexes],
  );
  const firstSearchMatch = searchMatchIndexes[0] ?? null;

  useEffect(() => {
    if (!normalizedSearch || firstSearchMatch === null) return;

    const scrollRoot = textareaRef.current?.closest(".csa-content");
    if (!(scrollRoot instanceof HTMLElement)) return;

    const nextTop = Math.max(0, firstSearchMatch * ROW_HEIGHT - ROW_HEIGHT);
    if (Math.abs(scrollRoot.scrollTop - nextTop) <= ROW_HEIGHT) return;

    scrollRoot.scrollTo({ top: nextTop, behavior: "smooth" });
  }, [firstSearchMatch, normalizedSearch]);

  const updateActiveLine = (textarea: HTMLTextAreaElement) => {
    const caret = textarea.selectionStart ?? 0;
    const nextLine = normalizeNewlines(textarea.value.slice(0, caret)).split(
      "\n",
    ).length - 1;

    setActiveLine(clamp(nextLine, 0, lineCount - 1));
  };

  const updateActiveLineFromPointer = (
    textarea: HTMLTextAreaElement,
    clientY: number,
  ) => {
    const rect = textarea.getBoundingClientRect();
    const nextLine = Math.floor((clientY - rect.top + textarea.scrollTop) / ROW_HEIGHT);

    setActiveLine(clamp(nextLine, 0, lineCount - 1));
  };

  const updateActiveLineAfterSelection = (textarea: HTMLTextAreaElement) => {
    requestAnimationFrame(() => updateActiveLine(textarea));
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(normalizeNewlines(event.currentTarget.value));
    updateActiveLine(event.currentTarget);
  };

  return (
    <CustomScrollArea
      className={`java-args-editor ${className}`.trim()}
      style={{ minHeight: 0 }}
    >
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
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {index + 1}
            </span>
          ))}
        </div>

        <div className="jae-text-cell">
          {searchMatchIndexes.length > 0 && (
            <div className="jae-search-lines" aria-hidden="true">
              {searchMatchIndexes.map((index) => (
                <span
                  key={index}
                  className="jae-search-line"
                  style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
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
            aria-label={ariaLabel}
            onChange={handleChange}
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
