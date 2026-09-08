# Question library (app-data)

Operational store for reusable named questions and question sets. The open
Project Question Set snapshot remains the authoritative record of what a Run
actually asked. This file is a reuse cache in Electron `userData`.

Location: `<userData>/question-library.json`. Tests inject a temporary
directory.

## Schema

```json
{
  "schemaVersion": "0.0",
  "entries": [
    {
      "id": "qset-…",
      "name": "試辦評估",
      "questions": ["你會支持這項計畫嗎？"],
      "savedAt": "2026-09-08T00:00:00Z",
      "updatedAt": "2026-09-08T00:00:00Z"
    }
  ]
}
```

Rules:

- A single question is a one-item set. Names and questions are trimmed;
  blank names or blank-only question lists are refused.
- Caps match Workbook Question Sets: at most 50 items, 4,000 code points
  per question.
- Loading into a draft is a copy (`append` or `replace`). Editing or
  deleting a library entry never rewrites existing Runs.
- Writes are atomic (temp file + rename). A missing file is empty; a
  corrupt or unknown-schema file is refused, never rewritten.
- The library holds no credentials and never calls a model.
