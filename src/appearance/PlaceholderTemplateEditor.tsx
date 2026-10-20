import { useAppearanceText } from "./localization";
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
import { PlaceholderGuideButton } from "../components/placeholders/PlaceholderGuideButton";
import { useLocale } from "../i18n/locale";
import {
  getPlaceholderGuideDescription,
  getPlaceholderGuideLabel,
} from "../components/builds/buildPlaceholdersGuide";

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
  const copy = useAppearanceText();
  const locale = useLocale();
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
        aria-label={copy("Element text and placeholder template")}
        onChange={handleChange}
        onSelect={rememberSelection}
        onClick={rememberSelection}
        onKeyUp={rememberSelection}
      />

      <PlaceholderGuideButton compact />

      <div className="studio-placeholder-case" aria-label={copy("Placeholder output case")}>
        <span>{copy("PLACEHOLDER OUTPUT CASE")}</span>
        <div>
          <button
            type="button"
            className={!insertUppercase ? "active" : ""}
            onMouseDown={keepEditorSelection}
            onClick={() => selectPlaceholderCase(false)}
          >
            <code>{copy("%placeholder%")}</code>
            <span>{copy("AS VALUE")}</span>
          </button>
          <button
            type="button"
            className={insertUppercase ? "active" : ""}
            onMouseDown={keepEditorSelection}
            onClick={() => selectPlaceholderCase(true)}
          >
            <code>{copy("^%placeholder%")}</code>
            <span>{copy("UPPERCASE")}</span>
          </button>
        </div>
        <small>
          {templateCase === "mixed"
            ? copy("MIXED CASE · CHOOSE A MODE TO NORMALIZE ALL TOKENS")
            : copy("THE ^ MODIFIER UPPERCASES ONLY THE RESOLVED VALUE")}
        </small>
      </div>

      <div className="studio-template-map" aria-label={copy("Placeholder-highlighted template")}>
        <span className="studio-template-map-label">{copy("TEMPLATE MAP")}</span>
        <div className="studio-template-code">
          {segments.length === 0 ? (
            <span className="studio-template-empty">{copy("EMPTY TEXT")}</span>
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
                    <strong>
                      {definition
                        ? getPlaceholderGuideLabel(definition, locale)
                        : copy("UNKNOWN PLACEHOLDER")}
                    </strong>
                    <code>{segment.value}</code>
                    <small>
                      {copy("CASE ·")}{" "}
                      {segment.uppercase ? copy("UPPERCASE (^)") : copy("AS VALUE")}
                    </small>
                    <span>
                      {definition
                        ? getPlaceholderGuideDescription(definition, locale)
                        : copy("This token is kept unchanged.")}
                    </span>
                    <em>
                      {isResolved ? copy("CURRENT VALUE") : copy("NOT AVAILABLE")} ·{" "}
                      {liveValue || copy("EMPTY")}
                    </em>
                    {definition?.aliases?.length ? (
                      <small>
                        {copy("ALIASES ·")}{" "}
                        {definition.aliases.map((alias) => `%${alias}%`).join(" · ")}
                      </small>
                    ) : null}
                  </span>
                </span>
              );
            })
          )}
        </div>
        <div className="studio-template-resolved">
          <span>{copy("LIVE RESULT")}</span>
          <strong>{resolvedPreview || copy("EMPTY TEXT")}</strong>
        </div>
      </div>

      <div className="studio-placeholder-picker">
        <span>{copy("INSERT LIVE PLACEHOLDER AT CURSOR")}</span>
        {PLACEHOLDER_GROUPS.map((group) => (
          <div className="studio-placeholder-group" key={group.id}>
            <small>{copy(group.label)}</small>
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
                      data-tooltip={`${token} → ${liveValue}`}
                      disabled={!hasRoom}
                      onMouseDown={keepEditorSelection}
                      onClick={() => insertPlaceholder(token)}
                    >
                      <code>{token}</code>
                      <span>{getPlaceholderGuideLabel(placeholder, locale)}</span>
                      <em>{liveValue}</em>
                    </button>
                  );
                },
              )}
            </div>
          </div>
        ))}
        <small>
          <code>{copy("%placeholder%")}</code> {copy("keeps the resolved value casing.")}{" "}
          <code>{copy("^%placeholder%")}</code>{" "}
          {copy("forces uppercase. Legacy aliases are shown in each token tooltip.")}
        </small>
      </div>

      <small className="studio-template-meta">
        {copy("ORIGINAL:")} {originalText} {copy("· RENDERED:")} {renderedOriginalText} ·{" "}
        {value.length}/{maxLength}
      </small>
    </div>
  );
});
