import { PipelineStep } from "../../hooks/useRagRun";

interface ExecutablePipelineProps {
  steps: PipelineStep[];
  activeStepIndex: number;
}

export function ExecutablePipeline({ steps, activeStepIndex }: ExecutablePipelineProps) {
  return (
    <div className="executable-pipeline">
      {steps.map((step, index) => {
        const state = index < activeStepIndex ? "done" : index === activeStepIndex ? "active" : "pending";
        return (
          <div className="pipeline-row" key={step.id}>
            <div className={`pipeline-card ${state}`}>
              <strong>{step.label}</strong>
              {step.detail && <span>{step.detail}</span>}
            </div>
            {index < steps.length - 1 && <div className="pipeline-arrow">↓</div>}
          </div>
        );
      })}
    </div>
  );
}
