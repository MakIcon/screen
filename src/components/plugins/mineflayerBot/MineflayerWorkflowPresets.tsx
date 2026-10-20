import { useState } from "react";
import { MineflayerActionIcon } from "./MineflayerActionIcon";
import { WORKFLOW_STEP_LIMIT, type WorkflowDraftStep } from "./workflowDraft";
import { WORKFLOW_PRESETS, WORKFLOW_PRESET_GROUPS, workflowTemplate } from "./workflowPresets";
import { useTranslation } from "../../../i18n/locale";

export function MineflayerWorkflowPresets({
  locked,
  stepCount,
  onAppend,
}: {
  locked: boolean;
  stepCount: number;
  onAppend: (steps: WorkflowDraftStep[]) => void;
}) {
  const tr = useTranslation();
  const [expanded, setExpanded] = useState(stepCount === 0);
  const [group, setGroup] = useState<string>("farm");
  const presets = WORKFLOW_PRESETS.filter((preset) => group === "all" || preset.group === group);
  return (
    <section className="mf-preset-library" aria-label={tr("bot.workflowPresets.workflowPresets")}>
      <button
        className="mf-preset-heading"
        type="button"
        aria-expanded={expanded}
        aria-controls="mf-preset-library"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="mf-preset-heading-copy">
          <span className="mf-preset-heading-title">
            {tr("bot.workflowPresets.readyMadeWorkflows")}
          </span>
        </span>
        <span className="mf-preset-heading-action">
          {expanded ? tr("bot.workflowPresets.collapse") : tr("bot.workflowPresets.chooseAPreset")}
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
          <div
            className="mf-preset-filters"
            role="group"
            aria-label={tr("bot.workflowPresets.presetCategory")}
          >
            {[...WORKFLOW_PRESET_GROUPS, "all" as const].map((entry) => {
              const count =
                entry === "all"
                  ? WORKFLOW_PRESETS.length
                  : WORKFLOW_PRESETS.filter((preset) => preset.group === entry).length;
              return (
                <button
                  type="button"
                  key={entry}
                  aria-pressed={group === entry}
                  onClick={() => setGroup(entry)}
                >
                  {tr(`bot.presetGroup.${entry}`)}
                  <span className="mf-preset-filter-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="mf-preset-grid">
            {presets.map((preset) => {
              const text = {
                label: tr(`bot.preset.${preset.id}.label`),
                description: tr(`bot.preset.${preset.id}.description`),
                requires: tr(`bot.preset.${preset.id}.requires`),
              };
              const overflow = stepCount + preset.steps.length > WORKFLOW_STEP_LIMIT;
              return (
                <article className="mf-preset-card" key={preset.id}>
                  <div className="mf-preset-title">
                    <MineflayerActionIcon kind={preset.steps[0].kind} />
                    <h4>{text.label}</h4>
                    <span>
                      {tr("bot.workflowPresets.stepCount", { count: preset.steps.length })}
                    </span>
                  </div>
                  <p>{text.description}</p>
                  <p className="mf-preset-requires">
                    <strong>{tr("bot.workflowPresets.requires")}</strong> {text.requires}
                  </p>
                  <button
                    type="button"
                    disabled={locked || overflow}
                    aria-label={`${tr("bot.workflowPresets.addPreset")}: ${text.label}`}
                    data-tooltip={
                      overflow
                        ? tr("bot.workflowPresets.aPlanCanHave", { WORKFLOW_STEP_LIMIT })
                        : tr("bot.workflowPresets.addStepsToThe", {
                            stepsCount: preset.steps.length,
                          })
                    }
                    onClick={() => onAppend(workflowTemplate(preset.id))}
                  >
                    {overflow
                      ? tr("bot.workflowPresets.notEnoughRoomIn")
                      : tr("bot.workflowPresets.addToPlan")}
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
