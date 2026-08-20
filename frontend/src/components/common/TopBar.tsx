import { LectureState } from "../../state/lectureState";

interface TopBarProps {
  state: LectureState;
}

export function TopBar({ state }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <div className="class-mark">RAG CLASS</div>
        <div className="class-subtitle">Retrieval-Augmented Generation</div>
      </div>
      <div className="section-chip">
        SECTION {state.stepIndex + 1} / 6
      </div>
    </header>
  );
}
