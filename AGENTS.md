# Bridge Extension development

This project is independent from Taptop Bridge. Do not read or import code through a sibling checkout. The wire contract is the versioned snapshot under `contracts/`; update it and its synthetic fixtures explicitly when compatibility changes.

The extension runs only in the Taptop editor: the path `/-/cms/v1/mosaic/*` on a Taptop subdomain or on a site's connected domain (`https://*/-/cms/v1/mosaic/*`). Never widen this to other paths or to all pages of a site. Preserve user data, receipts and existing class ownership across updates. Never claim a live import from unit tests or package inspection alone. Runtime discoveries require a minimal synthetic regression, an importer fix and a dated fact in the project's compatibility/release docs.

Read `README.md`, `docs/compatibility.md` and the relevant extension UI design before UI or runtime changes. Run `npm test` and verify the exact ZIP before a release. The source is public under the MIT License; Chrome Web Store submission is a separate, later step.
