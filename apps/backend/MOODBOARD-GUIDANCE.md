# Reference-led moodboard guidance

Product-specific adaptation of the reviewed `style-inspiration` document. The runtime instructions live in `src/moodboard-guidance.ts`; structured output and deterministic checks live in `src/moodboard-design.ts`.

## Shared exploration

- Infer one creative axis from the original brief and saved images. Explain it without requiring approval. Its poles describe a visual tension, not a prescribed left-to-right ordering of risk levels.
- Keep the brief and core requirements constant. Both type specimens use the same fixed `AaBbCc` text across directions.
- Produce Grounded, Exploratory, and Bold, with genuinely different identities. Keep each AI-generated name, three descriptors, summary, position on the axis, and rationale.
- Grounded stays close to the references. Exploratory makes deliberate shifts. Bold allows unexpected combinations while preserving readability and core requirements.
- Respect explicit brand constraints. Do not infer exact brand assets from a brand name. Exact brief-supplied hex colours may override image sampling, with a verbatim quote as provenance. Explain Google Fonts proxies for unavailable brand fonts. Do not silently ignore incompatible requirements.

## Reference evidence

- Review all selected search references; use only preserved images. No web research, invented assets, logo recreation, or product samples.
- Strong matches lead wherever relevant. Borrow only useful qualities from partial matches, explaining both their contribution and limitations.
- Different subsets and overlap are allowed. Explain every exclusion; never force irrelevant images to satisfy a quota. A reference is used somewhere or excluded, never both.
- Each direction requires at least three distinct, meaningfully relevant references. Overlap between directions is allowed; never pad a board with irrelevant images to meet the minimum. A partial-only used set must be labelled approximate, and other limitations must be described honestly.
- If three meaningful directions cannot be supported, report the specific gap and what references are needed. The worker saves this as an actionable generation failure; it does not publish empty or fabricated boards.
- Equal reference weight is the default. At most one genuinely important reference per direction may receive subtle emphasis, justified in its reference explanation. Never require a hero image.

## Style decisions

- Choose supported Google Fonts and weights for character and use; justify each pairing. Familiar fonts are allowed when appropriate.
- Use five roles: background, surface, text, primary, accent. Provide descriptive names, hex codes, sources, refinements and usage guidance. Explain primary versus accent emphasis.
- Grounded uses at least three colours close to sampled image colours or explicitly supplied brand hex constraints. Exploratory and Bold have progressively more freedom, tied to evidence.
- Text must meet 4.5:1 contrast against background and surface in every direction.
- Explain imagery/cropping, texture/motifs, and composition/spacing in practical, reference-specific language.
- Include a short “Choose this if…” comparison cue, provisionally, pending visual review.

## Visual composition and presentation

- Three stacked boards, with a compact overview above. The creative axis informs generation internally but is not displayed on the page, including direction positions along it.
- Use a transparent composition inside the same frosted card surface, border and rounded corners as the app's reference cards. Never use a direction's palette to fill the canvas.
- Use a controlled family of varied compositions, adapting to each direction's reference proportions and count. Avoid a mandatory hero or a fixed arrangement across the set. Show every selected reference, including additional rows when needed; never silently trim the selection to three.
- Preserve original image proportions and show images in full, without cropping or stretching. Keep images prominent with moderate separation: neither a sparse grid nor a tightly packed collage. Allow only small, justified differences in emphasis.
- Distribute five circular swatches around the references. Anchor them to actual visible photo boundaries, including when `object-fit: contain` leaves empty space. Controlled overlaps are welcome; avoid typography and important reference content where possible. No floating standalone swatches, hex codes or palette labels inside the visual board.
- Place separate display and body specimens in gaps close to their neighbouring references, following the composition rather than the outer top/bottom edges. Only `AaBbCc` uses the suggested typeface and weight. `Display font`, `Body font` and `Weight N` labels always use Inter.
- Outside: unique names, descriptors, descriptions, font family names/weights, colour names/roles/hex values, rationale and usage guidance, reference choices and limitations. Keep these in a left-hand information column with the visual board to its right; stack information above the board on narrow screens. Secondary explanations can be expanded.
- Respect the app's page container: 24px horizontal padding below the desktop breakpoint, 64px on desktop, and the shared 1920px maximum width. Align the information to the page title's left edge and extend the board to the right content margin without another inset or width cap.
- Use consistent product typography for explanatory content. Recommended fonts are applied only to `AaBbCc`.
- Use the app's controlled renderer. AI returns plain editorial text and structured data, never HTML/CSS/SVG or executable content.

## Persistence and verification

New generations use output version 2. Regeneration creates a separate set, retaining earlier sets. Existing saved sets are read without rewriting their JSON. Legacy headline/paragraph specimens remain stored but are replaced visually by `AaBbCc`; that legacy output field is optional for new generations. Layout selection is deterministic and requires no AI call when opening a saved set.

Validate references/exclusions, required comparison fields, font catalogue/weights, palette sources (including exact brief quotes), contrast, colour fidelity, and partial-only coverage. Coherence and art-direction quality also require visual review of real generations.
