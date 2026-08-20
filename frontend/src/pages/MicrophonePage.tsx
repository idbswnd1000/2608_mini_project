import { useEffect, useRef, useState } from "react";
import { LectureAction, LectureCommandResult, sendLectureAudio } from "../services/lectureControl";

type MicStatus = "off" | "listening" | "processing";

export function MicrophonePage() {
  const [connection, setConnection] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const [lastTranscript, setLastTranscript] = useState("");
  const [detectedCommand, setDetectedCommand] = useState<LectureAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    fetch("/health")
      .then((response) => setConnection(response.ok ? "connected" : "disconnected"))
      .catch(() => setConnection("disconnected"));

    return () => {
      stopMicrophone();
    };
  }, []);

  async function processAudio(blob: Blob) {
    if (processingRef.current || blob.size === 0) return;
    processingRef.current = true;
    setMicStatus("processing");
    setError(null);

    try {
      const result: LectureCommandResult = await sendLectureAudio(blob);
      setLastTranscript(result.transcript || "");
      setDetectedCommand(result.action);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Audio command failed");
    } finally {
      processingRef.current = false;
      if (recorderRef.current?.state === "recording") {
        setMicStatus("listening");
      } else {
        setMicStatus("off");
      }
    }
  }

  async function startMicrophone() {
    if (recorderRef.current?.state === "recording") return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          void processAudio(event.data);
        }
      };

      recorder.onstop = () => {
        if (!processingRef.current) {
          setMicStatus("off");
        }
      };

      recorder.start(4500);
      setMicStatus("listening");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Microphone permission failed");
      setMicStatus("off");
    }
  }

  function stopMicrophone() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (!processingRef.current) {
      setMicStatus("off");
    }
  }

  function preferredMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
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
            <dt>Microphone</dt>
            <dd>{micStatus === "off" ? "OFF" : "ON"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{micStatus === "processing" ? "Processing" : micStatus === "listening" ? "Listening" : "Idle"}</dd>
          </div>
          <div>
            <dt>Detected Command</dt>
            <dd>{detectedCommand ?? "-"}</dd>
          </div>
        </dl>

        <div className="mic-transcript">
          <span>Last Transcript</span>
          <p>{lastTranscript ? `"${lastTranscript}"` : "-"}</p>
        </div>

        {error && <p className="mic-error">{error}</p>}

        <div className="mic-actions">
          <button type="button" onClick={startMicrophone} disabled={micStatus !== "off"}>
            Start Microphone
          </button>
          <button type="button" onClick={stopMicrophone} disabled={micStatus === "off"}>
            Stop Microphone
          </button>
        </div>
      </section>
    </main>
  );
}
