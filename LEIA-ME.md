# Prazos de Casa

App para registar os pagamentos da casa (Internet, ZAP, DSTV, propinas…) e receber
avisos no telefone e no PC a partir de 7 dias antes de cada prazo terminar, todos os dias
até ao último dia.

- **App**: instalável no telefone e no PC (PWA), protegida por um PIN da família. Tem três abas:
  - **Prazos**: serviços pagos por ciclo (Internet, ZAP, DSTV…) e todos os avisos do dia.
  - **Propinas**: os meninos, com *Lista mensal* e *Mapa anual* (PAGO / PENDENTE / PARCIAL / FUTURO),
    o próximo mês a pagar por ordem e o pagamento de vários meses de uma vez.
  - **Histórico**: todos os pagamentos seguidos, mês a mês, com mapa anual e totais.
- **Dados**: guardados no Upstash Redis (gratuito), partilhados por toda a família.
- **Avisos**: a Vercel corre `/api/notificar` todas as manhãs e envia para a app **ntfy**.

---

## 1. Pôr o código no GitHub

1. Crie uma conta em <https://github.com> (se ainda não tiver).
2. Clique em **New repository** → nome `prazos-de-casa` → **Private** → **Create repository**.
3. Na página do repositório, clique em **uploading an existing file** e arraste **todo o
   conteúdo** da pasta `prazos-de-casa` (as pastas `api`, `public` e os ficheiros
   `package.json`, `vercel.json`, etc.). Clique em **Commit changes**.

## 2. Criar o projeto na Vercel

1. Entre em <https://vercel.com> com a conta do GitHub.
2. **Add New… → Project** → escolha `prazos-de-casa` → **Import**.
3. Em *Framework Preset* deixe **Other**. Não mude mais nada. Clique em **Deploy**.
   (O primeiro deploy funciona, mas a app ainda não tem base de dados: continue.)

## 3. Ligar a base de dados (gratuita)

1. No projeto da Vercel: separador **Storage** → **Create Database** → **Upstash** →
   **Upstash for Redis** → plano **Free** → região mais próxima (ex.: Frankfurt) → **Create**.
2. Ligue-a ao projeto `prazos-de-casa` quando for pedido. A Vercel cria sozinha as
   variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.

## 4. Definir as variáveis

Em **Settings → Environment Variables**, adicione:

| Nome | Exemplo | Para quê |
|---|---|---|
| `FAMILIA_PIN` | `2580` | O PIN que a família escreve para entrar. Escolha um que não seja óbvio. |
| `NTFY_TOPIC` | `prazos-casa-k7q2m9x4` | Nome do canal de avisos. **Invente um difícil de adivinhar**: quem souber o nome recebe os avisos. |
| `CRON_SECRET` | uma frase longa ao acaso | Garante que só a Vercel dispara os avisos diários. |
| `FUSO_HORARIO` | `Africa/Luanda` | Fuso usado para contar os dias (opcional; o padrão é Luanda). |

Depois: **Deployments** → nos três pontos do último deploy → **Redeploy**.

## 5. Instalar a app

Abra o endereço do projeto (ex.: `https://prazos-de-casa.vercel.app`) e escreva o PIN.

- **Android (Chrome)**: menu ⋮ → **Instalar app** (ou **Adicionar ao ecrã principal**).
- **iPhone (Safari)**: botão Partilhar → **Adicionar ao ecrã principal**.
- **PC (Chrome ou Edge)**: ícone de instalar na barra de endereço, ou o botão
  **Instalar app** na própria página.

O PIN só é pedido uma vez em cada aparelho.

## 6. Receber as notificações (cada pessoa da casa)

1. Instale a app **ntfy** (Play Store / App Store).
2. Toque em **+**, escreva o nome do canal (`NTFY_TOPIC`, aparece também dentro da app
   Prazos de Casa, com botão **Copiar**) e confirme.
3. No Android, aceite as notificações. Se quiser que cheguem mesmo com o telefone em
   poupança de bateria, nas definições da ntfy ative **Instant delivery**.
4. **No PC**: abra <https://ntfy.sh/app>, subscreva o mesmo canal e permita as
   notificações do browser (com o browser aberto).
5. Na app Prazos de Casa, toque em **Enviar notificação de teste**.

## Quando chegam os avisos

Todos os dias às **07:00 UTC (08:00 em Angola)**. No plano gratuito da Vercel a hora exata
pode variar até cerca de uma hora. Para mudar, edite `vercel.json` → `"schedule"`
(formato cron, sempre em UTC; ex.: `"0 6 * * *"` = 07:00 em Angola).

Só chega notificação nos dias em que algum serviço está dentro da janela de aviso ou
já expirou. Nesses dias chega uma só notificação com a lista de todos.

## Estrutura

```
api/_lib.js        utilitários do servidor (Redis, PIN)
api/dados.js       tudo o que a app mostra (serviços, meninos, pagamentos)
api/servicos.js    criar / alterar / apagar serviços
api/alunos.js      criar / alterar / apagar meninos
api/pagamentos.js  registar e anular pagamentos (serviços e propinas)
api/config.js      confirma o PIN e devolve o canal ntfy
api/notificar.js   aviso diário (cron) e teste
public/            a app (HTML, JS, ícones, manifest, service worker)
public/prazos-core.js  cálculo dos prazos (usado pela app e pelo servidor)
vercel.json        agendamento diário
```
