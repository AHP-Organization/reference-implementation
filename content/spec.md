---
title: Specification
layout: default
nav_order: 2
permalink: /spec
---

# Agent Handshake Protocol (AHP)
## Specification — Draft 0.1

---

## Abstract

The Agent Handshake Protocol (AHP) defines a standard mechanism for websites and web services to advertise themselves to, and interact with, autonomous AI agents. AHP replaces the passive document-dump model of agent-to-web interaction with a structured, negotiated exchange — a handshake — in which a visiting agent declares its needs and the site responds with exactly what is required.

AHP is designed for progressive adoption. Sites may implement any subset of its three modes, each building on the last. A site supporting only MODE1 is already AHP-compliant and provides more value to agents than an unstructured HTML or markdown page. A site supporting MODE3 becomes an active participant in agentic workflows.

AHP is the infrastructure layer for agent-native web presence — the successor to SEO in a world where the agent is the user.

---

## Status of This Document

This is a working draft. It is not yet a final specification. Feedback and contributions are welcome at https://github.com/AHP-Organization/agent-handshake-protocol.

---

## Table of Contents

1. Introduction
2. Terminology
3. Discovery
4. The AHP Manifest
5. Modes
   - MODE1: Static Serve
   - MODE2: Interactive Knowledge
   - MODE3: Agentic Desk
6. Conversational Endpoint
   - 6.6 Response Content Types
7. Content Signals
8. Trust & Identity
9. Async Model
10. Error Handling
11. Rate Limiting
12. Versioning & Backwards Compatibility
13. Security Considerations
14. Examples

Appendices:
- Appendix A: JSON Schema for the AHP Manifest
- Appendix B: Relationship to llms.txt
- Appendix C: Extension Mechanism & Content Type Registry

---

## 1. Introduction

The web was built for humans. When AI agents interact with websites today, they are typically given a raw HTML page, or at best a markdown conversion of it, and left to parse it themselves. This is the equivalent of handing someone a city's entire phone book when they asked for one phone number.

AHP defines a better contract. A site publishes a machine-readable manifest at a well-known URI. The manifest declares what the site can offer agents and how to interact with it. Visiting agents discover the manifest, understand the site's capabilities, and interact through a defined protocol — rather than scraping, parsing, or guessing.

### 1.1 Relationship to Existing Work

AHP is compatible with and builds upon:

