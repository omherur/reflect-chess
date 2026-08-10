"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

/** Minimal shape of the bits of the Web Speech API this component actually uses. */
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Support never changes at runtime, so a no-op subscribe is correct here —
// this is the React-sanctioned way to read a browser-only capability
// without a hydration mismatch (server always reports unsupported) and
// without setState-in-an-effect.
function subscribe() {
  return () => {};
}
function getSnapshot(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}
function getServerSnapshot(): boolean {
  return false;
}

/**
 * A mic button that transcribes speech into the given text field via
 * onTranscript — falls back to rendering nothing on browsers without the
 * Web Speech API, so typing always still works.
 */
export function VoiceInputButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const supported = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");
      onTranscript(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={listening ? "Stop voice input" : "Start voice input"}
      className={listening ? "animate-pulse text-red-600" : "text-stone-500"}
    >
      {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </Button>
  );
}
