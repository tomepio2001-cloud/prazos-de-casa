// GET /api/config -> confirma o PIN e diz à app qual é o canal ntfy.
import { exigirPin, lerEnvio, responder } from "./_lib.js";

export default async function handler(req, res) {
  if (!(await exigirPin(req, res))) return;
  const servidor = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const topico = process.env.NTFY_TOPIC || "";
  responder(res, 200, {
    ntfy: topico ? { servidor, topico, link: `${servidor}/${encodeURIComponent(topico)}` } : null,
    fuso: process.env.FUSO_HORARIO || "Africa/Luanda",
    cronSecretDefinido: !!process.env.CRON_SECRET,
    ultimoEnvio: await lerEnvio(),
  });
}
