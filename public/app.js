import {
  hojeISO, calcular, dataCurta, dataLonga, nomeMes, addDias, kz, MESES, MESES_CURTOS,
  estadoMesPropina, mesesPorPagar, avisosGerais, dataLimite, nomeMesCurto,
  PAPEIS, TAMANHO_MAX,
} from "/prazos-core.js";

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};
const num = (v) => (typeof v === "number" && v > 0 ? new Intl.NumberFormat("pt-PT").format(v) : "");
const mesNome = (ym) => MESES[Number(ym.slice(5)) - 1];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

let pin = store.get("prazos.pin");
let D = { servicos: [], alunos: [], pagamentos: [], pessoas: [], documentos: [] };
let ultimoJSON = "";
let loaded = false;

// Estado da interface
const hoje0 = hojeISO();
const UI = {
  vista: "MENSAL",
  ano: hoje0.slice(0, 4),
  mes: hoje0.slice(5, 7),
  aluno: "TODOS",
  sit: "TODAS",
  hPeriodo: hoje0.slice(0, 4),
  hRef: "TUDO",
  hBusca: "",
  pasta: null,
};

// ---------- API ----------
class ErroPin extends Error {}
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", "x-pin": pin || "", ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new ErroPin(j.erro || "PIN errado.");
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}

function status(msg) {
  $("status").textContent = msg;
  if (msg) setTimeout(() => { if ($("status").textContent === msg) $("status").textContent = ""; }, 7000);
}

function semPin(msg) {
  pin = null; store.del("prazos.pin");
  $("app").hidden = true; $("gate").hidden = false;
  $("pinErr").textContent = msg || "";
  $("pin").focus();
}

async function carregar() {
  try {
    const dados = await api("/api/dados");
    const novo = { servicos: dados.servicos || [], alunos: dados.alunos || [], pagamentos: dados.pagamentos || [], pessoas: dados.pessoas || [], documentos: dados.documentos || [] };
    const json = JSON.stringify(novo);
    if (loaded && json === ultimoJSON) return; // nada mudou: não redesenha
    D = novo; ultimoJSON = json; loaded = true;
    store.set("prazos.cache2", json);
    render();
  } catch (e) {
    if (e instanceof ErroPin) return semPin(e.message);
    const cache = store.get("prazos.cache2");
    if (cache) { try { D = JSON.parse(cache); loaded = true; render(); } catch { } }
    status(navigator.onLine === false ? "Sem internet: a mostrar a última informação guardada neste aparelho." : "Não foi possível atualizar: " + e.message);
  }
}

async function guardar(fn, okMsg) {
  try { await fn(); status(okMsg); await carregar(); return true; }
  catch (e) { if (e instanceof ErroPin) semPin(e.message); else status("Não foi possível guardar: " + e.message); return false; }
}

// ---------- Abas ----------
const TABS = ["prazos", "propinas", "historico", "documentos"];
function abaAtual() { const h = location.hash.slice(1); return TABS.includes(h) ? h : "prazos"; }
function mostrarAba() {
  const t = abaAtual();
  for (const n of TABS) {
    $("tab-" + n).hidden = n !== t;
    document.querySelector(`[data-tab="${n}"]`).setAttribute("aria-current", n === t ? "page" : "false");
  }
}
window.addEventListener("hashchange", () => { mostrarAba(); window.scrollTo({ top: 0 }); });

// ---------- Render geral ----------
function render() {
  const hoje = hojeISO();
  const d = new Date();
  $("today").textContent = `Hoje, ${d.toLocaleDateString("pt-PT", { weekday: "long" })}, ${dataLonga(hoje)} de ${d.getFullYear()}`;
  if (!loaded) return;
  renderPrazos(hoje);
  renderPropinas(hoje);
  renderHistorico();
  renderDocumentos();
}

const pagsDe = (tipo, refId) => D.pagamentos.filter((p) => p.tipo === tipo && p.refId === refId);

// ---------- PRAZOS ----------
function renderPrazos(hoje) {
  const avisos = avisosGerais(D, hoje);
  const nProp = avisos.filter((a) => a.tipo === "propina").length;
  $("dotPrazos").hidden = !avisos.length; $("dotPrazos").textContent = avisos.length;
  $("dotPropinas").hidden = !nProp; $("dotPropinas").textContent = nProp;

  const A = $("alerts");
  const rows = D.servicos.map((s) => ({ s, c: calcular(s, hoje) })).sort((a, b) => a.c.faltam - b.c.faltam);
  if (!rows.length && !D.alunos.length) A.innerHTML = `<p class="calm">Ainda não há serviços nem meninos. Adicione o primeiro serviço (por exemplo a Internet) ou registe os meninos na aba <a href="#propinas">Propinas</a>.</p>`;
  else if (!avisos.length) {
    const n = rows[0];
    A.innerHTML = `<p class="calm">Nada a pagar esta semana.${n ? ` O próximo serviço é <b>${esc(n.s.nome)}</b>, a ${dataLonga(n.c.fim)} (daqui a ${n.c.faltam} dias).` : ""}</p>`;
  } else {
    A.innerHTML = avisos.map((a) => {
      const i = a.texto.indexOf(" (");
      const main = i > 0 ? a.texto.slice(0, i) + "." : a.texto;
      const sub = i > 0 ? a.texto.slice(i + 1) : "";
      return `<div class="alert ${a.nivel}"><div class="count">${a.numero}<small>${esc(a.rotulo)}</small></div>
        <p>${esc(main)}<br><span class="sub">${esc(sub)}</span></p>
        <button class="btn-ghost" type="button" data-pagar-${a.tipo}="${esc(a.id)}">${a.tipo === "servico" ? "Paguei" : "Pagar propina"}</button></div>`;
    }).join("");
  }

  const L = $("list");
  if (!rows.length) { L.innerHTML = `<div class="empty">Sem serviços registados.<br>Toque em <b>+ Adicionar serviço</b> para começar.</div>`; return; }
  L.innerHTML = rows.map(({ s, c }) => {
    const chip = c.estado === "crit" ? `<span class="chip crit">Expirado</span>` : c.estado === "warn" ? `<span class="chip warn">A expirar</span>` : `<span class="chip ok">Em dia</span>`;
    const ref = s.mesPago ? ` · mês pago: ${nomeMes(s.mesPago)}` : "";
    const ticks = Array.from({ length: c.dias }, (_, i) => {
      const cls = [];
      if (i < c.usados) cls.push("used");
      if (i === c.usados && c.faltam >= 0) cls.push("today");
      if (i >= c.dias - c.aviso) cls.push("win");
      return `<i class="${cls.join(" ")}"></i>`;
    }).join("");
    const nPags = pagsDe("servico", s.id).length;
    const leftU = c.faltam < 0 ? "dias em atraso" : c.faltam === 1 ? "dia restante" : "dias restantes";
    return `<div class="row ${c.estado}">
      <div class="info"><div class="name">${esc(s.nome)} ${chip}</div>
        <div class="meta">Pago a ${dataCurta(s.ultimoPagamento)} · ciclo de ${c.dias} dias · termina a ${dataCurta(c.fim)}${ref}${kz(s.valor) ? " · " + kz(s.valor) : ""}</div></div>
      <div class="left"><span class="n">${Math.abs(c.faltam)}</span><span class="u">${leftU}</span></div>
      <div class="meter" aria-hidden="true">${ticks}</div>
      <div class="scale" aria-hidden="true"><span>${dataCurta(s.ultimoPagamento)}</span><span>aviso a ${dataCurta(c.inicioAviso)}</span><span>${dataCurta(c.fim)}</span></div>
      <div class="actions">
        <button class="btn-ghost" type="button" data-pagar-servico="${esc(s.id)}">Paguei</button>
        <button class="btn-ghost" type="button" data-edit="${esc(s.id)}">Editar</button>
        ${nPags ? `<button class="btn-ghost" type="button" data-hist="servico:${esc(s.id)}">Histórico (${nPags})</button>` : ""}
      </div></div>`;
  }).join("");
}

