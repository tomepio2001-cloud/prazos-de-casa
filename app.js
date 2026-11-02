import { hojeISO, calcular, fraseAviso, dataCurta, dataLonga, nomeMes, mesSeguinte, addDias, kz } from "/prazos-core.js";

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: pede o PIN de novo na próxima vez */ } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

let pin = store.get("prazos.pin");
let items = [];
let editingId = null;
let loaded = false;

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
  if (msg) setTimeout(() => { if ($("status").textContent === msg) $("status").textContent = ""; }, 6000);
}

function semPin(msg) {
  pin = null; store.del("prazos.pin");
  $("app").hidden = true; $("gate").hidden = false;
  $("pinErr").textContent = msg || "";
  $("pin").focus();
}

async function carregar() {
  try {
    const { servicos } = await api("/api/servicos");
    items = servicos; loaded = true;
    store.set("prazos.cache", JSON.stringify(servicos));
    render();
  } catch (e) {
    if (e instanceof ErroPin) return semPin(e.message);
    const cache = store.get("prazos.cache");
    if (cache) { try { items = JSON.parse(cache); loaded = true; render(); } catch { } }
    status(navigator.onLine === false ? "Sem internet: a mostrar a última lista guardada neste aparelho." : "Não foi possível atualizar: " + e.message);
  }
}

// ---------- Render ----------
function render() {
  const hoje = hojeISO();
  const d = new Date();
  $("today").textContent = `Hoje, ${d.toLocaleDateString("pt-PT", { weekday: "long" })}, ${dataLonga(hoje)} de ${d.getFullYear()}`;
  if (!loaded) return;
  const rows = items.map((s) => ({ s, c: calcular(s, hoje) })).sort((a, b) => a.c.faltam - b.c.faltam);

  const due = rows.filter((r) => r.c.estado !== "ok");
  const A = $("alerts");
  if (!rows.length) A.innerHTML = `<p class="calm">Ainda não há serviços. Adicione o primeiro (por exemplo a Internet) com o botão <b>+ Adicionar serviço</b>.</p>`;
  else if (!due.length) {
    const n = rows[0];
    A.innerHTML = `<p class="calm">Nada a pagar esta semana. O próximo é <b>${esc(n.s.nome)}</b>, a ${dataLonga(n.c.fim)} (daqui a ${n.c.faltam} dias).</p>`;
  } else {
    A.innerHTML = due.map(({ s, c }) => {
      const n = Math.abs(c.faltam);
      const lbl = c.faltam < 0 ? "atraso" : c.faltam === 1 ? "dia" : "dias";
      const sub = c.faltam < 0 ? "Pague para renovar." : `Termina a ${dataLonga(c.fim)}${kz(s.valor) ? " · " + kz(s.valor) : ""}.`;
      return `<div class="alert ${c.estado}"><div class="count">${n}<small>${lbl}</small></div>
        <p>${esc(fraseAviso(s, c).split(" (")[0])}<br><span class="sub">${sub}</span></p>
        <button class="btn-ghost" type="button" data-pay="${esc(s.id)}">Paguei hoje</button></div>`;
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
    const leftU = c.faltam < 0 ? "dias em atraso" : c.faltam === 1 ? "dia restante" : "dias restantes";
    return `<div class="row ${c.estado}">
      <div class="info"><div class="name">${esc(s.nome)} ${chip}</div>
        <div class="meta">Pago a ${dataCurta(s.ultimoPagamento)} · ciclo de ${c.dias} dias · termina a ${dataCurta(c.fim)}${ref}${kz(s.valor) ? " · " + kz(s.valor) : ""}</div></div>
      <div class="left"><span class="n">${Math.abs(c.faltam)}</span><span class="u">${leftU}</span></div>
      <div class="meter" aria-hidden="true">${ticks}</div>
      <div class="scale" aria-hidden="true"><span>${dataCurta(s.ultimoPagamento)}</span><span>aviso a ${dataCurta(c.inicioAviso)}</span><span>${dataCurta(c.fim)}</span></div>
      <div class="actions">
        <button class="btn-ghost" type="button" data-pay="${esc(s.id)}">Paguei hoje</button>
        <button class="btn-ghost" type="button" data-edit="${esc(s.id)}">Editar</button>
      </div></div>`;
  }).join("");
}

// ---------- Ações ----------
async function guardar(fn, okMsg) {
  try { await fn(); status(okMsg); await carregar(); return true; }
  catch (e) { if (e instanceof ErroPin) semPin(e.message); else status("Não foi possível guardar: " + e.message); return false; }
}

async function pagarHoje(id) {
  const s = items.find((x) => x.id === id); if (!s) return;
  const hoje = hojeISO();
  const novoMes = s.mesPago ? mesSeguinte(s.mesPago) : null;
  const historico = [...(s.historico || []).slice(-23), { data: hoje, valor: s.valor || null, mes: novoMes }];
  const body = { ...s, ultimoPagamento: hoje, mesPago: novoMes, historico };
  delete body.id;
  await guardar(() => api(`/api/servicos?id=${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
    `${s.nome}: pagamento de hoje registado. Novo prazo até ${dataLonga(addDias(hoje, Number(s.dias) || 30))}.`);
}

function abrirForm(id) {
  editingId = id || null;
  const s = id ? items.find((x) => x.id === id) : null;
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
    $("delWrap").innerHTML = `<span class="confirm">Apagar mesmo? <button type="button" class="btn-ghost danger" id="delYes">Sim, apagar</button></span>`;
  } else if (e.target.id === "delYes") {
    const id = editingId, nome = items.find((x) => x.id === id)?.nome || "Serviço";
    $("dlg").close();
    guardar(() => api(`/api/servicos?id=${encodeURIComponent(id)}`, { method: "DELETE" }), `${nome} apagado.`);
  }
});
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const atual = editingId ? items.find((x) => x.id === editingId) : null;
  const body = {
    nome: $("f-nome").value.trim(),
    ultimoPagamento: $("f-data").value,
    dias: parseInt($("f-dias").value, 10),
    avisoDias: parseInt($("f-aviso").value, 10),
    mesPago: $("f-ref").value || null,
    valor: parseFloat($("f-valor").value) || null,
  };
  if (!body.nome || !body.ultimoPagamento || !(body.dias >= 1)) return;
  body.historico = atual?.historico || [{ data: body.ultimoPagamento, valor: body.valor, mes: body.mesPago }];
  $("dlg").close();
  if (editingId) await guardar(() => api(`/api/servicos?id=${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify(body) }), `${body.nome} atualizado.`);
  else await guardar(() => api("/api/servicos", { method: "POST", body: JSON.stringify(body) }), `${body.nome} adicionado.`);
});

