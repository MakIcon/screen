import type { EnvironmentVariable } from "../../types";
import { getEnvironmentVariablesError } from "../../utils/environmentVariables";

type Props = {
  entries: EnvironmentVariable[];
  onChange: (entries: EnvironmentVariable[]) => void;
};

export function BuildEnvironmentVariablesEditor({ entries, onChange }: Props) {
  const error = getEnvironmentVariablesError(entries);
  const update = (index: number, changes: Partial<EnvironmentVariable>) => {
    onChange(
      entries.map((entry, current) => (current === index ? { ...entry, ...changes } : entry)),
    );
  };

  return (
    <section className="brs-section brs-environment-section">
      <div className="brs-section-head">
        <span>ENVIRONMENT</span>
        <button
          className="brs-compact-action"
          type="button"
          onClick={() => onChange([...entries, { name: "", value: "" }])}
        >
          ADD
        </button>
      </div>
      <p className="brs-note">
        Переменные передаются игре при запуске. Значения вводятся как есть, без кавычек и
        подстановок.
      </p>
      {entries.length === 0 && (
        <p className="brs-note">
          Используется окружение системы. Добавьте переменную, чтобы переопределить её для этой
          сборки.
        </p>
      )}
      {entries.map((entry, index) => (
        <div className="brs-env-entry" key={index}>
          <div className="brs-env-name-row">
            <label className="brs-field">
              <span>NAME</span>
              <input
                value={entry.name}
                placeholder="VARIABLE_NAME"
                spellCheck={false}
                autoComplete="off"
                aria-label={`Environment variable ${index + 1} name`}
                onChange={(event) => update(index, { name: event.target.value })}
              />
            </label>
            <button
              className="brs-compact-action"
              type="button"
              aria-label={`Remove environment variable ${index + 1}`}
              onClick={() => onChange(entries.filter((_, current) => current !== index))}
            >
              REMOVE
            </button>
          </div>
          <label className="brs-field">
            <span>VALUE</span>
            <input
              value={entry.value}
              placeholder="Значение (можно оставить пустым)"
              spellCheck={false}
              autoComplete="off"
              aria-label={`Environment variable ${index + 1} value`}
              onChange={(event) => update(index, { value: event.target.value })}
            />
          </label>
        </div>
      ))}
      {error && (
        <p className="brs-args-status" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
