// POST   /api/alunos          -> adiciona um menino
// PUT    /api/alunos?id=...   -> altera
// DELETE /api/alunos?id=...   -> apaga (os pagamentos já feitos ficam no histórico)
import { redis, CHAVE_ALUNOS, gravar, novoId, idValido, exigirPin, lerCorpo, responder } from "./_lib.js";
import { normalizarAluno } from "../public/prazos-core.js";

export default async function handler(req, res) {
  if (!(await exigirPin(req, res))) return;
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    if (req.method === "DELETE") {
      if (!idValido(id)) return responder(res, 400, { erro: "Falta o id." });
      await redis("HDEL", CHAVE_ALUNOS, id);
      return responder(res, 200, { ok: true });
    }
    if (req.method === "POST" || req.method === "PUT") {
      const a = normalizarAluno(await lerCorpo(req));
      if (!a) return responder(res, 400, { erro: "Precisa do nome e do mês em que começam as propinas." });
      if (req.method === "PUT") {
        if (!idValido(id) || !(await redis("HEXISTS", CHAVE_ALUNOS, id))) return responder(res, 404, { erro: "Este menino já não existe. Atualize a lista." });
        await gravar(CHAVE_ALUNOS, { id, ...a });
        return responder(res, 200, { aluno: { id, ...a } });
      }
      if ((await redis("HLEN", CHAVE_ALUNOS)) >= 30) return responder(res, 400, { erro: "Limite de 30 meninos atingido." });
      const novo = { id: novoId(), ...a };
      await gravar(CHAVE_ALUNOS, novo);
      return responder(res, 200, { aluno: novo });
    }
    res.setHeader("Allow", "POST, PUT, DELETE");
    return responder(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
