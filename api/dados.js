// GET /api/dados -> tudo o que a app precisa: serviços, meninos e histórico de pagamentos.
// Na primeira vez, passa o histórico antigo guardado dentro de cada serviço para o histórico geral.
import { CHAVE, CHAVE_PAGAMENTOS, listarServicos, listarAlunos, listarPagamentos, gravar, novoId, pinValido, responder } from "./_lib.js";

export default async function handler(req, res) {
  if (!process.env.FAMILIA_PIN) return responder(res, 500, { erro: "Falta definir FAMILIA_PIN nas variáveis do projeto Vercel." });
  if (!pinValido(req)) return responder(res, 401, { erro: "PIN errado." });
  try {
    let [servicos, alunos, pagamentos] = await Promise.all([listarServicos(), listarAlunos(), listarPagamentos()]);

    const antigos = servicos.filter((s) => Array.isArray(s.historico) && s.historico.length);
    for (const s of antigos) {
      for (const h of s.historico) {
        const r = { id: novoId(), tipo: "servico", refId: s.id, nome: s.nome, data: h.data, valor: h.valor ?? null, mes: h.mes ?? null, anterior: null, anteriorMes: null, criadoEm: new Date().toISOString() };
        await gravar(CHAVE_PAGAMENTOS, r);
        pagamentos.push(r);
      }
      s.historico = [];
      await gravar(CHAVE, s);
    }

    responder(res, 200, { servicos, alunos, pagamentos });
  } catch (e) {
    responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
