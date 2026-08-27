import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  extractBrowserCommandSegment,
  matchBrowserLectureCommand,
  normalizeSpeechText,
} from "../services/browserSpeechCommandMatcher";
import { sendLectureCommand } from "../services/lectureControl";
import type { LectureAction } from "../services/lectureControl";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string };
    };
  };
};

type BrowserSpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type MicStatus = "off" | "listening" | "command" | "error";
type CommandTestResult = {
  input: string;
  normalized: string;
  segment: string;
  action: LectureAction | null;
};

const RECENT_TRANSCRIPT_MAX_CHARS = 220;
const COMMAND_LOCK_MS = 2800;
const RESTART_DELAY_MS = 350;
const MAX_TRANSIENT_RESTART_ATTEMPTS = 3;
const LIVE_TRANSCRIPT_INACTIVITY_MS = 2000;

export function MicrophonePage() {
  const [connection, setConnection] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [speechSupported, setSpeechSupported] = useState<"unknown" | "supported" | "unsupported">("unknown");
  const [liveFinalTranscript, setLiveFinalTranscript] = useState("");
  const [liveInterimTranscript, setLiveInterimTranscript] = useState("");
  const [liveDetectedCommand, setLiveDetectedCommand] = useState<LectureAction | null>(null);
  const [commandTestInput, setCommandTestInput] = useState("");
  const [commandTestResult, setCommandTestResult] = useState<CommandTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const recognitionRunningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const restartAttemptRef = useRef(0);
  const liveInactivityTimerRef = useRef<number | null>(null);
  const liveFinalTranscriptRef = useRef("");
  const liveCommandFinalBufferRef = useRef("");
  const liveCommandInterimRef = useRef("");
  const liveLastFinalResultIndexRef = useRef(-1);
  const commandLockedUntilRef = useRef(0);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionConstructor() ? "supported" : "unsupported");
    fetch("/health")
      .then((response) => setConnection(response.ok ? "connected" : "disconnected"))
      .catch(() => setConnection("disconnected"));

    return () => {
      stopMicrophone();
    };
  }, []);

  function statusLabel() {
    if (micStatus === "listening") return "Listening";
    if (micStatus === "command") return "Command detected";
    if (micStatus === "error") return "Error";
    return "Stopped";
  }

  function getSpeechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function clearRestartTimer() {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function clearLiveInactivityTimer() {
    if (liveInactivityTimerRef.current != null) {
      window.clearTimeout(liveInactivityTimerRef.current);
      liveInactivityTimerRef.current = null;
    }
  }

  function resetLiveTranscript() {
    clearLiveInactivityTimer();
    liveFinalTranscriptRef.current = "";
    liveCommandFinalBufferRef.current = "";
    liveCommandInterimRef.current = "";
    setLiveFinalTranscript("");
    setLiveInterimTranscript("");
  }

  function scheduleLiveTranscriptReset() {
    clearLiveInactivityTimer();
    liveInactivityTimerRef.current = window.setTimeout(() => {
      resetLiveTranscript();
    }, LIVE_TRANSCRIPT_INACTIVITY_MS);
  }

  function isFatalRecognitionError(error: string) {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("not-allowed") ||
      normalized.includes("service-not-allowed") ||
      normalized.includes("permission") ||
      normalized.includes("audio-capture") ||
      normalized.includes("microphone")
    );
  }

  function scheduleRecognitionRestart(delayMs = RESTART_DELAY_MS) {
    clearRestartTimer();
    if (!shouldListenRef.current) return;

    restartTimerRef.current = window.setTimeout(() => {
      if (shouldListenRef.current) {
        startRecognition();
      }
    }, delayMs);
  }

  function createRecognition() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return null;

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = handleSpeechResult;
    recognition.onerror = (event) => {
      setError(event.message || `Speech recognition error: ${event.error}`);
      setMicStatus("error");
      if (isFatalRecognitionError(event.error)) {
        shouldListenRef.current = false;
        clearRestartTimer();
      }
    };
    recognition.onend = () => {
      recognitionRunningRef.current = false;
      if (!shouldListenRef.current) {
        setMicStatus("off");
        return;
      }

      scheduleRecognitionRestart();
    };

    return recognition;
  }

  function startRecognition() {
    if (recognitionRunningRef.current) return;

    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition();
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      setSpeechSupported("unsupported");
      setError("Browser speech recognition is not supported.");
      shouldListenRef.current = false;
      setMicStatus("error");
      return;
    }

    try {
      liveLastFinalResultIndexRef.current = -1;
      recognition.start();
      recognitionRunningRef.current = true;
      restartAttemptRef.current = 0;
      setMicStatus("listening");
    } catch (reason) {
      if (String(reason).includes("already started")) {
        recognitionRunningRef.current = true;
        restartAttemptRef.current = 0;
        setMicStatus("listening");
        return;
      }

      const message = reason instanceof Error ? reason.message : "Speech recognition failed to start.";
      setError(message);
      recognitionRunningRef.current = false;
      setMicStatus("error");

      if (shouldListenRef.current && !isFatalRecognitionError(message) && restartAttemptRef.current < MAX_TRANSIENT_RESTART_ATTEMPTS) {
        restartAttemptRef.current += 1;
        scheduleRecognitionRestart(RESTART_DELAY_MS * (restartAttemptRef.current + 1));
        return;
      }

      shouldListenRef.current = false;
    }
  }

  function startMicrophone() {
    if (shouldListenRef.current || recognitionRunningRef.current) return;
    setError(null);
    shouldListenRef.current = true;
    restartAttemptRef.current = 0;
    startRecognition();
  }

  function stopMicrophone() {
    shouldListenRef.current = false;
    clearRestartTimer();
    clearLiveInactivityTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
    }
    recognitionRunningRef.current = false;
    recognitionRef.current = null;
    setLiveInterimTranscript("");
    setMicStatus("off");
  }

  function handleSpeechResult(event: BrowserSpeechRecognitionEvent) {
    const finalPieces: string[] = [];
    const interimPieces: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) {
        continue;
      }
      if (result.isFinal) {
        if (index <= liveLastFinalResultIndexRef.current) {
          continue;
        }
        liveLastFinalResultIndexRef.current = index;
        finalPieces.push(transcript);
      } else {
        interimPieces.push(transcript);
      }
    }

    const finalText = finalPieces.join(" ").trim();
    const interimText = interimPieces.join(" ").trim();

    if (interimText) {
      setLiveInterimTranscript(interimText);
      liveCommandInterimRef.current = interimText;
    } else if (finalText) {
      setLiveInterimTranscript("");
      liveCommandInterimRef.current = "";
    }

    if (!finalText && !interimText) return;

    scheduleLiveTranscriptReset();

    if (finalText) {
      liveFinalTranscriptRef.current = appendTranscript(liveFinalTranscriptRef.current, finalText);
      liveCommandFinalBufferRef.current = appendTranscript(
        liveCommandFinalBufferRef.current,
        finalText,
        RECENT_TRANSCRIPT_MAX_CHARS
      );
      setLiveFinalTranscript(liveFinalTranscriptRef.current);
    }

    const recentTranscript = displayTranscript(liveCommandFinalBufferRef.current, liveCommandInterimRef.current).slice(
      -RECENT_TRANSCRIPT_MAX_CHARS
    );

    const action = matchBrowserLectureCommand(recentTranscript);
    if (!action || shouldSuppressCommand(action, recentTranscript)) return;

    liveCommandFinalBufferRef.current = "";
    liveCommandInterimRef.current = "";
    setLiveInterimTranscript("");
    setLiveDetectedCommand(action);
    setMicStatus("command");
    void sendLectureCommand(action, recentTranscript)
      .then((result) => {
        if (result.broadcast) {
          resetLiveTranscript();
        }
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Lecture command failed");
        setMicStatus("error");
      })
      .finally(() => {
        if (shouldListenRef.current) {
          setMicStatus("listening");
        }
      });
  }

  function shouldSuppressCommand(action: LectureAction, transcript: string) {
    void action;
    void transcript;
    const now = Date.now();
    if (now < commandLockedUntilRef.current) {
      return true;
    }

    commandLockedUntilRef.current = now + COMMAND_LOCK_MS;
    return false;
  }

  function appendTranscript(base: string, next: string, maxChars?: number) {
    const combined = `${base} ${next}`.replace(/\s+/g, " ").trim();
    return typeof maxChars === "number" ? combined.slice(-maxChars) : combined;
  }

  function displayTranscript(finalTranscript: string, interimTranscript: string) {
    return `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();
  }

  function evaluateCommandTestInput(input: string) {
    const trimmedInput = input.trim();
    const result: CommandTestResult = {
      input: trimmedInput,
      normalized: normalizeSpeechText(trimmedInput),
      segment: extractBrowserCommandSegment(trimmedInput),
      action: matchBrowserLectureCommand(trimmedInput),
    };
    setCommandTestResult(result);
  }

  function submitCommandTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    evaluateCommandTestInput(commandTestInput);
  }

  const liveDisplayTranscript = displayTranscript(liveFinalTranscript, liveInterimTranscript);
  const isMicOn = micStatus === "listening" || micStatus === "command";

  return (
    <main className="mic-page">
      <section className="mic-panel">
        <header>
          <span>RAG CLASS</span>
          <h1>RAG Lecture Microphone</h1>
        </header>

        <dl className="mic-status-grid">
          <div>
            <dt>Connection</dt>
            <dd>{connection === "connected" ? "Connected" : connection === "disconnected" ? "Disconnected" : "Checking"}</dd>
          </div>
          <div>
            <dt>Speech Recognition</dt>
            <dd>{speechSupported === "supported" ? "Supported" : speechSupported === "unsupported" ? "Unsupported" : "Checking"}</dd>
          </div>
          <div>
            <dt>Microphone</dt>
            <dd>{micStatus === "listening" || micStatus === "command" ? "Listening" : "Stopped"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{statusLabel()}</dd>
          </div>
          <div>
            <dt>Detected Command</dt>
            <dd>{liveDetectedCommand ?? "-"}</dd>
          </div>
        </dl>

        <section className="mic-section">
          <div className="mic-section-heading">
            <div className="mic-section-title-row">
              <span>LIVE MICROPHONE</span>
              <span className={`mic-state-badge ${isMicOn ? "on" : "off"}`}>
                <span aria-hidden="true" />
                {isMicOn ? "MIC ON" : "MIC OFF"}
              </span>
            </div>
            <p>Use after browser microphone permission is available.</p>
          </div>
          <div className="mic-actions">
            <button type="button" onClick={startMicrophone} disabled={micStatus !== "off"}>
              Start Microphone
            </button>
            <button type="button" onClick={stopMicrophone} disabled={micStatus === "off"}>
              Stop Microphone
            </button>
          </div>
          <div className="mic-transcript">
            <span>Live Transcript</span>
            <p>{liveDisplayTranscript ? `"${liveDisplayTranscript}"` : "-"}</p>
          </div>
          <div className="mic-transcript">
            <span>Detected Command</span>
            <p>{liveDetectedCommand ?? "-"}</p>
          </div>
        </section>

        <section className="mic-section command-test-section">
          <div className="mic-section-heading">
            <span>COMMAND TEST</span>
            <p>키워드가 어떤 명령으로 인식되는지만 확인합니다.</p>
          </div>
          <form className="command-test-form" onSubmit={submitCommandTest}>
            <input
              type="text"
              value={commandTestInput}
              onChange={(event) => setCommandTestInput(event.target.value)}
              placeholder="네이버로 넘어가겠습니다"
            />
            <button type="submit">명령 확인</button>
          </form>
          <div className="command-test-result">
            <div>
              <span>원본 입력</span>
              <p>{commandTestResult?.input || "-"}</p>
            </div>
            <div>
              <span>정규화</span>
              <p>{commandTestResult?.normalized || "-"}</p>
            </div>
            <div>
              <span>명령 구간</span>
              <p>{commandTestResult?.segment || "-"}</p>
            </div>
            <div>
              <span>인식 결과</span>
              <p>{commandTestResult ? commandTestResult.action ?? "명령 없음" : "-"}</p>
            </div>
          </div>
        </section>

        {error && <p className="mic-error">{error}</p>}
      </section>
    </main>
  );
}
