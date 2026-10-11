---
description: "Keep simple-chat backward compatible with existing production chats, messages, and clients."
applyTo: "simple-chat/**"
---

# Production Compatibility

- Keep changes backward compatible: existing messages, history, room links (including longer IDs), and browser storage must continue working unchanged.
- Default missing fields; prefer additive, tracked migrations. Version message formats only for incompatible changes, retaining legacy support.
- Modern browser APIs are fine, but older app clients in open tabs must still work with updated server event contracts.
- Test legacy data, links, and room isolation; disclose unverified compatibility.
- Require explicit approval for destructive changes, backups, restores, production migrations, or production data writes.