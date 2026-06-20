# `web/` — Portal & dashboards *(planned, not started)*

The experience layer: onboarding, *My Orchard*, and the network globe.

- **Stack (planned):** Next.js + TypeScript + Tailwind.
- **Key pieces:** wallet connect (**Sage + Chia WalletConnect**) · Pass-gated **in-browser flasher** ([ESP Web Tools](https://github.com/espressif/esptool-js), Chromium-only) · *My Orchard* dashboard & Tree detail pages · admin console · live network globe ([deck.gl](https://deck.gl) + [MapLibre](https://maplibre.org)).

The **artwork engine** is already prototyped and runnable in [`prototypes/living-tree-renderer/`](../prototypes/living-tree-renderer/) — the production app embeds the same Heartwood recipe model.
