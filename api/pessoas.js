// POST   /api/pessoas          -> cria uma pasta (pessoa da casa)
// PUT    /api/pessoas?id=...   -> altera
// DELETE /api/pessoas?id=...   -> apaga (só se a pasta estiver vazia)
import { redis, CHAVE_PESSOAS, gravar, novoId, idValido, listarDocumentos, exigirPin, lerCorpo, responder } from "./_lib.js";
import { normalizarPessoa } from "../public/prazos-core.js";

export default async function handler(req, res) {
  if (!(await exigirPin(req, res))) return;
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (req.method === "DELETE") {
      if (!idValido(id)) return responder(res, 400, { erro: "Falta o id." });
      const n = (await listarDocumentos()).filter((d) => d.pessoaId === id).length;
      if (n) return responder(res, 400, { erro: `Esta pasta ainda tem ${n} ${n === 1 ? "documento" : "documentos"}. Apague-os primeiro.` });
      await redis("HDEL", CHAVE_PESSOAS, id);
      return responder(res, 200, { ok: true });
    }
    if (req.method === "POST" || req.method === "PUT") {
      const corpo = await lerCorpo(req);
      // Vários de uma vez: { pessoas: [...] } (usado para criar as pastas iniciais)
      if (req.method === "POST" && Array.isArray(corpo?.pessoas)) {
        const novas = corpo.pessoas.slice(0, 20).map(normalizarPessoa).filter(Boolean).map((p) => ({ id: novoId(), ...p }));
        if (!novas.length) return responder(res, 400, { erro: "Nenhuma pasta válida." });
        await redis("HSET", CHAVE_PESSOAS, ...novas.flatMap(({ id: pid, ...r }) => [pid, JSON.stringify(r)]));
        return responder(res, 200, { pessoas: novas });
      }
      const p = normalizarPessoa(corpo);
      if (!p) return responder(res, 400, { erro: "Precisa do nome da pasta." });
      if (req.method === "PUT") {
        if (!idValido(id) || !(await redis("HEXISTS", CHAVE_PESSOAS, id))) return responder(res, 404, { erro: "Esta pasta já não existe. Atualize a lista." });
        await gravar(CHAVE_PESSOAS, { id, ...p });
        return responder(res, 200, { pessoa: { id, ...p } });
      }
      if ((await redis("HLEN", CHAVE_PESSOAS)) >= 30) return responder(res, 400, { erro: "Limite de 30 pastas atingido." });
      const nova = { id: novoId(), ...p };
      await gravar(CHAVE_PESSOAS, nova);
      return responder(res, 200, { pessoa: nova });
    }
    res.setHeader("Allow", "POST, PUT, DELETE");
    return responder(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
