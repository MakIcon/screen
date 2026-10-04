import {
  getPlaceholderTemplateCase,
  setPlaceholderTemplateCase,
  type PlaceholderTemplateCase,
} from "../../utils/placeholders";

type Props = {
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
};

const CASE_OPTIONS: readonly {
  mode: Extract<PlaceholderTemplateCase, "value" | "uppercase">;
  label: string;
  syntax: string;
  title: string;
}[] = [
  {
    mode: "value",
    label: "AS VALUE",
    syntax: "%…%",
    title: "Keep the resolved placeholder value's natural casing",
  },
  {
    mode: "uppercase",
    label: "UPPERCASE",
    syntax: "^%…%",
    title: "Force the resolved placeholder value to uppercase",
  },
];

export function BuildPlaceholderCaseControl({ value, maxLength, onChange }: Props) {
  const currentCase = getPlaceholderTemplateCase(value);
  const hasPlaceholder = currentCase !== "none";

  return (
    <div className="bce-placeholder-case" aria-label="Placeholder output case">
      {CASE_OPTIONS.map((option) => {
        const nextValue = setPlaceholderTemplateCase(value, option.mode);
        const disabled =
          !hasPlaceholder || (maxLength !== undefined && nextValue.length > maxLength);
        return (
          <button
            type="button"
            key={option.mode}
            className={currentCase === option.mode ? "active" : ""}
            disabled={disabled}
            data-tooltip={option.title}
            onClick={() => {
              if (nextValue !== value) onChange(nextValue);
            }}
          >
            <code>{option.syntax}</code>
            <span>{option.label}</span>
          </button>
        );
      })}
      {currentCase === "mixed" && <small>MIXED CASE</small>}
    </div>
  );
}
