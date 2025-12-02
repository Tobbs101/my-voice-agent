import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useRealtimeVoice } from "../hooks/useRealtimeVoice";

const apiKey = import.meta.env.VITE_OPENAI_API_KEY || "";
const instructions =
  "You are a helpful and friendly voice assistant. Be conversational, concise, and engaging. Respond naturally to user queries.";

export function VoiceAgent() {
  const {
    isConnected,
    isRecording,
    error,
    transcription,
    connect,
    disconnect,
  } = useRealtimeVoice({ apiKey, instructions });

  const handleConnect = async () => {
    if (!apiKey) {
      alert("Missing OpenAI API Key.");

      return;
    }
    await connect();
  };

  return (
    <div className="min-h-screen bg-[#161616] flex py-[50px] items-center justify-center flex-col text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-center items-center mb-8">
          <h1 className="text-4xl font-bold text-white text-center">
            Your Personal Voice Agent
          </h1>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700 mb-6">
          <div className="flex flex-col items-center gap-8">
            <div className="relative">
              <div
                className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isConnected && isRecording
                    ? "bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50"
                    : isConnected
                    ? "bg-green-500"
                    : "bg-slate-700"
                }`}
              >
                {isRecording ? (
                  <Mic className="w-20 h-20" />
                ) : (
                  <MicOff className="w-20 h-20 opacity-50" />
                )}
              </div>
              {isConnected && (
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-4 border-slate-800 animate-pulse" />
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={isConnected ? disconnect : handleConnect}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 transition-all rounded-full font-semibold text-lg flex items-center gap-3 transition-all shadow-lg hover:shadow-xl"
              >
                {isConnected ? (
                  <>
                    <PhoneOff className="w-6 h-6" />
                    End Conversation
                  </>
                ) : (
                  <>
                    <Phone className="w-6 h-6" />
                    Start Conversation
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
                <p className="font-semibold">Error:</p>
                <p>{error}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-slate-400">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-slate-500"
                }`}
              />
              {isConnected ? "Connected - Speak now" : "Disconnected"}
            </div>
          </div>
        </div>

        {transcription && (
          <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              Conversation
            </h2>
            <div className="bg-slate-900 rounded-lg p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-slate-300 font-mono text-sm">
                {transcription}
              </pre>
            </div>
          </div>
        )}

        <div className="mt-8 bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-3">How to use:</h3>
          <ol className="space-y-2 text-slate-300">
            <li className="flex gap-3">
              <span className="text-blue-400 font-semibold">1.</span>
              <span>
                Click "Start Conversation" and allow microphone access
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-semibold">2.</span>
              <span>Speak naturally - the agent will respond in real-time</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
