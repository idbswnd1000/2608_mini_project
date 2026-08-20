import { useCallback, useEffect, useReducer } from "react";
import {
  LectureAction,
  lectureSteps,
  reduceLectureState,
  initialLectureState
} from "../state/lectureState";

export function useLectureController() {
  const [state, dispatch] = useReducer(reduceLectureState, initialLectureState);

  const sendAction = useCallback((action: LectureAction | "NEXT" | "PREVIOUS") => {
    dispatch(action);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        dispatch("NEXT");
      }
      if (event.key === "ArrowLeft") {
        dispatch("PREVIOUS");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    state,
    steps: lectureSteps,
    sendAction,
    canGoPrevious: state.stepIndex > 0,
    canGoNext: state.stepIndex < lectureSteps.length - 1
  };
}
