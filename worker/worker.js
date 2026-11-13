/**
 * Meja Copy Hannah: Cloudflare Worker (the "middleman")
 *
 * Keeps the AI keys secret, checks the passcode, and tries the AIs in order:
 *   Gemini  ->  SEA-LION  ->  Groq   (change with PROVIDER_ORDER)
 *
 * Secrets (Settings > Variables and Secrets, type "Secret"):
 *   PASSCODE           the passcode she types into the app
 *   GEMINI_API_KEY     from Google AI Studio
 *   SEALION_API_KEY    from the SEA-LION playground
 *   GROQ_API_KEY       from console.groq.com
 *   OPENAI_API_KEY     optional spare slot
 *
 * Plain variables (optional):
 *   ALLOWED_ORIGIN     e.g. https://nuhihsan.github.io   (recommended)
 *   PROVIDER_ORDER     default "gemini,sealion,groq"     (also: openai, workersai)
 *   GEMINI_PAID        "true" once you prepay Gemini; then Confidential mode may use Gemini
 *   GEMINI_MODEL       default "gemini-flash-latest"
 *   SEALION_MODEL      default "aisingapore/Qwen-SEA-LION-v4.5-27B-IT"
 *   GROQ_MODEL         default "openai/gpt-oss-120b"
 *   OPENAI_MODEL       default "gpt-5.4-mini"
 *   WORKERSAI_MODEL    default "@cf/aisingapore/gemma-sea-lion-v4-27b-it" (needs an AI binding named AI)
 *   GEMINI_THINKING    default "low" (how long Gemini thinks before answering: low, medium, high, or off)
 *
 * Bindings:
 *   KV namespace named STORE (or TRENDS)   stores her encrypted sync data and the weekly trend board
 *   Workers AI named AI         only if you add "workersai" to PROVIDER_ORDER
 *
 * Optional Cron Trigger (refreshes trends): 39 23 * * 0   (= Monday 7:39am Malaysia time)
 */

const DEFAULTS = {
  PROVIDER_ORDER: "gemini,sealion,groq",
  GEMINI_MODEL: "gemini-flash-latest",
  SEALION_MODEL: "aisingapore/Qwen-SEA-LION-v4.5-27B-IT",
  GROQ_MODEL: "openai/gpt-oss-120b",
  OPENAI_MODEL: "gpt-5.4-mini",
  WORKERSAI_MODEL: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  GEMINI_THINKING: "low",
};
const NAMES = { gemini: "Gemini", sealion: "SEA-LION", groq: "Groq", openai: "OpenAI", workersai: "SEA-LION (Cloudflare)" };
const IMAGE_CAPABLE = new Set(["gemini", "openai"]);
const PROVIDER_TIMEOUT_MS = 45000; // give up on one AI after 45s and try the next
const MAX_PROMPT_CHARS = 200000;
const MAX_IMAGES = 6;
const MAX_SYNC_BYTES = 20 * 1024 * 1024;
const kvOf = env => env.STORE || env.TRENDS || null;

const cfg = (env, k) => (env && env[k] != null && String(env[k]).trim() !== "" ? String(env[k]).trim() : DEFAULTS[k]);

/* ---------------- HTTP helpers ---------------- */
function corsHeaders(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = cfg(env, "ALLOWED_ORIGIN");
  const allow = !allowed ? "*" : (allowed.split(",").map(s => s.trim()).includes(origin) ? origin : allowed.split(",")[0].trim());
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Passcode",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(env, req, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(env, req) } });
}
function err(env, req, code, message, status) { return json(env, req, { error: { code, message } }, status); }

async function sameText(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(String(a))), crypto.subtle.digest("SHA-256", enc.encode(String(b)))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function checkPass(env, req) {
  if (!env.PASSCODE) return "not_configured";
  const given = req.headers.get("X-Passcode") || "";
  return (await sameText(given, env.PASSCODE)) ? "" : "bad_passcode";
}

function withTimeout(ms) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, done: () => clearTimeout(t) }; }

