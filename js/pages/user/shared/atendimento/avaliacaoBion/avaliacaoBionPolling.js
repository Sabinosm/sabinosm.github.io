// avaliacaoBionPolling.js
//
// Espera a avaliação terminar consultando a rota LEVE de status (sem conteúdo
// clínico, sem auditoria). Sem DOM. Cancelável por AbortSignal.
//
//   - começa em 3 s e passa a 5 s depois de 30 s
//   - pausa enquanto a aba do navegador está oculta
//   - tolera até 2 falhas de rede/5xx seguidas; 401/403/404 sobem na hora
//   - teto de 11 min (o back expira em 10 min e então responde falhou/expirado)

import { statusAvaliacao, ApiError } from "./avaliacaoBionApi.js";
import { STATUS_BACK } from "./avaliacaoBionHelpers.js";

const INTERVALO_INICIAL_MS = 3000;
const INTERVALO_LENTO_MS = 5000;
const TROCA_PARA_LENTO_APOS_MS = 30_000;
const TETO_MS = 11 * 60 * 1000;
const FALHAS_TOLERADAS = 2;

export class PollingTimeout extends Error {
  constructor() {
    super("A avaliação está demorando mais que o esperado.");
    this.name = "PollingTimeout";
  }
}

const abortado = () => new DOMException("Cancelado", "AbortError");

function esperar(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortado());
    const t = setTimeout(() => { signal?.removeEventListener("abort", aoCancelar); resolve(); }, ms);
    function aoCancelar() { clearTimeout(t); reject(abortado()); }
    signal?.addEventListener("abort", aoCancelar, { once: true });
  });
}

function esperarVisivel(signal) {
  return new Promise((resolve, reject) => {
    if (!document.hidden) return resolve();
    if (signal?.aborted) return reject(abortado());
    const limpar = () => {
      document.removeEventListener("visibilitychange", aoMudar);
      signal?.removeEventListener("abort", aoCancelar);
    };
    function aoMudar() { if (!document.hidden) { limpar(); resolve(); } }
    function aoCancelar() { limpar(); reject(abortado()); }
    document.addEventListener("visibilitychange", aoMudar);
    signal?.addEventListener("abort", aoCancelar, { once: true });
  });
}

/**
 * Resolve com o último estado ({uuid_output, status, erro_codigo, criado_em}) quando
 * deixa de ser "processando". Rejeita com AbortError (cancelado), PollingTimeout ou ApiError.
 * `aoAtualizar(estado)` é chamado a cada resposta (opcional).
 */
export async function aguardarConclusao(uuidOutput, { signal, aoAtualizar } = {}) {
  const inicio = Date.now();
  let falhas = 0;

  for (;;) {
    const decorrido = Date.now() - inicio;
    if (decorrido > TETO_MS) throw new PollingTimeout();

    await esperar(decorrido < TROCA_PARA_LENTO_APOS_MS ? INTERVALO_INICIAL_MS : INTERVALO_LENTO_MS, signal);
    await esperarVisivel(signal);

    try {
      const resp = await statusAvaliacao(uuidOutput, { signal });
      falhas = 0;
      const estado = resp.data;
      aoAtualizar?.(estado);
      if (estado?.status !== STATUS_BACK.PROCESSANDO) return estado;
    } catch (erro) {
      if (erro?.name === "AbortError") throw erro;
      const transitorio = erro instanceof ApiError && (erro.status === 0 || erro.status >= 500);
      if (!transitorio || ++falhas > FALHAS_TOLERADAS) throw erro;
    }
  }
}