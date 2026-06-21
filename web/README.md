# `web/` — Portal & dashboards

## `dashboard/` — operator dashboard *(BUILT & runnable)*

A self-contained dashboard the Oracle serves at `/`. Run `npm run oracle` and open **http://localhost:8791**.

- **Plant a Tree** — your browser generates a P-256 device with [`lib/identity.mjs`](../lib/identity.mjs) and signs a real registration + heartbeats (the Oracle verifies every one). No CLI needed.
- **Advance a Season / Fast-forward a Year** — streams signed heartbeats so you watch the Tree grow (canvas render), gain fruit, climb reputation, and accrue **JUICE**.
- **My Orchard** cards use the canonical [`lib/card.js`](../lib/card.js) display fields; the canvas renders from the same recipe shape as [`lib/growth.js`](../lib/growth.js).
- **Network overview** + an **activity log** showing each signature verified.

It imports the exact same `/lib/*` modules the Oracle uses — one source of truth, browser and server.

## Production portal *(planned)*

- **Stack:** Next.js + TypeScript + Tailwind.
- **Key pieces:** wallet connect (**Sage + Chia WalletConnect**) · Pass-gated **in-browser flasher** ([ESP Web Tools](https://github.com/espressif/esptool-js), Chromium-only) · Tree detail pages · admin console · live network globe ([deck.gl](https://deck.gl) + [MapLibre](https://maplibre.org)).

The standalone artwork engine lives in [`prototypes/living-tree-renderer/`](../prototypes/living-tree-renderer/).
