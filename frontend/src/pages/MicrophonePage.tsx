import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
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
  start: (audioTrack?: MediaStreamTrack) => void;
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

type CapturableAudioElement = HTMLAudioElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type MicStatus = "off" | "listening" | "command" | "error";
type FileStatus = "idle" | "loading" | "listening" | "command" | "no-command" | "error";
type CommandTestResult = {
  input: string;
  normalized: string;
  segment: string;
  action: LectureAction | null;
  message: string | null;
};

const ACCEPTED_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".webm", ".ogg"];
const ACCEPTED_AUDIO_INPUT = ACCEPTED_AUDIO_EXTENSIONS.join(",");
const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
const RECENT_TRANSCRIPT_MAX_CHARS = 220;
const COMMAND_LOCK_MS = 2800;
const RESTART_DELAY_MS = 350;
const MAX_TRANSIENT_RESTART_ATTEMPTS = 3;
const LIVE_TRANSCRIPT_INACTIVITY_MS = 5000;

export function MicrophonePage() {
  const [connection, setConnection] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [fileStatus, setFileStatus] = useState<FileStatus>("idle");
  const [speechSupported, setSpeechSupported] = useState<"unknown" | "supported" | "unsupported">("unknown");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [liveFinalTranscript, setLiveFinalTranscript] = useState("");
  const [liveInterimTranscript, setLiveInterimTranscript] = useState("");
  const [liveDetectedCommand, setLiveDetectedCommand] = useState<LectureAction | null>(null);
  const [fileFinalTranscript, setFileFinalTranscript] = useState("");
  const [fileInterimTranscript, setFileInterimTranscript] = useState("");
  const [fileDetectedCommand, setFileDetectedCommand] = useState<LectureAction | null>(null);
  const [commandTestInput, setCommandTestInput] = useState("");
  const [commandTestResult, setCommandTestResult] = useState<CommandTestResult | null>(null);
  const [commandTestSending, setCommandTestSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileAudioRef = useRef<HTMLAudioElement | null>(null);
  const shouldListenRef = useRef(false);
  const recognitionRunningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const restartAttemptRef = useRef(0);
  const liveInactivityTimerRef = useRef<number | null>(null);
  const liveFinalTranscriptRef = useRef("");
  const fileFinalTranscriptRef = useRef("");
  const liveCommandFinalBufferRef = useRef("");
  const liveCommandInterimRef = useRef("");
  const fileCommandFinalBufferRef = useRef("");
  const fileCommandInterimRef = useRef("");
  const liveLastFinalResultIndexRef = useRef(-1);
  const fileLastFinalResultIndexRef = useRef(-1);
  const fileDetectedCommandRef = useRef<LectureAction | null>(null);
  const commandLockedUntilRef = useRef(0);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognitionConstructor() ? "supported" : "unsupported");
    fetch("/health")
      .then((response) => setConnection(response.ok ? "connected" : "disconnected"))
      .catch(() => setConnection("disconnected"));

    return () => {
      stopMicrophone();
      cleanupFileRecognition();
    };
  }, []);

  async function analyzeVoiceFile() {
    if (!selectedFile) {
      setError("Please select an audio file first.");
      setFileStatus("error");
      return;
    }

    const validationError = validateAudioFile(selectedFile);
    if (validationError) {
      setError(validationError);
      setFileStatus("error");
      return;
    }

    cleanupFileRecognition();
    fileFinalTranscriptRef.current = "";
    fileCommandFinalBufferRef.current = "";
    fileCommandInterimRef.current = "";
    fileLastFinalResultIndexRef.current = -1;
    fileDetectedCommandRef.current = null;
    setFileFinalTranscript("");
    setFileInterimTranscript("");
    setFileDetectedCommand(null);
    setFileStatus("loading");
    setError(null);

    const recognition = createFileRecognition();
    if (!recognition) {
      setSpeechSupported("unsupported");
      setError("Browser speech recognition is not supported.");
      setFileStatus("error");
      return;
    }

    const audio = new Audio(URL.createObjectURL(selectedFile)) as CapturableAudioElement;
    fileAudioRef.current = audio;
    audio.muted = true;

    audio.oncanplay = () => {
      try {
        const captureStream = audio.captureStream || audio.mozCaptureStream;
        if (!captureStream) {
          throw new Error("This browser cannot expose audio files as speech-recognition tracks.");
        }
        const stream = captureStream.call(audio);
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) {
          throw new Error("No audio track was found in the selected file.");
        }
        fileRecognitionRef.current = recognition;
        recognition.start(audioTrack);
        void audio.play();
        setFileStatus("listening");
      } catch (reason) {
        cleanupFileRecognition();
        setError(reason instanceof Error ? reason.message : "Browser file speech recognition failed to start.");
        setFileStatus("error");
      }
    };

    audio.onerror = () => {
      cleanupFileRecognition();
      setError("The selected audio file could not be loaded by this browser.");
      setFileStatus("error");
    };
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    fileFinalTranscriptRef.current = "";
    fileCommandFinalBufferRef.current = "";
    fileCommandInterimRef.current = "";
    fileLastFinalResultIndexRef.current = -1;
    fileDetectedCommandRef.current = null;
    setFileFinalTranscript("");
    setFileInterimTranscript("");
    setFileDetectedCommand(null);
    setFileStatus("idle");
    setError(null);
  }

  function validateAudioFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const isSupported = ACCEPTED_AUDIO_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
    if (!isSupported) {
      return "Unsupported audio file. Use mp3, m4a, wav, webm, or ogg.";
    }
    if (file.size > MAX_AUDIO_FILE_BYTES) {
      return "Audio file is too large. Use a file under 25 MB.";
    }
    if (file.size === 0) {
      return "Audio file is empty.";
    }
    return null;
  }

  function fileStatusLabel() {
    if (fileStatus === "loading") return "Loading";
    if (fileStatus === "listening") return "Recognizing";
    if (fileStatus === "command") return "Command detected";
    if (fileStatus === "no-command") return "No lecture command detected";
    if (fileStatus === "error") return "Error";
    return "Idle";
  }

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

  function createFileRecognition() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) return null;

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = handleFileSpeechResult;
    recognition.onerror = (event) => {
      setError(event.message || `File speech recognition error: ${event.error}`);
      setFileStatus("error");
    };
    recognition.onend = () => {
      setFileStatus(fileDetectedCommandRef.current ? "command" : "no-command");
      cleanupFileRecognition(false);
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

  function cleanupFileRecognition(stopRecognition = true) {
    const recognition = fileRecognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      if (stopRecognition) {
        recognition.stop();
      }
    }
    fileRecognitionRef.current = null;

    const audio = fileAudioRef.current;
    if (audio) {
      audio.pause();
      URL.revokeObjectURL(audio.src);
    }
    fileAudioRef.current = null;
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

  function handleFileSpeechResult(event: BrowserSpeechRecognitionEvent) {
    const finalPieces: string[] = [];
    const interimPieces: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) {
        continue;
      }
      if (result.isFinal) {
        if (index <= fileLastFinalResultIndexRef.current) {
          continue;
        }
        fileLastFinalResultIndexRef.current = index;
        finalPieces.push(transcript);
      } else {
        interimPieces.push(transcript);
      }
    }

    const finalText = finalPieces.join(" ").trim();
    const interimText = interimPieces.join(" ").trim();

    if (interimText) {
      setFileInterimTranscript(interimText);
      fileCommandInterimRef.current = interimText;
    } else if (finalText) {
      setFileInterimTranscript("");
      fileCommandInterimRef.current = "";
    }

    if (!finalText && !interimText) return;

    if (finalText) {
      fileFinalTranscriptRef.current = appendTranscript(fileFinalTranscriptRef.current, finalText);
      fileCommandFinalBufferRef.current = appendTranscript(
        fileCommandFinalBufferRef.current,
        finalText,
        RECENT_TRANSCRIPT_MAX_CHARS
      );
      setFileFinalTranscript(fileFinalTranscriptRef.current);
    }

    const transcript = displayTranscript(fileCommandFinalBufferRef.current, fileCommandInterimRef.current).slice(
      -RECENT_TRANSCRIPT_MAX_CHARS
    );

    const action = matchBrowserLectureCommand(transcript);
    if (!action || shouldSuppressCommand(action, transcript)) return;

    fileCommandFinalBufferRef.current = "";
    fileCommandInterimRef.current = "";
    setFileInterimTranscript("");
    fileDetectedCommandRef.current = action;
    setFileDetectedCommand(action);
    setFileStatus("command");
    void sendLectureCommand(action, transcript).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Lecture command failed");
      setFileStatus("error");
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

  function evaluateCommandTestInput(input: string, message: string | null = null) {
    const trimmedInput = input.trim();
    const result: CommandTestResult = {
      input: trimmedInput,
      normalized: normalizeSpeechText(trimmedInput),
      segment: extractBrowserCommandSegment(trimmedInput),
      action: matchBrowserLectureCommand(trimmedInput),
      message,
    };
    setCommandTestResult(result);
    return result;
  }

  function confirmCommandTest() {
    evaluateCommandTestInput(commandTestInput);
  }

  function submitCommandTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    confirmCommandTest();
  }

  async function executeCommandTest() {
    const result = evaluateCommandTestInput(commandTestInput);
    if (!result.action) {
      setCommandTestResult({
        ...result,
        message: "명령을 인식하지 못했습니다.",
      });
      return;
    }

    setCommandTestSending(true);
    try {
      await sendLectureCommand(result.action, result.input);
      setCommandTestResult({
        ...result,
        message: "명령을 전송했습니다.",
      });
    } catch (reason) {
      setCommandTestResult({
        ...result,
        message: reason instanceof Error ? reason.message : "명령 전송에 실패했습니다.",
      });
    } finally {
      setCommandTestSending(false);
    }
  }

  const liveDisplayTranscript = displayTranscript(liveFinalTranscript, liveInterimTranscript);
  const fileDisplayTranscript = displayTranscript(fileFinalTranscript, fileInterimTranscript);
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
          <div>
            <dt>File Status</dt>
            <dd>{fileStatusLabel()}</dd>
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
            <p>Test the current browser command matcher without using the microphone.</p>
          </div>
          <form className="command-test-form" onSubmit={submitCommandTest}>
            <input
              type="text"
              value={commandTestInput}
              onChange={(event) => setCommandTestInput(event.target.value)}
              placeholder="네이버로 넘어가겠습니다"
            />
            <button type="submit">명령 확인</button>
            <button type="button" onClick={executeCommandTest} disabled={commandTestSending}>
              {commandTestSending ? "전송 중" : "명령 실행"}
            </button>
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
              <span>Action</span>
              <p>{commandTestResult ? commandTestResult.action ?? "명령 없음" : "-"}</p>
            </div>
            {commandTestResult?.message && (
              <div className="command-test-message">
                <span>상태</span>
                <p>{commandTestResult.message}</p>
              </div>
            )}
          </div>
        </section>

        <section className="mic-section">
          <div className="mic-section-heading">
            <span>VOICE FILE</span>
            <p>Recognize an uploaded file in the browser.</p>
          </div>
          <label className="mic-file-picker">
            <span>Audio File</span>
            <input type="file" accept={ACCEPTED_AUDIO_INPUT} onChange={onFileChange} />
          </label>
          <div className="mic-file-meta">
            <span>Selected</span>
            <strong>{selectedFile ? selectedFile.name : "-"}</strong>
          </div>
          <div className="mic-actions mic-actions-single">
            <button type="button" onClick={analyzeVoiceFile} disabled={fileStatus === "loading" || fileStatus === "listening"}>
              Analyze Voice
            </button>
          </div>
          <div className="mic-transcript">
            <span>Transcript</span>
            <p>{fileDisplayTranscript ? `"${fileDisplayTranscript}"` : "-"}</p>
          </div>
          <div className="mic-transcript">
            <span>Detected Command</span>
            <p>{fileDetectedCommand ?? "-"}</p>
          </div>
        </section>

        {error && <p className="mic-error">{error}</p>}
      </section>
    </main>
  );
}