// ---------- PROPINAS ----------
function badge(estado, attrs = "") {
  const map = { PAGO: ["b-pago", "PAGO"], PENDENTE: ["b-pend", "PEND."], PARCIAL: ["b-parc", "PARC."], FUTURO: ["b-fut", "FUT."], FORA: ["b-fora", "—"] };
  const [cls, lbl] = map[estado];
  if (estado === "FORA") return `<span class="badge ${cls}">${lbl}</span>`;
  return `<button type="button" class="badge ${cls}" ${attrs}>${lbl}</button>`;
}

function preencherFiltrosPropinas() {
  const anoAtual = Number(hojeISO().slice(0, 4));
  const anos = new Set([anoAtual - 1, anoAtual, anoAtual + 1]);
  D.alunos.forEach((a) => { anos.add(Number(a.inicio.slice(0, 4))); if (a.fim) anos.add(Number(a.fim.slice(0, 4))); });
  const lista = [...anos].sort((a, b) => b - a);
  $("fAno").innerHTML = lista.map((a) => `<option value="${a}">Ano ${a}</option>`).join("");
  $("fAno").value = UI.ano;
  $("fMes").innerHTML = MESES.map((m, i) => `<option value="${String(i + 1).padStart(2, "0")}">${cap(m)}</option>`).join("");
  $("fMes").value = UI.mes;
  $("fMes").hidden = UI.vista !== "MENSAL";
  $("fAluno").innerHTML = `<option value="TODOS">Todos os meninos</option>` + D.alunos.map((a) => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join("");
  $("fAluno").value = D.alunos.some((a) => a.id === UI.aluno) ? UI.aluno : "TODOS";
  $("fSit").value = UI.sit;
  $("vMensal").setAttribute("aria-pressed", UI.vista === "MENSAL");
  $("vAnual").setAttribute("aria-pressed", UI.vista === "ANUAL");
}

function renderPropinas(hoje) {
  preencherFiltrosPropinas();
  const alunos = D.alunos.filter((a) => UI.aluno === "TODOS" || a.id === UI.aluno);
  const meses12 = Array.from({ length: 12 }, (_, i) => `${UI.ano}-${String(i + 1).padStart(2, "0")}`);
  const linhas = alunos.map((a) => {
    const pags = pagsDe("propina", a.id);
    const estados = Object.fromEntries(meses12.map((m) => [m, estadoMesPropina(a, pags, m, hoje)]));
    const vals = Object.values(estados);
    const pagoAno = vals.reduce((s, e) => s + e.pago, 0);
    const dividaAno = vals.filter((e) => e.estado === "PENDENTE" || e.estado === "PARCIAL").reduce((s, e) => s + Math.max(0, e.devido - e.pago), 0);
    return {
      a, pags, estados, pagoAno, dividaAno,
      nPago: vals.filter((e) => e.estado === "PAGO").length,
      nPend: vals.filter((e) => e.estado === "PENDENTE").length,
      nParc: vals.filter((e) => e.estado === "PARCIAL").length,
      proximo: mesesPorPagar(a, pags, hoje, 1)[0],
    };
  });

  // Resumo
  const tot = (k) => linhas.reduce((s, l) => s + l[k], 0);
  $("kpisPropinas").innerHTML = `
    <div class="kpi"><span>Meninos</span><b>${alunos.length}</b></div>
    <div class="kpi ok"><span>Meses pagos ${UI.ano}</span><b>${tot("nPago")}</b></div>
    <div class="kpi crit"><span>Pendentes</span><b>${tot("nPend")}</b></div>
    <div class="kpi warn"><span>Parciais</span><b>${tot("nParc")}</b></div>
    <div class="kpi ok"><span>Total pago ${UI.ano}</span><b>${num(tot("pagoAno")) || 0} Kz</b></div>
    <div class="kpi crit"><span>Em dívida ${UI.ano}</span><b>${num(tot("dividaAno")) || 0} Kz</b></div>`;

  const T = $("tblPropinas");
  if (!D.alunos.length) {
    T.innerHTML = `<div class="empty">Ainda não há meninos registados.<br>Toque em <b>+ Adicionar menino</b> para começar: nome, propina mensal e o mês em que começam as propinas.</div>`;
    $("footPropinas").textContent = "";
  } else if (UI.vista === "MENSAL") {
    const ym = `${UI.ano}-${UI.mes}`;
    const vis = linhas.filter((l) => {
      const e = l.estados[ym];
      if (e.estado === "FORA") return false;
      if (UI.sit === "PAGO") return e.estado === "PAGO";
      if (UI.sit === "DIVIDA") return e.estado === "PENDENTE" || e.estado === "PARCIAL";
      return true;
    });
    T.innerHTML = `<table><thead><tr>
        <th class="sticky">Menino</th><th class="num">Valor devido</th><th class="num">Valor pago</th><th class="num">Saldo</th><th>Data limite</th><th class="c">Estado</th><th></th>
      </tr></thead><tbody>${vis.length ? vis.map((l) => {
        const e = l.estados[ym];
        const saldo = Math.max(0, e.devido - e.pago);
        const pagoEm = e.registos.map((r) => dataCurta(r.data)).join(", ");
        return `<tr>
          <td class="sticky who"><b>${esc(l.a.nome)}</b><small>${esc([l.a.escola, l.a.classe].filter(Boolean).join(" · ") || "—")}</small></td>
          <td class="num">${num(e.devido) || "—"}</td>
          <td class="num green">${num(e.pago) || "—"}</td>
          <td class="num ${saldo > 0 && e.estado !== "FUTURO" ? "red" : ""}">${e.estado === "PAGO" ? "0" : num(saldo) || "—"}</td>
          <td>${e.estado === "PAGO" ? `<span class="muted">pago a ${esc(pagoEm)}</span>` : dataCurta(dataLimite(ym, l.a.diaLimite || 10))}</td>
          <td class="c">${badge(e.estado, `data-cel="${esc(l.a.id)}|${ym}"`)}</td>
          <td>${e.estado !== "PAGO" ? `<button class="btn-ghost" type="button" style="padding:4px 10px;font-size:12px" data-cel="${esc(l.a.id)}|${ym}">Pagar</button>` : ""}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="7" class="empty">Nenhum menino com propina em ${mesNome(ym)} de ${UI.ano} para este filtro.</td></tr>`}</tbody></table>`;
    $("footPropinas").textContent = `${cap(mesNome(ym))} de ${UI.ano} · ${vis.length} ${vis.length === 1 ? "menino" : "meninos"}`;
  } else {
    const vis = linhas.filter((l) => {
      if (UI.sit === "PAGO") return l.nPend + l.nParc === 0 && l.nPago > 0;
      if (UI.sit === "DIVIDA") return l.nPend + l.nParc > 0;
      return true;
    });
    T.innerHTML = `<table><thead><tr>
        <th class="sticky">Menino</th>${MESES_CURTOS.map((m) => `<th class="c">${m}</th>`).join("")}<th class="num">Total pago</th><th class="num">Em dívida</th><th>Próximo a pagar</th>
      </tr></thead><tbody>${vis.length ? vis.map((l) => `<tr>
        <td class="sticky who"><b>${esc(l.a.nome)}</b><small>${num(l.a.propina) ? num(l.a.propina) + " Kz/mês" : "—"}</small></td>
        ${meses12.map((m) => `<td class="c">${badge(l.estados[m].estado, `data-cel="${esc(l.a.id)}|${m}" title="${esc(cap(mesNome(m)))}${l.estados[m].pago ? ": pago " + num(l.estados[m].pago) + " Kz" : ""}"`)}</td>`).join("")}
        <td class="num green">${num(l.pagoAno) || "0"}</td>
        <td class="num">${l.dividaAno > 0 ? `<span class="red">${num(l.dividaAno)}</span>` : `<span class="muted">Em dia</span>`}</td>
        <td>${l.proximo ? cap(nomeMesCurto(l.proximo.mes)) : `<span class="muted">Tudo pago</span>`}</td>
      </tr>`).join("") : `<tr><td colspan="16" class="empty">Nenhum menino para este filtro.</td></tr>`}</tbody></table>`;
    $("footPropinas").textContent = `Mapa de ${UI.ano} · ${vis.length} ${vis.length === 1 ? "menino" : "meninos"}`;
  }

  // Cartões dos meninos
  const K = $("kids");
  K.innerHTML = D.alunos.length ? D.alunos.map((a) => {
    const pags = pagsDe("propina", a.id);
    const prox = mesesPorPagar(a, pags, hoje, 1)[0];
    const atras = mesesPorPagar(a, pags, hoje, 24).filter((p) => p.mes <= hoje.slice(0, 7) && dataLimite(p.mes, a.diaLimite || 10) < hoje).length;
    return `<div class="kid">
      <h3>${esc(a.nome)}</h3>
      <p>${esc([a.escola, a.classe].filter(Boolean).join(" · ") || "Sem escola indicada")}</p>
      <p>${num(a.propina) ? num(a.propina) + " Kz por mês" : "Valor da propina por indicar"} · até dia ${a.diaLimite || 10}</p>
      <p>${cap(nomeMesCurto(a.inicio))} – ${a.fim ? cap(nomeMesCurto(a.fim)) : "sem fim"}</p>
      <p class="next">${prox ? `Próximo a pagar: <b>${cap(mesNome(prox.mes))} ${prox.mes.slice(0, 4)}</b>${atras ? ` · <span class="red">${atras} em atraso</span>` : ""}` : "<b class='green'>Tudo pago</b>"}</p>
      <div class="row-btns">
        ${prox ? `<button class="btn-ghost" type="button" data-pagar-propina="${esc(a.id)}">Pagar</button>` : ""}
        <button class="btn-ghost" type="button" data-edit-aluno="${esc(a.id)}">Editar</button>
        ${pags.length ? `<button class="btn-ghost" type="button" data-hist="propina:${esc(a.id)}">Histórico (${pags.length})</button>` : ""}
      </div></div>`;
  }).join("") : `<p class="calm">Registe cada menino uma vez. Depois a app sabe que mês vem a seguir e avisa antes do dia limite.</p>`;
}

// ---------- HISTÓRICO ----------
function refsHistorico() {
  const m = new Map();
  for (const s of D.servicos) m.set(`servico:${s.id}`, s.nome);
  for (const a of D.alunos) m.set(`propina:${a.id}`, `Propinas · ${a.nome}`);
  for (const p of D.pagamentos) {
    const k = `${p.tipo}:${p.refId}`;
    if (!m.has(k)) m.set(k, p.tipo === "propina" ? `Propinas · ${p.nome}` : `${p.nome}`);
  }
  return m;
}

function preencherFiltrosHistorico() {
  const anoAtual = Number(hojeISO().slice(0, 4));
  const anos = new Set([anoAtual, anoAtual - 1]);
  D.pagamentos.forEach((p) => anos.add(Number(p.data.slice(0, 4))));
  const lista = [...anos].sort((a, b) => b - a);
  let html = `<option value="TUDO">Todo o período</option>`;
  for (const ano of lista) {
    html += `<optgroup label="${ano}"><option value="${ano}">Ano ${ano} (completo)</option>`;
    for (let i = 0; i < 12; i++) {
      if (ano === anoAtual && i > new Date().getMonth()) break;
      const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
      html += `<option value="${ym}">${cap(MESES[i])} ${ano}</option>`;
    }
    html += `</optgroup>`;
  }
  $("hPeriodo").innerHTML = html;
  $("hPeriodo").value = UI.hPeriodo;
  if ($("hPeriodo").value !== UI.hPeriodo) { UI.hPeriodo = String(anoAtual); $("hPeriodo").value = UI.hPeriodo; }
  const refs = refsHistorico();
  $("hRef").innerHTML = `<option value="TUDO">Todos os pagamentos</option><option value="T:servico">Só serviços</option><option value="T:propina">Só propinas</option>` +
    [...refs].map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join("");
  $("hRef").value = refs.has(UI.hRef) || UI.hRef.startsWith("T:") ? UI.hRef : "TUDO";
}

const descricao = (p) => p.tipo === "propina" ? `Propina · ${p.nome}` : p.nome;
const detalhe = (p) => p.tipo === "propina" ? `Mês de ${mesNome(p.mes)} ${p.mes.slice(0, 4)}` : (p.mes ? `Mês pago: ${nomeMes(p.mes)}` : "");

function filtrarRef(p) {
  if (UI.hRef === "TUDO") return true;
  if (UI.hRef.startsWith("T:")) return p.tipo === UI.hRef.slice(2);
  return `${p.tipo}:${p.refId}` === UI.hRef;
}

function renderHistorico() {
  preencherFiltrosHistorico();
  const per = UI.hPeriodo;
  const busca = UI.hBusca.trim().toLowerCase();
  const noPer = (p) => per === "TUDO" || p.data.startsWith(per);
  const base = D.pagamentos.filter(filtrarRef).filter((p) => !busca || (descricao(p) + " " + (p.nota || "")).toLowerCase().includes(busca));
  const vis = base.filter(noPer).sort((a, b) => (b.data + (b.criadoEm || "")).localeCompare(a.data + (a.criadoEm || "")));

  const soma = (arr) => arr.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const servs = vis.filter((p) => p.tipo === "servico"), props = vis.filter((p) => p.tipo === "propina");
  $("kpisHist").innerHTML = `
    <div class="kpi"><span>Pagamentos</span><b>${vis.length}</b></div>
    <div class="kpi ok"><span>Total pago</span><b>${num(soma(vis)) || 0} Kz</b></div>
    <div class="kpi"><span>Serviços</span><b>${num(soma(servs)) || 0} Kz</b></div>
    <div class="kpi"><span>Propinas</span><b>${num(soma(props)) || 0} Kz</b></div>`;

  // Mapa anual: uma linha por serviço/menino, uma coluna por mês (data do pagamento)
  const ano = per === "TUDO" ? hojeISO().slice(0, 4) : per.slice(0, 4);
  $("hMapaTitulo").textContent = `Mapa anual ${ano}`;
  const refs = refsHistorico();
  const doAno = base.filter((p) => p.data.startsWith(ano));
  const atual = (k) => D.servicos.some((s) => `servico:${s.id}` === k) || D.alunos.some((a) => `propina:${a.id}` === k);
  const chaves = [...refs.keys()]
    .filter((k) => doAno.some((p) => `${p.tipo}:${p.refId}` === k) || atual(k))
    .filter((k) => UI.hRef === "TUDO" || (UI.hRef.startsWith("T:") ? k.startsWith(UI.hRef.slice(2) + ":") : k === UI.hRef));
  const totMes = Array(12).fill(0);
  const linhas = chaves.map((k) => {
    const ps = doAno.filter((p) => `${p.tipo}:${p.refId}` === k);
    const cel = Array.from({ length: 12 }, (_, i) => {
      const m = ps.filter((p) => Number(p.data.slice(5, 7)) === i + 1);
      const v = soma(m); totMes[i] += v;
      if (!m.length) return `<td class="cell"><span class="muted">·</span></td>`;
      const ym = `${ano}-${String(i + 1).padStart(2, "0")}`;
      return `<td class="cell"><button type="button" data-hmes="${ym}" data-href="${esc(k)}" title="${m.length} pagamento(s)">${v ? num(v) : "✓"}${m.length > 1 ? ` <span class="cnt">×${m.length}</span>` : ""}</button></td>`;
    }).join("");
    return `<tr><td class="sticky who"><b>${esc(refs.get(k))}</b></td>${cel}<td class="num green">${num(soma(ps)) || "—"}</td></tr>`;
  });
  $("tblHist").innerHTML = linhas.length
    ? `<table><thead><tr><th class="sticky">Serviço / menino</th>${MESES_CURTOS.map((m) => `<th class="c">${m}</th>`).join("")}<th class="num">Total ${ano}</th></tr></thead>
       <tbody>${linhas.join("")}</tbody>
       <tfoot><tr><td class="sticky who"><b>Total do mês</b></td>${totMes.map((v) => `<td class="cell"><b>${v ? num(v) : ""}</b></td>`).join("")}<td class="num"><b>${num(totMes.reduce((a, b) => a + b, 0)) || "—"}</b></td></tr></tfoot></table>`
    : `<div class="empty">Sem pagamentos em ${ano}.</div>`;

  // Lista cronológica agrupada por mês. Propinas pagas de uma vez (mesmo menino, mesmo registo) ficam numa só linha.
  const descPer = per === "TUDO" ? "todo o período" : per.length === 4 ? `${per}` : `${mesNome(per)} de ${per.slice(0, 4)}`;
  $("hListaTitulo").textContent = `Pagamentos · ${descPer}`;
  const lotes = [];
  const porChave = new Map();
  for (const p of vis) {
    const k = p.tipo === "propina" ? `${p.refId}|${p.data}|${p.criadoEm || p.id}` : p.id;
    let l = porChave.get(k);
    if (!l) { l = { ...p, ids: [], meses: [], total: 0 }; porChave.set(k, l); lotes.push(l); }
    l.ids.push(p.id); if (p.mes) l.meses.push(p.mes); l.total += Number(p.valor) || 0;
  }
  const detalheLote = (l) => {
    if (l.tipo !== "propina") return detalhe(l);
    const ms = [...l.meses].sort();
    if (ms.length === 1) return `Mês de ${mesNome(ms[0])} ${ms[0].slice(0, 4)}`;
    const nome = (m) => cap(nomeMesCurto(m));
    return ms.length <= 3 ? `${ms.length} meses: ${ms.map(nome).join(", ")}` : `${ms.length} meses: ${nome(ms[0])} a ${nome(ms[ms.length - 1])}`;
  };
  const grupos = new Map();
  for (const l of lotes) { const k = l.data.slice(0, 7); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l); }
  $("listaHist").innerHTML = lotes.length ? [...grupos].map(([ym, ls]) => {
    const t = ls.reduce((s, l) => s + l.total, 0);
    return `<div class="mgroup">
      <h3>${cap(mesNome(ym))} ${ym.slice(0, 4)} <span>${ls.length} ${ls.length === 1 ? "pagamento" : "pagamentos"}${t ? " · " + num(t) + " Kz" : ""}</span></h3>
      ${ls.map((l) => `<div class="pay">
        <span class="d">${dataCurta(l.data)}</span>
        <span class="t"><span class="tag ${l.tipo === "propina" ? "p" : ""}">${l.tipo === "propina" ? "Propina" : "Serviço"}</span>${esc(l.nome)}
          <small>${esc([detalheLote(l), l.nota].filter(Boolean).join(" · "))}</small></span>
        <span class="v">${l.total ? num(l.total) + " Kz" : "—"}</span>
        <span class="x-wrap" data-anular-wrap="${esc(l.ids.join(","))}"><button type="button" class="btn-ghost x" data-anular="${esc(l.ids.join(","))}" data-n="${l.ids.length}">Anular</button></span>
      </div>`).join("")}</div>`;
  }).join("")
    : `<div class="empty">Sem pagamentos em ${descPer}${UI.hRef !== "TUDO" ? " para este filtro" : ""}.</div>`;
  $("kpisHist").querySelector(".kpi b").textContent = lotes.length;
}


