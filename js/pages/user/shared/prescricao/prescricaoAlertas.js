// prescricaoAlertas.js
//
// Interações medicamentosas do rascunho (GET /<uuid>/alertas). NÃO bloqueia nada: o back devolve
// alertas + cobertura e o médico decide (a confirmação exige reconhecer_alertas quando há alerta).
// Regra de apresentação: lista vazia NUNCA aparece como "sem interação": a base só conhece as
// interações cadastradas, então o aviso da cobertura é sempre mostrado.

import { el, CONTEXTO_ALERTA_LABELS, rotulo } from "./prescricaoHelpers.js";

/** Devolve quantos alertas foram desenhados (0 se o bloco nem aparece). */
export function renderAlertas(alvo, verificacao, resultado) {
  alvo.replaceChildren();
  if (!resultado || resultado.status !== "rascunho" || !resultado.medicamentos?.length) return 0;

  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Interações medicamentosas"));
  alvo.appendChild(painel);

  if (!verificacao) {
    painel.appendChild(el("p", "field-hint", "Verificando interações…"));
    return 0;
  }

  const alertas = verificacao.alertas ?? [];
  if (alertas.length) {
    painel.appendChild(el("p", "presc-alerta-resumo",
      `${alertas.length} alerta(s). Revise antes de confirmar: a confirmação pede o seu reconhecimento.`));
    alertas.forEach((a) => {
      const item = el("div", "presc-alerta");
      item.appendChild(el("p", "presc-item-titulo", `${a.medicamento_a} × ${a.medicamento_b}`));
      const meta = [rotulo(CONTEXTO_ALERTA_LABELS, a.contexto), a.gravidade ? `gravidade: ${a.gravidade}` : null]
        .filter(Boolean).join(" · ");
      item.appendChild(el("p", "field-hint", meta));
      if (a.descricao) item.appendChild(el("p", "presc-texto", a.descricao));
      painel.appendChild(item);
    });
  } else {
    painel.appendChild(el("p", "presc-texto", "Nenhuma interação cadastrada entre os itens desta prescrição."));
  }

  const cobertura = verificacao.cobertura ?? {};
  if (cobertura.aviso) painel.appendChild(el("p", "field-hint", cobertura.aviso));
  if (!cobertura.escopo?.includes("medicamentos_em_uso")) {
    painel.appendChild(el("p", "field-hint",
      "A verificação considera só os itens desta prescrição: não cruza com os medicamentos em uso nem com as alergias do paciente."));
  }
  return alertas.length;
}