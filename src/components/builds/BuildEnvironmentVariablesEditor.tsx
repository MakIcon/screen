import { TextField } from "../inputs/TextField";
import type { EnvironmentVariable } from "../../types";
import { getEnvironmentVariablesError } from "../../utils/environmentVariables";
import { useLocale, useTranslation } from "../../i18n/locale";

type Props = {
  entries: EnvironmentVariable[];
  onChange: (entries: EnvironmentVariable[]) => void;
};

export function BuildEnvironmentVariablesEditor({ entries, onChange }: Props) {
  const locale = useLocale();
  const tr = useTranslation();
  const error = getEnvironmentVariablesError(entries, locale);
  const update = (index: number, changes: Partial<EnvironmentVariable>) => {
    onChange(
      entries.map((entry, current) => (current === index ? { ...entry, ...changes } : entry)),
    );
  };

  return (
    <section className="brs-section brs-environment-section">
      <div className="brs-section-head">
        <span>{tr("buildEnvironmentVariables.environment")}</span>
        <button
          className="brs-compact-action"
          type="button"
          onClick={() => onChange([...entries, { name: "", value: "" }])}
        >
          {tr("buildEnvironmentVariables.add")}
        </button>
      </div>
      <p className="brs-note">{tr("buildEnvironmentVariables.variablesArePassedTo")}</p>
      {entries.length === 0 && (
        <p className="brs-note">{tr("buildEnvironmentVariables.theSystemEnvironmentIs")}</p>
      )}
      {entries.map((entry, index) => (
        <div className="brs-env-entry" key={index}>
          <div className="brs-env-name-row">
            <label className="brs-field">
              <span>{tr("buildEnvironmentVariables.name")}</span>
              <TextField
                value={entry.name}
                placeholder="VARIABLE_NAME"
                spellCheck={false}
                autoComplete="off"
                aria-label={tr("buildEnvironmentVariables.nameLabel", {
                  label: tr("buildEnvironmentVariables.environmentVariable"),
                  index: index + 1,
                })}
                onChange={(event) => update(index, { name: event.target.value })}
              />
            </label>
            <button
              className="brs-compact-action"
              type="button"
              aria-label={`${tr("buildEnvironmentVariables.removeEnvironmentVariable")} ${index + 1}`}
              onClick={() => onChange(entries.filter((_, current) => current !== index))}
            >
              {tr("common.remove")}
            </button>
          </div>
          <label className="brs-field">
            <span>{tr("buildEnvironmentVariables.value")}</span>
            <TextField
              value={entry.value}
              placeholder={tr("buildEnvironmentVariables.valueCanBeEmpty")}
              spellCheck={false}
              autoComplete="off"
              aria-label={tr("buildEnvironmentVariables.valueLabel", {
                label: tr("buildEnvironmentVariables.environmentVariable2"),
                index: index + 1,
              })}
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
