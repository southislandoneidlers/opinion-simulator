import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PersonaVersion } from "@opinion-simulator/core";

/**
 * v0.2 increment 4: reusable Persona library.
 *
 * Storage decision (user-approved 2026-08-24, hybrid): the app-data library
 * file is the operational store; an explicit import command copies confirmed
 * Persona Versions out of any valid open Project. The open Project format
 * stays the authoritative interchange/archive format. Confirming a Persona
 * Version auto-saves it here (toggleable); entries are deduplicated by the
 * Persona Version contentHash and never removed implicitly — only via the
 * explicit remove channel.
 *
 * This module holds no secrets; it runs in the main process only and reaches
 * the renderer exclusively through the IPC allow-list.
 */

export const LIBRARY_SCHEMA_VERSION = "0.0";
export const LIBRARY_FILENAME = "persona-library.json";

export type LibraryOrigin = {
  projectId: string;
  projectDirectory: string | null;
};

export type LibraryEntry = {
  personaVersion: PersonaVersion;
  savedAt: string;
  origin: LibraryOrigin | null;
};

export type PersonaLibrary = {
  schemaVersion: string;
  settings: { autoSave: boolean };
  personas: LibraryEntry[];
};

let libraryDirectory: string | null = null;

/** Configure where the library lives (Electron userData at startup). */
export function configureLibraryDirectory(directory: string): void {
  libraryDirectory = directory;
}

function defaultLibraryDirectory(): string {
  // Fallback for non-Electron contexts; production always configures this.
  return join(homedir(), ".config", "opinion-simulator");
}

function libraryPath(): string {
  return join(libraryDirectory ?? defaultLibraryDirectory(), LIBRARY_FILENAME);
}

function emptyLibrary(): PersonaLibrary {
  return { schemaVersion: LIBRARY_SCHEMA_VERSION, settings: { autoSave: true }, personas: [] };
}

/**
 * Load the library. A missing file is an empty library; a corrupt file is
 * refused loudly instead of being silently replaced, so user data is never
 * destroyed by a rewrite.
 */
export function loadPersonaLibrary(): PersonaLibrary {
  const path = libraryPath();
  if (!existsSync(path)) {
    return emptyLibrary();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Persona library 檔案無法解析（${path}）：${(error as Error).message}`);
  }
  const lib = parsed as Partial<PersonaLibrary>;
  if (
    !lib ||
    typeof lib !== "object" ||
    lib.schemaVersion !== LIBRARY_SCHEMA_VERSION ||
    !Array.isArray(lib.personas) ||
    !lib.settings ||
    typeof lib.settings.autoSave !== "boolean"
  ) {
    throw new Error(`Persona library 檔案格式不符（${path}）；請手動檢查或備份後處理`);
  }
  for (const entry of lib.personas as LibraryEntry[]) {
    if (!entry?.personaVersion?.id || !entry?.personaVersion?.contentHash) {
      throw new Error(`Persona library 含不完整條目（${path}）`);
    }
  }
  return parsed as PersonaLibrary;
}

/** Atomic write: temp file + rename in the same directory. */
function persistLibrary(library: PersonaLibrary): void {
  const path = libraryPath();
  mkdirSync(libraryDirectory ?? defaultLibraryDirectory(), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, JSON.stringify(library, null, 2), "utf8");
  renameSync(temp, path);
}

export function setAutoSave(enabled: boolean): PersonaLibrary {
  const library = loadPersonaLibrary();
  library.settings.autoSave = enabled;
  persistLibrary(library);
  return library;
}

/**
 * Auto-save hook used after confirming a Persona Version. No-op when
 * auto-save is off or an entry with the same contentHash already exists.
 */
export function autoSavePersona(
  personaVersion: PersonaVersion,
  origin: LibraryOrigin
): { saved: boolean; librarySize: number } {
  if (personaVersion.status !== "confirmed") {
    throw new Error("只有已確認的 Persona Version 可以進入 Persona library");
  }
  const library = loadPersonaLibrary();
  if (!library.settings.autoSave) {
    return { saved: false, librarySize: library.personas.length };
  }
  return addPersona(personaVersion, origin);
}

export function addPersona(
  personaVersion: PersonaVersion,
  origin: LibraryOrigin | null
): { saved: boolean; librarySize: number } {
  const library = loadPersonaLibrary();
  if (library.personas.some((entry) => entry.personaVersion.contentHash === personaVersion.contentHash)) {
    return { saved: false, librarySize: library.personas.length };
  }
  library.personas.push({
    personaVersion,
    savedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    origin
  });
  persistLibrary(library);
  return { saved: true, librarySize: library.personas.length };
}

export function removePersona(personaVersionId: string): { removed: boolean; librarySize: number } {
  const library = loadPersonaLibrary();
  const next = library.personas.filter((entry) => entry.personaVersion.id !== personaVersionId);
  if (next.length === library.personas.length) {
    return { removed: false, librarySize: library.personas.length };
  }
  library.personas = next;
  persistLibrary(library);
  return { removed: true, librarySize: next.length };
}

/** Summary shape for the renderer; carries full versions so picking needs no second call. */
export function listPersonas(): PersonaLibrary {
  return loadPersonaLibrary();
}