// ---------- DOCUMENTOS ----------
const PAPEL_ORDEM = { pai: 0, mae: 1, filho: 2, outro: 3 };
const pessoasOrdenadas = () => [...D.pessoas].sort((a, b) => (PAPEL_ORDEM[a.papel] - PAPEL_ORDEM[b.papel]) || a.nome.localeCompare(b.nome, "pt"));
const docsDe = (pid) => D.documentos.filter((d) => d.pessoaId === pid).sort((a, b) => a.categoria.localeCompare(b.categoria, "pt") || a.titulo.localeCompare(b.titulo, "pt"));
const tamanho = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function renderDocumentos() {
  // Pasta aberta que deixou de existir → volta às pastas
  if (UI.pasta && !D.pessoas.some((p) => p.id === UI.pasta)) UI.pasta = null;
  $("docsInicio").hidden = !!UI.pasta;
  $("docsPasta").hidden = !UI.pasta;

  if (!UI.pasta) {
    const P = $("pastas");
    if (!D.pessoas.length) {
      const filhos = D.alunos.map((a) => a.nome);
      P.innerHTML = `<div class="calm" style="grid-column:1/-1;display:flex;flex-direction:column;gap:10px;align-items:flex-start">
        <span>Ainda não há pastas. Pode criar já as pastas da família: <b>Pai</b>, <b>Mãe</b>${filhos.length ? ` e uma para cada menino (${esc(filhos.join(", "))})` : ""}.</span>
        <button class="btn" type="button" id="criarPastasBtn">Criar pastas da família</button></div>`;
      return;
    }
    P.innerHTML = pessoasOrdenadas().map((p) => {
      const ds = docsDe(p.id);
      return `<button type="button" class="pasta p-${esc(p.papel)}" data-pasta="${esc(p.id)}">
        <span class="pasta-ico" aria-hidden="true"></span>
        <b>${esc(p.nome)}</b>
        <span>${p.nome.toLowerCase() === PAPEIS[p.papel].toLowerCase() ? "" : esc(PAPEIS[p.papel]) + " · "}${ds.length} ${ds.length === 1 ? "documento" : "documentos"}</span>
      </button>`;
    }).join("");
    return;
  }

  const p = D.pessoas.find((x) => x.id === UI.pasta);
  $("pastaNome").textContent = p.nome;
  const ds = docsDe(p.id);
  $("docsLista").innerHTML = ds.length ? ds.map((d) => {
    const ext = d.contentType === "application/pdf" ? "PDF" : "FOTO";
    return `<div class="doc">
      <span class="doc-ico" aria-hidden="true">${ext}</span>
      <span class="t"><b>${esc(d.titulo)}</b>
        <small>${esc([d.categoria, d.numero ? `n.º ${d.numero}` : null, tamanho(d.tamanho || 0)].filter(Boolean).join(" · "))}</small>
        ${d.nota ? `<small style="display:block">${esc(d.nota)}</small>` : ""}</span>
      <span class="acts">
        <button class="btn-ghost" type="button" data-ver-doc="${esc(d.id)}">Ver</button>
        <button class="btn-ghost" type="button" data-edit-doc="${esc(d.id)}">Editar</button>
      </span></div>`;
  }).join("") : `<div class="empty">Esta pasta ainda está vazia.<br>Toque em <b>+ Adicionar documento</b> e tire uma fotografia ou escolha um PDF.</div>`;
}

