# `chialisp/` — On-chain logic *(planned, not started)*

Chia puzzles and minting authority for the Living Tree collection.

- **DID** as the collection's minting authority (a **new dedicated DID**, publicly linked to The Orchard — not the Pass DID).
- **NFT minting** with [CHIP-0007](https://github.com/Chia-Network/chips/blob/main/CHIPs/chip-0007.md) metadata.
- **Routine evolution** via the standard NFT1 **metadata updater** (append a URI on the *same* launcher → the Tree stays the same NFT).
- **CHIP-0021 fusion** reserved for genuinely *combining* assets later (two Trees → a grove; an event NFT → a Tree). ⚠️ Note: CHIP-0021 is **NFT fusion**, not in-place metadata editing — see the main [README](../README.md#a-note-on-chip-0021).
- **JUICE CAT** payout integration; **DataLayer** attestations in Phase 7.

The project lead is learning Chialisp — code here should favor heavily-commented, complete, working examples.
