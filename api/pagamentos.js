// POST   /api/pagamentos          -> regista um pagamento
//   serviço: { tipo:"servico", refId, data, valor?, nota? }  (atualiza o último pagamento do serviço)
//   propina: { tipo:"propina", refId, data, valor? (por mês), meses:["2026-11", ...], nota? }
// DELETE /api/pagamentos?id=...   -> anula um registo (e repõe o prazo do serviço, se for o caso)
import { redis, CHAVE, CHAVE_ALUNOS, CHAVE_PAGAMENTOS, lerUm, gravar, listarPagamentos, novoId, idValido, exigirPin, lerCorpo, responder } from "./_lib.js";
import { normalizarPagamento, mesSeguinte } from "../public/prazos-core.js";

export default async function handler(req, res) {
  if (!(await exigirPin(req, res))) return;
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    const agora = new Date().toISOString();

    if (req.method === "POST") {
      const p = normalizarPagamento(await lerCorpo(req));
      if (!p) return responder(res, 400, { erro: "Pagamento incompleto: precisa da data e do que foi pago." });

      if (p.tipo === "servico") {
        const s = await lerUm(CHAVE, p.refId);
        if (!s) return responder(res, 404, { erro: "Este serviço já não existe. Atualize a lista." });
        const mes = s.mesPago ? mesSeguinte(s.mesPago) : null;
        const registo = { id: novoId(), tipo: "servico", refId: s.id, nome: s.nome, data: p.data, valor: p.valor ?? s.valor ?? null, mes, nota: p.nota, anterior: s.ultimoPagamento, anteriorMes: s.mesPago ?? null, criadoEm: agora };
        await gravar(CHAVE_PAGAMENTOS, registo);
        if (p.data >= s.ultimoPagamento) await gravar(CHAVE, { ...s, ultimoPagamento: p.data, mesPago: mes });
        return responder(res, 200, { pagamentos: [registo] });
      }

      const a = await lerUm(CHAVE_ALUNOS, p.refId);
      if (!a) return responder(res, 404, { erro: "Este menino já não existe. Atualize a lista." });
      const registos = p.meses.map((mes) => ({ id: novoId(), tipo: "propina", refId: a.id, nome: a.nome, data: p.data, valor: p.valores[mes] ?? p.valor ?? a.propina ?? null, mes, nota: p.nota, criadoEm: agora }));
      const args = registos.flatMap(({ id: rid, ...r }) => [rid, JSON.stringify(r)]);
      await redis("HSET", CHAVE_PAGAMENTOS, ...args);
      return responder(res, 200, { pagamentos: registos });
    }

    if (req.method === "DELETE") {
      if (!idValido(id)) return responder(res, 400, { erro: "Falta o id." });
      const r = await lerUm(CHAVE_PAGAMENTOS, id);
      if (!r) return responder(res, 200, { ok: true });
      await redis("HDEL", CHAVE_PAGAMENTOS, id);
      if (r.tipo === "servico") {
        const s = await lerUm(CHAVE, r.refId);
        if (s && s.ultimoPagamento === r.data) {
          // Repõe o último pagamento: o mais recente que sobra, ou o que havia antes deste.
          const resto = (await listarPagamentos()).filter((x) => x.tipo === "servico" && x.refId === s.id).map((x) => x.data);
          const anterior = [...resto, r.anterior].filter(Boolean).sort().pop();
          if (anterior) await gravar(CHAVE, { ...s, ultimoPagamento: anterior, mesPago: s.mesPago && s.mesPago === r.mes ? r.anteriorMes : s.mesPago });
        }
      }
      return responder(res, 200, { ok: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return responder(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
