// Armazenamento dos ficheiros (Vercel Blob, loja PRIVADA): os ficheiros não têm link público;
// só são lidos pelo servidor, depois de confirmar o PIN, e entregues à app.
// Requer a variável BLOB_READ_WRITE_TOKEN, criada ao ligar uma loja Blob ao projeto.
// (globalThis.__armazemTeste permite testar localmente sem a Vercel.)

async function blob() {
  if (globalThis.__armazemTeste) return globalThis.__armazemTeste;
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    throw Object.assign(new Error("Armazenamento de documentos não configurado: falta ligar uma loja Blob (privada) ao projeto na Vercel."), { status: 500 });
  }
  return import("@vercel/blob");
}

export async function guardarFicheiro(caminho, dados, contentType) {
  const { put } = await blob();
  const r = await put(caminho, dados, { access: "private", contentType, addRandomSuffix: true });
  return { url: r.url, pathname: r.pathname };
}

/** Devolve { stream, contentType, size } ou null. */
export async function lerFicheiro(url) {
  const { get } = await blob();
  const r = await get(url, { access: "private" });
  if (!r || r.statusCode !== 200) return null;
  return { stream: r.stream, contentType: r.blob.contentType, size: r.blob.size };
}

export async function apagarFicheiro(url) {
  const { del } = await blob();
  await del(url);
}