// Pastas
let pessoaEdit = null;
function abrirPessoa(id) {
  pessoaEdit = id || null;
  const p = id ? D.pessoas.find((x) => x.id === id) : null;
  $("pessoaTitulo").textContent = p ? "Editar pasta" : "Nova pasta";
  $("ps-nome").value = p?.nome || "";
  $("ps-papel").value = p?.papel || "outro";
  $("ps-delWrap").innerHTML = p ? `<button type="button" class="btn-ghost danger" id="ps-del">Apagar pasta</button>` : "";
  $("dlgPessoa").showModal();
}
$("ps-delWrap").addEventListener("click", (e) => {
  if (e.target.id === "ps-del") $("ps-delWrap").innerHTML = `<span class="confirm">Apagar a pasta? <button type="button" class="btn-ghost danger" id="ps-delYes">Sim, apagar</button></span>`;
  else if (e.target.id === "ps-delYes") {
    const id = pessoaEdit;
    $("dlgPessoa").close();
    guardar(async () => { await api(`/api/pessoas?id=${encodeURIComponent(id)}`, { method: "DELETE" }); UI.pasta = null; }, "Pasta apagada.");
  }
});
$("formPessoa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { nome: $("ps-nome").value.trim(), papel: $("ps-papel").value };
  if (!body.nome) return;
  $("dlgPessoa").close();
  if (pessoaEdit) await guardar(() => api(`/api/pessoas?id=${encodeURIComponent(pessoaEdit)}`, { method: "PUT", body: JSON.stringify(body) }), "Pasta atualizada.");
  else await guardar(() => api("/api/pessoas", { method: "POST", body: JSON.stringify(body) }), `Pasta ${body.nome} criada.`);
});
$("novaPastaBtn").addEventListener("click", () => abrirPessoa());
$("editarPastaBtn").addEventListener("click", () => abrirPessoa(UI.pasta));
$("voltarPastas").addEventListener("click", () => { UI.pasta = null; render(); });

