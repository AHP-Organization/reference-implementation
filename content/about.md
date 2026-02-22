---
title: Home
layout: home
nav_order: 1
---

# Agent Handshake Protocol
{: .fs-9 }

The open protocol for how AI agents discover and interact with websites.
{: .fs-6 .fw-300 }

[Read the Spec](/spec){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[View on GitHub](https://github.com/AHP-Organization/agent-handshake-protocol){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## The problem

The web was built for humans. When AI agents visit websites today, they scrape HTML, parse markdown dumps, and guess at structure — the equivalent of handing someone an encyclopedia when they asked one question.

[Cloudflare's "Markdown for Agents"](https://blog.cloudflare.com/markdown-for-agents/) is a step forward. But it's still a monologue — a document thrown over a fence. The agent must parse the whole thing regardless of what it actually needs.

**AHP defines a better contract.** A site publishes a machine-readable manifest. Visiting agents discover it, understand what the site can do, and interact through a structured protocol — asking for exactly what they need, getting exactly that back.

No scraping. No guessing. A handshake.

{: .highlight }
> AHP is the infrastructure layer for agent-native web presence — the successor to SEO in a world where the agent is the user.

---

## Three modes. Progressive adoption.

Start with MODE1 in an afternoon. Upgrade when you're ready. Every mode is backwards compatible with the one before it.

### MODE1 — Static Serve

A manifest at `/.well-known/agent.json` points visiting agents to your content. Compatible with existing `llms.txt` implementations — add the manifest and you're compliant. No server logic required.

**Best for:** Static sites, blogs, portfolios, any site that already has `llms.txt`.

### MODE2 — Interactive Knowledge

Visiting agents ask questions. Your site answers from its content. A `POST /agent/converse` endpoint backed by your knowledge base returns precise, sourced answers. Agents get what they need in a fraction of the tokens compared to parsing a full document.

**Best for:** Sites with rich content that agents frequently need to search or summarise.

### MODE3 — Agentic Desk

Your site's agent has tools. It can access databases, call APIs, connect to MCP servers, and escalate to a human — capabilities the visiting agent may not have. A visiting agent delegates tasks; your concierge handles them and delivers results, synchronously or async.

**Best for:** Services, e-commerce, support, any site where agents need to *do* something, not just *learn* something.

---

## How discovery works

AHP meets agents wherever they arrive — headless browsers, direct HTTP requests, or crawlers.

| Discovery method | How it works |
|-----------------|--------------|
| **In-page notice** | An `<section aria-label="AI Agent Notice">` in the page body. Agents using headless browsers read this directly. |
| **HTML link tag** | `<link rel="agent-manifest">` in `<head>`. Picked up by any agent parsing the DOM. |
| **Accept header** | Respond to `Accept: application/agent+json` with the manifest or a redirect to it. |
| **Well-known URI** | `GET /.well-known/agent.json` — the direct path for agents that know to look. |

---

## Quick start

**MODE1 in 5 minutes:**

1. Create `/.well-known/agent.json`:

   ```json
   {
     "ahp": "0.1",
     "modes": ["MODE1"],
     "endpoints": { "content": "/llms.txt" },
     "content_signals": { "ai_train": false, "ai_input": true, "search": true }
   }
   ```

2. Add to your HTML `<head>`:

   ```html
   <link rel="agent-manifest" href="/.well-known/agent.json" type="application/agent+json">
   ```

3. Add to your page body:

   ```html
   <section class="ahp-notice" aria-label="AI Agent Notice" style="display:none">
     <p>This site supports AHP. Discover capabilities: GET /.well-known/agent.json</p>
   </section>
   ```

If you already have `llms.txt`, you're most of the way there. [Read the full spec](/spec) to go further.

---

## Status

**Draft 0.1** — active working draft. Not yet a final specification.

We are looking for feedback on the protocol design, implementers willing to prototype, and edge cases we haven't considered. [Open an issue](https://github.com/AHP-Organization/agent-handshake-protocol/issues) — we want the hard questions.

---

## Relationship to existing work

AHP is not a replacement for `robots.txt`, `llms.txt`, or Cloudflare's markdown serving. It is the evolution beyond them.

A site with `llms.txt` can become AHP MODE1 compliant with zero changes to that file — just add the manifest. Everything else builds from there.

[See the full comparison →](/spec#appendix-b-relationship-to-llmstxt)
