---
title: Changelog
layout: default
nav_order: 4
permalink: /changelog
---

# Changelog

All notable changes to the AHP specification are documented here.

Format: `[version] YYYY-MM-DD — description`

---

## [0.1] 2026-02-21 — Initial draft

- Initial specification covering MODE1, MODE2, and MODE3
- Discovery mechanisms: well-known URI, Accept header, HTML link tag, in-page agent notice
- AHP Manifest schema
- Conversational endpoint request/response format
- Multi-turn session protocol with `session_id`
- Content signals: `ai_train`, `ai_input`, `search`, `attribution_required`
- Trust & identity model (v0: unverified, declaration-based)
- Async model for MODE3 long-running capabilities
- Rate limiting: headers, recommended limits, cost-based throttling
- Error handling with standard codes
- Versioning and backwards compatibility policy
- Security considerations: prompt injection, SSRF, data exfiltration
- Appendix B: relationship to and migration path from `llms.txt`