class ProviderError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/* ---------------- Providers ---------------- */
async function callGemini(env, { prompt, images, wantJson }) {
  if (!env.GEMINI_API_KEY) throw new ProviderError("not_configured", "No Gemini key");
  const parts = [{ text: prompt }];
  for (const im of images) parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  const body = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.8 } };
  if (wantJson) body.generationConfig.responseMimeType = "application/json";
  // Gemini "thinks" before answering, which can take a minute on long prompts. Copywriting doesn't need much of it.
  const level = String(cfg(env, "GEMINI_THINKING") || "").trim().toLowerCase();
  if (level && level !== "off" && level !== "default") body.generationConfig.thinkingConfig = { thinkingLevel: level };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg(env, "GEMINI_MODEL"))}:generateContent`;
  const t = withTimeout(PROVIDER_TIMEOUT_MS);
  try {
    const send = () => fetch(url, { method: "POST", signal: t.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify(body) });
    let r = await send();
    if (r.status === 400 && body.generationConfig.thinkingConfig) {
      // This model doesn't accept the thinking setting: try once more without it.
      const msg = await r.text();
      if (/thinking/i.test(msg)) { delete body.generationConfig.thinkingConfig; r = await send(); }
      else throw new ProviderError("upstream_error", `Gemini 400: ${msg.slice(0, 300)}`);
    }
    if (!r.ok) throw new ProviderError(r.status === 429 ? "rate_limited" : "upstream_error", `Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    const cand = d.candidates && d.candidates[0];
    const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map(p => p.text || "").join("") : "";
    if (!text.trim()) throw new ProviderError(cand && cand.finishReason === "SAFETY" ? "refused" : "empty", "Gemini returned no text");
    return text;
  } finally { t.done(); }
}

async function callOpenAICompatible(url, key, model, { prompt, images, wantJson }, label) {
  if (!key) throw new ProviderError("not_configured", `No ${label} key`);
  const content = images.length
    ? [{ type: "text", text: prompt }, ...images.map(im => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.data}` } }))]
    : prompt;
  const body = { model, messages: [{ role: "user", content }], temperature: 0.8 };
  if (/gpt-oss/i.test(model)) body.reasoning_effort = "low"; // faster answers from Groq's reasoning model
  if (wantJson && label !== "SEA-LION") body.response_format = { type: "json_object" };
  const t = withTimeout(PROVIDER_TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: "POST", signal: t.signal, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, body: JSON.stringify(body) });
    if (!r.ok) throw new ProviderError(r.status === 429 ? "rate_limited" : "upstream_error", `${label} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    const text = d.choices && d.choices[0] && d.choices[0].message ? String(d.choices[0].message.content || "") : "";
    if (!text.trim()) throw new ProviderError("empty", `${label} returned no text`);
    return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  } finally { t.done(); }
}

async function callWorkersAI(env, { prompt }) {
  if (!env.AI) throw new ProviderError("not_configured", "No Workers AI binding");
  const out = await env.AI.run(cfg(env, "WORKERSAI_MODEL"), { messages: [{ role: "user", content: prompt }], max_tokens: 4096 });
  const text = out && (out.response || (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content)) || "";
  if (!String(text).trim()) throw new ProviderError("empty", "Workers AI returned no text");
  return String(text);
}

const CALLERS = {
  gemini: (env, a) => callGemini(env, a),
  sealion: (env, a) => callOpenAICompatible("https://api.sea-lion.ai/v1/chat/completions", env.SEALION_API_KEY, cfg(env, "SEALION_MODEL"), a, "SEA-LION"),
  groq: (env, a) => callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", env.GROQ_API_KEY, cfg(env, "GROQ_MODEL"), a, "Groq"),
  openai: (env, a) => callOpenAICompatible("https://api.openai.com/v1/chat/completions", env.OPENAI_API_KEY, cfg(env, "OPENAI_MODEL"), a, "OpenAI"),
  workersai: (env, a) => callWorkersAI(env, a),
};

function providerChain(env, { confidential, needImages }) {
  let order = cfg(env, "PROVIDER_ORDER").split(",").map(s => s.trim().toLowerCase()).filter(p => CALLERS[p]);
  const geminiPaid = String(env.GEMINI_PAID || "").toLowerCase() === "true";
  if (confidential && !geminiPaid) order = order.filter(p => p !== "gemini");
  if (needImages) order = order.filter(p => IMAGE_CAPABLE.has(p));
  return order;
}

async function runChain(env, args, opts) {
  const chain = providerChain(env, opts);
  if (!chain.length) throw new ProviderError(opts.needImages ? "images_unavailable" : "not_configured", "No AI available for this request");
  const tried = [];
  let last = null, sawRateLimit = false, configured = 0;
  for (const p of chain) {
    try {
      const text = await CALLERS[p](env, args);
      return { text, provider: NAMES[p], tried };
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : (e && e.name === "AbortError" ? "timeout" : "upstream_error");
      if (code !== "not_configured") configured++;
      if (code === "rate_limited") sawRateLimit = true;
      tried.push({ provider: NAMES[p], code });
      last = e;
      console.log(`[meja] ${p} failed: ${code} ${e && e.message ? e.message.slice(0, 200) : ""}`);
    }
  }
  if (!configured) throw new ProviderError(opts.needImages ? "images_unavailable" : "not_configured", "No AI key is set up");
  throw new ProviderError(sawRateLimit ? "rate_limited" : "upstream_error", last && last.message ? last.message : "All AIs failed");
}

