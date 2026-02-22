/**
 * AHP Tool Registry — MODE3 concierge tools.
 *
 * Each tool is a Claude tool_use definition + an executor.
 * The concierge calls tools via Claude's native tool use API;
 * executors run locally and return results back to Claude.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');

// ── Tool definitions (Claude tool_use format) ─────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'check_inventory',
    description: 'Check real-time inventory and availability for a product. Returns stock levels, pricing, and availability windows.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string', description: 'Product ID or SKU' },
        product_name: { type: 'string', description: 'Product name or search term (if ID unknown)' },
        quantity: { type: 'number', description: 'Requested quantity (default: 1)' },
      },
      required: [],
    },
  },
  {
    name: 'calculate_quote',
    description: 'Calculate a custom price quote based on requirements. Applies volume discounts, bundles, and current promotions.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Line items for the quote',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['product_id', 'quantity'],
          },
        },
        customer_type: {
          type: 'string',
          enum: ['individual', 'business', 'enterprise'],
          description: 'Customer tier for pricing',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'lookup_order',
    description: 'Look up an existing order by order ID or email address.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'Order ID' },
        email: { type: 'string', description: 'Customer email address' },
      },
      required: [],
    },
  },
  {
    name: 'search_knowledge',
    description: 'Search the site knowledge base for specific information. Use this when the query requires accurate information from site content.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Maximum results to return (default: 3)' },
      },
      required: ['query'],
    },
  },
];

// ── Tool executors ─────────────────────────────────────────────────────────────

export async function executeTool(name, input) {
  switch (name) {
    case 'check_inventory':     return execCheckInventory(input);
    case 'calculate_quote':     return execCalculateQuote(input);
    case 'lookup_order':        return execLookupOrder(input);
    case 'search_knowledge':    return execSearchKnowledge(input);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function loadData(filename) {
  const path = join(DATA, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function execCheckInventory({ product_id, product_name, quantity = 1 }) {
  const inventory = loadData('inventory.json');
  if (!inventory) return { error: 'Inventory system unavailable.' };

  let item = null;
  if (product_id) {
    item = inventory.products.find(p => p.id === product_id || p.sku === product_id);
  } else if (product_name) {
    const q = product_name.toLowerCase();
    item = inventory.products.find(p =>
      p.name.toLowerCase().includes(q) ||
      p.tags?.some(t => t.includes(q))
    );
  }

  if (!item) {
    return {
      found: false,
      message: `No product found matching '${product_id || product_name}'.`,
      available_products: inventory.products.map(p => ({ id: p.id, name: p.name })),
    };
  }

  const available = item.stock >= quantity;
  return {
    found: true,
    product: {
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description,
      price_usd: item.price_usd,
      stock: item.stock,
      available_quantity: item.stock,
    },
    requested_quantity: quantity,
    in_stock: available,
    message: available
      ? `${item.name} is in stock. ${item.stock} units available at $${item.price_usd} each.`
      : `${item.name} is out of stock. Current inventory: ${item.stock} units.`,
    estimated_restock: item.restock_date || null,
  };
}

function execCalculateQuote({ items, customer_type = 'individual' }) {
  const inventory = loadData('inventory.json');
  const pricing = loadData('pricing.json');
  if (!inventory || !pricing) return { error: 'Pricing system unavailable.' };

  const tier = pricing.tiers[customer_type] || pricing.tiers.individual;
  const lineItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = inventory.products.find(p => p.id === item.product_id);
    if (!product) {
      lineItems.push({ product_id: item.product_id, error: 'Product not found' });
      continue;
    }

    let unitPrice = product.price_usd;

    // Volume discount
    const volDiscount = tier.volume_discounts?.find(d => item.quantity >= d.min_qty);
    if (volDiscount) unitPrice *= (1 - volDiscount.discount);

    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    lineItems.push({
      product_id: item.product_id,
      name: product.name,
      quantity: item.quantity,
      unit_price_usd: Math.round(unitPrice * 100) / 100,
      line_total_usd: Math.round(lineTotal * 100) / 100,
    });
  }

  const discount = tier.base_discount || 0;
  const total = subtotal * (1 - discount);

  return {
    customer_type,
    line_items: lineItems,
    subtotal_usd: Math.round(subtotal * 100) / 100,
    discount_applied: `${(discount * 100).toFixed(0)}%`,
    total_usd: Math.round(total * 100) / 100,
    valid_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  };
}

function execLookupOrder({ order_id, email }) {
  const orders = loadData('orders.json');
  if (!orders) return { error: 'Order system unavailable.' };

  let order = null;
  if (order_id) order = orders.find(o => o.id === order_id);
  else if (email) order = orders.find(o => o.email === email);

  if (!order) return { found: false, message: 'No order found.' };

  return { found: true, order };
}

function execSearchKnowledge({ query, max_results = 3 }) {
  // Lazy import to avoid circular dep
  return import('./knowledge.js').then(({ retrieve }) => {
    const docs = retrieve(query, max_results);
    return {
      results: docs.map(d => ({
        title: d.title,
        url: d.url,
        excerpt: d.content.slice(0, 500),
      })),
    };
  });
}
