// Corre todos os dias pelo agendador da Vercel (vercel.json -> crons).
// Também pode ser chamado pela app com o PIN e ?teste=1 para enviar um aviso de teste.
import { listarServicos, pinValido, vemDoCron, responder } from "./_lib.js";
import { hojeISO, calcular, fraseAviso, kz } from "../public/prazos-core.js";

export default async function handler(req, res) {
  const teste = new URL(req.url, "http://x").searchParams.get("teste") === "1";
  if (!vemDoCron(req) && !pinValido(req)) return responder(res, 401, { erro: "Não autorizado." });

  const topico = process.env.NTFY_TOPIC;
  if (!topico) return responder(res, 500, { erro: "Falta definir NTFY_TOPIC nas variáveis do projeto Vercel." });
  const servidor = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const fuso = process.env.FUSO_HORARIO || "Africa/Luanda";
  const hoje = hojeISO(fuso);
  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

  try {
    const lista = (await listarServicos())
      .map((s) => ({ s, c: calcular(s, hoje) }))
      .filter((x) => x.c.estado !== "ok")
      .sort((a, b) => a.c.faltam - b.c.faltam);

    if (!lista.length && !teste) return responder(res, 200, { enviado: false, motivo: "Nada a expirar nos próximos dias.", hoje });

    let titulo, mensagem, prioridade, tags;
    if (!lista.length) {
      titulo = "Prazos de Casa: teste";
      mensagem = "As notificações estão a funcionar. Não há nenhum prazo a terminar nos próximos dias.";
      prioridade = 3; tags = ["white_check_mark"];
    } else {
      const expirados = lista.filter((x) => x.c.faltam < 0).length;
      const urgente = lista.some((x) => x.c.faltam <= 1);
      titulo = (teste ? "[Teste] " : "") + (lista.length === 1
        ? fraseAviso(lista[0].s, lista[0].c).split(" (")[0]
        : `${lista.length} pagamentos a tratar${expirados ? ` (${expirados} expirado${expirados > 1 ? "s" : ""})` : ""}`);
      mensagem = lista.map(({ s, c }) => "• " + fraseAviso(s, c) + (kz(s.valor) ? ` ${kz(s.valor)}.` : "")).join("\n");
      prioridade = urgente ? 5 : 4;
      tags = [urgente ? "rotating_light" : "calendar"];
    }

    const r = await fetch(servidor, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
      body: JSON.stringify({ topic: topico, title: titulo, message: mensagem, priority: prioridade, tags, ...(site ? { click: site } : {}) }),
    });
    if (!r.ok) return responder(res, 502, { erro: `A ntfy recusou o envio (${r.status}).` });
    return responder(res, 200, { enviado: true, itens: lista.length, hoje });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
