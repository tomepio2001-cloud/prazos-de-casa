// Lógica partilhada entre a app (browser) e o servidor (Vercel).
// Datas são tratadas como dias de calendário "AAAA-MM-DD", sem horas,
// para que mudanças de fuso ou de hora nunca desloquem um dia.

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const DAY = 86400000;
const toUTC = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };

/** Hoje (AAAA-MM-DD) num fuso horário, ex. "Africa/Luanda". Sem fuso: hora local do aparelho. */
export function hojeISO(timeZone) {
  const now = new Date();
  if (!timeZone) return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export const addDias = (iso, n) => fromUTC(toUTC(iso) + n * DAY);
export const diffDias = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export const dataCurta = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1].slice(0, 3)}`; };
export const dataLonga = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} de ${MESES[m - 1]}`; };
export const nomeMes = (ym) => { if (!ym) return ""; const [y, m] = ym.split("-").map(Number); return `${MESES[m - 1]} ${y}`; };
export const mesSeguinte = (ym) => { if (!ym) return null; let [y, m] = ym.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; };
export const kz = (v) => (typeof v === "number" && v > 0) ? new Intl.NumberFormat("pt-PT").format(v) + " Kz" : "";

/** Estado de um serviço em relação a "hoje". */
export function calcular(s, hoje) {
  const dias = Math.max(1, Number(s.dias) || 30);
  const aviso = Number(s.avisoDias) || 7;
  const fim = addDias(s.ultimoPagamento, dias);
  const faltam = diffDias(hoje, fim);
  const usados = Math.min(dias, Math.max(0, diffDias(s.ultimoPagamento, hoje)));
  const estado = faltam < 0 ? "crit" : faltam <= aviso ? "warn" : "ok";
  return { dias, aviso, fim, faltam, usados, estado, inicioAviso: addDias(fim, -aviso) };
}

/** Frase do aviso, em texto simples (usada na notificação e na app). */
export function fraseAviso(s, c) {
  const n = s.nome;
  if (c.faltam < 0) return `${n} expirou há ${-c.faltam} ${-c.faltam === 1 ? "dia" : "dias"} (terminou a ${dataLonga(c.fim)}).`;
  if (c.faltam === 0) return `${n} expira hoje (${dataLonga(c.fim)}).`;
  if (c.faltam === 1) return `O prazo de ${n} expira amanhã (${dataLonga(c.fim)}).`;
  return `O prazo de ${n} expira em ${c.faltam} dias (${dataLonga(c.fim)}).`;
}

/** Valida e normaliza um serviço vindo do browser. Devolve null se inválido. */
export function normalizar(b) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const nome = String(b?.nome ?? "").trim().slice(0, 60);
  const ultimoPagamento = String(b?.ultimoPagamento ?? "");
  const dias = parseInt(b?.dias, 10);
  if (!nome || !iso.test(ultimoPagamento) || !(dias >= 1 && dias <= 366)) return null;
  const avisoDias = Math.min(60, Math.max(1, parseInt(b?.avisoDias, 10) || 7));
  const mesPago = /^\d{4}-\d{2}$/.test(b?.mesPago ?? "") ? b.mesPago : null;
  const valor = Number(b?.valor) > 0 ? Number(b.valor) : null;
  const historico = Array.isArray(b?.historico)
    ? b.historico.filter((h) => h && iso.test(h.data)).slice(-24).map((h) => ({ data: h.data, valor: Number(h.valor) > 0 ? Number(h.valor) : null, mes: /^\d{4}-\d{2}$/.test(h.mes ?? "") ? h.mes : null }))
    : [];
  return { nome, ultimoPagamento, dias, avisoDias, mesPago, valor, historico };
}