// Documento: preparar ficheiro (reduz fotografias e remove dados de localização)
let ficheiroPronto = null; // { blob, nome }
async function prepararFicheiro(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > TAMANHO_MAX) throw new Error(`Este PDF tem ${tamanho(file.size)}. O máximo é 4 MB: reduza-o ou envie fotografias das páginas.`);
    return { blob: file, nome: file.name };
  }
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error("Não foi possível ler esta imagem. Use uma fotografia JPG ou PNG, ou um PDF."); }
  const max = 2200;
  const esc2 = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * esc2); c.height = Math.round(bmp.height * esc2);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  let q = 0.85, blob;
  do { blob = await new Promise((r) => c.toBlob(r, "image/jpeg", q)); q -= 0.15; } while (blob && blob.size > TAMANHO_MAX && q > 0.3);
  if (!blob || blob.size > TAMANHO_MAX) throw new Error("A fotografia continua grande demais depois de reduzida. Tente outra.");
  return { blob, nome: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}
async function escolherFicheiro(input) {
  const f = input.files?.[0]; input.value = "";
  if (!f) return;
  $("d-info").textContent = "A preparar…";
  try {
    ficheiroPronto = await prepararFicheiro(f);
    $("d-info").textContent = `Pronto: ${ficheiroPronto.nome} (${tamanho(ficheiroPronto.blob.size)}).`;
  } catch (err) { ficheiroPronto = null; $("d-info").textContent = err.message; }
}
$("d-foto").addEventListener("change", (e) => escolherFicheiro(e.target));
$("d-ficheiro").addEventListener("change", (e) => escolherFicheiro(e.target));

const TITULOS = { BI: "Bilhete de Identidade", Passaporte: "Passaporte", "Académico": "", "Saúde": "", Outro: "" };
$("d-categoria").addEventListener("change", (e) => {
  const t = $("d-titulo");
  if (!t.value || Object.values(TITULOS).includes(t.value)) t.value = TITULOS[e.target.value];
});

let docEdit = null;
function abrirDoc(id) {
  docEdit = id || null;
  const d = id ? D.documentos.find((x) => x.id === id) : null;
  ficheiroPronto = null;
  $("docTitulo").textContent = d ? "Editar documento" : "Novo documento";
  $("d-ficheiro-wrap").hidden = !!d;
  $("d-info").textContent = "Fotografia (JPG, PNG) ou PDF, até 4 MB.";
  $("d-pasta").innerHTML = pessoasOrdenadas().map((p) => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("");
  $("d-pasta").value = d?.pessoaId || UI.pasta || D.pessoas[0]?.id || "";
  $("d-categoria").value = d?.categoria || "BI";
  $("d-titulo").value = d ? d.titulo : TITULOS.BI;
  $("d-numero").value = d?.numero || "";
  $("d-nota").value = d?.nota || "";
  $("d-delWrap").innerHTML = d ? `<button type="button" class="btn-ghost danger" id="d-del">Apagar</button>` : "";
  $("d-ok").disabled = false;
  $("dlgDoc").showModal();
}
$("addDocBtn").addEventListener("click", () => abrirDoc());
$("d-delWrap").addEventListener("click", (e) => {
  if (e.target.id === "d-del") $("d-delWrap").innerHTML = `<span class="confirm">Apagar o documento e o ficheiro? <button type="button" class="btn-ghost danger" id="d-delYes">Sim, apagar</button></span>`;
  else if (e.target.id === "d-delYes") {
    const id = docEdit;
    $("dlgDoc").close();
    guardar(() => api(`/api/documentos?id=${encodeURIComponent(id)}`, { method: "DELETE" }), "Documento apagado.");
  }
});
$("formDoc").addEventListener("submit", async (e) => {
  e.preventDefault();
  const meta = {
    pessoaId: $("d-pasta").value, categoria: $("d-categoria").value, titulo: $("d-titulo").value.trim(),
    numero: $("d-numero").value.trim() || null, nota: $("d-nota").value.trim() || null,
  };
  if (!meta.titulo || !meta.pessoaId) return;
  if (docEdit) {
    $("dlgDoc").close();
    await guardar(() => api(`/api/documentos?id=${encodeURIComponent(docEdit)}`, { method: "PUT", body: JSON.stringify(meta) }), "Documento atualizado.");
    return;
  }
  if (!ficheiroPronto) { $("d-info").textContent = "Escolha primeiro a fotografia ou o PDF."; return; }
  $("d-ok").disabled = true; $("d-info").textContent = "A enviar…";
  meta.nomeFicheiro = ficheiroPronto.nome;
  try {
    const r = await fetch("/api/documentos", { method: "POST", headers: { "Content-Type": "application/octet-stream", "x-pin": pin || "", "x-doc": encodeURIComponent(JSON.stringify(meta)) }, body: ficheiroPronto.blob });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { $("dlgDoc").close(); return semPin(j.erro); }
    if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
    $("dlgDoc").close();
    UI.pasta = meta.pessoaId;
    status(`${meta.titulo} guardado.`);
    await carregar();
  } catch (err) { $("d-info").textContent = "Não foi possível enviar: " + err.message; $("d-ok").disabled = false; }
});

// Ver um documento: pede o ficheiro com o PIN e mostra-o dentro da app
let urlAberto = null;
async function verDoc(id) {
  const d = D.documentos.find((x) => x.id === id); if (!d) return;
  const dono = D.pessoas.find((p) => p.id === d.pessoaId)?.nome;
  $("verTitulo").textContent = d.titulo;
  $("verSub").textContent = [dono, d.categoria, d.numero ? `n.º ${d.numero}` : null].filter(Boolean).join(" · ");
  $("verConteudo").innerHTML = `<p class="note">A abrir…</p>`;
  $("verAcoes").innerHTML = "";
  $("dlgVer").showModal();
  try {
    const r = await fetch(`/api/documentos?id=${encodeURIComponent(id)}`, { headers: { "x-pin": pin || "" } });
    if (r.status === 401) { $("dlgVer").close(); return semPin("PIN errado."); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.erro || `Erro ${r.status}`); }
    const blob = await r.blob();
    if (urlAberto) URL.revokeObjectURL(urlAberto);
    urlAberto = URL.createObjectURL(blob);
    const pdf = blob.type === "application/pdf";
    $("verConteudo").innerHTML = pdf
      ? `<iframe src="${urlAberto}" title="${esc(d.titulo)}"></iframe>`
      : `<img src="${urlAberto}" alt="${esc(d.titulo)}">`;
    $("verAcoes").innerHTML = `<a class="btn-ghost" style="text-decoration:none" href="${urlAberto}" target="_blank" rel="noopener">${pdf ? "Abrir PDF em ecrã inteiro" : "Abrir em ecrã inteiro"}</a>
      <a class="btn-ghost" style="text-decoration:none" href="${urlAberto}" download="${esc(d.nomeFicheiro || d.titulo)}">Guardar cópia</a>`;
  } catch (err) {
    $("verConteudo").innerHTML = `<p class="note">Não foi possível abrir: ${esc(err.message)}</p>`;
  }
}
$("dlgVer").addEventListener("close", () => { if (urlAberto) { URL.revokeObjectURL(urlAberto); urlAberto = null; } $("verConteudo").innerHTML = ""; });

