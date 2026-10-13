# Saved-search persistence (stage 1)

Run the backend with Node.js 22.13 or newer. SQLite uses Node's built-in `node:sqlite` module.

## Storage

- `data/photos.json`: the existing editable photo library.
- `uploads/`: the existing library images.
- `data/workspace.sqlite`: completed searches, prompts, timestamps, and result snapshots.
- `data/search-snapshots/<search-id>/`: independent copies of every image referenced by a saved result, including candidates.

These paths are private local data and are ignored by Git. They are not included in a code commit.

The database has a versioned schema (`PRAGMA user_version`). Migration 1 creates saved-search storage; later stages will add moodboards and background jobs with further migrations. Opening a newer unsupported schema fails explicitly.

Each successful AI search is saved before its response is returned. Image files are copied into a temporary directory and published before the atomic database insert. A failed copy creates no history entry. Interrupted unpublished directories are cleaned at startup. Run one backend instance against a given data directory.

The snapshots preserve the original keywords, titles, scores, selection reasons, debug information, and image bytes. Editing or deleting library references does not alter them. Repeated searches create separate records. Completed searches with zero results are also saved. Failed AI requests are not saved as successful searches.

## API

- `POST /search`: returns the original result structure plus `id`, `prompt`, and `createdAt`; reference URLs point to preserved image copies.
- `GET /searches?limit=30&offset=0`: returns `{ searches, total }`, ordered newest-first. Limit is 1–100 and offset is nonnegative.
- `GET /searches/:id`: restores the complete saved result without calling the AI; returns 404 for a missing ID.
- `GET /search-snapshots/:id/:filename`: serves a preserved reference image.

The frontend opens saved results at `/search?search=<id>`. New searches update the URL automatically; the results header has a **Copy search link** action. Refreshing or opening this link restores the saved snapshot. The dedicated History page is stage 2.

## Backup and rollback

Before copying a complete workspace backup, stop the backend so database and image files cannot change during the copy. Copy **all of `data/`**, **all of `uploads/`**, and the private `.env` configuration together. SQLite uses WAL journaling; never copy only `workspace.sqlite` while the backend is running. The pre-persistence checkpoint also includes the committed code archive and existing untracked files.

To restore: stop the backend, back up the current workspace, restore the chosen checkpoint's code, data, uploads, and configuration, then restart and check the library and saved-search links.

Run `npm test` for isolated persistence tests; these use temporary directories and do not modify the real library.