- **[Cloudflare's "Markdown for Agents"](https://blog.cloudflare.com/markdown-for-agents/)** — sites exposing clean markdown content at `?markdown=true` or via `/llms.txt` are MODE1-compatible with minor additions.
- **`robots.txt`** — AHP's `agent.json` manifest follows the same well-known URI pattern and spirit.
- **OpenAPI / Schema.org** — AHP borrows structured schema conventions but targets agent interaction rather than API documentation.

AHP does not replace any of these. It layers on top of them.

---

## 2. Terminology

- **Visiting Agent**: An autonomous AI agent (e.g. a user's assistant, a research agent, a workflow bot) that navigates to a website as part of a task.
- **Concierge**: The site-side component that responds to AHP requests. In MODE1, it may be purely static. In MODE3, it is an active agent.
- **Manifest**: The JSON document served at `/.well-known/agent.json` that describes the site's AHP capabilities.
- **Capability**: A named function the concierge can perform, declared in the manifest.
- **Session**: A stateful multi-turn exchange between a visiting agent and the concierge.
- **Content Signal**: A machine-readable declaration of how content may be used by AI systems.

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as in RFC 2119.

---

## 3. Discovery

### 3.1 Well-Known Manifest

A site supporting AHP MUST serve a manifest at:

```
GET /.well-known/agent.json
```

The response MUST have `Content-Type: application/json` and MUST be a valid AHP Manifest (Section 4).

### 3.2 Accept Header Discovery

A site supporting AHP SHOULD inspect the `Accept` header on all requests. If a request includes `Accept: application/agent+json`, the site SHOULD respond with one of:

- A `302` redirect to `/.well-known/agent.json`
- A `200` response containing the manifest directly
- A `Link` header pointing to the manifest: `Link: </.well-known/agent.json>; rel="agent-manifest"`

### 3.3 HTML Link Tag

Sites SHOULD include the following `<link>` tag in HTML pages to enable discovery by traditional crawlers and browser-based agents:

```html
<link rel="agent-manifest" href="/.well-known/agent.json" type="application/agent+json">
```

### 3.4 In-Page Agent Notice

Many AI agents interact with websites via headless browsers or HTML-to-text pipelines. In these cases, the agent's underlying LLM reads the rendered page content directly — it may not inspect headers, `<link>` tags, or well-known URIs unless explicitly prompted to.

To reach these agents, sites SHOULD embed a human-readable, agent-targeted notice in the visible body of each page. This notice instructs the LLM to use AHP rather than parsing the page.

**Recommended HTML element:**

```html
<section
  class="ahp-notice"
  aria-label="AI Agent Notice"
  style="display:none"
>
  <p>
    If you are an AI agent or autonomous system: this site supports the
    Agent Handshake Protocol (AHP). Instead of parsing this page, you can
    get structured, precise responses directly.
  </p>
  <p>
    Discover capabilities: <code>GET /.well-known/agent.json</code><br>
    Protocol version: AHP/0.1<br>
    Learn more: https://agenthandshake.dev
  </p>
</section>
```

**Important:** The notice SHOULD be visually hidden from human users (`display:none` or equivalent) but MUST remain in the DOM and be present in the raw HTML served to agents. The text MUST NOT be removed by JavaScript hydration in a way that eliminates it from the rendered text visible to headless browsers.

**Rationale:** LLMs processing page content are reading text, not executing logic. A clearly worded, in-content notice is the most reliable way to reach an agent that arrived via a headless browser without prior knowledge of AHP. It mirrors the longstanding convention of human-readable notices in `robots.txt` and `humans.txt` — but targeted at the agent reading the page, not the developer reading the file.

**Additional placement recommendations:**
- On `404` and error pages — an agent following a broken link should still discover AHP
- On API documentation pages — developer-targeting agents are high-value visitors
- In site footers — catches agents that scroll to the end of a page looking for metadata

Sites MAY use `aria-label="AI Agent Notice"` as a semantic hook; visiting agents that parse ARIA attributes can use this to locate the notice directly.

### 3.5 Discovery Priority

Visiting agents SHOULD attempt discovery in the following order:

1. Check rendered page content for an element with `aria-label="AI Agent Notice"` or class `ahp-notice`
2. Parse `<link rel="agent-manifest">` from HTML `<head>`
3. Check for `Accept: application/agent+json` response header or `Link` header
4. Fetch `/.well-known/agent.json` directly

Agents arriving via headless browser will typically encounter discovery mechanisms 1 and 2 first. Agents making direct HTTP requests will encounter 3 and 4.

---

## 4. The AHP Manifest

The manifest is the handshake opener. It tells a visiting agent everything it needs to know to interact with the site.

### 4.1 Schema

```json
{
  "ahp": "0.1",
  "name": "Example Site",
  "description": "A brief description of this site for agents.",
  "modes": ["MODE1", "MODE2"],
  "endpoints": {
    "converse": "/agent/converse",
    "content": "/llms.txt"
  },
  "capabilities": [
    {
      "name": "site_info",
      "description": "General information about this site, its owner, and purpose",
      "mode": "MODE2",
      "response_types": ["text/answer"]
    },
    {
      "name": "content_search",
      "description": "Find specific content, posts, or pages by topic",
      "mode": "MODE2",
      "response_types": ["text/answer", "application/feed"]
    },
    {
      "name": "get_video",
      "description": "Retrieve a video by title, topic, or ID",
      "mode": "MODE2",
      "response_types": ["media/video", "text/answer"],
      "accept_fallback": true
    },
    {
      "name": "contact",
      "description": "How to reach the site owner; returns structured data",
      "mode": "MODE1",
      "response_types": ["application/data"]
    }
  ],
  "authentication": "none",
  "rate_limit": "30/minute",
  "content_signals": {
    "ai_train": false,
    "ai_input": true,
    "search": true
  },
  "async": {
    "supported": false
  }
}
```

### 4.2 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `ahp` | string | Protocol version. MUST be present. |
| `modes` | array | List of supported modes. At least one MUST be declared. |
| `content_signals` | object | Content usage declarations (see Section 7). MUST be present. |

### 4.3 Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable site name |
| `description` | string | Brief description for visiting agents |
| `endpoints` | object | URLs for AHP endpoints |
| `capabilities` | array | Declared capabilities (required for MODE2/MODE3). Each capability MAY include `response_types` (array of content type strings) and `accept_fallback` (boolean — whether the capability can fall back to `text/answer` if the visiting agent cannot handle the primary type). |
| `authentication` | string | Auth scheme: `"none"`, `"bearer"`, `"api_key"` |
| `rate_limit` | string | Request limit in `"N/period"` format |
| `async` | object | Async capability declaration (see Section 9) |

---

## 5. Modes

### 5.1 MODE1 — Static Serve

**The agent-readable web. No server required beyond static hosting.**

In MODE1, the site provides a static, structured representation of its content accessible to agents. This is the entry point for AHP adoption and is compatible with existing Cloudflare `llms.txt` implementations.

**Requirements:**
- The manifest MUST declare `"modes": ["MODE1"]`
- The site MUST serve agent-readable content. This MAY be:
  - A `/llms.txt` file following the llms.txt convention
  - Markdown pages accessible at predictable URLs
  - A static JSON knowledge document
- The manifest SHOULD include an `endpoints.content` pointing to the primary content URL

**Visiting agent behavior:**
A visiting agent discovering a MODE1 site fetches the content document and processes it locally. The interaction is read-only and stateless.

**Compatibility:**
Sites already exposing `/llms.txt` or `?markdown=true` endpoints are MODE1-compatible with only the addition of `/.well-known/agent.json`.

---

### 5.2 MODE2 — Interactive Knowledge

**The agent asks questions. The site answers from its content.**

MODE2 adds a conversational endpoint. Instead of parsing a document, the visiting agent submits queries and receives precise, sourced answers. The concierge is typically backed by a retrieval system (vector search, structured data, or keyword search) over the site's content.

**Requirements:**
- All MODE1 requirements apply (backwards compatibility is mandatory)
- The manifest MUST declare capabilities with `"mode": "MODE2"`
- The site MUST expose a `POST /agent/converse` endpoint (or the path declared in `endpoints.converse`)
- The endpoint MUST support single-turn queries
- The endpoint SHOULD support multi-turn sessions via `session_id`

**Key characteristic:**
The concierge answers *from its knowledge base*. It does not take actions, make external calls, or escalate to humans. It knows what the site contains and surfaces it precisely.

---

### 5.3 MODE3 — Agentic Desk

**The site's agent works on your behalf.**

MODE3 elevates the concierge from a knowledge retrieval system to an active agent. The site-side concierge may have access to tools, MCP servers, external APIs, and human operators that the visiting agent does not. A visiting agent can delegate tasks to the concierge that require capabilities it lacks.

**Requirements:**
- All MODE2 requirements apply
- The manifest MUST declare MODE3 capabilities with explicit `input_schema` and `output_schema`
- Each MODE3 capability MUST declare its `action_type`: `"query"`, `"action"`, or `"async"`
- Capabilities of type `"action"` or `"async"` MUST require authentication (authentication MUST NOT be `"none"`)
- The site MUST implement the async model (Section 9) for `action_type: "async"` capabilities

**Example MODE3 capabilities:**
- Book an appointment (accesses a calendar)
- Check order status (accesses a CRM)
- Get a custom quote (runs a calculation or contacts a human)
- Perform deep research (has access to MCPs the visitor does not)
- Escalate to a human (routes to a real person and delivers answer via callback)

**Key characteristic:**
MODE3 capabilities have *action surface*. This requires a trust model (Section 8) and careful capability scoping. Visiting agents MUST declare their intent when invoking MODE3 capabilities.

---

## 6. Conversational Endpoint

### 6.1 Request Format

```
POST /agent/converse
Content-Type: application/json
```

```json
{
  "ahp": "0.1",
  "capability": "content_search",
  "query": "What has the site owner written about AI agents?",
  "session_id": null,
  "context": {
    "requesting_agent": "my-research-bot/1.0",
    "user_intent": "research",
    "max_tokens": 500,
    "accept_types": ["text/answer", "application/feed", "media/video"]
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `ahp` | SHOULD | Protocol version for compatibility checking |
| `capability` | MUST | The capability being invoked |
| `query` | MUST | The request or question |
| `session_id` | MAY | Session identifier for multi-turn exchanges |
| `context` | MAY | Additional context about the requesting agent |
| `context.accept_types` | MAY | List of content types the visiting agent can handle, in preference order. If absent, the concierge SHOULD default to `text/answer`. See Section 6.6 and Appendix C. |

### 6.2 Response — Success

```json
{
  "status": "success",
  "session_id": null,
  "response": {
    "answer": "The site owner has written three pieces on AI agents...",
    "sources": [
      {
        "title": "Why Agents Need Better Web Protocols",
        "url": "/blog/agent-protocols",
        "relevance": "direct"
      }
    ],
    "follow_up": {
      "suggested_queries": [
        "What is the site owner's professional background?",
        "Are there open source projects related to this topic?"
      ]
    }
  },
  "meta": {
    "tokens_used": 187,
    "capability_used": "content_search",
    "mode": "MODE2",
    "cached": false,
    "content_signals": {
      "ai_train": false,
      "ai_input": true
    }
  }
}
```

### 6.3 Response — Clarification Needed

When the query is ambiguous, the concierge SHOULD request clarification rather than guess.

```json
{
  "status": "clarification_needed",
  "session_id": "abc-123",
  "clarification": {
    "question": "Are you looking for blog posts, or also open source projects?",
    "options": ["blog_posts", "projects", "everything"],
    "free_form": true
  }
}
```

`options` MAY be null for entirely open-ended clarification. `free_form: true` signals that the visiting agent may respond with arbitrary text rather than selecting an option.

To continue, the visiting agent resubmits with the same `session_id` and a `clarification` field:

```json
{
  "capability": "content_search",
  "query": "What has the site owner written about AI agents?",
  "session_id": "abc-123",
  "clarification": "blog_posts"
}
```

### 6.4 Response — Async Accepted (MODE3)

```json
{
  "status": "accepted",
  "session_id": "xyz-456",
  "eta_seconds": 120,
  "callback": {
    "method": "POST",
    "url": "https://[provided by visiting agent]"
  },
  "poll": "/agent/converse/status/xyz-456"
}
```

### 6.5 Session Constraints

Implementations SHOULD enforce:
- Maximum 10 turns per session
- Session expiry after 10 minutes of inactivity
- Request body cap of 8KB
- Rate limiting per IP and optionally per `requesting_agent`

### 6.6 Response Content Types

AHP responses are not limited to text. A concierge MAY return any media type — video streams, audio, images, files, structured feeds, or custom payloads — provided the type is declared in the capability's `response_types` and the visiting agent has indicated it can handle it via `context.accept_types`.

**Content type negotiation:**

1. The manifest declares what types each capability *can* return (`response_types`)
2. The visiting agent declares what types it *can handle* (`context.accept_types`) in preference order
3. The concierge selects the most preferred type both parties support
4. If no overlap exists and `accept_fallback: true` is set on the capability, the concierge MUST fall back to `text/answer` with a plain-language description of the content
5. If no overlap exists and `accept_fallback` is false or absent, the concierge MUST return a `400` error with code `unsupported_type`, listing the available types

**Response structure with content type:**

The standard success response is extended with a `content_type` field and a `payload` object alongside (or instead of) `answer`:

```json
{
  "status": "success",
  "response": {
    "content_type": "media/video",
    "payload": {
      "stream_url": "https://cdn.example.com/video/intro-to-ahp.m3u8",
      "format": "hls",
      "duration_seconds": 847,
      "width": 1920,
      "height": 1080,
      "thumbnail_url": "https://cdn.example.com/thumb/intro-to-ahp.jpg",
      "subtitles": [
        { "lang": "en", "url": "https://cdn.example.com/subs/intro-to-ahp.en.vtt" }
      ],
      "title": "Introduction to AHP",
      "description": "A walkthrough of the Agent Handshake Protocol specification."
    },
    "answer": "Here is the requested video. It covers AHP modes 1 through 3 in 14 minutes.",
    "sources": [
      { "title": "Introduction to AHP", "url": "/videos/intro-to-ahp", "relevance": "direct" }
    ]
  },
  "meta": {
    "content_type": "media/video",
    "capability_used": "get_video",
    "mode": "MODE2"
  }
}
```

**Rules:**
- Media content MUST be URL-referenced. Binary content MUST NOT be embedded in the response body.
- `answer` SHOULD always be present as a human-readable (and LLM-readable) summary, even when a rich payload is returned. This ensures visiting agents that cannot render the media can still extract useful information.
- `payload` structure is defined per content type. See Appendix C for the standard type registry and payload schemas.
- `content_type` in the `meta` object SHOULD echo the type used, to aid logging and downstream processing.

**Fallback example** — visiting agent cannot handle `media/video`, capability has `accept_fallback: true`:

```json
{
  "status": "success",
  "response": {
    "content_type": "text/answer",
    "answer": "The video 'Introduction to AHP' (14 min) is available at https://example.com/videos/intro-to-ahp. It covers MODE1 through MODE3 with live demonstrations.",
    "sources": [
      { "title": "Introduction to AHP", "url": "/videos/intro-to-ahp", "relevance": "direct" }
    ]
  },
  "meta": {
    "content_type": "text/answer",
    "fallback_from": "media/video",
    "capability_used": "get_video",
    "mode": "MODE2"
  }
}
```

The `meta.fallback_from` field informs the visiting agent that a richer response was available but not served due to type negotiation. The visiting agent MAY retry with the appropriate `accept_types` if it gains the ability to handle the type.

---

## 7. Content Signals

Content signals allow site owners to declare their preferences for AI usage of their content. They MUST appear in the manifest and SHOULD be echoed in responses.

| Signal | Type | Meaning |
|--------|------|---------|
| `ai_train` | boolean | May this content be used to train AI models? |
| `ai_input` | boolean | May this content be used as input/context for AI inference? |
| `search` | boolean | May this content be indexed for AI-powered search? |
| `attribution_required` | boolean | Must the source be cited when content is used? |

Visiting agents and downstream systems MUST respect `ai_train: false` by not including the response content in training pipelines. AHP does not enforce this technically — it is a declaration of intent and a legal/ethical signal.

A future AHP revision may define a signed content signals extension for stronger assertions.

---

## 8. Trust & Identity

### 8.1 Visiting Agent Identity

Visiting agents SHOULD include a `requesting_agent` field in the request context. This is an unverified hint — it is not a security mechanism. Sites MAY use it for logging, routing, or capability gating.

### 8.2 Authentication

MODE1 and MODE2 query capabilities MAY be unauthenticated. MODE3 action capabilities MUST require authentication.

Supported schemes:

| Scheme | Description |
|--------|-------------|
| `none` | No authentication required |
| `bearer` | HTTP Bearer token in `Authorization` header |
| `api_key` | API key in `X-AHP-Key` header |
| `signed_request` | HMAC-signed request body (details TBD in 0.2) |

### 8.3 Future Work

A future revision will define a verifiable agent identity extension, likely building on existing work in decentralized identity (DIDs) or signed JWTs with well-known public keys. The goal is to allow site-side concierges to make trust decisions based on verified agent identity rather than self-reported claims.

---

## 9. Async Model

MODE3 capabilities that involve human escalation, long-running computation, or external API calls MUST use the async model.

### 9.1 Flow

1. Visiting agent POSTs to `/agent/converse` with a MODE3 async capability
2. Concierge responds with `status: "accepted"`, a `session_id`, estimated ETA, and a `poll` URL
3. Visiting agent either:
   - **Polls** `GET /agent/converse/status/{session_id}` until status is `success` or `failed`
   - **Waits for callback** at a URL it provided in the initial request
4. On completion, the response follows the standard success format

### 9.2 Status Response

```json
{
  "status": "pending",
  "session_id": "xyz-456",
  "progress": "Waiting for human operator response",
  "eta_seconds": 60
}
```

Status values: `pending`, `success`, `failed`, `expired`

---

## 10. Error Handling

All errors MUST return appropriate HTTP status codes and a JSON body:

```json
{
  "status": "error",
  "code": "unknown_capability",
  "message": "The capability 'foobar' is not supported.",
  "available_capabilities": ["site_info", "content_search", "contact"]
}
```

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | `invalid_request` | Malformed request body |
| 400 | `unknown_capability` | Capability not in manifest |
| 400 | `missing_field` | Required field absent |
| 401 | `auth_required` | Authentication required for this capability |
| 403 | `forbidden` | Valid auth but insufficient permissions |
| 413 | `request_too_large` | Body exceeds size cap |
| 429 | `rate_limited` | Rate limit hit; includes `Retry-After` header |
| 500 | `concierge_error` | Internal error in the concierge |
| 503 | `unavailable` | Concierge temporarily unavailable |

---

## 11. Rate Limiting

Rate limiting in AHP serves two purposes: protecting the site's infrastructure and managing LLM API costs for MODE2/MODE3 concierges. Sites MUST communicate rate limit status using standard headers and SHOULD publish their limits in the manifest.

### 11.1 Required Headers

All AHP endpoints MUST include the following headers on every response when rate limiting is active:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `X-RateLimit-Window` | Window duration in seconds (e.g. `60`) |

On a `429 Too Many Requests` response, the site MUST also include:

| Header | Description |
|--------|-------------|
| `Retry-After` | Seconds until the visiting agent may retry |

**Example headers:**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 12
X-RateLimit-Reset: 1708559400
X-RateLimit-Window: 60
```

### 11.2 Recommended Limits by Mode

These are recommended defaults. Sites MAY apply stricter or more permissive limits based on their infrastructure and use case.

| Mode | Unauthenticated | Authenticated |
|------|----------------|---------------|
| MODE1 (static content) | 120/minute | N/A |
| MODE2 (conversational) | 30/minute | 120/minute |
| MODE3 (agentic, query) | 30/minute | 120/minute |
| MODE3 (agentic, action) | N/A | 30/minute |

MODE3 action capabilities SHOULD have conservative limits regardless of authentication status. Actions have side effects; runaway agents can cause real-world consequences.

### 11.3 Limit Scope

Rate limits SHOULD be applied per IP address as the baseline. Sites MAY additionally apply limits per `requesting_agent` identifier (from the request context), per API key, or per session.

When `requesting_agent` scoping is in use and a visiting agent hits its per-agent limit before the per-IP limit, the `429` response SHOULD indicate this:

```json
{
  "status": "error",
  "code": "rate_limited",
  "message": "Rate limit exceeded for this agent identity.",
  "scope": "agent",
  "retry_after": 47
}
```

### 11.4 Cost-Based Throttling (MODE2/MODE3)

Sites operating MODE2 or MODE3 concierges backed by LLM APIs incur per-token costs. Sites MAY implement cost-based throttling in addition to request-count limits:

- **Token budget per session**: Limit total tokens consumed across a session's turns (recommended: 10,000 tokens/session)
- **Daily token quota per IP**: Cap total LLM token spend per IP per day
- **Max tokens per response**: Honor the `context.max_tokens` hint from visiting agents, and enforce a hard ceiling regardless

When a token budget is exhausted, respond with `429` and include:

```json
{
  "status": "error",
  "code": "rate_limited",
  "message": "Token budget for this session has been exhausted.",
  "scope": "session_tokens",
  "retry_after": null
}
```

`retry_after: null` signals that retrying in the same session will not help; the visiting agent should start a new session.

### 11.5 Manifest Declaration

Sites MUST declare their rate limits in the manifest for transparency:

```json
{
  "rate_limits": {
    "unauthenticated": {
      "requests": "30/minute",
      "token_budget": "5000/session"
    },
    "authenticated": {
      "requests": "120/minute",
      "token_budget": "20000/session"
    }
  }
}
```

### 11.6 Backoff Guidance for Visiting Agents

Visiting agents MUST respect `Retry-After` headers and MUST NOT retry before the indicated time. Visiting agents SHOULD implement exponential backoff with jitter when retrying after a `429`. Visiting agents SHOULD NOT treat `429` as a fatal error — it is a temporary condition.

---

## 12. Versioning & Backwards Compatibility

The `ahp` field in both the manifest and requests carries the protocol version.

- A site implementing AHP **0.x** MUST remain compatible with MODE1 visiting agents regardless of which modes it supports.
- A visiting agent encountering an unknown `ahp` version SHOULD fall back to MODE1 behavior.
- Minor version increments (0.1 → 0.2) MUST be backwards compatible.
- Major version increments (0.x → 1.0) MAY introduce breaking changes but MUST provide a migration path.

---

## 13. Security Considerations

- **Prompt injection**: MODE2 and MODE3 concierges that pass visiting agent queries to an LLM MUST sanitize inputs and implement guardrails against prompt injection attacks.
- **Data exfiltration**: MODE3 action capabilities SHOULD restrict what data can be returned to visiting agents, particularly for authenticated endpoints.
- **Rate limiting**: All AHP endpoints SHOULD implement rate limiting. Recommended defaults: 30 requests/minute for unauthenticated, 120/minute for authenticated.
- **SSRF**: Concierges that accept callback URLs from visiting agents (async model) MUST validate URLs to prevent SSRF attacks.
- **Content signal enforcement**: AHP does not technically enforce content signals. Sites SHOULD include signals in responses; visiting agents SHOULD honor them.

---

## 14. Examples

### 13.1 Minimal MODE1 Implementation

```
/.well-known/agent.json  → AHP manifest with modes: ["MODE1"]
/llms.txt                → Site content in plain text/markdown
```

A visiting agent fetches the manifest, finds the content URL, retrieves `/llms.txt`, and processes it locally. Zero server-side logic required.

### 13.2 MODE2 Query Flow

```
Visiting Agent                          Site Concierge
     │                                       │
     │  GET /.well-known/agent.json          │
     │──────────────────────────────────────►│
     │  ◄── manifest (modes: MODE1, MODE2) ──│
     │                                       │
     │  POST /agent/converse                 │
     │  { capability: "content_search",      │
     │    query: "posts about AI agents" }   │
     │──────────────────────────────────────►│
     │  ◄── { status: "success",             │
     │        response: { answer, sources }} │
```

### 13.3 MODE3 Human Escalation Flow

```
Visiting Agent                          Site Concierge + Human
     │                                       │
     │  POST /agent/converse                 │
     │  { capability: "get_custom_quote",    │
     │    query: "...", auth: "Bearer ..." } │
     │──────────────────────────────────────►│
     │  ◄── { status: "accepted",            │
     │        session_id, poll: "/..." }     │
     │                                       │  [human notified]
     │  GET /agent/converse/status/xyz       │  [human responds]
     │──────────────────────────────────────►│
     │  ◄── { status: "success",             │
     │        response: { answer } }         │
```

---

## Appendix A: JSON Schemas

Machine-readable JSON Schema files for all AHP data structures are published alongside this specification. Implementations SHOULD validate against these schemas.

| Schema | URL | Validates |
|--------|-----|-----------|
| Manifest | [`/schema/0.1/manifest.json`](https://agenthandshake.dev/schema/0.1/manifest.json) | `/.well-known/agent.json` |
| Request | [`/schema/0.1/request.json`](https://agenthandshake.dev/schema/0.1/request.json) | `POST /agent/converse` body |
| Response | [`/schema/0.1/response.json`](https://agenthandshake.dev/schema/0.1/response.json) | `POST /agent/converse` response |

All schemas use JSON Schema draft-07 and are versioned alongside the specification. The schema `$id` URIs are stable and will not change for a given version.

**Validating a manifest:**

```bash
# Using ajv-cli
npx ajv validate -s https://agenthandshake.dev/schema/0.1/manifest.json \
  -d .well-known/agent.json

# Using Python jsonschema
pip install jsonschema requests
python3 -c "
import jsonschema, json, requests
schema = requests.get('https://agenthandshake.dev/schema/0.1/manifest.json').json()
manifest = json.load(open('.well-known/agent.json'))
jsonschema.validate(manifest, schema)
print('Valid')
"
```

---

## Appendix B: Relationship to llms.txt

The `llms.txt` convention (proposed by Answer.AI) defines a standard location for a site-level plain text or markdown document intended for LLM consumption. It is a useful first step — better than raw HTML — but it is fundamentally a document dump: a static, unstructured file that an LLM must parse entirely, regardless of what it actually needs.

AHP is the evolution beyond `llms.txt`. The differences are significant:

| | llms.txt | AHP |
|--|----------|-----|
| Interaction model | Read-only document | Conversational exchange |
| Agent gets what it needs | Must parse everything | Asks for what it needs |
| Capabilities declared | No | Yes |
| Multi-turn support | No | Yes |
| Human escalation | No | Yes (MODE3) |
| Content signals | No | Yes |
| Rate limiting | No | Yes |
| Agent discovery (in-page) | No | Yes |
| Backwards compatible with llms.txt | — | Yes |

AHP does not deprecate `llms.txt`. A site with an existing `llms.txt` can become AHP MODE1 compliant with zero changes to that file:

1. Add `/.well-known/agent.json` with `modes: ["MODE1"]` and `endpoints.content: "/llms.txt"`
2. Add the `<link rel="agent-manifest">` tag to HTML pages
3. Add the in-page agent notice (Section 3.4)

The `llms.txt` file becomes the content source for MODE1. When the site is ready to upgrade to MODE2, the same content can back the conversational endpoint.

The goal is not to fragment the ecosystem — it is to give it a path forward. Sites that adopt AHP are not abandoning `llms.txt` compatibility; they are making it meaningful.

---

## Appendix C: Extension Mechanism & Content Type Registry

### C.1 Extension Philosophy

AHP cannot enumerate every content type or capability pattern the web will produce. Instead, the protocol defines:

1. **A core registry** of well-known content types with standardised payload schemas
2. **A namespaced extension prefix** (`x-`) for custom types that any implementation may use without coordination
3. **A promotion path** for widely-adopted extensions to become core types in future revisions

This mirrors the design of HTTP headers, MIME types, and HTML data attributes — all of which use the same pattern successfully.

### C.2 Core Content Type Registry

The following types are defined by this specification. Payload schemas are normative.

---

#### `text/answer`

Default type. A plain-text (or markdown) response. Used when no richer type applies or as a fallback.

```json
{
  "content_type": "text/answer",
  "answer": "string — the response text. Markdown is permitted.",
  "sources": [ { "title": "string", "url": "string", "relevance": "direct|indirect|background" } ],
  "follow_up": { "suggested_queries": ["string"] }
}
```

---

#### `application/data`

Structured JSON data. Used when the response is machine-readable records rather than prose — contact info, product details, structured metadata.

```json
{
  "content_type": "application/data",
  "payload": {
    "schema": "URI or name identifying the data shape (optional but RECOMMENDED)",
    "data": { }
  },
  "answer": "string — human-readable summary (SHOULD be present)"
}
```

---

#### `application/feed`

A list of items. Used for search results, article listings, product catalogues, or any ordered collection.

```json
{
  "content_type": "application/feed",
  "payload": {
    "total": 42,
    "items": [
      {
        "title": "string",
        "url": "string",
        "description": "string",
        "published_at": "ISO 8601 datetime or null",
        "thumbnail_url": "string or null",
        "metadata": { }
      }
    ],
    "next_cursor": "string or null — for pagination"
  },
  "answer": "string — summary of results"
}
```

---

#### `media/video`

A video resource. Payload provides stream URL, format, and metadata sufficient for a capable agent to present, embed, or describe the content.

```json
{
  "content_type": "media/video",
  "payload": {
    "stream_url": "string — primary playback URL (HLS, DASH, MP4, etc.)",
    "format": "hls | dash | mp4 | webm | string",
    "duration_seconds": 0,
    "width": 1920,
    "height": 1080,
    "thumbnail_url": "string or null",
    "title": "string",
    "description": "string or null",
    "published_at": "ISO 8601 datetime or null",
    "subtitles": [
      { "lang": "BCP 47 language tag", "url": "string — VTT or SRT" }
    ],
    "chapters": [
      { "title": "string", "start_seconds": 0 }
    ],
    "alternate_formats": [
      { "format": "string", "url": "string", "quality": "string" }
    ]
  },
  "answer": "string — description of the video"
}
```

---

#### `media/audio`

An audio resource. Covers podcasts, music, voice recordings, and audio streams.

```json
{
  "content_type": "media/audio",
  "payload": {
    "stream_url": "string",
    "format": "mp3 | ogg | aac | flac | string",
    "duration_seconds": 0,
    "title": "string",
    "description": "string or null",
    "published_at": "ISO 8601 datetime or null",
    "thumbnail_url": "string or null",
    "transcript_url": "string or null — VTT, SRT, or plain text",
    "chapters": [
      { "title": "string", "start_seconds": 0 }
    ]
  },
  "answer": "string — description of the audio"
}
```

---

#### `media/image`

One or more images. Used for photos, illustrations, diagrams, or galleries.

```json
{
  "content_type": "media/image",
  "payload": {
    "images": [
      {
        "url": "string",
        "alt": "string — descriptive alt text. REQUIRED.",
        "width": 0,
        "height": 0,
        "format": "jpeg | png | webp | gif | svg | string",
        "title": "string or null"
      }
    ],
    "layout": "single | gallery | carousel"
  },
  "answer": "string — description of the image(s)"
}
```

---

#### `file/download`

A downloadable file. Used for PDFs, datasets, archives, documents, or any non-media binary.

```json
{
  "content_type": "file/download",
  "payload": {
    "url": "string — download URL",
    "filename": "string",
    "mime_type": "string — IANA MIME type",
    "size_bytes": 0,
    "checksum": "string — SHA-256 hex digest (RECOMMENDED)",
    "description": "string or null",
    "expires_at": "ISO 8601 datetime or null — if the URL is time-limited"
  },
  "answer": "string — description of the file"
}
```

---

#### `application/action-result`

The outcome of a MODE3 action capability. Used when an action was performed and a result is being returned.

```json
{
  "content_type": "application/action-result",
  "payload": {
    "action": "string — name of the action performed",
    "success": true,
    "result": { },
    "side_effects": [
      { "type": "string", "description": "string" }
    ]
  },
  "answer": "string — plain-language summary of what happened"
}
```

---

### C.3 Extension Types

Any content type prefixed with `x-` is an extension type. Extension types are not defined by this specification and carry no compatibility guarantees.

**Format:** `x-{vendor}/{type}`

**Examples:**
- `x-shopify/cart` — Shopify cart state
- `x-realestate/listing` — Property listing with geo, pricing, photos
- `x-health/appointment` — Healthcare appointment booking result

**Rules for extension types:**
- MUST be prefixed with `x-`
- SHOULD include a vendor namespace to avoid collisions
- The payload schema is defined entirely by the implementer
- `answer` SHOULD still be present for agents that cannot interpret the extension type
- Extension types SHOULD be documented publicly if intended for third-party use

**Promotion to core:** Extension types that see broad adoption across multiple independent implementations MAY be proposed for inclusion in the core registry via the standard contribution process. Proposals should include real-world usage evidence and at least two independent implementations.

### C.4 Registering a Content Type

To formally propose a new core content type:

1. Open an issue in the spec repository with the label `content-type-proposal`
2. Provide: the type string, a use case description, a normative payload schema, at least one worked example, and evidence of need (why existing types don't cover it)
3. Discussion and refinement happens in the issue
4. If accepted, a PR adds it to Appendix C and the type is included in the next minor revision

Until a proposal is accepted, use the `x-` prefix.

---

*Agent Handshake Protocol — Draft 0.1*
*Authors: Nick Allain, [contributors]*
*Repository: https://github.com/AHP-Organization/agent-handshake-protocol*
*Spec site: https://agenthandshake.dev*
