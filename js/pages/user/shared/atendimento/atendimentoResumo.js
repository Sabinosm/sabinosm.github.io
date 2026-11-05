// atendimentoResumo.js
//
// Carrega e mostra o resumo de conferência do atendimento dentro de um contêiner.
// Usado pela aba Finalizar (atendimento.html) e pela página de prescrição.
//
// Fonte: GET /atendimentos/<uuid>/detalhe (leitura AUDITADA no back). Por isso cada tela só chama
// quando o profissional chega à etapa final, e não a cada digitação. `geracao` descarta respostas
// atrasadas quando o resumo é pedido de novo antes da anterior terminar.

import { buscarDetalheAtendimento } from "./atendimentoDetalhe/atendimentoDetalheApi.js";
import { renderResumo } from "./atendimentoResumoRender.js";
import { el } from "../historico/historicoHelpers.js";

let geracao = 0;

/**
 * @param {HTMLElement} alvo contêiner onde o resumo é desenhado
 * @param {string} uuidAtendimento
 */
export async function mostrarResumo(alvo, uuidAtendimento) {
  if (!alvo || !uuidAtendimento) return;
  const minha = ++geracao;
  alvo.replaceChildren(el("p", "field-hint", "Carregando resumo…"));
  try {
    const dados = await buscarDetalheAtendimento(uuidAtendimento);
    if (minha !== geracao) return;
    alvo.replaceChildren(renderResumo(dados));
  } catch (erro) {
    if (minha !== geracao) return;
    const caixa = el("div", "resumo-erro");
    caixa.appendChild(el("p", "field-hint", erro?.message || "Não foi possível carregar o resumo."));
    const tentar = el("button", "btn-ghost", "Tentar novamente");
    tentar.type = "button";
    tentar.addEventListener("click", () => mostrarResumo(alvo, uuidAtendimento));
    caixa.appendChild(tentar);
    alvo.replaceChildren(caixa);
  }
}

export function limparResumo(alvo) {
  geracao += 1;
  alvo?.replaceChildren();
}
