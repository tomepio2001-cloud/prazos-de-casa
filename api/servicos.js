// GET    /api/servicos          -> lista todos
// POST   /api/servicos          -> cria (corpo: serviço)
// PUT    /api/servicos?id=...   -> substitui
// DELETE /api/servicos?id=...   -> apaga
import { randomUUID } from "node:crypto";
import { redis, CHAVE, listarServicos, pinValido, lerCorpo, responder } from "./_lib.js";
import { normalizar } from "../public/prazos-core.js";

export default async function handler(req, res) {
  if (!process.env.FAMILIA_PIN) return responder(res, 500, { erro: "Falta definir FAMILIA_PIN nas variáveis do projeto Vercel." });
  if (!pinValido(req)) return responder(res, 401, { erro: "PIN errado." });
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (req.method === "GET") return responder(res, 200, { servicos: await listarServicos() });

    if (req.method === "DELETE") {
      if (!id) return responder(res, 400, { erro: "Falta o id." });
      await redis("HDEL", CHAVE, id);
      return responder(res, 200, { ok: true });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const s = normalizar(await lerCorpo(req));
      if (!s) return responder(res, 400, { erro: "Dados incompletos: precisa de nome, data do último pagamento e número de dias." });
      const alvo = req.method === "PUT" ? id : randomUUID().slice(0, 12);
      if (!alvo || !/^[\w-]{1,40}$/.test(alvo)) return responder(res, 400, { erro: "Id inválido." });
      if (req.method === "PUT" && !(await redis("HEXISTS", CHAVE, alvo))) return responder(res, 404, { erro: "Este serviço já não existe. Atualize a lista." });
      if (req.method === "POST" && (await redis("HLEN", CHAVE)) >= 200) return responder(res, 400, { erro: "Limite de 200 serviços atingido." });
      await redis("HSET", CHAVE, alvo, JSON.stringify(s));
      return responder(res, 200, { servico: { id: alvo, ...s } });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return responder(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
