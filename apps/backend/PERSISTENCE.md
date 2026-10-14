# Workspace persistence, generation, and moodboards (stages 1–4)

Run the backend with Node.js 22.13 or newer. SQLite uses Node's built-in `node:sqlite` module.

## Storage

- `data/photos.json`: the existing editable photo library.
- `uploads/`: the existing library images.
- `data/workspace.sqlite`: completed searches, prompts, timestamps, and result snapshots.
- `data/search-snapshots/<search-id>/`: independent copies of every image referenced by a saved result, including candidates.

These paths are private local data and are ignored by Git. They are not included in a code commit.

The database has a versioned schema (`PRAGMA user_version`). Migration 1 creates saved-search storage. Migration 2 adds moodboard sets and their durable queued/running/ready/failed state, linked to searches with cascading deletion. Opening a newer unsupported schema fails explicitly. Existing searches and image snapshots are preserved by migration.

Each successful AI search is saved before its response is returned. Image files are copied into a temporary directory and published before the atomic database insert. A failed copy creates no history entry. Interrupted unpublished directories are cleaned at startup. Run one backend instance against a given data directory.

New searches require at least six uploaded library references. `GET /library/status` reports the count, minimum, and readiness. The search page displays an onboarding banner and disables search below the minimum; `POST /search` also enforces it and returns 400 before making any AI request. Saved search and moodboard snapshots remain accessible independently of current library readiness.

Eligible new searches select six distinct references. If the two keyword searches retrieve fewer than six candidates, remaining library images are added for AI visual review. Every narrowing batch retains up to six nominees, and the final selection tool enforces exactly six selections. Each selection has a validated `matchType` of `strong` or `partial`, with an explanation. Partial includes references missing key requirements or weak matches used to complete the selection; the AI must not inflate their strength to satisfy the quota. Match classifications are saved in the search snapshot, with partial matches displayed in a separate labelled section. Older snapshots without classifications retain their original selected-reference presentation. Agent diagnostics report additional library candidates included to meet the minimum.

The snapshots preserve the original keywords, titles, scores, selection reasons, debug information, and image bytes. Editing or deleting library references does not alter them. Repeated searches create separate records. Completed searches with zero results are also saved. Failed AI requests are not saved as successful searches.

## API

- `POST /search`: returns the original result structure plus `id`, `prompt`, and `createdAt`; reference URLs point to preserved image copies.
- `GET /searches?limit=30&offset=0`: returns `{ searches, total }`, ordered newest-first. Limit is 1–100 and offset is nonnegative.
- `GET /searches/:id`: restores the complete saved result without calling the AI; returns 404 for a missing ID.
- `DELETE /searches/:id`: permanently deletes a saved search and its image snapshots; returns 404 for a missing ID. Library originals and other searches are preserved.
- `DELETE /searches` with `{ ids: [...] }`: deletes the selected searches atomically, returning `{ deletedIds }`. Missing or repeated IDs are ignored; accepts 1–1000 UUIDs.
- `GET /search-snapshots/:id/:filename`: serves a preserved reference image.
- `GET /library/status`: returns `{ photoCount, minimumReferences, canSearch }` for the new-search readiness check.
- `POST /searches/:id/moodboards`: enqueues a set of three directions and returns 202 immediately. Repeated requests while a set is queued/running return that same active set. After completion or failure, requesting again creates a new set and preserves previous ones.
- `GET /searches/:id/moodboards`: lists saved set summaries, newest-first.
- `GET /moodboards/:id`: retrieves set status and, when ready, the saved design and extracted image colours, plus the original search prompt, preserved returned references, and active set ID. This endpoint never invokes AI.
- `DELETE /moodboards/:id`: deletes one set, cancelling it if active, without removing the search or other sets.

The frontend opens saved results at `/search?search=<id>`. New searches update the URL automatically; the results header has a **Copy search link** action. Refreshing or opening this link restores the saved snapshot. The dedicated `/history` page lists searches newest-first with image previews, dates, and pagination. It is accessed via **Your history** before starting a search. Clicking a card opens its results; closing returns to History. Use **Select**, choose cards, and **Delete selected** to remove searches after confirmation. Selection persists across pages and **Cancel selection** clears it. Deletion makes the saved URLs unavailable.

