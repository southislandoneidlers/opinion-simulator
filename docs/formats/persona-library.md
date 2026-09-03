# Persona library (app-data)

Operational store for reusable confirmed Persona Versions. The open Project
format remains the authoritative interchange and archive; this file is the
fast reuse cache living in Electron `userData`.

Location: `<userData>/persona-library.json` (macOS:
`~/Library/Application Support/<app>/persona-library.json`). Tests inject a
temporary directory.

## Schema

```json
{
  "schemaVersion": "0.0",
  "settings": { "autoSave": true },
  "personas": [
    {
      "personaVersion": { "...full confirmed PersonaVersion including contentHash..." },
      "savedAt": "2026-08-24T00:00:00Z",
      "origin": { "projectId": "project-…", "projectDirectory": "/path/or/null" }
    }
  ]
}
```

Rules:

- Only confirmed Persona Versions are stored.
- Deduplication is by `personaVersion.contentHash`; a second save of the same
  hash is a no-op.
- Writes are atomic (temp file + rename). A missing file is treated as empty;
  a corrupt or unknown-schema file is refused, never rewritten.
- Confirming a Persona Version in a draft auto-saves when `settings.autoSave`
  is true (default). Users can import from any valid Project directory.
- Entries are never deleted implicitly; only the explicit remove channel
  drops them.
