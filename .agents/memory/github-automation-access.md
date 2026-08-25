---
name: GitHub automation access
description: A GitHub connection may not be able to publish repository automation from this workspace.
---

Do not treat a configured GitHub connection or a readable repository as proof that an Actions workflow can be published. Verify the write and the resulting workflow run before relying on it for an operational job.

**Why:** GitHub repository reads succeeded, while writes through the connector and the repository’s configured Git remote were rejected by an environment-level authentication/Cloudflare response.

**How to apply:** For any GitHub-backed monitor or automation, publish a tiny workflow and confirm its Actions run before declaring it active. If writes fail, use a separately configured external monitor or an always-running deployment rather than an unverified local workflow file.