import { useEffect, useRef, useState, useCallback } from 'react';

interface UseRealtimeVoiceProps {
  apiKey: string;
  instructions?: string;
}

export function useRealtimeVoice({ apiKey, instructions }: UseRealtimeVoiceProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>('');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const connect = useCallback(async () => {
    try {
      setError(null);

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      audioElementRef.current = document.createElement('audio');
      audioElementRef.current.autoplay = true;

      pc.ontrack = (e) => {
        if (audioElementRef.current) {
          audioElementRef.current.srcObject = e.streams[0];
        }
      };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = ms;
      pc.addTrack(ms.getTracks()[0]);

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.addEventListener('message', (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            setTranscription(prev => prev + '\nYou: ' + event.transcript);
          } else if (event.type === 'response.audio_transcript.delta') {
            setTranscription(prev => prev + event.delta);
          } else if (event.type === 'response.audio_transcript.done') {
            setTranscription(prev => prev + '\n');
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = 'https://api.openai.com/v1/realtime';
      const model = 'gpt-4o-realtime-preview-2024-12-17';

      const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/sdp'
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(`Failed to connect: ${sdpResponse.status} ${sdpResponse.statusText}`);
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });

      setIsConnected(true);

      dc.addEventListener('open', () => {
        const sessionUpdate = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: instructions || 'You are a helpful voice assistant. Be concise and conversational.',
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        };
        dc.send(JSON.stringify(sessionUpdate));
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      console.error('Connection error:', err);
    }
  }, [apiKey, instructions]);

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
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
  }, []);

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
    stopRecording
  };
}
