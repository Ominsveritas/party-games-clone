"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GAMES } from "@/games/catalog";
import { makeRoomCode } from "@/lib/code";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");

  function startGame(gameId: string) {
    const code = makeRoomCode();
    router.push(`/room/${code}?game=${gameId}`);
  }

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length >= 3) router.push(`/room/${code}`);
  }

  return (
    <div className="theme-light min-h-screen">
      <main className="mx-auto max-w-5xl px-6 py-14">
        <header className="mb-12 text-center">
          <div className="light-surface light-text-accent mb-3 inline-flex animate-float items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium shadow-sm">
            🎲 play together, instantly
          </div>
          <h1 className="light-text pb-1 text-5xl font-black leading-tight tracking-tight sm:text-6xl">
            Party Games
          </h1>
          <p className="light-text-muted mx-auto mt-4 max-w-xl text-balance text-lg">
            Quick, real-time multiplayer mini-games. Start a room, share the
            link, play in seconds.
          </p>
        </header>

        <form onSubmit={joinRoom} className="mx-auto mb-12 flex max-w-md gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Got a room code?"
            maxLength={6}
            className="light-input flex-1 rounded-xl border px-4 py-3 text-center font-mono text-lg tracking-widest outline-none"
          />
          <button
            type="submit"
            className="light-btn rounded-xl px-5 py-3 font-semibold"
          >
            Join
          </button>
        </form>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => startGame(game.id)}
              className="light-card group relative overflow-hidden rounded-2xl border p-6 text-left"
            >
              <div
                className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl transition group-enabled:group-hover:opacity-50"
                style={{ background: game.accent }}
              />
              <div className="mb-4 text-4xl">{game.emoji}</div>
              <h2 className="light-text mb-1 text-xl font-bold">
                {game.name}
              </h2>
              <p className="light-text-muted mb-4 text-sm">{game.blurb}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="light-text-subtle">
                  {game.minPlayers}+ players
                </span>
                <span className="light-text-accent font-semibold transition group-hover:translate-x-0.5">
                  Start →
                </span>
              </div>
            </button>
          ))}
        </div>

        <footer className="light-text-subtle mt-16 text-center text-sm">
          An open-source real-time multiplayer games starter
        </footer>
      </main>
    </div>
  );
}
