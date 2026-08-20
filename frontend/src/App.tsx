import { TopBar } from "./components/common/TopBar";
import { BasicSection } from "./components/lecture/BasicSection";
import { ComparisonSection } from "./components/lecture/ComparisonSection";
import { ConclusionSection } from "./components/lecture/ConclusionSection";
import { EvolutionSection } from "./components/lecture/EvolutionSection";
import { LectureControls } from "./components/lecture/LectureControls";
import { useLectureController } from "./hooks/useLectureController";

export function App() {
  const { state, steps, sendAction, canGoPrevious, canGoNext } = useLectureController();

  return (
    <main className="app-shell">
      <TopBar state={state} />
      <div className="blackboard">
        {state.lectureSection === "basic" && <BasicSection />}
        {state.lectureSection === "evolution" && <EvolutionSection ragStage={state.ragStage} />}
        {state.lectureSection === "comparison" && <ComparisonSection />}
        {state.lectureSection === "conclusion" && <ConclusionSection />}
      </div>
      <LectureControls
        steps={steps}
        currentIndex={state.stepIndex}
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onAction={sendAction}
      />
    </main>
  );
}
