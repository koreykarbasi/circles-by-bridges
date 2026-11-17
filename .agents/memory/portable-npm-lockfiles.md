---
name: Portable npm lockfiles
description: Keep dependency upgrades installable on external EAS builders.
---

After dependency installation, ensure npm lockfile tarball URLs remain publicly reachable, retaining package versions and integrity hashes.

**Why:** The workspace package installer can record Replit-internal firewall URLs even when the project's npm registry is public. External EAS builders cannot resolve those private hosts, and npm uses locked tarball URLs rather than replacing them with the configured registry.

**How to apply:** Continue installing through the managed package installer and respecting its security checks. Before delivering dependency upgrades, inspect the resulting lockfile for private download URLs and correct them to equivalent public npm URLs. Verify with an empty-cache clean install. Do not change package versions or hashes to bypass a firewall block.
