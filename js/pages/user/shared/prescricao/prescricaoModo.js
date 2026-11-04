// prescricaoModo.js
//
// Escolha do modo de prescrever (só em avaliação médica / reavaliação, médico dono):
//   - "ia"     -> a IA analisa o atendimento e cria o rascunho; o médico revisa
//   - "manual" -> o médico informa o diagnóstico e monta medicamentos/exames
//
// Sem modo escolhido (modo === null) mostra DOIS cartões grandes para a primeira escolha.
// Com modo escolhido mostra um alternador (segmentado) para trocar a qualquer momento enquanto a
// prescrição for rascunho. Só desenha: quem guarda o modo e decide o que aparece é prescricao.js.
//
// `bloqueado` = a IA está gerando; trocar de modo nesse meio tempo esconderia o andamento,
// então o botão "manual" fica desabilitado até a IA terminar.

import { el } from "./prescricaoHelpers.js";

export const MODOS = {
  ia: {
    titulo: "Prescrever com IA",
    descricao: "A IA analisa os dados já registrados no atendimento e cria um rascunho para você revisar. "
      + "Nada é prescrito automaticamente.",
  },
  manual: {
    titulo: "Prescrição manual",
    descricao: "Você informa o diagnóstico e escolhe os medicamentos e exames.",
  },
};

function botaoCartao(modo, aoEscolher) {
  const b = el("button", "presc-escolha-opcao");
  b.type = "button";
  b.dataset.modo = modo;
  b.append(el("strong", "presc-escolha-titulo", MODOS[modo].titulo), el("span", "presc-escolha-texto", MODOS[modo].descricao));
  b.addEventListener("click", () => aoEscolher(modo));
  return b;
}

/**
 * @param {HTMLElement} alvo
 * @param {{modo:"ia"|"manual"|null, bloqueado:boolean, aoEscolher:(modo:string)=>void}} ctx
 */
export function renderModo(alvo, { modo, bloqueado, aoEscolher }) {
  alvo.replaceChildren();

  if (modo == null) {
    const painel = el("section", "cons-panel presc-bloco");
    painel.appendChild(el("h2", "cons-panel-titulo", "Como deseja prescrever?"));
    painel.appendChild(el("p", "field-hint",
      "Você pode trocar de modo depois, enquanto a prescrição for um rascunho."));
    const grade = el("div", "presc-escolha");
    grade.append(botaoCartao("ia", aoEscolher), botaoCartao("manual", aoEscolher));
    painel.appendChild(grade);
    alvo.appendChild(painel);
    return;
  }

  const caixa = el("div", "presc-modo");
  const seg = el("div", "segmented presc-modo-seg");
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "Modo de prescrição");
  ["ia", "manual"].forEach((m) => {
    const b = el("button", `segmented-item${m === modo ? " segmented-item--active" : ""}`, MODOS[m].titulo);
    b.type = "button";
    b.setAttribute("aria-pressed", String(m === modo));
    if (m !== modo && bloqueado) b.disabled = true;
    b.addEventListener("click", () => { if (m !== modo) aoEscolher(m); });
    seg.appendChild(b);
  });
  caixa.appendChild(seg);
  if (bloqueado) caixa.appendChild(el("p", "field-hint", "Aguarde a IA terminar para trocar de modo."));
  alvo.appendChild(caixa);
}