async function criarPastasFamilia() {
  const pessoas = [{ nome: "Pai", papel: "pai" }, { nome: "Mãe", papel: "mae" }, ...D.alunos.map((a) => ({ nome: a.nome, papel: "filho", alunoId: a.id }))];
  await guardar(() => api("/api/pessoas", { method: "POST", body: JSON.stringify({ pessoas }) }), `${pessoas.length} pastas criadas.`);
}

// ---------- Modal: registar pagamento ----------
let pagarCtx = null; // { tipo, id, ateMes? }

function abrirPagarServico(id) {
  const s = D.servicos.find((x) => x.id === id); if (!s) return;
  pagarCtx = { tipo: "servico", id };
  $("pagarTitulo").textContent = `Pagamento: ${s.nome}`;
  $("p-aluno-wrap").hidden = true; $("p-meses-wrap").hidden = true;
  $("p-valor-lbl").textContent = "Valor (Kz)";
  $("p-data").value = hojeISO();
  $("p-valor").value = s.valor || "";
  $("p-nota").value = "";
  atualizarPagar();
  $("dlgPagar").showModal();
}

function abrirPagarPropina(alunoId, ateMes) {
  if (!D.alunos.length) { status("Primeiro adicione um menino na aba Propinas."); location.hash = "#propinas"; abrirAluno(); return; }
  const a = D.alunos.find((x) => x.id === alunoId) || D.alunos[0];
  pagarCtx = { tipo: "propina", id: a.id, ateMes };
  $("pagarTitulo").textContent = "Pagamento de propina";
  $("p-aluno-wrap").hidden = false; $("p-meses-wrap").hidden = false;
  $("p-aluno").innerHTML = D.alunos.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join("");
  $("p-aluno").value = a.id;
  $("p-valor-lbl").textContent = "Valor por mês (Kz)";
  $("p-data").value = hojeISO();
  $("p-nota").value = "";
  montarMeses();
  $("dlgPagar").showModal();
}

function montarMeses() {
  const hoje = hojeISO();
  const a = D.alunos.find((x) => x.id === $("p-aluno").value);
  pagarCtx.id = a.id;
  const pend = mesesPorPagar(a, pagsDe("propina", a.id), hoje, 12);
  if (!pend.length) {
    $("p-meses").innerHTML = `<p class="note">Todos os meses de ${esc(a.nome)} estão pagos.</p>`;
    $("p-valor").value = a.propina || "";
    atualizarPagar(); return;
  }
  // Pré-seleciona até ao mês tocado (ou só o primeiro em falta), sempre por ordem.
  const ate = pagarCtx.ateMes && pend.some((p) => p.mes === pagarCtx.ateMes) ? pagarCtx.ateMes : pend[0].mes;
  $("p-meses").innerHTML = pend.map((p, i) => `<label><input type="checkbox" value="${p.mes}" data-i="${i}" ${p.mes <= ate ? "checked" : ""}>
      ${cap(nomeMesCurto(p.mes))}${p.estado === "PARCIAL" ? `<small>falta ${num(p.devido - p.pago)}</small>` : ""}</label>`).join("");
  const primeiro = pend[0];
  const soUmParcial = primeiro.estado === "PARCIAL" && ate === primeiro.mes;
  $("p-valor").value = soUmParcial ? (primeiro.devido - primeiro.pago) : (a.propina || "");
  atualizarPagar();
}

function mesesEscolhidos() { return [...$("p-meses").querySelectorAll("input:checked")].map((i) => i.value); }

/** Valor de cada mês escolhido: num mês parcial, só o que falta (nunca mais do que o valor indicado). */
function valoresPorMes(v) {
  const a = D.alunos.find((x) => x.id === pagarCtx.id);
  const pend = mesesPorPagar(a, pagsDe("propina", a.id), hojeISO(), 12);
  const out = {};
  for (const m of mesesEscolhidos()) {
    const p = pend.find((x) => x.mes === m);
    out[m] = p && p.estado === "PARCIAL" && v ? Math.min(v, p.devido - p.pago) : v;
  }
  return out;
}

function atualizarPagar() {
  const v = parseFloat($("p-valor").value) || 0;
  if (pagarCtx?.tipo === "servico") {
    const s = D.servicos.find((x) => x.id === pagarCtx.id);
    const d = $("p-data").value || hojeISO();
    $("p-info").textContent = s ? `Novo prazo: até ${dataLonga(addDias(d >= s.ultimoPagamento ? d : s.ultimoPagamento, Number(s.dias) || 30))}.` : "";
    $("p-total").textContent = v ? `Total: ${num(v)} Kz` : "";
    $("p-ok").disabled = false;
  } else {
    const ms = mesesEscolhidos();
    const vals = valoresPorMes(v);
    const total = Object.values(vals).reduce((s, x) => s + (x || 0), 0);
    const partes = ms.map((m) => vals[m] !== v ? `${cap(MESES_CURTOS[Number(m.slice(5)) - 1])} ${num(vals[m])}` : null).filter(Boolean);
    $("p-info").textContent = ms.length ? `Vai ficar pago: ${ms.map((m) => cap(nomeMesCurto(m))).join(", ")}.` : "Escolha pelo menos um mês.";
    $("p-total").textContent = ms.length && v ? `Total: ${num(total)} Kz${partes.length ? ` (${partes.join(", ")} que faltava; restantes ${num(v)})` : ms.length > 1 ? ` (${ms.length} × ${num(v)})` : ""}` : "";
    $("p-ok").disabled = !ms.length;
  }
}

