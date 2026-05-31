import {
  useLayoutEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { CustomScrollArea } from "../layout/CustomScrollArea";
import "./JavaArgsEditor.css";

type JavaArgsEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
};

type FocusTarget = {
  index: number;
  caret: number;
};

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toLines(value: string) {
  return normalizeNewlines(value).split("\n");
}

function serializeLines(lines: string[]) {
  return lines.join("\n");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function JavaArgsEditor({
  value,
  onChange,
  className = "",
  ariaLabel = "Java arguments",
}: JavaArgsEditorProps) {
  const lines = useMemo(() => toLines(value), [value]);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const pendingFocus = useRef<FocusTarget | null>(null);

  const focusInput = (target: FocusTarget) => {
    requestAnimationFrame(() => {
      const index = clamp(target.index, 0, lines.length - 1);
      const input = inputRefs.current[index];
      if (!input) return;

      const caret = clamp(target.caret, 0, input.value.length);
      input.focus();
      input.setSelectionRange(caret, caret);
      input.scrollIntoView({ block: "nearest" });
    });
  };

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;

    pendingFocus.current = null;
    focusInput(target);
  }, [lines]);

  const updateLine = (index: number, nextValue: string) => {
    const nextLines = [...lines];
    nextLines[index] = nextValue;
    onChange(serializeLines(nextLines));
  };

  const splitLine = (index: number, input: HTMLInputElement) => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const nextLines = [...lines];

    nextLines.splice(index, 1, before, after);
    pendingFocus.current = { index: index + 1, caret: 0 };
    onChange(serializeLines(nextLines));
  };

  const mergeWithPrevious = (index: number) => {
    const previous = lines[index - 1] ?? "";
    const current = lines[index] ?? "";
    const nextLines = [...lines];

    nextLines.splice(index - 1, 2, previous + current);
    pendingFocus.current = { index: index - 1, caret: previous.length };
    onChange(serializeLines(nextLines));
  };

  const mergeWithNext = (index: number) => {
    const current = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    const nextLines = [...lines];

    nextLines.splice(index, 2, current + next);
    pendingFocus.current = { index, caret: current.length };
    onChange(serializeLines(nextLines));
  };

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    updateLine(index, event.currentTarget.value);
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = normalizeNewlines(event.clipboardData.getData("text"));
    if (!pastedText.includes("\n")) return;

    event.preventDefault();

    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const pastedLines = pastedText.split("\n");
    const replacement = [
      before + pastedLines[0],
      ...pastedLines.slice(1, -1),
      pastedLines[pastedLines.length - 1] + after,
    ];
    const nextLines = [...lines];

    nextLines.splice(index, 1, ...replacement);
    pendingFocus.current = {
      index: index + replacement.length - 1,
      caret: pastedLines[pastedLines.length - 1].length,
    };
    onChange(serializeLines(nextLines));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const isCollapsed = start === end;

    if (event.key === "Enter") {
      event.preventDefault();
      splitLine(index, input);
      return;
    }

    if (event.key === "Backspace" && index > 0 && isCollapsed && start === 0) {
      event.preventDefault();
      mergeWithPrevious(index);
      return;
    }

    if (
      event.key === "Delete" &&
      index < lines.length - 1 &&
      isCollapsed &&
      start === input.value.length
    ) {
      event.preventDefault();
      mergeWithNext(index);
      return;
    }

    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      focusInput({ index: index - 1, caret: start });
      return;
    }

    if (event.key === "ArrowDown" && index < lines.length - 1) {
      event.preventDefault();
      focusInput({ index: index + 1, caret: start });
    }
  };

  return (
    <CustomScrollArea
      className={`java-args-editor ${className}`.trim()}
      style={{ minHeight: 0 }}
    >
      <div className="jae-lines" role="list" aria-label={ariaLabel}>
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isLast = index === lines.length - 1;
          const placeholder = isLast ? "NEW ARGUMENT" : "EMPTY LINE";

          return (
            <label
              key={index}
              className={`jae-row ${line ? "" : "jae-row--empty"}`.trim()}
              role="listitem"
            >
              <span className="jae-line-number">{lineNumber}</span>
              <input
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                className="jae-input"
                value={line}
                placeholder={placeholder}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={`${ariaLabel}, line ${lineNumber}`}
                onChange={(event) => handleChange(index, event)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
              />
            </label>
          );
        })}
      </div>
    </CustomScrollArea>
  );
}
