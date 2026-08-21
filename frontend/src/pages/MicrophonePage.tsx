import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { matchBrowserLectureCommand } from "../services/browserSpeechCommandMatcher";
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

const ACCEPTED_AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".webm", ".ogg"];
const ACCEPTED_AUDIO_INPUT = ACCEPTED_AUDIO_EXTENSIONS.join(",");
const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024;
const RECENT_TRANSCRIPT_MAX_CHARS = 220;
const COMMAND_LOCK_MS = 2800;

export function MicrophonePage() {
  const [connection, setConnection] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [fileStatus, setFileStatus] = useState<FileStatus>("idle");
  const [speechSupported, setSpeechSupported] = useState<"unknown" | "supported" | "unsupported">("unknown");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveDetectedCommand, setLiveDetectedCommand] = useState<LectureAction | null>(null);
  const [fileTranscript, setFileTranscript] = useState("");
  const [fileDetectedCommand, setFileDetectedCommand] = useState<LectureAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileAudioRef = useRef<HTMLAudioElement | null>(null);
  const shouldListenRef = useRef(false);
  const recognitionRunningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const recentTranscriptRef = useRef("");
  const fileTranscriptRef = useRef("");
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
    fileTranscriptRef.current = "";
    fileDetectedCommandRef.current = null;
    setFileTranscript("");
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
    fileTranscriptRef.current = "";
    fileDetectedCommandRef.current = null;
    setFileTranscript("");
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
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        shouldListenRef.current = false;
      }
    };
    recognition.onend = () => {
      recognitionRunningRef.current = false;
      if (!shouldListenRef.current) {
        setMicStatus("off");
        return;
      }

      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        if (shouldListenRef.current) {
          startRecognition();
        }
      }, 350);
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
      recognition.start();
      recognitionRunningRef.current = true;
      setMicStatus("listening");
    } catch (reason) {
      if (String(reason).includes("already started")) {
        recognitionRunningRef.current = true;
        setMicStatus("listening");
        return;
      }
      setError(reason instanceof Error ? reason.message : "Speech recognition failed to start.");
      shouldListenRef.current = false;
      setMicStatus("error");
    }
  }

  function startMicrophone() {
    if (shouldListenRef.current || recognitionRunningRef.current) return;
    setError(null);
    shouldListenRef.current = true;
    startRecognition();
  }

  function stopMicrophone() {
    shouldListenRef.current = false;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
    }
    recognitionRunningRef.current = false;
    recognitionRef.current = null;
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
    const pieces: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result?.[0]?.transcript) {
        pieces.push(result[0].transcript);
      }
    }

    const latestText = pieces.join(" ").trim();
    if (!latestText) return;

    const recentTranscript = `${recentTranscriptRef.current} ${latestText}`.trim().slice(-RECENT_TRANSCRIPT_MAX_CHARS);
    recentTranscriptRef.current = recentTranscript;
    setLiveTranscript(latestText);

    const action = matchBrowserLectureCommand(recentTranscript);
    if (!action || shouldSuppressCommand(action, recentTranscript)) return;

    recentTranscriptRef.current = "";
    setLiveDetectedCommand(action);
    setMicStatus("command");
    void sendLectureCommand(action, recentTranscript)
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
    const pieces: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result?.[0]?.transcript) {
        pieces.push(result[0].transcript);
      }
    }

    const latestText = pieces.join(" ").trim();
    if (!latestText) return;

    const transcript = `${fileTranscriptRef.current} ${latestText}`.trim().slice(-RECENT_TRANSCRIPT_MAX_CHARS);
    fileTranscriptRef.current = transcript;
    setFileTranscript(transcript);

    const action = matchBrowserLectureCommand(transcript);
    if (!action || shouldSuppressCommand(action, transcript)) return;

    fileTranscriptRef.current = "";
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
            <span>LIVE MICROPHONE</span>
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
            <p>{liveTranscript ? `"${liveTranscript}"` : "-"}</p>
          </div>
          <div className="mic-transcript">
            <span>Detected Command</span>
            <p>{liveDetectedCommand ?? "-"}</p>
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
            <p>{fileTranscript ? `"${fileTranscript}"` : "-"}</p>
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
