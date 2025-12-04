/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from "react";

type TranscriptEntry = { speaker: "user" | "assistant"; text: string };

type ActiveEntry<T extends "user" | "assistant"> = T extends "user"
  ? { itemId: string | null; entry: TranscriptEntry }
  : { responseId: string | null; entry: TranscriptEntry };

const REALTIME_MODEL = "gpt-4o-mini-realtime-preview";

interface UseRealtimeVoiceProps {
  apiKey: string;
  instructions?: string;
}

export function useRealtimeVoice({
  apiKey,
  instructions,
}: UseRealtimeVoiceProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>("");

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const transcriptEntriesRef = useRef<TranscriptEntry[]>([]);
  const activeUserEntryRef = useRef<ActiveEntry<"user"> | null>(null);
  const activeAssistantEntryRef = useRef<ActiveEntry<"assistant"> | null>(null);

  const refreshTranscription = useCallback(() => {
    const formatted = transcriptEntriesRef.current
      .map((entry) => {
        const label = entry.speaker === "user" ? "You" : "Assistant";
        return `${label}: ${entry.text.trim()}`.trim();
      })
      .filter(Boolean)
      .join("\n");

    setTranscription(formatted);
  }, []);

  const getUserEntry = useCallback((itemId?: string | null) => {
    const current = activeUserEntryRef.current;
    if (current) {
      const idsMatch =
        !itemId || current.itemId === itemId || current.itemId === null;
      if (idsMatch) {
        if (!current.itemId && itemId) {
          current.itemId = itemId;
        }
        return current.entry;
      }
    }

    const entry: TranscriptEntry = { speaker: "user", text: "" };
    transcriptEntriesRef.current.push(entry);
    activeUserEntryRef.current = { itemId: itemId ?? null, entry };
    return entry;
  }, []);

  const finalizeUserEntry = useCallback((itemId?: string | null) => {
    if (!activeUserEntryRef.current) {
      return;
    }

    if (
      !itemId ||
      activeUserEntryRef.current.itemId === null ||
      activeUserEntryRef.current.itemId === itemId
    ) {
      activeUserEntryRef.current = null;
    }
  }, []);

  const getAssistantEntry = useCallback((responseId?: string | null) => {
    const current = activeAssistantEntryRef.current;
    if (current) {
      const idsMatch =
        !responseId ||
        current.responseId === responseId ||
        current.responseId === null;

      if (idsMatch) {
        if (!current.responseId && responseId) {
          current.responseId = responseId;
        }
        return current.entry;
      }
    }

    const entry: TranscriptEntry = { speaker: "assistant", text: "" };
    transcriptEntriesRef.current.push(entry);
    activeAssistantEntryRef.current = {
      responseId: responseId ?? null,
      entry,
    };
    return entry;
  }, []);

  const finalizeAssistantEntry = useCallback((responseId?: string | null) => {
    if (!activeAssistantEntryRef.current) {
      return;
    }

    if (
      !responseId ||
      activeAssistantEntryRef.current.responseId === null ||
      activeAssistantEntryRef.current.responseId === responseId
    ) {
      activeAssistantEntryRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
  }, []);

  const connect = useCallback(async () => {
    try {
      setError(null);
      setTranscription("");
      transcriptEntriesRef.current = [];
      activeUserEntryRef.current = null;
      activeAssistantEntryRef.current = null;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      audioElementRef.current = document.createElement("audio");
      audioElementRef.current.autoplay = true;

      pc.ontrack = (event) => {
        if (audioElementRef.current) {
          audioElementRef.current.srcObject = event.streams[0];
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = mediaStream;
      mediaStream
        .getTracks()
        .forEach((track) => pc.addTrack(track, mediaStream));

      const dataChannel = pc.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.addEventListener("message", (messageEvent) => {
        let event;
        try {
          event = JSON.parse(messageEvent.data);
        } catch (err) {
          console.error(
            "Failed to parse realtime event:",
            err,
            messageEvent.data
          );
          return;
        }

        const ensureListeningPlaceholder = (itemId?: string | null) => {
          const entry = getUserEntry(itemId);
          if (!entry.text) {
            entry.text = "(listening...)";
            refreshTranscription();
          }
        };

        const appendUserUtterance = (
          delta?: string,
          itemId?: string | null
        ) => {
          if (!delta) {
            return;
          }
          const entry = getUserEntry(itemId);
          if (entry.text === "(listening...)") {
            entry.text = "";
          }
          entry.text += delta;
          refreshTranscription();
        };

        const overwriteUserUtterance = (
          text?: string,
          itemId?: string | null,
          finalize = false
        ) => {
          const entry = getUserEntry(itemId);
          if (text?.trim()) {
            entry.text = text.trim();
          } else if (!entry.text) {
            entry.text = "(listening...)";
          }
          refreshTranscription();
          if (finalize) {
            finalizeUserEntry(itemId);
          }
        };

        const appendAssistantUtterance = (
          delta?: string,
          responseId?: string | null
        ) => {
          if (!delta) {
            return;
          }
          const entry = getAssistantEntry(responseId);
          entry.text += delta;
          refreshTranscription();
        };

        if (
          event.type === "conversation.item.created" &&
          event.item?.role === "user"
        ) {
          const segments = event.item?.content ?? [];
          const textSegment = segments.find(
            (segment: any) =>
              segment?.type === "input_text" ||
              segment?.type === "input_audio_transcription"
          );

          if (textSegment?.text || textSegment?.transcript) {
            overwriteUserUtterance(
              textSegment.text || textSegment.transcript,
              event.item?.id ?? null,
              true
            );
          } else {
            ensureListeningPlaceholder(event.item?.id ?? null);
          }
          return;
        }

        if (event.type?.includes("input_audio_transcription.delta")) {
          appendUserUtterance(
            event.delta ?? event.transcript,
            event.item_id ?? null
          );
          return;
        }

        if (event.type?.includes("input_audio_transcription.completed")) {
          overwriteUserUtterance(
            event.transcript ?? event.text,
            event.item_id ?? null,
            true
          );
          return;
        }

        if (event.type?.includes("input_text.delta")) {
          appendUserUtterance(event.delta ?? event.text, event.item_id ?? null);
          return;
        }

        if (event.type?.includes("input_text.completed")) {
          overwriteUserUtterance(
            event.text ?? event.transcript,
            event.item_id ?? null,
            true
          );
          return;
        }

        if (
          event.type === "response.output_text.delta" ||
          event.type === "response.audio_transcript.delta"
        ) {
          const responseKey =
            event.response_id || event.item_id || event.response?.id || null;
          appendAssistantUtterance(event.delta ?? "", responseKey);
          return;
        }

        if (
          event.type === "response.output_text.done" ||
          event.type === "response.audio_transcript.done"
        ) {
          const responseKey =
            event.response_id || event.item_id || event.response?.id || null;
          finalizeAssistantEntry(responseKey);
          refreshTranscription();
          return;
        }

        if (
          event.type === "response.output_audio.delta" ||
          event.type === "response.output_audio.done"
        ) {
          return;
        }

        console.debug("Unhandled realtime event:", event);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
        {
          method: "POST",
          body: offer.sdp ?? "",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/sdp",
            "OpenAI-Beta": "realtime=v1",
          },
        }
      );

      if (!sdpResponse.ok) {
        const payload = await sdpResponse.text();
        throw new Error(
          `Failed to connect: ${sdpResponse.status} ${sdpResponse.statusText} - ${payload}`
        );
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      dataChannel.addEventListener("open", () => {
        const englishDirective =
          "Always speak and transcribe in English unless the user explicitly requests another language.";
        const instructionText = instructions
          ? `${instructions}\n\n${englishDirective}`
          : `You are a helpful voice assistant. Be concise, conversational, and ${englishDirective.toLowerCase()}`;

        const sessionUpdate = {
          type: "session.update",
          session: {
            instructions: instructionText,
            modalities: ["audio", "text"],
            voice: "alloy",
            input_audio_transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "en",
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
            },
          },
        };

        dataChannel.send(JSON.stringify(sessionUpdate));
      });

      setIsConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      console.error("Connection error:", err);
      disconnect();
    }
  }, [
    apiKey,
    instructions,
    disconnect,
    finalizeAssistantEntry,
    finalizeUserEntry,
    getAssistantEntry,
    getUserEntry,
    refreshTranscription,
  ]);

  const startRecording = useCallback(() => {
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isRecording,
    error,
    transcription,
    connect,
    disconnect,
    startRecording,
    stopRecording,
  };
}
