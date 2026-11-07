// GET    /api/servicos          -> lista todos
// POST   /api/servicos          -> cria (corpo: serviço) e regista o 1.º pagamento no histórico
// PUT    /api/servicos?id=...   -> substitui
// DELETE /api/servicos?id=...   -> apaga (o histórico de pagamentos mantém-se)
import { redis, CHAVE, CHAVE_PAGAMENTOS, listarServicos, gravar, novoId, idValido, pinValido, lerCorpo, responder } from "./_lib.js";
import { normalizar } from "../public/prazos-core.js";

export default async function handler(req, res) {
  if (!process.env.FAMILIA_PIN) return responder(res, 500, { erro: "Falta definir FAMILIA_PIN nas variáveis do projeto Vercel." });
  if (!pinValido(req)) return responder(res, 401, { erro: "PIN errado." });
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (req.method === "GET") return responder(res, 200, { servicos: await listarServicos() });

    if (req.method === "DELETE") {
      if (!idValido(id)) return responder(res, 400, { erro: "Falta o id." });
      await redis("HDEL", CHAVE, id);
      return responder(res, 200, { ok: true });
    }

    if (req.method === "POST" || req.method === "PUT") {
      const s = normalizar(await lerCorpo(req));
      if (!s) return responder(res, 400, { erro: "Dados incompletos: precisa de nome, data do último pagamento e número de dias." });
      s.historico = [];
      if (req.method === "PUT") {
        if (!idValido(id) || !(await redis("HEXISTS", CHAVE, id))) return responder(res, 404, { erro: "Este serviço já não existe. Atualize a lista." });
        await gravar(CHAVE, { id, ...s });
        return responder(res, 200, { servico: { id, ...s } });
      }
      if ((await redis("HLEN", CHAVE)) >= 200) return responder(res, 400, { erro: "Limite de 200 serviços atingido." });
      const novo = { id: novoId(), ...s };
      await gravar(CHAVE, novo);
      await gravar(CHAVE_PAGAMENTOS, { id: novoId(), tipo: "servico", refId: novo.id, nome: novo.nome, data: novo.ultimoPagamento, valor: novo.valor, mes: novo.mesPago, anterior: null, anteriorMes: null, criadoEm: new Date().toISOString() });
      return responder(res, 200, { servico: novo });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return responder(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