document.addEventListener("click", (e) => {
  const p = e.target.closest("[data-pay]"); if (p) { pagarHoje(p.dataset.pay); return; }
  const ed = e.target.closest("[data-edit]"); if (ed) abrirForm(ed.dataset.edit);
});

// ---------- Notificações (ntfy) ----------
async function carregarConfig() {
  try {
    const cfg = await api("/api/config");
    $("topic").textContent = cfg.ntfy ? cfg.ntfy.topico : "(falta definir NTFY_TOPIC na Vercel)";
    $("testBtn").disabled = !cfg.ntfy;
  } catch (e) { if (e instanceof ErroPin) semPin(e.message); }
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
    $("pinErr").textContent = err instanceof ErroPin ? "PIN errado. Tente de novo." : "Sem ligação ao servidor: " + err.message;
    pin = null;
  } finally { $("pinBtn").disabled = false; }
});
$("logoutBtn").addEventListener("click", () => { store.del("prazos.cache"); semPin(""); });

function entrar() {
  $("gate").hidden = true; $("app").hidden = false;
  render(); carregar(); carregarConfig();
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

// Atualiza ao voltar à app (o dia pode ter mudado) e de hora a hora.
document.addEventListener("visibilitychange", () => { if (!document.hidden && pin) carregar(); });
setInterval(() => { if (pin) render(); }, 60 * 60 * 1000);

if (pin) entrar(); else semPin("");
