// GET /api/dados -> tudo o que a app precisa: serviços, meninos, pagamentos, pastas e documentos.
// Na primeira vez, passa o histórico antigo guardado dentro de cada serviço para o histórico geral.
import { CHAVE, CHAVE_PAGAMENTOS, listarServicos, listarAlunos, listarPagamentos, listarPessoas, listarDocumentos, gravar, novoId, exigirPin, responder } from "./_lib.js";

export default async function handler(req, res) {
  if (!(await exigirPin(req, res))) return;
  try {
    let [servicos, alunos, pagamentos, pessoas, documentos] = await Promise.all([listarServicos(), listarAlunos(), listarPagamentos(), listarPessoas(), listarDocumentos()]);

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

    // Dos documentos só vão os metadados; o ficheiro pede-se à parte, com o PIN.
    documentos = documentos.map(({ url, pathname, ...meta }) => meta);
    responder(res, 200, { servicos, alunos, pagamentos, pessoas, documentos });
  } catch (e) {
    responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
