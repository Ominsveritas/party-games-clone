"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "../registry";
import { playSwap, playCorrect, playWrong } from "@/lib/sounds";

interface KzPlayer {
  name: string;
  bestRound: number;
  bestTimeMs: number;
  curRound: number;
  active: boolean;
}

interface KeyboardZenState {
  players?: Record<string, KzPlayer>;
}

type Status = "idle" | "playing" | "failed";

const MEDALS = ["🥇", "🥈", "🥉"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Key count per round follows: 1, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, ...
// Iterate key-count c = 1, 2, 3, ...; repeat value c exactly
// Math.max(1, Math.min(c - 1, 3)) times.
function keyCountForRound(round: number): number {
  let idx = 0; // 1-indexed position we're filling as we walk the sequence
  for (let c = 1; ; c++) {
    const reps = Math.max(1, Math.min(c - 1, 3));
    for (let r = 0; r < reps; r++) {
      idx += 1;
      if (idx === round) return c;
    }
  }
}

function randomKeys(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
  }
  return out;
}

export default function KeyboardZen({ socket, me, game }: GameProps) {
  const g = game as KeyboardZenState;
  const players = g.players ?? {};

  const [round, setRound] = useState(1);
  const [keys, setKeys] = useState<string[]>(() => randomKeys(1));
  const [typed, setTyped] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);
  const runStart = useRef(0);

  // Keep a ref of the live game state so the keydown handler stays stable.
  const stateRef = useRef({ keys, typed, round, status });
  stateRef.current = { keys, typed, round, status };

  function start() {
    const first = randomKeys(keyCountForRound(1));
    setRound(1);
    setKeys(first);
    setTyped(0);
    setWrongIndex(null);
    setStatus("playing");
    runStart.current = Date.now();
    socket.emit("kz:start");
  }

  const handleKey = useCallback(
    (raw: string) => {
      const s = stateRef.current;
      if (s.status !== "playing") return;
      const key = raw.toUpperCase();
      if (key.length !== 1 || key < "A" || key > "Z") return;

      if (key === s.keys[s.typed]) {
        const nextTyped = s.typed + 1;
        playSwap();
        if (nextTyped >= s.keys.length) {
          // Round cleared.
          socket.emit("kz:clear", {
            round: s.round,
            timeMs: Date.now() - runStart.current,
          });
          playCorrect();
          const nextRound = s.round + 1;
          setRound(nextRound);
          setKeys(randomKeys(keyCountForRound(nextRound)));
          setTyped(0);
        } else {
          setTyped(nextTyped);
        }
      } else {
        // Wrong key — end the run.
        setWrongIndex(s.typed);
        setStatus("failed");
        playWrong();
        socket.emit("kz:fail");
      }
    },
    [socket],
  );

  useEffect(() => {
    if (status !== "playing") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      handleKey(e.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, handleKey]);

  const leaderboard = useMemo(() => {
    return Object.values(players).sort((a, b) => {
      if (b.bestRound !== a.bestRound) return b.bestRound - a.bestRound;
      return a.bestTimeMs - b.bestTimeMs;
    });
  }, [players]);

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_260px]">
      <div>
        {status === "idle" ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-6 text-center">
            <div className="text-6xl">⌨️</div>
            <p className="max-w-sm text-violet-100/60">
              Type the keys as they appear. Each cleared round adds more keys.
              One wrong key resets you to round 1. How far can you flow?
            </p>
            <button
              onClick={start}
              className="rounded-2xl bg-cyan-400/90 px-8 py-3 text-lg font-bold text-slate-900 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
            >
              Start
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="text-sm font-semibold uppercase tracking-wide text-violet-100/40">
              Round {round}
            </div>

            <div
              className={`flex flex-wrap justify-center gap-3 ${
                status === "failed" ? "animate-shake" : ""
              }`}
            >
              {keys.map((k, i) => {
                const isTyped = i < typed;
                const isWrong = status === "failed";
                const emphasizeWrong = status === "failed" && i === wrongIndex;
                return (
                  <button
                    key={i}
                    onClick={() => handleKey(k)}
                    disabled={status !== "playing"}
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 text-2xl font-black transition ${
                      isWrong
                        ? `border-red-400/70 bg-red-500/20 text-red-200 ${
                            emphasizeWrong ? "ring-2 ring-red-400" : ""
                          }`
                        : isTyped
                          ? "border-cyan-400/70 bg-cyan-400/20 text-cyan-200"
                          : "border-white/10 bg-white/5 text-violet-50"
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>

            {status === "playing" ? (
              <p className="text-sm text-violet-100/50">
                Tap the tiles or use your keyboard — in order.
              </p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm font-semibold text-red-300/80">
                  Wrong key! Run reset.
                </p>
                <button
                  onClick={start}
                  className="rounded-2xl bg-cyan-400/90 px-6 py-2.5 text-base font-bold text-slate-900 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <aside>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-violet-100/40">
          Furthest
        </h3>
        <ul className="flex flex-col gap-2">
          {leaderboard.map((p, idx) => (
            <li
              key={p.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            >
              <span className="truncate">
                {MEDALS[idx] ?? "•"} {p.name}
                {p.name === me?.name && (
                  <span className="ml-1 text-xs text-sky-300/70">(you)</span>
                )}
                {p.active && p.curRound > 0 && (
                  <span className="ml-1 text-xs text-cyan-300/60">
                    on {p.curRound}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-violet-100/50">
                r{p.bestRound}
                {p.bestRound > 0 && (
                  <span className="ml-1 text-xs text-violet-100/30">
                    {(p.bestTimeMs / 1000).toFixed(3)}
                  </span>
                )}
              </span>
            </li>
          ))}
          {leaderboard.length === 0 && (
            <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-violet-100/40">
              No runs yet.
            </li>
          )}
        </ul>
        <p className="mt-2 text-xs text-violet-100/30">round reached · run time (s)</p>
      </aside>
    </div>
  );
}
