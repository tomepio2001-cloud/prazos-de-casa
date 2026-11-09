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

// ---------------------------------------------------------------------------
// Propinas e histórico de pagamentos
// ---------------------------------------------------------------------------

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const YM = /^\d{4}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11" + n meses. */
export function somaMeses(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
/** Último dia válido do mês para um "dia limite" (ex.: 31 em fevereiro → 28/29). */
export function dataLimite(ym, dia) {
  const [y, m] = ym.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}
export const nomeMesCurto = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MESES_CURTOS[m - 1]} ${y}`; };

/** Estado de um mês de propina de um menino. pagamentos = registos do tipo "propina" desse menino. */
export function estadoMesPropina(aluno, pagamentos, ym, hoje) {
  if (ym < aluno.inicio || (aluno.fim && ym > aluno.fim)) return { estado: "FORA", devido: 0, pago: 0, registos: [] };
  const registos = pagamentos.filter((p) => p.mes === ym);
  const pago = registos.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const devido = Number(aluno.propina) || 0;
  let estado;
  if (registos.length && (devido === 0 || pago >= devido)) estado = "PAGO";
  else if (registos.length) estado = "PARCIAL";
  else if (ym > hoje.slice(0, 7)) estado = "FUTURO";
  else estado = "PENDENTE";
  return { estado, devido, pago, registos };
}

/** Meses ainda por pagar (por ordem), a partir do início, até `quantos`. */
export function mesesPorPagar(aluno, pagamentos, hoje, quantos = 12) {
  const out = [];
  let ym = aluno.inicio;
  for (let i = 0; i < 120 && out.length < quantos; i++, ym = somaMeses(ym, 1)) {
    if (aluno.fim && ym > aluno.fim) break;
    const e = estadoMesPropina(aluno, pagamentos, ym, hoje);
    if (e.estado !== "PAGO") out.push({ mes: ym, ...e });
  }
  return out;
}

/** Avisos de propina: meses em atraso e o mês atual a vencer dentro da antecedência. */
export function avisoPropina(aluno, pagamentos, hoje) {
  const mesAtual = hoje.slice(0, 7);
  const dia = Number(aluno.diaLimite) || 10;
  const antecedencia = Number(aluno.avisoDias) || 7;
  const atrasados = [];
  let vence = null;
  for (const p of mesesPorPagar(aluno, pagamentos, hoje, 24)) {
    if (p.mes > mesAtual) break;
    const limite = dataLimite(p.mes, dia);
    const faltam = diffDias(hoje, limite);
    if (faltam < 0) atrasados.push(p.mes);
    else if (faltam <= antecedencia) vence = { mes: p.mes, limite, faltam };
  }
  return { atrasados, vence };
}

/** Lista única de avisos (serviços + propinas), já ordenada, com texto pronto. */
export function avisosGerais({ servicos = [], alunos = [], pagamentos = [], documentos = [], pessoas = [] }, hoje) {
  const out = avisosDocumentos(documentos, pessoas, hoje);
  for (const s of servicos) {
    const c = calcular(s, hoje);
    if (c.estado === "ok") continue;
    out.push({
      tipo: "servico", id: s.id, nivel: c.estado, ordem: c.faltam, numero: Math.abs(c.faltam),
      rotulo: c.faltam < 0 ? "atraso" : c.faltam === 1 ? "dia" : "dias",
      texto: fraseAviso(s, c),
    });
  }
  for (const a of alunos) {
    if (a.ativo === false) continue;
    const pags = pagamentos.filter((p) => p.tipo === "propina" && p.refId === a.id);
    const { atrasados, vence } = avisoPropina(a, pags, hoje);
    if (atrasados.length) {
      const n = atrasados.length;
      out.push({
        tipo: "propina", id: a.id, nivel: "crit", ordem: -100 - n, numero: n, rotulo: n === 1 ? "mês" : "meses",
        texto: `Propina de ${a.nome}: ${n} ${n === 1 ? "mês" : "meses"} em atraso (${atrasados.map((m) => MESES[Number(m.slice(5)) - 1]).join(", ")}).`,
      });
    }
    if (vence) {
      const mes = MESES[Number(vence.mes.slice(5)) - 1];
      const quando = vence.faltam === 0 ? "vence hoje" : vence.faltam === 1 ? "vence amanhã" : `vence em ${vence.faltam} dias`;
      out.push({
        tipo: "propina", id: a.id, nivel: "warn", ordem: vence.faltam, numero: vence.faltam, rotulo: vence.faltam === 1 ? "dia" : "dias",
        texto: `Propina de ${a.nome} (${mes}) ${quando} (${dataLonga(vence.limite)}).`,
      });
    }
  }
  return out.sort((x, y) => x.ordem - y.ordem);
}

/** Valida um menino vindo do browser. */
export function normalizarAluno(b) {
  const nome = String(b?.nome ?? "").trim().slice(0, 60);
  const inicio = String(b?.inicio ?? "");
  if (!nome || !YM.test(inicio)) return null;
  const fim = YM.test(b?.fim ?? "") && b.fim >= inicio ? b.fim : null;
  return {
    nome, inicio, fim,
    escola: String(b?.escola ?? "").trim().slice(0, 60) || null,
    classe: String(b?.classe ?? "").trim().slice(0, 30) || null,
    propina: Number(b?.propina) > 0 ? Number(b.propina) : null,
    diaLimite: Math.min(31, Math.max(1, parseInt(b?.diaLimite, 10) || 10)),
    avisoDias: Math.min(30, Math.max(1, parseInt(b?.avisoDias, 10) || 7)),
    ativo: b?.ativo !== false,
  };
}

/** Valida um pagamento vindo do browser (sem id nem nome: o servidor completa). */
export function normalizarPagamento(b) {
  const tipo = b?.tipo === "propina" ? "propina" : b?.tipo === "servico" ? "servico" : null;
  const data = String(b?.data ?? "");
  const refId = String(b?.refId ?? "");
  if (!tipo || !ISO.test(data) || !/^[\w-]{1,40}$/.test(refId)) return null;
  const valor = Number(b?.valor) > 0 ? Number(b.valor) : null;
  const nota = String(b?.nota ?? "").trim().slice(0, 120) || null;
  if (tipo === "propina") {
    const meses = [...new Set(Array.isArray(b?.meses) ? b.meses.filter((m) => YM.test(m)) : [])].sort();
    if (!meses.length || meses.length > 12) return null;
    // Valor próprio por mês (ex.: o resto de um mês parcial); senão usa `valor`.
    const valores = {};
    if (b?.valores && typeof b.valores === "object") for (const m of meses) if (Number(b.valores[m]) > 0) valores[m] = Number(b.valores[m]);
    return { tipo, refId, data, valor, nota, meses, valores };
  }
  return { tipo, refId, data, valor, nota };
}

// ---------------------------------------------------------------------------
// Documentos da família (pastas por pessoa)
// ---------------------------------------------------------------------------

export const PAPEIS = { pai: "Pai", mae: "Mãe", filho: "Filho(a)", outro: "Outro" };
export const CATEGORIAS_DOC = ["BI", "Passaporte", "Académico", "Saúde", "Outro"];
export const TIPOS_FICHEIRO = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const TAMANHO_MAX = 4 * 1024 * 1024; // 4 MB (limite de pedido das funções da Vercel é 4,5 MB)
export const AVISO_DOC_DIAS = 30;

export function normalizarPessoa(b) {
  const nome = String(b?.nome ?? "").trim().slice(0, 60);
  if (!nome) return null;
  const papel = Object.hasOwn(PAPEIS, b?.papel) ? b.papel : "outro";
  const alunoId = /^[\w-]{1,40}$/.test(b?.alunoId ?? "") ? b.alunoId : null;
  return { nome, papel, alunoId };
}

/** Metadados de um documento (o ficheiro em si é guardado à parte). */
export function normalizarDocumento(b) {
  const titulo = String(b?.titulo ?? "").trim().slice(0, 80);
  const pessoaId = String(b?.pessoaId ?? "");
  if (!titulo || !/^[\w-]{1,40}$/.test(pessoaId)) return null;
  return {
    titulo, pessoaId,
    categoria: CATEGORIAS_DOC.includes(b?.categoria) ? b.categoria : "Outro",
    numero: String(b?.numero ?? "").trim().slice(0, 40) || null,
    validade: ISO.test(b?.validade ?? "") ? b.validade : null,
    nota: String(b?.nota ?? "").trim().slice(0, 200) || null,
  };
}

/** Avisos de documentos a expirar (≤ 30 dias) ou expirados. */
export function avisosDocumentos(documentos, pessoas, hoje) {
  const out = [];
  for (const d of documentos) {
    if (!d.validade) continue;
    const faltam = diffDias(hoje, d.validade);
    if (faltam > AVISO_DOC_DIAS) continue;
    const dono = pessoas.find((p) => p.id === d.pessoaId)?.nome;
    const nome = `${d.titulo}${dono ? ` de ${dono}` : ""}`;
    out.push(faltam < 0
      ? { tipo: "documento", id: d.id, nivel: "crit", ordem: -50, numero: -faltam, rotulo: -faltam === 1 ? "dia" : "dias", texto: `${nome} expirou há ${-faltam} ${-faltam === 1 ? "dia" : "dias"} (${dataLonga(d.validade)}).` }
      : { tipo: "documento", id: d.id, nivel: "warn", ordem: faltam, numero: faltam, rotulo: faltam === 1 ? "dia" : "dias", texto: `${nome} expira ${faltam === 0 ? "hoje" : faltam === 1 ? "amanhã" : `em ${faltam} dias`} (${dataLonga(d.validade)}).` });
  }
  return out;
}
