import { PipelineStatus, PipelineStep, StepState } from "../../hooks/usePresentationRun";

interface ExecutablePipelineProps {
  steps: PipelineStep[];
  stepStates: Record<string, StepState>;
  density?: "naive" | "advanced" | "agentic";
  meta?: string | null;
}

const statusMark: Record<string, string> = {
  idle: "",
  running: "RUN",
  completed: "DONE",
  failed: "!",
  retry: "RETRY",
  insufficient: "NO"
};

function mergeStatus(statuses: PipelineStatus[]): PipelineStatus {
  if (statuses.includes("running")) return "running";
  if (statuses.includes("retry")) return "retry";
  if (statuses.includes("insufficient")) return "insufficient";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("completed")) return "completed";
  return "idle";
}

function stateForStep(step: PipelineStep, stepStates: Record<string, StepState>) {
  const ids = step.sourceIds ?? [step.id];
  const states = ids.map((id) => stepStates[id]).filter(Boolean);
  const status = mergeStatus(states.map((state) => state.status));
  const elapsedIndex = [...states].reverse().findIndex((state) => state.elapsedMs != null);
  const elapsedState = elapsedIndex >= 0 ? [...states].reverse()[elapsedIndex] : undefined;
  const activeSource = ids.find((id) => stepStates[id]?.status === status);
  return { status, elapsedMs: elapsedState?.elapsedMs, activeSource };
}

export function ExecutablePipeline({ steps, stepStates, density = "naive", meta = null }: ExecutablePipelineProps) {
  return (
    <div className={`executable-pipeline ${density}-pipeline`} data-step-count={steps.length}>
      {meta && <div className="pipeline-meta">{meta}</div>}
      {steps.map((step, index) => {
        const state = stateForStep(step, stepStates);
        return (
          <div className="pipeline-row" key={step.id}>
            <div
              className={`pipeline-card ${state.status}${step.variant ? ` ${step.variant}-step` : ""}${
                state.activeSource ? ` source-${state.activeSource}` : ""
              }`}
            >
              <strong>
                {step.label} <span className="status-mark">{statusMark[state.status]}</span>
              </strong>
              {step.detail && <span>{step.detail}</span>}
              {step.branchDetail && (
                <div className="pipeline-branch" aria-label="Agentic decision branch">
                  <span>{step.branchDetail}</span>
                  <div>
                    <b>YES</b>
                    <em>Context → LLM → Answer</em>
                  </div>
                  <div>
                    <b>NO</b>
                    <em>Query Refinement → Retry Search → Search</em>
                  </div>
                </div>
              )}
              {state.elapsedMs != null && <em>{state.elapsedMs}ms</em>}
            </div>
            {index < steps.length - 1 && <div className="pipeline-arrow">↓</div>}
          </div>
        );
      })}
    </div>
  );
}
