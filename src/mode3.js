/**
 * AHP MODE3 capability handlers.
 * Uses Claude's native tool use to let the concierge decide
 * which tools to call and how to synthesise results.
 */

import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';
import { enqueueHumanRequest } from './async-queue.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SITE_NAME = process.env.SITE_NAME || 'this site';

const MODE3_SYSTEM = `You are an advanced concierge agent for ${SITE_NAME}. You have access to real-time tools that go beyond static site content.

Your capabilities:
- Check live inventory and pricing
- Calculate custom quotes with volume discounts
- Look up existing orders
- Search the site knowledge base for accurate information

Rules:
- Use tools when the query requires real-time or structured data
- Synthesise tool results into a clear, direct answer
- Be precise about numbers, availability, and dates — never estimate what a tool can tell you exactly
- If a tool returns an error, acknowledge it and suggest what the agent can do instead
- Always cite data sources (tool results, knowledge base entries) in your response`;

/**
 * Handle a MODE3 query capability (real-time data, tool use).
 * Synchronous — returns within the HTTP request lifecycle.
 */
export async function handleMode3Query({ capability, query, context = {}, sessionId }) {
  const startMs = Date.now();

  const messages = [{ role: 'user', content: query }];
  let totalTokens = 0;
  let toolCallCount = 0;
  const toolsUsed = [];

  // Agentic loop — let Claude call tools until it has what it needs
  while (true) {
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
      max_tokens: Math.min(context.max_tokens || 1000, 2000),
      system: MODE3_SYSTEM,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    totalTokens += response.usage.input_tokens + response.usage.output_tokens;

    // If Claude is done (no more tool calls), extract and return the answer
    if (response.stop_reason === 'end_turn') {
      const answer = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();

      return {
        content_type: 'text/answer',
        answer,
        sources: [],
        _tokens: totalTokens,
        _latency_ms: Date.now() - startMs,
        _tools_used: toolsUsed,
        _tool_call_count: toolCallCount,
      };
    }

    // Claude wants to use tools — execute them all in parallel
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Add Claude's response (with tool_use blocks) to message history
      messages.push({ role: 'assistant', content: response.content });

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolCallCount++;
          toolsUsed.push(block.name);
          console.log(`[mode3] Tool call: ${block.name}`, block.input);

          let result;
          try {
            result = await executeTool(block.name, block.input);
          } catch (e) {
            result = { error: `Tool execution failed: ${e.message}` };
          }

          console.log(`[mode3] Tool result: ${block.name} →`, JSON.stringify(result).slice(0, 200));

          return {
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );

      // Feed tool results back to Claude
      messages.push({ role: 'user', content: toolResults });

      // Safety: cap the loop at 5 tool call rounds
      if (toolCallCount >= 10) {
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUseBlocks[0].id, content: '{"error":"Tool call limit reached. Synthesise from available results."}' }],
        });
        break;
      }
    } else {
      // Unexpected stop reason
      break;
    }
  }

  return {
    content_type: 'text/answer',
    answer: 'Unable to complete the request with available tools.',
    sources: [],
    _tokens: totalTokens,
    _latency_ms: Date.now() - startMs,
    _tools_used: toolsUsed,
  };
}

/**
 * Handle a MODE3 async capability (human escalation).
 * Returns immediately with accepted status; resolution is async.
 */
export function handleMode3Async({ capability, query, context = {}, sessionId }) {
  const { eta_seconds } = enqueueHumanRequest({
    sessionId,
    capability,
    query,
    context,
    callbackUrl: context.callback_url || null,
  });

  return {
    status: 'accepted',
    session_id: sessionId,
    eta_seconds,
    poll: `/agent/converse/status/${sessionId}`,
    ...(context.callback_url ? {
      callback: { method: 'POST', url: context.callback_url },
    } : {}),
  };
}
