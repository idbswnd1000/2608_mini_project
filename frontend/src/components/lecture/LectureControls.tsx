import { LectureAction, LectureStep } from "../../state/lectureState";

interface LectureControlsProps {
  steps: LectureStep[];
  currentIndex: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onAction: (action: LectureAction | "NEXT" | "PREVIOUS") => void;
}

export function LectureControls({
  steps,
  currentIndex,
  canGoPrevious,
  canGoNext,
  onAction
}: LectureControlsProps) {
  return (
    <nav className="lecture-controls" aria-label="강의 진행 컨트롤">
      <div className="step-dots">
        {steps.map((step, index) => (
          <button
            key={step.action}
            className={index === currentIndex ? "step-dot active" : "step-dot"}
            type="button"
            onClick={() => onAction(step.action)}
            aria-label={step.label}
            title={step.label}
          />
        ))}
      </div>
      <div className="control-buttons">
        <button type="button" onClick={() => onAction("RESET")}>
          처음으로
        </button>
        <button type="button" onClick={() => onAction("PREVIOUS")} disabled={!canGoPrevious}>
          이전
        </button>
        <button type="button" onClick={() => onAction("NEXT")} disabled={!canGoNext}>
          다음
        </button>
      </div>
    </nav>
  );
}
