---
title: Contributing
layout: default
nav_order: 3
permalink: /contributing
---

# Contributing to AHP

Thanks for wanting to improve the protocol. AHP is an open specification — its quality depends on people who find the holes and push back on bad decisions.

---

## The Process

### For protocol changes (the spec itself)

1. **Open an issue first.** Describe the problem you've found or the change you want to make. Don't start with a PR — start with a conversation. Protocol decisions have second-order effects that need discussion before implementation.

2. **Reference the spec section.** Point to the exact section and clause you're addressing. This keeps discussions focused.

3. **Propose, don't just critique.** "This is broken" is less useful than "this is broken, and here's one way to fix it." You don't need a perfect solution — but a direction helps.

4. **Wait for consensus.** For substantive changes, give it a few days for others to weigh in. For obvious fixes (typos, broken examples, ambiguous wording), a PR is fine with a brief explanation.

5. **Submit a PR** that updates `SPEC.md` and any affected schema files. Reference the issue. Update the changelog.

### For schema / example changes

Same process, but faster review cycle. If an example in the spec is wrong or a schema doesn't validate against it, open an issue and PR together.

### For the README or documentation

PRs welcome without prior issue. Use your judgment.

---

## What Makes a Good Issue

**Strong issues:**
- Identify a specific ambiguity, gap, or contradiction in the spec
- Describe a real scenario the spec doesn't handle correctly
- Question a design decision with a concrete alternative
- Report that an example doesn't match the schema it's supposed to illustrate

**Less useful:**
- Vague "this could be better" without specifics
- Feature requests without a clear protocol-level justification
- Implementation questions (open a Discussion instead)

---

## Versioning Policy

- **Patch changes** (typos, clarifications, example fixes): No version bump required, noted in changelog
- **Minor changes** (new optional fields, new capabilities, non-breaking additions): Bump minor version (0.1 → 0.2), backwards compatible guaranteed
- **Major changes** (breaking schema changes, mode restructuring): Bump major version, migration path required

All changes, however small, are logged in [`CHANGELOG.md`](./CHANGELOG.md).

---

## What We're Looking For Right Now

AHP 0.1 is a working draft. These areas need the most scrutiny:

- **Trust & identity model** — the current spec punts on verifiable agent identity. What should 0.2 look like here?
- **MODE3 capability schemas** — `input_schema` and `output_schema` are declared but not yet formally specified
- **Async model edge cases** — what happens if the callback URL is unreachable? Timeout behavior?
- **Content signals enforcement** — the spec relies on honor system. Is there a better mechanism?
- **Rate limiting across distributed concierges** — the spec assumes single-server; what breaks in multi-node deployments?

If you have opinions on any of these, open an issue.

---

## Code of Conduct

Be direct. Be specific. Assume good faith. Disagree on ideas, not people.

This is a technical standards project. Decisions are made on the merits of arguments, not seniority or volume.

---

## Questions?

Open a [Discussion](https://github.com/AHP-Organization/agent-handshake-protocol/discussions) for anything that isn't a specific issue or PR. Implementation questions, integration help, design explorations — all welcome there.
