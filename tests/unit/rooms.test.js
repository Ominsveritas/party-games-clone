// Unit tests for server/rooms.js — the in-memory room store.
import { describe, it, expect, beforeEach } from "vitest";

// rooms.js uses a module-level Map, so we re-require it fresh for each suite
// by clearing the module cache between describe blocks via beforeEach resets on
// the shared Map. Because Vitest isolates modules per file by default we can
// just import once and reset between tests by removing rooms manually.
import { getOrCreateRoom, getRoom, removeRoom, publicState } from "../../server/rooms.js";

describe("rooms — getOrCreateRoom", () => {
  beforeEach(() => {
    // Clean up any rooms created during a previous test.
    removeRoom("TEST");
    removeRoom("AAA");
  });

  it("creates a new room when the code is unknown", () => {
    const room = getOrCreateRoom("TEST", "wheel");
    expect(room).toBeDefined();
    expect(room.code).toBe("TEST");
    expect(room.gameId).toBe("wheel");
    expect(room.members).toBeInstanceOf(Map);
    expect(room.game).toEqual({});
    expect(room.private).toEqual({});
  });

  it("returns the same room object on a second call with the same code", () => {
    const first = getOrCreateRoom("AAA", "wheel");
    const second = getOrCreateRoom("AAA", "wheel");
    expect(second).toBe(first); // strict reference equality
  });
});

describe("rooms — getRoom", () => {
  beforeEach(() => {
    removeRoom("EXISTS");
  });

  it("returns undefined for a code that has never been created", () => {
    expect(getRoom("NOPE")).toBeUndefined();
  });

  it("returns the room after it has been created", () => {
    const created = getOrCreateRoom("EXISTS", "disordered");
    expect(getRoom("EXISTS")).toBe(created);
  });
});

describe("rooms — removeRoom", () => {
  it("deletes the room so subsequent getRoom calls return undefined", () => {
    getOrCreateRoom("DEL", "wheel");
    expect(getRoom("DEL")).toBeDefined();
    removeRoom("DEL");
    expect(getRoom("DEL")).toBeUndefined();
  });

  it("does not throw when removing a code that does not exist", () => {
    expect(() => removeRoom("GHOST")).not.toThrow();
  });
});

describe("rooms — publicState", () => {
  it("exposes code, gameId, members list, and game without the private field", () => {
    const room = getOrCreateRoom("PUB", "punchline");
    // Simulate two members.
    room.members.set("sock1", { id: "u1", name: "Alice" });
    room.members.set("sock2", { id: "u2", name: "Bob" });
    room.game.phase = "lobby";
    room.private.secret = "hidden";

    const state = publicState(room);

    expect(state.code).toBe("PUB");
    expect(state.gameId).toBe("punchline");
    expect(state.game.phase).toBe("lobby");
    // private must not bleed through
    expect(state).not.toHaveProperty("private");
    // members are plain objects, not the Map
    expect(state.members).toEqual([
      { id: "u1", name: "Alice" },
      { id: "u2", name: "Bob" },
    ]);

    removeRoom("PUB");
  });
});
