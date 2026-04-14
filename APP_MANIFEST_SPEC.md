# Haven App Manifest Spec (MVP Draft)

## Purpose

Define a versioned app manifest format for the pilot app so schema, indexes, and migration intent are explicit and reviewable.

## Design principles

- Document-first and evolution-friendly.
- Backward-compatible additions should be cheap.
- Potentially destructive changes must be explicit and gated.
- Provider-side indexes are treated as optimization metadata.

## Manifest envelope

```json
{
  "manifestVersion": "1.0",
  "appId": "haven-pilot-app",
  "schemaVersion": 1,
  "collections": [],
  "indexes": [],
  "migrations": [],
  "permissions": {}
}
```

## Collections

Each collection entry:

- `name`: stable collection identifier.
- `primaryKey`: primary id field (default `id`).
- `fields`: dictionary of field definitions.
- `required`: optional list of required fields.
- `softDeleteField`: optional tombstone field (e.g., `deleted`).

### Field definition

- `type`: `string | number | boolean | object | array | datetime | reference`
- `nullable`: boolean
- `default`: optional default value
- `reference`: optional target collection when `type=reference`
- `validation`: optional runtime hint metadata (`maxLength`, regex, enum)

## Index requests

Each index entry:

- `name`: stable index name.
- `collection`: target collection.
- `fields`: ordered list of fields.
- `kind`: `exact | range | text`.
- `unique`: boolean (default `false`).

## Permissions metadata (MVP-light)

For MVP, permissions metadata is descriptive (not full policy engine):

- `scope`: app namespace scope identifier.
- `roles`: optional role hints for future enforcement.

## Migration hints

Each migration entry:

- `fromVersion`: integer
- `toVersion`: integer
- `type`: `additive | rename | split | merge | destructive`
- `steps`: array of machine-readable or human-readable actions
- `requiresConfirmation`: boolean

## Safe vs destructive change policy

### Safe changes (auto-allowed)

- Add nullable field.
- Add collection.
- Add non-unique index.
- Add optional validation hints.

### Review-required changes

- Field rename.
- Type narrowing (e.g., `string` -> constrained enum).
- Unique index introduction over existing data.

### Destructive changes (explicit confirmation)

- Field removal.
- Collection removal.
- Type change that can invalidate existing stored values.

## Example pilot manifest (v1)

```json
{
  "manifestVersion": "1.0",
  "appId": "haven-pilot-app",
  "schemaVersion": 1,
  "collections": [
    {
      "name": "note",
      "primaryKey": "id",
      "fields": {
        "id": {"type": "string", "nullable": false},
        "title": {"type": "string", "nullable": false},
        "body": {"type": "string", "nullable": false},
        "updatedAt": {"type": "datetime", "nullable": false},
        "deleted": {"type": "boolean", "nullable": false, "default": false}
      },
      "required": ["id", "title", "body", "updatedAt"],
      "softDeleteField": "deleted"
    },
    {
      "name": "tag",
      "primaryKey": "id",
      "fields": {
        "id": {"type": "string", "nullable": false},
        "name": {"type": "string", "nullable": false},
        "updatedAt": {"type": "datetime", "nullable": false}
      },
      "required": ["id", "name", "updatedAt"]
    },
    {
      "name": "noteTag",
      "primaryKey": "id",
      "fields": {
        "id": {"type": "string", "nullable": false},
        "noteId": {"type": "reference", "reference": "note", "nullable": false},
        "tagId": {"type": "reference", "reference": "tag", "nullable": false},
        "updatedAt": {"type": "datetime", "nullable": false}
      },
      "required": ["id", "noteId", "tagId", "updatedAt"]
    }
  ],
  "indexes": [
    {"name": "note_updatedAt", "collection": "note", "fields": ["updatedAt"], "kind": "range"},
    {"name": "tag_name", "collection": "tag", "fields": ["name"], "kind": "exact"},
    {"name": "noteTag_noteId", "collection": "noteTag", "fields": ["noteId"], "kind": "exact"},
    {"name": "noteTag_tagId", "collection": "noteTag", "fields": ["tagId"], "kind": "exact"}
  ],
  "migrations": [],
  "permissions": {
    "scope": "app/haven-pilot-app"
  }
}
```

## Upgrade path guidance

1. Start with optional runtime validation in development mode.
2. Emit warning telemetry for validation mismatches in production.
3. Move to stricter defaults after mismatch rates are acceptably low.