$("p-aluno").addEventListener("change", () => { pagarCtx.ateMes = null; montarMeses(); });
$("p-valor").addEventListener("input", atualizarPagar);
$("p-data").addEventListener("input", atualizarPagar);
$("p-meses").addEventListener("change", (e) => {
  // Mantém a ordem: marcar um mês marca os anteriores; desmarcar desmarca os seguintes.
  const i = Number(e.target.dataset.i);
  $("p-meses").querySelectorAll("input").forEach((inp) => {
    const j = Number(inp.dataset.i);
    if (e.target.checked && j < i) inp.checked = true;
    if (!e.target.checked && j > i) inp.checked = false;
  });
  atualizarPagar();
});
$("formPagar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { tipo: pagarCtx.tipo, refId: pagarCtx.id, data: $("p-data").value, valor: parseFloat($("p-valor").value) || null, nota: $("p-nota").value.trim() || null };
  if (!body.data) return;
  let msg;
  if (body.tipo === "propina") {
    body.meses = mesesEscolhidos();
    if (!body.meses.length) return;
    if (body.valor) body.valores = valoresPorMes(body.valor);
    const a = D.alunos.find((x) => x.id === body.refId);
    msg = `Propina de ${a?.nome}: ${body.meses.map((m) => mesNome(m)).join(", ")} registado.`;
  } else {
    const s = D.servicos.find((x) => x.id === body.refId);
    msg = `${s?.nome}: pagamento registado.`;
  }
  $("p-ok").disabled = true;
  $("dlgPagar").close();
  await guardar(() => api("/api/pagamentos", { method: "POST", body: JSON.stringify(body) }), msg);
  $("p-ok").disabled = false;
});

// ---------- Modal: menino ----------
let alunoEdit = null;
function abrirAluno(id) {
  alunoEdit = id || null;
  const a = id ? D.alunos.find((x) => x.id === id) : null;
  $("alunoTitulo").textContent = a ? `Editar: ${a.nome}` : "Novo menino";
  $("a-nome").value = a?.nome || "";
  $("a-escola").value = a?.escola || "";
  $("a-classe").value = a?.classe || "";
  $("a-propina").value = a?.propina || "";
  $("a-dia").value = a?.diaLimite || 10;
  $("a-inicio").value = a?.inicio || hojeISO().slice(0, 7);
  $("a-fim").value = a?.fim || "";
  $("a-aviso").value = String(a?.avisoDias || 7);
  $("a-delWrap").innerHTML = a ? `<button type="button" class="btn-ghost danger" id="a-del">Apagar</button>` : "";
  $("dlgAluno").showModal();
}
$("a-delWrap").addEventListener("click", (e) => {
  if (e.target.id === "a-del") $("a-delWrap").innerHTML = `<span class="confirm">Apagar? Os pagamentos ficam no histórico. <button type="button" class="btn-ghost danger" id="a-delYes">Sim, apagar</button></span>`;
  else if (e.target.id === "a-delYes") {
    const id = alunoEdit, nome = D.alunos.find((x) => x.id === id)?.nome || "Menino";
    $("dlgAluno").close();
    guardar(() => api(`/api/alunos?id=${encodeURIComponent(id)}`, { method: "DELETE" }), `${nome} apagado.`);
  }
});
$("formAluno").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    nome: $("a-nome").value.trim(), escola: $("a-escola").value.trim(), classe: $("a-classe").value.trim(),
    propina: parseFloat($("a-propina").value) || null, diaLimite: parseInt($("a-dia").value, 10) || 10,
    inicio: $("a-inicio").value, fim: $("a-fim").value || null, avisoDias: parseInt($("a-aviso").value, 10),
  };
  if (!body.nome || !body.inicio) return;
  $("dlgAluno").close();
  if (alunoEdit) await guardar(() => api(`/api/alunos?id=${encodeURIComponent(alunoEdit)}`, { method: "PUT", body: JSON.stringify(body) }), `${body.nome} atualizado.`);
  else await guardar(() => api("/api/alunos", { method: "POST", body: JSON.stringify(body) }), `${body.nome} adicionado.`);
});

// ---------- Modal: detalhe de um mês de propina ----------
function abrirInfoPropina(alunoId, ym) {
  const a = D.alunos.find((x) => x.id === alunoId); if (!a) return;
  const e = estadoMesPropina(a, pagsDe("propina", a.id), ym, hojeISO());
  $("infoTitulo").textContent = `${a.nome}: ${cap(mesNome(ym))} ${ym.slice(0, 4)}`;
  $("infoSub").textContent = e.estado === "PAGO" ? `Pago${e.pago ? ": " + num(e.pago) + " Kz" : ""}.` : `Parcial: pago ${num(e.pago)} Kz de ${num(e.devido)} Kz. Falta ${num(e.devido - e.pago)} Kz.`;
  $("infoLista").innerHTML = e.registos.map((r) => `<li><span>Pago a ${dataLonga(r.data)}${r.nota ? " · " + esc(r.nota) : ""}</span><b>${r.valor ? num(r.valor) + " Kz" : ""}</b>
    <span data-anular-wrap="${esc(r.id)}"><button type="button" class="btn-ghost x" data-anular="${esc(r.id)}">Anular</button></span></li>`).join("");
  $("infoExtra").innerHTML = e.estado === "PARCIAL" ? `<button type="button" class="btn-ghost" data-resto="${esc(a.id)}|${ym}">Pagar o resto</button>` : "";
  $("dlgInfo").showModal();
}