## Background moodboard generation

In search results, **Generate moodboards** starts a durable job. **Regenerate moodboards** creates a new independent set. The results page shows progress and saved direction-plan previews; History displays Generating, Ready, or Failed. Polling uses saved status endpoints and never triggers another AI request.

## Moodboard-set pages

**Open moodboard set** in search results opens `/moodboards/<set-id>`. Each set has its own stable URL, a compact overview and jump links, and three vertically arranged directions with preserved reference collages, typography previews, five-role colour palettes, and source/refinement rationale. Fonts are loaded from Google Fonts at the validated selected weights; previews use the direction title and summary. Generated text is rendered by React, with no AI HTML or executable code.

Page actions include **Copy share link**, **Regenerate**, and **Delete set** with confirmation. Regeneration opens a new set's progress page and preserves the previous URL. Deleted sets show an unavailable page; other sets and original references remain available. Product/design samples are no longer generated or displayed. Existing saved sets with legacy sample fields remain readable without changing their stored data.

The pages can be opened without signing in. During local development, copied links use localhost; internet-accessible sharing requires the later deployment step. The backend base URL remains configured in `apps/frontend/src/lib/api.ts` for the local setup.

The worker processes one set at a time. It reads **all returned references (`photos`)**, not the discarded candidates, from the preserved snapshots; extracts representative colours using Sharp; and sends resized versions of those same images, colours, original prompt, and metadata to the existing configured AI model. One coordinated planning call chooses three risk levels, Google Fonts pairings from a verified catalogue, source-linked palettes, and rationale. One validation-feedback retry is allowed if the generated design is invalid.

Validation requires exactly Grounded/Exploratory/Bold in order, valid unique reference IDs per direction, coverage of every returned image across the set, distinct names/font pairings/palettes, supported Google Fonts weights, six-digit hex colours, valid colour-source IDs, readable palette text contrast, and a Grounded palette closely following at least three extracted source colours. Design data contains plain text and structured values; no AI HTML or code is executed.

Jobs and results live in `workspace.sqlite`. On startup, interrupted running jobs are requeued under the same ID; after three interrupted attempts they fail explicitly and can be retried as a new set. Failures preserve searches and earlier sets. Graceful shutdown aborts in-flight generation and leaves it recoverable. Deleting a search cascades to all its sets, cancels active work, and makes saved image URLs unavailable even if filesystem cleanup needs retrying. Run one backend instance per workspace.

## Backup and rollback

Before copying a complete workspace backup, stop the backend so database and image files cannot change during the copy. Copy **all of `data/`**, **all of `uploads/`**, and the private `.env` configuration together. SQLite uses WAL journaling; never copy only `workspace.sqlite` while the backend is running. The pre-persistence checkpoint also includes the committed code archive and existing untracked files.

To restore: stop the backend, back up the current workspace, restore the chosen checkpoint's code, data, uploads, and configuration, then restart and check the library and saved-search links.

Run `npm test` for isolated persistence tests; these use temporary directories and do not modify the real library.

## End-to-end verification (stage 5)

`tests/server-flow.test.ts` starts the real backend as a separate process against a temporary workspace and an isolated Anthropic-compatible test provider. It exercises the actual HTTP routes, AI SDK tool calls, Sharp extraction, SQLite migrations/jobs, and snapshot files without using a real AI key or changing the working library.

The integration check covers completed/failed searches, minimum-library enforcement without AI calls, six-reference selection through multi-batch narrowing and candidate expansion, persisted strong/partial classifications, history and snapshot restoration without AI calls, generation and regeneration, image/metadata preservation after library edits and deletion, duplicate active requests, a hard process crash and recovery under the same set ID, invalid-generation failure and retry, cancellation of a running set, search deletion cascading to ready/failed/running sets, and preservation of unrelated searches and images. It runs as part of `npm test`; to run only this check, use `npx tsx --test tests/server-flow.test.ts`.

History and the saved-set panel retry transient loading failures automatically after five seconds. Successful recovery clears the error; a deleted search's set list stops retrying its 404 response. Browser checks also exercise a real search through History and the full moodboard page, and simulated temporary connection loss in both views at mobile width.
