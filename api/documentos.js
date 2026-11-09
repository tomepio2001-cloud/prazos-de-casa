// POST   /api/documentos                 -> envia um ficheiro (corpo = bytes do ficheiro;
//                                           metadados no cabeçalho x-doc, JSON codificado em URI)
// GET    /api/documentos?id=...          -> devolve o ficheiro (só com o PIN)
// PUT    /api/documentos?id=...          -> altera os metadados (título, categoria, validade…)
// DELETE /api/documentos?id=...          -> apaga o documento e o ficheiro
import { Readable } from "node:stream";
import { redis, CHAVE_DOCS, CHAVE_PESSOAS, lerUm, gravar, novoId, idValido, exigirPin, lerCorpo, responder } from "./_lib.js";
import { guardarFicheiro, lerFicheiro, apagarFicheiro } from "./_armazem.js";
import { normalizarDocumento, TIPOS_FICHEIRO, TAMANHO_MAX } from "../public/prazos-core.js";

async function lerBytes(req, limite) {
  // A app envia "application/octet-stream": a Vercel entrega o corpo como Buffer; noutros servidores, lê-se o fluxo.
  if (Buffer.isBuffer(req.body)) {
    if (req.body.length > limite) throw Object.assign(new Error("O ficheiro é grande demais (máximo 4 MB)."), { status: 413 });
    return req.body;
  }
  const partes = []; let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > limite) throw Object.assign(new Error("O ficheiro é grande demais (máximo 4 MB)."), { status: 413 });
    partes.push(c);
  }
  return Buffer.concat(partes);
}

/** Confere o tipo real do ficheiro pelos primeiros bytes (não confia só no que o browser diz). */
function tipoReal(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

export default async function handler(req, res) {
  if (!(await exigirPin(req, res))) return;
  try {
    const id = new URL(req.url, "http://x").searchParams.get("id");

    if (req.method === "GET") {
      if (!idValido(id)) return responder(res, 400, { erro: "Falta o id." });
      const d = await lerUm(CHAVE_DOCS, id);
      if (!d) return responder(res, 404, { erro: "Este documento já não existe." });
      const f = await lerFicheiro(d.url);
      if (!f) return responder(res, 404, { erro: "O ficheiro deste documento não foi encontrado." });
      res.statusCode = 200;
      res.setHeader("Content-Type", f.contentType || d.contentType || "application/octet-stream");
      if (f.size) res.setHeader("Content-Length", String(f.size));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(d.nomeFicheiro || "documento")}"`);
      return Readable.fromWeb(f.stream).pipe(res);
    }

    if (req.method === "POST") {
      let meta;
      try { meta = JSON.parse(decodeURIComponent(String(req.headers["x-doc"] || ""))); } catch { meta = null; }
      const m = normalizarDocumento(meta);
      if (!m) return responder(res, 400, { erro: "Falta o título do documento ou a pasta." });
      if (!(await redis("HEXISTS", CHAVE_PESSOAS, m.pessoaId))) return responder(res, 404, { erro: "Esta pasta já não existe. Atualize a lista." });
      if ((await redis("HLEN", CHAVE_DOCS)) >= 500) return responder(res, 400, { erro: "Limite de 500 documentos atingido." });
      const bytes = await lerBytes(req, TAMANHO_MAX);
      if (!bytes.length) return responder(res, 400, { erro: "O ficheiro chegou vazio. Tente de novo." });
      const tipo = tipoReal(bytes);
      if (!tipo || !TIPOS_FICHEIRO[tipo]) return responder(res, 415, { erro: "Tipo de ficheiro não aceite. Use fotografia (JPG, PNG, WEBP) ou PDF." });
      const docId = novoId();
      const guardado = await guardarFicheiro(`documentos/${m.pessoaId}/${docId}.${TIPOS_FICHEIRO[tipo]}`, bytes, tipo);
      const nomeFicheiro = String(meta?.nomeFicheiro || "").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || `${m.titulo}.${TIPOS_FICHEIRO[tipo]}`;
      const doc = { id: docId, ...m, contentType: tipo, tamanho: bytes.length, nomeFicheiro, url: guardado.url, pathname: guardado.pathname, criadoEm: new Date().toISOString() };
      await gravar(CHAVE_DOCS, doc);
      const { url, pathname, ...publico } = doc;
      return responder(res, 200, { documento: publico });
    }

    if (req.method === "PUT") {
      const d = idValido(id) && await lerUm(CHAVE_DOCS, id);
      if (!d) return responder(res, 404, { erro: "Este documento já não existe. Atualize a lista." });
      const corpo = (await lerCorpo(req)) || {};
      const m = normalizarDocumento({ ...corpo, pessoaId: corpo.pessoaId || d.pessoaId });
      if (!m) return responder(res, 400, { erro: "Falta o título do documento." });
      if (m.pessoaId !== d.pessoaId && !(await redis("HEXISTS", CHAVE_PESSOAS, m.pessoaId))) return responder(res, 404, { erro: "A pasta de destino já não existe." });
      await gravar(CHAVE_DOCS, { ...d, ...m });
      return responder(res, 200, { ok: true });
    }

    if (req.method === "DELETE") {
      const d = idValido(id) && await lerUm(CHAVE_DOCS, id);
      if (!d) return responder(res, 200, { ok: true });
      try { await apagarFicheiro(d.url); } catch { /* se o ficheiro já não existir, apaga na mesma o registo */ }
      await redis("HDEL", CHAVE_DOCS, id);
      return responder(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return responder(res, 405, { erro: "Método não suportado." });
  } catch (e) {
    return responder(res, e.status || 500, { erro: e.message || "Erro inesperado." });
  }
}
