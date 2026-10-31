import type { AuctionEngine } from "./engine";

let engine: AuctionEngine | null = null;

export function setEngine(e: AuctionEngine) {
  engine = e;
}

export function getEngine(): AuctionEngine {
  if (!engine) throw new Error("Engine not initialised");
  return engine;
}
