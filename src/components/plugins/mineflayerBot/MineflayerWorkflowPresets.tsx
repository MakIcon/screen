import { useState } from "react";
import { MineflayerActionIcon } from "./MineflayerActionIcon";
import { WORKFLOW_STEP_LIMIT, type WorkflowDraftStep } from "./workflowDraft";
import { WORKFLOW_PRESETS, WORKFLOW_PRESET_GROUPS, workflowTemplate } from "./workflowPresets";

export function MineflayerWorkflowPresets({
  locked,
  stepCount,
  onAppend,
}: {
  locked: boolean;
  stepCount: number;
  onAppend: (steps: WorkflowDraftStep[]) => void;
}) {
  const [expanded, setExpanded] = useState(stepCount === 0);
  const [group, setGroup] = useState<string>("farm");
  const presets = WORKFLOW_PRESETS.filter((preset) => group === "all" || preset.group === group);
  return (
    <section className="mf-preset-library" aria-label="Пресеты сценария">
      <button
        className="mf-preset-heading"
        type="button"
        aria-expanded={expanded}
        aria-controls="mf-preset-library"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="mf-preset-heading-copy">
          <span className="mf-preset-heading-title">ГОТОВЫЕ СЦЕНАРИИ</span>
        </span>
        <span className="mf-preset-heading-action">
          {expanded ? "Свернуть" : "Выбрать пресет"}
          <svg
            className={expanded ? "is-expanded" : undefined}
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div id="mf-preset-library" className="mf-preset-content">
          <div className="mf-preset-filters" role="group" aria-label="Категория пресетов">
            {[...WORKFLOW_PRESET_GROUPS, { id: "all", label: "Все" }].map((entry) => {
              const count =
                entry.id === "all"
                  ? WORKFLOW_PRESETS.length
                  : WORKFLOW_PRESETS.filter((preset) => preset.group === entry.id).length;
              return (
                <button
                  type="button"
                  key={entry.id}
                  aria-pressed={group === entry.id}
                  onClick={() => setGroup(entry.id)}
                >
                  {entry.label}
                  <span className="mf-preset-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="mf-preset-grid">
            {presets.map((preset) => {
              const overflow = stepCount + preset.steps.length > WORKFLOW_STEP_LIMIT;
              return (
                <article className="mf-preset-card" key={preset.id}>
                  <div className="mf-preset-title">
                    <MineflayerActionIcon kind={preset.steps[0].kind} />
                    <h4>{preset.label}</h4>
                    <span>{preset.steps.length} шаг.</span>
                  </div>
                  <p>{preset.description}</p>
                  <p className="mf-preset-requires">
                    <strong>Нужно:</strong> {preset.requires}
                  </p>
                  <button
                    type="button"
                    disabled={locked || overflow}
                    aria-label={`Добавить пресет: ${preset.label}`}
                    data-tooltip={
                      overflow
                        ? `В плане может быть не больше ${WORKFLOW_STEP_LIMIT} шагов`
                        : `Добавить ${preset.steps.length} шагов в конец плана`
                    }
                    onClick={() => onAppend(workflowTemplate(preset.id))}
                  >
                    {overflow ? "Не хватает места в плане" : "+ Добавить в план"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
