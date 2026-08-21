import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { BasicSection } from "./components/lecture/BasicSection";
import { ComparisonSection } from "./components/lecture/ComparisonSection";
import { EvolutionSection } from "./components/lecture/EvolutionSection";
import { NaiveLectureSection } from "./components/lecture/NaiveLectureSection";
import { useLectureControlSocket } from "./hooks/useLectureControlSocket";
import { EvaluationPage } from "./pages/EvaluationPage";
import { GraphRagPage } from "./pages/GraphRagPage";
import { MicrophonePage } from "./pages/MicrophonePage";
import { MultimodalRagPage } from "./pages/MultimodalRagPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { NavigationAction, PageId, orderedPages } from "./navigation/navigation";

export function App() {
  const isMicrophonePage = window.location.pathname === "/mic";
  const [activePage, setActivePage] = useState<PageId>("basic");
  const currentIndex = useMemo(() => orderedPages.indexOf(activePage), [activePage]);

  const navigate = useCallback((action: NavigationAction) => {
    setActivePage(action.page);
  }, []);

  useLectureControlSocket(navigate, !isMicrophonePage);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(currentIndex + direction, orderedPages.length - 1));
      setActivePage(orderedPages[nextIndex]);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex]);

  if (isMicrophonePage) {
    return <MicrophonePage />;
  }

  return (
    <AppShell activePage={activePage} onNavigate={navigate}>
      {activePage === "basic" && <BasicSection />}
      {activePage === "naive" && <NaiveLectureSection />}
      {activePage === "advanced" && <EvolutionSection ragStage="advanced" />}
      {activePage === "agentic" && <EvolutionSection ragStage="agentic" />}
      {activePage === "comparison" && <ComparisonSection />}
      {activePage === "playground" && <PlaygroundPage />}
      {activePage === "evaluation" && <EvaluationPage />}
      {activePage === "graphrag" && <GraphRagPage />}
      {activePage === "multimodal" && <MultimodalRagPage />}
    </AppShell>
  );
}
