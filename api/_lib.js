// Utilitários do servidor. Ficheiros começados por "_" não viram rotas na Vercel.
import { timingSafeEqual, randomUUID } from "node:crypto";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const CHAVE = "prazos:servicos"; // hash: id -> JSON do serviço
export const CHAVE_ALUNOS = "prazos:alunos"; // hash: id -> JSON do menino
export const CHAVE_PAGAMENTOS = "prazos:pagamentos"; // hash: id -> JSON de um pagamento (histórico)

/** Executa um comando Redis via REST (Upstash). */
export async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) throw Object.assign(new Error("Base de dados não configurada (falta ligar o Upstash Redis no projeto Vercel)."), { status: 500 });
  const r = await fetch(REDIS_URL, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw Object.assign(new Error("Erro na base de dados: " + (j.error || r.status)), { status: 502 });
  return j.result;
}

export const listarServicos = () => listar(CHAVE);
export const listarAlunos = () => listar(CHAVE_ALUNOS);
export const listarPagamentos = () => listar(CHAVE_PAGAMENTOS);

export async function lerUm(chave, id) {
  const raw = await redis("HGET", chave, id);
  if (!raw) return null;
  try { return { id, ...JSON.parse(raw) }; } catch { return null; }
}

/** Guarda um registo (sem o campo id dentro do JSON). */
export async function gravar(chave, registo) {
  const { id, ...resto } = registo;
  await redis("HSET", chave, id, JSON.stringify(resto));
}

export const novoId = () => randomUUID().slice(0, 12);
export const idValido = (id) => typeof id === "string" && /^[\w-]{1,40}$/.test(id);

export async function listar(chave) {
  const flat = (await redis("HGETALL", chave)) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    try { out.push({ id: flat[i], ...JSON.parse(flat[i + 1]) }); } catch { /* ignora entradas corrompidas */ }
  }
  return out;
}

const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/** Confirma o PIN da família (cabeçalho x-pin). */
export function pinValido(req) {
  const pin = process.env.FAMILIA_PIN;
  if (!pin) return false;
  return igual(req.headers["x-pin"] || "", pin);
}

/** Pedido vindo do agendador da Vercel (Authorization: Bearer CRON_SECRET). */
export function vemDoCron(req) {
  const s = process.env.CRON_SECRET;
  return !!s && igual(req.headers.authorization || "", `Bearer ${s}`);
}

export async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  let raw = ""; for await (const c of req) raw += c;
  try { return JSON.parse(raw || "{}"); } catch { return null; }
}

export function responder(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
