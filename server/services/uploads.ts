import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import multer from "multer";
import { config } from "../config";
import { badRequest, notFound } from "../util/errors";

/** Images only, detected by magic bytes (never trust the browser's MIME type). SVG is refused (script risk). */
const SIGNATURES: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: "png", type: "image/png", test: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 },
  { ext: "jpg", type: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", type: "image/webp", test: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  { ext: "gif", type: "image/gif", test: (b) => b.length > 6 && b.toString("ascii", 0, 3) === "GIF" },
];
const TYPES: Record<string, string> = Object.fromEntries(SIGNATURES.map((s) => [s.ext, s.type]));
const NAME_RE = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
}).single("file");

export function saveImage(file: Express.Multer.File | undefined): string {
  if (!file) throw badRequest("NO_FILE", "Choose an image to upload.");
  const sig = SIGNATURES.find((s) => s.test(file.buffer));
  if (!sig) throw badRequest("UNSUPPORTED_IMAGE", "Use a PNG, JPG, WEBP or GIF image.");
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = `${crypto.randomUUID()}.${sig.ext}`;
  fs.writeFileSync(path.join(config.uploadDir, name), file.buffer, { flag: "wx" });
  return name;
}

export function copyImage(name: string | null): string | null {
  if (!name || !NAME_RE.test(name)) return null;
  const src = path.join(config.uploadDir, name);
  if (!fs.existsSync(src)) return null;
  const copy = `${crypto.randomUUID()}.${name.split(".").pop()}`;
  fs.copyFileSync(src, path.join(config.uploadDir, copy));
  return copy;
}

export function deleteImage(name: string | null) {
  if (!name || !NAME_RE.test(name)) return;
  fs.rm(path.join(config.uploadDir, name), { force: true }, () => undefined);
}

export function serveUpload(req: Request, res: Response) {
  const name = String(req.params.file ?? "");
  if (!NAME_RE.test(name)) throw notFound("File");
  const file = path.join(config.uploadDir, name);
  if (!fs.existsSync(file)) throw notFound("File");
  res.setHeader("Content-Type", TYPES[name.split(".").pop() as string] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(file).pipe(res);
}
