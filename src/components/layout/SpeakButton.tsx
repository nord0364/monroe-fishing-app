

interface SpeakButtonProps {
  text: string
  speak: (t: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  speaking: boolean
  paused: boolean
}

export default function SpeakButton({ text, speak, pause, resume, stop, speaking, paused }: SpeakButtonProps) {
  if (!speaking) {
    return (
      <button
        onClick={() => speak(text)}
        className="p-2.5 rounded-full bg-slate-800 text-slate-300 active:bg-slate-700 border border-slate-700"
        title="Read aloud"
      >
        🔊
      </button>
    )
  }

  return (
    <div className="flex gap-2">
      {paused ? (
        <button
          onClick={resume}
          className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm"
        >
          ▶ Resume
        </button>
      ) : (
        <button
          onClick={pause}
          className="px-3 py-2 rounded-lg bg-amber-700 text-white text-sm"
        >
          ⏸ Pause
        </button>
      )}
      <button
        onClick={stop}
        className="px-3 py-2 rounded-lg bg-red-800 text-white text-sm"
      >
        ⏹ Stop
      </button>
    </div>
  )
}
