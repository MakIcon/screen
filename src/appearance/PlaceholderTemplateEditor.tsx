import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  AVAILABLE_PLACEHOLDERS,
  createPlaceholderTokenVariant,
  getPlaceholderTemplateCase,
  resolveAppearancePlaceholderTemplate,
  setPlaceholderTemplateCase,
  tokenizePlaceholderTemplate,
  type PlaceholderAppearanceValues,
  type PlaceholderGroup,
} from "../utils/placeholders";

const PLACEHOLDER_GROUPS: readonly { id: PlaceholderGroup; label: string }[] = [
  { id: "build", label: "BUILD" },
  { id: "player", label: "PLAYER" },
  { id: "library", label: "LIBRARY" },
  { id: "launcher", label: "LAUNCHER" },
];

type PlaceholderTemplateEditorProps = {
  value: string;
  maxLength: number;
  originalText: string;
  renderedOriginalText: string;
  placeholderValues?: PlaceholderAppearanceValues;
  onChange: (value: string) => void;
};

export const PlaceholderTemplateEditor = memo(function PlaceholderTemplateEditor({
  value,
  maxLength,
  originalText,
  renderedOriginalText,
  placeholderValues = {},
  onChange,
}: PlaceholderTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: value.length, end: value.length });
  const templateCase = useMemo(() => getPlaceholderTemplateCase(value), [value]);
  const [insertUppercase, setInsertUppercase] = useState(templateCase === "uppercase");
  const segments = useMemo(() => tokenizePlaceholderTemplate(value), [value]);
  const resolvedPreview = useMemo(
    () => resolveAppearancePlaceholderTemplate(value, placeholderValues),
    [placeholderValues, value],
  );

  useEffect(() => {
    if (templateCase === "value" || templateCase === "uppercase") {
      setInsertUppercase(templateCase === "uppercase");
    }
  }, [templateCase]);

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    selectionRef.current = {
      start: textarea.selectionStart ?? value.length,
      end: textarea.selectionEnd ?? value.length,
    };
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    selectionRef.current = {
      start: event.currentTarget.selectionStart ?? event.currentTarget.value.length,
      end: event.currentTarget.selectionEnd ?? event.currentTarget.value.length,
    };
    onChange(event.currentTarget.value);
  };

  const insertPlaceholder = (token: string) => {
    const textarea = textareaRef.current;
    const selection = textarea
      ? {
          start: textarea.selectionStart ?? selectionRef.current.start,
          end: textarea.selectionEnd ?? selectionRef.current.end,
        }
      : selectionRef.current;
    const remainingLength = maxLength - (value.length - (selection.end - selection.start));
    if (remainingLength < token.length) return;

    const nextValue = `${value.slice(0, selection.start)}${token}${value.slice(selection.end)}`;
    const nextCaret = selection.start + token.length;
    selectionRef.current = { start: nextCaret, end: nextCaret };
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const keepEditorSelection = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const selectPlaceholderCase = (uppercase: boolean) => {
    const nextValue = setPlaceholderTemplateCase(value, uppercase ? "uppercase" : "value");
    if (nextValue.length > maxLength) return;
    setInsertUppercase(uppercase);
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <div className="studio-template-editor">
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={maxLength}
        rows={2}
        spellCheck={false}
        aria-label="Element text and placeholder template"
        onChange={handleChange}
        onSelect={rememberSelection}
        onClick={rememberSelection}
        onKeyUp={rememberSelection}
      />

      <div className="studio-placeholder-case" aria-label="Placeholder output case">
        <span>PLACEHOLDER OUTPUT CASE</span>
        <div>
          <button
            type="button"
            className={!insertUppercase ? "active" : ""}
            onMouseDown={keepEditorSelection}
            onClick={() => selectPlaceholderCase(false)}
          >
            <code>%placeholder%</code>
            <span>AS VALUE</span>
          </button>
          <button
            type="button"
            className={insertUppercase ? "active" : ""}
            onMouseDown={keepEditorSelection}
            onClick={() => selectPlaceholderCase(true)}
          >
            <code>^%placeholder%</code>
            <span>UPPERCASE</span>
          </button>
        </div>
        <small>
          {templateCase === "mixed"
            ? "MIXED CASE · CHOOSE A MODE TO NORMALIZE ALL TOKENS"
            : "THE ^ MODIFIER UPPERCASES ONLY THE RESOLVED VALUE"}
        </small>
      </div>

      <div className="studio-template-map" aria-label="Placeholder-highlighted template">
        <span className="studio-template-map-label">TEMPLATE MAP</span>
        <div className="studio-template-code">
          {segments.length === 0 ? (
            <span className="studio-template-empty">EMPTY TEXT</span>
          ) : (
            segments.map((segment, index) => {
              if (segment.type === "text") {
                return <span key={`${index}-${segment.value}`}>{segment.value}</span>;
              }
              const definition = segment.definition;
              const liveValue = resolveAppearancePlaceholderTemplate(
                segment.value,
                placeholderValues,
              );
              const isResolved = liveValue !== segment.value;
              return (
                <span
                  key={`${index}-${segment.value}`}
                  className={`studio-template-token${segment.uppercase ? " is-uppercase" : ""}${definition ? "" : " is-unknown"}`}
                  tabIndex={0}
                >
                  {segment.value}
                  <span className="studio-template-token-tooltip" role="tooltip">
                    <strong>{definition?.label ?? "UNKNOWN PLACEHOLDER"}</strong>
                    <code>{segment.value}</code>
                    <small>CASE · {segment.uppercase ? "UPPERCASE (^)" : "AS VALUE"}</small>
                    <span>{definition?.description ?? "This token is kept unchanged."}</span>
                    <em>
                      {isResolved ? "CURRENT VALUE" : "NOT AVAILABLE"} · {liveValue || "EMPTY"}
                    </em>
                    {definition?.aliases?.length ? (
                      <small>
                        ALIASES · {definition.aliases.map((alias) => `%${alias}%`).join(" · ")}
                      </small>
                    ) : null}
                  </span>
                </span>
              );
            })
          )}
        </div>
        <div className="studio-template-resolved">
          <span>LIVE RESULT</span>
          <strong>{resolvedPreview || "EMPTY TEXT"}</strong>
        </div>
      </div>

      <div className="studio-placeholder-picker">
        <span>INSERT LIVE PLACEHOLDER AT CURSOR</span>
        {PLACEHOLDER_GROUPS.map((group) => (
          <div className="studio-placeholder-group" key={group.id}>
            <small>{group.label}</small>
            <div>
              {AVAILABLE_PLACEHOLDERS.filter((placeholder) => placeholder.group === group.id).map(
                (placeholder) => {
                  const token = createPlaceholderTokenVariant(placeholder.token, insertUppercase);
                  const liveValue = resolveAppearancePlaceholderTemplate(token, placeholderValues);
                  const hasRoom = value.length + token.length <= maxLength;
                  return (
                    <button
                      type="button"
                      key={token}
                      title={`${token} → ${liveValue}`}
                      disabled={!hasRoom}
                      onMouseDown={keepEditorSelection}
                      onClick={() => insertPlaceholder(token)}
                    >
                      <code>{token}</code>
                      <span>{placeholder.label}</span>
                      <em>{liveValue}</em>
                    </button>
                  );
                },
              )}
            </div>
          </div>
        ))}
        <small>
          <code>%placeholder%</code> keeps the resolved value casing. <code>^%placeholder%</code>{" "}
          forces uppercase. Legacy aliases are shown in each token tooltip.
        </small>
      </div>

      <small className="studio-template-meta">
        ORIGINAL: {originalText} · RENDERED: {renderedOriginalText} · {value.length}/{maxLength}
      </small>
    </div>
  );
});