// ---------- Modal: serviço ----------
let editingId = null;
function abrirForm(id) {
  editingId = id || null;
  const s = id ? D.servicos.find((x) => x.id === id) : null;
  $("formTitle").textContent = s ? "Editar serviço" : "Novo serviço";
  $("f-nome").value = s ? s.nome : "";
  $("f-data").value = s ? s.ultimoPagamento : hojeISO();
  $("f-ref").value = s?.mesPago || "";
  $("f-dias").value = s ? s.dias : 30;
  $("f-aviso").value = String(s?.avisoDias || 7);
  $("f-valor").value = s?.valor || "";
  $("delWrap").innerHTML = s ? `<button type="button" class="btn-ghost danger" id="delBtn">Apagar</button>` : "";
  $("dlg").showModal();
}
$("addBtn").addEventListener("click", () => abrirForm());
$("cancelBtn").addEventListener("click", () => $("dlg").close());
document.querySelectorAll(".presets button").forEach((b) => b.addEventListener("click", () => { $("f-dias").value = b.dataset.d; }));
$("delWrap").addEventListener("click", (e) => {
  if (e.target.id === "delBtn") {
    $("delWrap").innerHTML = `<span class="confirm">Apagar? Os pagamentos ficam no histórico. <button type="button" class="btn-ghost danger" id="delYes">Sim, apagar</button></span>`;
  } else if (e.target.id === "delYes") {
    const id = editingId, nome = D.servicos.find((x) => x.id === id)?.nome || "Serviço";
    $("dlg").close();
    guardar(() => api(`/api/servicos?id=${encodeURIComponent(id)}`, { method: "DELETE" }), `${nome} apagado.`);
  }
});
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    nome: $("f-nome").value.trim(),
    ultimoPagamento: $("f-data").value,
    dias: parseInt($("f-dias").value, 10),
    avisoDias: parseInt($("f-aviso").value, 10),
    mesPago: $("f-ref").value || null,
    valor: parseFloat($("f-valor").value) || null,
  };
  if (!body.nome || !body.ultimoPagamento || !(body.dias >= 1)) return;
  $("dlg").close();
  if (editingId) await guardar(() => api(`/api/servicos?id=${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify(body) }), `${body.nome} atualizado.`);
  else await guardar(() => api("/api/servicos", { method: "POST", body: JSON.stringify(body) }), `${body.nome} adicionado.`);
});

// ---------- Cliques globais ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("button, a"); if (!t) return;
  if (t.matches("[data-close]")) { t.closest("dialog").close(); return; }
  if (t.dataset.pagarServico) { abrirPagarServico(t.dataset.pagarServico); return; }
  if (t.dataset.pagarPropina) { abrirPagarPropina(t.dataset.pagarPropina); return; }
  if (t.dataset.edit) { abrirForm(t.dataset.edit); return; }
  if (t.dataset.pasta) { UI.pasta = t.dataset.pasta; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.verDoc) { verDoc(t.dataset.verDoc); return; }
  if (t.dataset.editDoc) { abrirDoc(t.dataset.editDoc); return; }
  if (t.id === "criarPastasBtn") { t.disabled = true; criarPastasFamilia(); return; }
  if (t.dataset.editAluno) { abrirAluno(t.dataset.editAluno); return; }
  if (t.dataset.cel) {
    const [id, ym] = t.dataset.cel.split("|");
    const a = D.alunos.find((x) => x.id === id);
    const est = a && estadoMesPropina(a, pagsDe("propina", id), ym, hojeISO()).estado;
    if (est === "PAGO" || est === "PARCIAL") abrirInfoPropina(id, ym); else abrirPagarPropina(id, ym);
    return;
  }
  if (t.dataset.resto) { const [id, ym] = t.dataset.resto.split("|"); $("dlgInfo").close(); abrirPagarPropina(id, ym); return; }
  if (t.dataset.hist) { UI.hRef = t.dataset.hist; UI.hPeriodo = "TUDO"; location.hash = "#historico"; render(); return; }
  if (t.dataset.hmes) { UI.hPeriodo = t.dataset.hmes; UI.hRef = t.dataset.href; render(); $("hListaTitulo").scrollIntoView({ behavior: "smooth" }); return; }
  if (t.dataset.anular) {
    const n = Number(t.dataset.n) || 1;
    t.closest("[data-anular-wrap]").innerHTML = `<span class="confirm">${n > 1 ? `Anular os ${n} meses?` : "Anular?"} <button type="button" class="btn-ghost danger x" data-anular-sim="${esc(t.dataset.anular)}">Sim</button></span>`;
    return;
  }
  if (t.dataset.anularSim) {
    const dlg = t.closest("dialog"); if (dlg) dlg.close();
    const ids = t.dataset.anularSim.split(",");
    guardar(async () => { for (const id of ids) await api(`/api/pagamentos?id=${encodeURIComponent(id)}`, { method: "DELETE" }); }, ids.length > 1 ? `${ids.length} meses anulados.` : "Pagamento anulado.");
  }
});

// Filtros
$("pagarPropinaBtn").addEventListener("click", () => abrirPagarPropina(UI.aluno !== "TODOS" ? UI.aluno : D.alunos[0]?.id));
$("addAlunoBtn").addEventListener("click", () => abrirAluno());
$("vMensal").addEventListener("click", () => { UI.vista = "MENSAL"; render(); });
$("vAnual").addEventListener("click", () => { UI.vista = "ANUAL"; render(); });
$("fAno").addEventListener("change", (e) => { UI.ano = e.target.value; render(); });
$("fMes").addEventListener("change", (e) => { UI.mes = e.target.value; render(); });
$("fAluno").addEventListener("change", (e) => { UI.aluno = e.target.value; render(); });
$("fSit").addEventListener("change", (e) => { UI.sit = e.target.value; render(); });
$("hPeriodo").addEventListener("change", (e) => { UI.hPeriodo = e.target.value; render(); });
$("hRef").addEventListener("change", (e) => { UI.hRef = e.target.value; render(); });
let buscaT; $("hBusca").addEventListener("input", (e) => { clearTimeout(buscaT); buscaT = setTimeout(() => { UI.hBusca = e.target.value; renderHistorico(); }, 200); });

// ---------- Notificações (ntfy) ----------
async function carregarConfig() {
  try {
    const cfg = await api("/api/config");
    $("topic").textContent = cfg.ntfy ? cfg.ntfy.topico : "(falta definir NTFY_TOPIC na Vercel)";
    $("testBtn").disabled = !cfg.ntfy;
    mostrarEnvio(cfg);
  } catch (e) { if (e instanceof ErroPin) semPin(e.message); }
}
function mostrarEnvio(cfg) {
  const el = $("envioAuto");
  const u = cfg.ultimoEnvio;
  el.classList.toggle("mau", !cfg.cronSecretDefinido || (u && u.ok === false));
  if (!cfg.cronSecretDefinido) { el.textContent = "Envio automático desligado: falta a variável CRON_SECRET na Vercel."; return; }
  if (!u) { el.innerHTML = "<b>Envio automático:</b> ainda não correu desde esta versão. Corre uma vez por dia, entre as 8h e as 9h (hora de Angola)."; return; }
  const d = new Date(u.quando);
  const quando = `${d.getDate()} ${MESES_CURTOS[d.getMonth()].toLowerCase()} às ${d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`;
  const res = u.ok === false ? esc(u.motivo) : u.enviado ? `enviado, com ${u.itens} ${u.itens === 1 ? "aviso" : "avisos"}.` : `correu, mas não enviou nada: ${esc(u.motivo).toLowerCase()}`;
  el.innerHTML = `<b>Último envio automático:</b> ${quando}: ${res}`;
}

$("copyBtn").addEventListener("click", async () => {
  const t = $("topic").textContent;
  try { await navigator.clipboard.writeText(t); status("Nome do canal copiado."); }
  catch { const r = document.createRange(); r.selectNodeContents($("topic")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); status("Selecionado. Copie com o menu do telefone."); }
});
$("testBtn").addEventListener("click", async () => {
  $("testBtn").disabled = true;
  try { const r = await api("/api/notificar?teste=1", { method: "POST" }); status(r.enviado ? "Notificação de teste enviada. Deve chegar em segundos." : r.motivo); }
  catch (e) { if (e instanceof ErroPin) semPin(e.message); else status("O teste falhou: " + e.message); }
  finally { $("testBtn").disabled = false; }
});

// ---------- PIN ----------
$("pinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  pin = $("pin").value.trim();
  $("pinBtn").disabled = true; $("pinErr").textContent = "";
  try {
    await api("/api/config");
    store.set("prazos.pin", pin);
    $("pin").value = "";
    entrar();
  } catch (err) {
    $("pinErr").textContent = err instanceof ErroPin ? "PIN errado. Tente de novo." : err.message;
    pin = null;
  } finally { $("pinBtn").disabled = false; }
});
$("logoutBtn").addEventListener("click", () => { store.del("prazos.cache2"); semPin(""); });

function entrar() {
  $("gate").hidden = true; $("app").hidden = false;
  mostrarAba(); render(); carregar(); carregarConfig();
}

// ---------- Instalação (PWA) ----------
let promptInstalar = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptInstalar = e; $("installBtn").hidden = false; });
$("installBtn").addEventListener("click", async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice.catch(() => null);
  promptInstalar = null; $("installBtn").hidden = true;
});
window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; status("App instalada."); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

document.addEventListener("visibilitychange", () => { if (!document.hidden && pin) carregar(); });
// Mantém todos os aparelhos da casa atualizados: com a app aberta, verifica alterações a cada 30 segundos.
setInterval(() => { if (pin && !document.hidden && !document.querySelector("dialog[open]")) carregar(); }, 30 * 1000);
setInterval(() => { if (pin) render(); }, 60 * 60 * 1000);

if (pin) entrar(); else semPin("");
