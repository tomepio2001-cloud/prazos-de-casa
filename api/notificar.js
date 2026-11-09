// Corre todos os dias pelo agendador da Vercel (vercel.json -> crons).
// Também pode ser chamado pela app com o PIN e ?teste=1 para enviar um aviso de teste.
import { listarServicos, listarAlunos, listarPagamentos, exigirPin, vemDoCron, registarEnvio, responder } from "./_lib.js";
import { hojeISO, avisosGerais } from "../public/prazos-core.js";

export default async function handler(req, res) {
  const teste = new URL(req.url, "http://x").searchParams.get("teste") === "1";
  const doCron = vemDoCron(req);
  if (!doCron && !req.headers["x-pin"]) {
    // O agendador da Vercel identifica-se assim; se chegou aqui, o CRON_SECRET falta ou não coincide.
    if (String(req.headers["user-agent"] || "").startsWith("vercel-cron")) {
      await registarEnvio({ ok: false, motivo: process.env.CRON_SECRET ? "O agendador foi recusado: o CRON_SECRET não coincide. Volte a gravá-lo na Vercel e faça Redeploy." : "O agendador foi recusado: falta a variável CRON_SECRET na Vercel." });
    }
    return responder(res, 401, { erro: "Não autorizado." });
  }
  if (!doCron && !(await exigirPin(req, res))) return;
  const auto = doCron && !teste;

  const topico = process.env.NTFY_TOPIC;
  if (!topico) return responder(res, 500, { erro: "Falta definir NTFY_TOPIC nas variáveis do projeto Vercel." });
  const servidor = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const fuso = process.env.FUSO_HORARIO || "Africa/Luanda";
  const hoje = hojeISO(fuso);
  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;

  try {
    const [servicos, alunos, pagamentos] = await Promise.all([listarServicos(), listarAlunos(), listarPagamentos()]);
    const lista = avisosGerais({ servicos, alunos, pagamentos }, hoje);

    if (!lista.length && !teste) {
      if (auto) await registarEnvio({ ok: true, enviado: false, itens: 0, motivo: "Não havia prazos nem propinas dentro da janela de aviso." });
      return responder(res, 200, { enviado: false, motivo: "Nada a expirar nos próximos dias.", hoje });
    }

    let titulo, mensagem, prioridade, tags;
    if (!lista.length) {
      titulo = "Prazos de Casa: teste";
      mensagem = "As notificações estão a funcionar. Não há nenhum prazo a terminar nos próximos dias.";
      prioridade = 3; tags = ["white_check_mark"];
    } else {
      const atrasos = lista.filter((x) => x.nivel === "crit").length;
      const urgente = atrasos > 0 || lista.some((x) => x.tipo === "servico" ? x.ordem <= 1 : x.numero <= 1);
      titulo = (teste ? "[Teste] " : "") + (lista.length === 1
        ? lista[0].texto.split(" (")[0]
        : `${lista.length} pagamentos a tratar${atrasos ? ` (${atrasos} em atraso)` : ""}`);
      mensagem = lista.map((x) => "• " + x.texto).join("\n");
      prioridade = urgente ? 5 : 4;
      tags = [urgente ? "rotating_light" : "calendar"];
    }

    const r = await fetch(servidor, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
      body: JSON.stringify({ topic: topico, title: titulo, message: mensagem, priority: prioridade, tags, ...(site ? { click: site } : {}) }),
    });
    if (!r.ok) {
      if (auto) await registarEnvio({ ok: false, motivo: `A ntfy recusou o envio (${r.status}).` });
      return responder(res, 502, { erro: `A ntfy recusou o envio (${r.status}).` });
    }
    if (auto) await registarEnvio({ ok: true, enviado: true, itens: lista.length });
    return responder(res, 200, { enviado: true, itens: lista.length, hoje });
  } catch (e) {
    if (auto) await registarEnvio({ ok: false, motivo: e.message || "Erro inesperado." });
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
