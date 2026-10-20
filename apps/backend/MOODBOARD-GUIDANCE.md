# Reference-led moodboard guidance

Product-specific adaptation of the reviewed `style-inspiration` document. The runtime instructions live in `src/moodboard-guidance.ts`; structured output and deterministic checks live in `src/moodboard-design.ts`.

## Shared exploration

- Infer one creative axis from the original brief and saved images. Explain it without requiring approval. Its poles describe a visual tension, not a prescribed left-to-right ordering of risk levels.
- Keep the brief, core requirements, visual board structure, and one shared typography specimen headline/paragraph constant.
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

## Presentation

- Three stacked boards, with a compact overview and shared axis above.
- Inside: reference images, an integrated typography specimen box, and a palette box of swatches with subtle hex codes. Same specimen content across all directions.
- Outside: unique names, descriptors, descriptions, axis positions, font names/weights, colour names/roles, all rationale and usage guidance, reference choices and limitations.
- Use consistent product typography for explanatory content. Recommended fonts are applied only to their visual specimens.
- Use the app's controlled renderer. AI returns plain editorial text and structured data, never HTML/CSS/SVG or executable content.

## Persistence and verification

New generations use output version 2. Regeneration creates a separate set, retaining earlier sets. Existing saved sets are read without rewriting their JSON, with optional presentation fields and shared fallback specimen text.

Validate references/exclusions, required comparison fields, font catalogue/weights, palette sources (including exact brief quotes), contrast, colour fidelity, and partial-only coverage. Coherence and art-direction quality also require visual review of real generations.
