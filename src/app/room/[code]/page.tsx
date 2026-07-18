"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSocket, type Member, type RoomState } from "@/lib/socket";
import { getGameMeta } from "@/games/catalog";
import { GAME_COMPONENTS } from "@/games/registry";
import { generateAvatar, ANIMAL_EMOJIS } from "@/lib/avatars";

const NAME_KEY = "party-games:name";
const AVATAR_KEY = "party-games:avatar";

const ADJECTIVES = ["Spicy", "Fluffy", "Sneaky", "Glittery", "Wobbly", "Cosmic", "Sassy", "Zippy", "Chunky", "Plucky"];
const ANIMALS = ["Otter", "Ferret", "Narwhal", "Llama", "Axolotl", "Capybara", "Quokka", "Pangolin", "Platypus", "Wombat"];

function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10–99
  return `${adj}${animal}${num}`;
}

export default function RoomPage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase();
  const searchParams = useSearchParams();
  const requestedGame = searchParams.get("game") || undefined;

  const [name, setName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [avatar, setAvatar] = useState<string>("");
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Rename widget state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");

  // Load any remembered name + avatar on first paint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedName = localStorage.getItem(NAME_KEY);
    if (savedName) {
      setName(savedName);
    } else {
      setNameInput(generateName());
    }

    const savedAvatar = localStorage.getItem(AVATAR_KEY);
    if (savedAvatar && ANIMAL_EMOJIS.includes(savedAvatar)) {
      setAvatar(savedAvatar);
    } else {
      const newAvatar = generateAvatar();
      localStorage.setItem(AVATAR_KEY, newAvatar);
      setAvatar(newAvatar);
    }
  }, []);

  // Connect + join once we have a name.
  useEffect(() => {
    if (!name) return;
    const socket = getSocket();

    function join() {
      socket.emit("room:join", { code, name, gameId: requestedGame, avatar });
    }
    function onState(s: RoomState) {
      setError(null);
      setState(s);
    }
    function onError(e: { message: string }) {
      setError(e.message);
    }

    function onPlayerJoined({ name: who }: { name: string }) {
      setToast(`👋 ${who} joined the party!`);
      setTimeout(() => setToast(null), 3000);
    }
    function onWelcome({ name: who }: { name: string }) {
      setToast(`🎉 Welcome, ${who}! You're in.`);
      setTimeout(() => setToast(null), 3000);
    }

    socket.on("connect", join);
    socket.on("room:state", onState);
    socket.on("room:error", onError);
    socket.on("room:player-joined", onPlayerJoined);
    socket.on("room:welcome", onWelcome);
    if (socket.connected) join();

    return () => {
      socket.off("connect", join);
      socket.off("room:state", onState);
      socket.off("room:error", onError);
      socket.off("room:player-joined", onPlayerJoined);
      socket.off("room:welcome", onWelcome);
    };
  }, [name, code, requestedGame, avatar]);

  const me: Member | null = useMemo(() => {
    const socket = getSocket();
    return state?.members.find((m) => m.id === socket.id) || null;
  }, [state]);

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    localStorage.setItem(NAME_KEY, trimmed);
    setName(trimmed);
  }

  function confirmRename() {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    localStorage.setItem(NAME_KEY, trimmed);
    // Emit directly — do NOT call setName() to avoid re-triggering the join effect.
    getSocket().emit("room:rename", { name: trimmed });
    setIsRenaming(false);
  }

  function refreshAvatar() {
    const newAvatar = generateAvatar();
    localStorage.setItem(AVATAR_KEY, newAvatar);
    setAvatar(newAvatar);
    getSocket().emit("room:set-avatar", { avatar: newAvatar });
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.origin + `/room/${code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // --- Name gate ---------------------------------------------------------
  if (!name) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="mb-2 text-center text-3xl font-black">Join room {code}</h1>
        <p className="mb-6 text-center text-violet-100/60">What should we call you?</p>
        <form onSubmit={submitName} className="flex gap-2">
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Your name"
            maxLength={24}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg outline-none focus:border-violet-400/50 focus:bg-white/10"
          />
          <button className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-6 py-3 font-bold">
            Go
          </button>
        </form>
        <Link href="/" className="mt-6 text-center text-sm text-violet-100/40 hover:text-violet-100/70">
          ← back to all games
        </Link>
      </main>
    );
  }

  // --- Room not found ----------------------------------------------------
  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">🤷</div>
        <h1 className="text-2xl font-black">{error}</h1>
        <Link
          href="/"
          className="rounded-xl bg-white/10 px-5 py-3 font-semibold transition hover:bg-white/20"
        >
          Back to games
        </Link>
      </main>
    );
  }

  const gameId = state?.gameId || requestedGame;
  const meta = gameId ? getGameMeta(gameId) : undefined;
  const GameComponent = gameId ? GAME_COMPONENTS[gameId] : undefined;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-violet-100/40 hover:text-violet-100/70">
            ← Party Games
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black">
            <span>{meta?.emoji}</span> {meta?.name || "Game"}
          </h1>
        </div>
        <button
          onClick={copyLink}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left transition hover:bg-white/10"
        >
          <div className="text-xs uppercase tracking-wide text-violet-100/40">
            {copied ? "Copied!" : "Room code · tap to share"}
          </div>
          <div className="font-mono text-xl font-bold tracking-[0.3em]">{code}</div>
        </button>
      </header>

      <div className="grid gap-8 md:grid-cols-[1fr_220px]">
        <section className="order-2 md:order-1">
          {GameComponent && state ? (
            <GameComponent
              socket={getSocket()}
              me={me}
              members={state.members}
              game={state.game}
            />
          ) : (
            <p className="text-center text-violet-100/50">Loading game…</p>
          )}
        </section>

        <aside className="order-1 md:order-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-violet-100/40">
            Players ({state?.members.length || 0})
          </h2>
          <ul className="flex flex-wrap gap-2 md:flex-col">
            {state?.members.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              >
                {m.id === me?.id ? (
                  isRenaming ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRename();
                          if (e.key === "Escape") setIsRenaming(false);
                        }}
                        maxLength={24}
                        className="w-full min-w-0 flex-1 rounded border border-violet-400/40 bg-white/10 px-1.5 py-0.5 text-xs outline-none focus:border-violet-400/70"
                      />
                      <button
                        onClick={confirmRename}
                        className="shrink-0 rounded bg-violet-500/70 px-1.5 py-0.5 text-xs font-bold leading-none hover:bg-violet-500"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>{m.avatar ?? "🎮"}</span>
                      <span className="flex-1">{m.name}</span>
                      <span className="text-xs text-violet-300/70">(you)</span>
                      <button
                        onClick={() => {
                          setRenameInput(m.name);
                          setIsRenaming(true);
                        }}
                        title="Rename"
                        className="ml-0.5 shrink-0 leading-none opacity-50 hover:opacity-100"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={refreshAvatar}
                        title="New avatar"
                        className="shrink-0 leading-none opacity-50 hover:opacity-100"
                      >
                        🔄
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-1">
                    <span>{m.avatar ?? "🎮"}</span>
                    <span>{m.name}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