/* ---------------- /ai ---------------- */
async function handleAI(env, req) {
  let body;
  try { body = await req.json(); } catch { return err(env, req, "invalid_request", "Body must be JSON", 400); }
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) return err(env, req, "invalid_request", "Missing prompt", 400);
  if (prompt.length > MAX_PROMPT_CHARS) return err(env, req, "prompt_too_large", "Prompt too long", 413);
  const images = (Array.isArray(body.images) ? body.images : []).slice(0, MAX_IMAGES)
    .filter(im => im && typeof im.data === "string" && /^image\/(png|jpeg|webp|gif)$/.test(String(im.mime)))
    .map(im => ({ mime: String(im.mime), data: im.data }));
  const opts = { confidential: !!body.confidential, needImages: images.length > 0 };
  try {
    const out = await runChain(env, { prompt, images, wantJson: !!body.json }, opts);
    return json(env, req, { text: out.text, provider: out.provider, fallbacks: out.tried });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "upstream_error";
    const status = code === "rate_limited" ? 429 : code === "images_unavailable" ? 422 : code === "not_configured" ? 503 : 502;
    return err(env, req, code, "The AI couldn't answer this time.", status);
  }
}

/* ---------------- Trends ---------------- */
const FEEDS = [
  { name: "Google Trends Malaysia", url: "https://trends.google.com/trending/rss?geo=MY" },
  { name: "Malay Mail", url: "https://www.malaymail.com/feed/rss/malaysia" },
  { name: "Malay Mail Life", url: "https://www.malaymail.com/feed/rss/life" },
  { name: "Free Malaysia Today", url: "https://www.freemalaysiatoday.com/feed/" },
  { name: "The Star", url: "https://www.thestar.com.my/rss/News/Nation" },
];
const decode = s => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
function parseFeed(xml, source) {
  const out = [];
  const items = String(xml).match(/<item[\s\S]*?<\/item>/g) || [];
  for (const it of items.slice(0, 15)) {
    const title = decode((it.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
    let link = decode((it.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1]);
    const newsUrl = decode((it.match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/) || [])[1]);
    if (newsUrl) link = newsUrl;
    const traffic = decode((it.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1]);
    if (title && /^https?:\/\//.test(link)) out.push({ source, title: title.slice(0, 200), url: link, traffic });
  }
  return out;
}
async function gatherHeadlines() {
  const results = await Promise.allSettled(FEEDS.map(async f => {
    const t = withTimeout(15000);
    try {
      const r = await fetch(f.url, { signal: t.signal, headers: { "User-Agent": "MejaCopyHannah/1.0 (+trend board)" } });
      if (!r.ok) return [];
      return parseFeed(await r.text(), f.name);
    } finally { t.done(); }
  }));
  return results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
}
function mytNow() { return new Date(Date.now() + 8 * 3600 * 1000); }
function weekOfLabel() {
  const d = mytNow(); const day = d.getUTCDay(); const diff = (day + 6) % 7; d.setUTCDate(d.getUTCDate() - diff);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function parseLooseJson(text) {
  const s = String(text || "").trim();
  try { return JSON.parse(s); } catch {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}
async function buildTrends(env) {
  const headlines = await gatherHeadlines();
  if (!headlines.length) throw new Error("No feed headlines could be read");
  const today = mytNow().toISOString().slice(0, 10);
  const list = headlines.slice(0, 70).map((h, i) => `${i + 1}. [${h.source}] ${h.title}${h.traffic ? " (searches: " + h.traffic + ")" : ""} | ${h.url}`).join("\n");
  const prompt = `You prepare a weekly trend board for a junior Bahasa Melayu copywriter at a Malaysian ad agency. Today is ${today} (Malaysia).
Below are this week's Malaysian search trends and headlines. Using ONLY these, plus well-known fixed Malaysian dates (public and school holidays, festivals, sales days like 12.12, payday at month end), build the board.

HEADLINES:
${list}

Rules:
- 6 to 10 items, 5 to 9 upcoming dates for the next 5 weeks in date order, 4 to 8 slang terms Malaysians are using online now (only ones you are confident are real and current; fewer is fine).
- risk "high" for politics, royalty, religion, race (3R), crime, disasters, deaths or tragedy, with angle "None". risk "medium" for things brands can only touch indirectly.
- Every item's sources must be URLs copied exactly from the list above. Never invent a URL.
- English text, no em dashes.

Reply with only JSON:
{"weekOf":"${weekOfLabel()}","updated":"${new Date().toISOString()}","summary":"2-3 sentences on the mood of the week and what is safe for brands","items":[{"id":"short-kebab-id","topic":"","category":"Social media|Seasonal|Festive|Tech|Sports|Entertainment|Food|Economy|News|Politics","why":"","angle":"","caution":"","risk":"low|medium|high","sources":[{"title":"outlet","url":"https://..."}]}],"dates":[{"date":"e.g. 12 Dec","label":"","note":""}],"slang":[{"term":"","meaning":"","example":"short natural BM example","audience":"Everyone|Gen Z|Young adults|Online / TikTok|Northern (Utara)|East Coast|Sabah / Sarawak","caution":""}]}`;
  const out = await runChain(env, { prompt, images: [], wantJson: true }, { confidential: false, needImages: false });
  const board = parseLooseJson(out.text);
  if (!board || !Array.isArray(board.items)) throw new Error("Trend board came back in the wrong shape");
  const allowed = new Set(headlines.map(h => h.url));
  board.items = board.items.filter(t => t && t.topic).map(t => ({ ...t, sources: (Array.isArray(t.sources) ? t.sources : []).filter(s => s && allowed.has(s.url)) }));
  board.weekOf = board.weekOf || weekOfLabel();
  board.updated = new Date().toISOString();
  board.writtenBy = out.provider;
  await kvOf(env).put("current", JSON.stringify(board));
  return board;
}

/* ---------------- Sync (end-to-end encrypted; the Worker only stores ciphertext) ---------------- */
async function handleSync(env, req) {
  const kv = kvOf(env);
  if (!kv) return err(env, req, "not_configured", "Add a KV namespace named STORE first", 503);
  if (req.method === "GET") {
    const v = await kv.get("sync");
    if (!v) return json(env, req, { exists: false });
    return new Response(v, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(env, req) } });
  }
  if (req.method === "PUT") {
    const raw = await req.text();
    if (raw.length > MAX_SYNC_BYTES) return err(env, req, "too_large", "Sync data too large", 413);
    let body; try { body = JSON.parse(raw); } catch { return err(env, req, "invalid_request", "Body must be JSON", 400); }
    const vault = body && body.vault;
    const m = vault && vault.meta, d = vault && vault.data;
    const okStr = x => typeof x === "string" && x.length > 0 && x.length < MAX_SYNC_BYTES;
    if (!m || !d || !okStr(m.saltP) || !okStr(m.ivP) || !okStr(m.wrapP) || !okStr(m.saltR) || !okStr(m.ivR) || !okStr(m.wrapR) || !okStr(d.iv) || !okStr(d.ct)) {
      return err(env, req, "invalid_request", "Vault is missing fields", 400);
    }
    const curRaw = await kv.get("sync");
    const cur = curRaw ? JSON.parse(curRaw) : null;
    const curRev = cur && Number.isFinite(cur.rev) ? cur.rev : 0;
    if (Number(body.baseRev || 0) !== curRev) return json(env, req, { error: { code: "conflict", message: "Newer data on the server" }, current: cur }, 409);
    const next = { v: 1, meta: m, data: d, rev: curRev + 1, updated: new Date().toISOString() };
    await kv.put("sync", JSON.stringify(next));
    return json(env, req, { ok: true, rev: next.rev, updated: next.updated });
  }
  if (req.method === "DELETE") { await kv.delete("sync"); return json(env, req, { ok: true }); }
  return err(env, req, "not_found", "Not found", 404);
}

/* ---------------- Router ---------------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    if (url.pathname === "/" && req.method === "GET") return json(env, req, { ok: true, app: "Meja Copy Hannah worker" });

    const pass = await checkPass(env, req);
    if (pass === "not_configured") return err(env, req, "not_configured", "Set the PASSCODE secret first", 503);
    if (pass) return err(env, req, "bad_passcode", "Wrong passcode", 401);

    if (url.pathname === "/ai" && req.method === "POST") return handleAI(env, req);
    if (url.pathname === "/check" && req.method === "GET") {
      return json(env, req, { ok: true, providers: providerChain(env, { confidential: false, needImages: false }).map(p => ({ id: p, name: NAMES[p], key: !!(p === "workersai" ? env.AI : env[p.toUpperCase() + "_API_KEY"]) })), trends: !!kvOf(env), sync: !!kvOf(env), geminiPaid: String(env.GEMINI_PAID || "").toLowerCase() === "true" });
    }
    if (url.pathname === "/sync") return handleSync(env, req);
    if (url.pathname === "/trends" && req.method === "GET") {
      if (!kvOf(env)) return json(env, req, {});
      const v = await kvOf(env).get("current");
      return new Response(v || "{}", { headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(env, req) } });
    }
    if (url.pathname === "/trends/refresh" && req.method === "POST") {
      if (!kvOf(env)) return err(env, req, "not_configured", "Add a KV namespace named STORE first", 503);
      try { return json(env, req, await buildTrends(env)); }
      catch (e) { return err(env, req, "upstream_error", String(e && e.message || e).slice(0, 200), 502); }
    }
    return err(env, req, "not_found", "Not found", 404);
  },
  async scheduled(event, env, ctx) {
    if (!kvOf(env)) return;
    ctx.waitUntil(buildTrends(env).catch(e => console.log("[meja] trends failed: " + (e && e.message))));
  },
};
