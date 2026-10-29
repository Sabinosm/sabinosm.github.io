// prescricaoDocumentos.js
//
// Bloco "Documentos" da página de Prescrição: baixar em PDF a prescrição e o atendimento.
//   - Prescrição (PDF): só com a prescrição CONFIRMADA (o back devolve 409 em rascunho/descartada).
//     É o documento para o PACIENTE: receita e pedido de exames, sem CID e sem menção à IA.
//   - Atendimento, resumo: só com o atendimento FINALIZADO (409 nos demais).
//   - Atendimento, detalhado: sempre (sai com marca PARCIAL se estiver em andamento).
// O PDF não tem assinatura digital (ICP-Brasil): sai com aviso de "via informativa". Quem decide o que
// pode ser baixado é o back; aqui só se habilita o botão e se mostra a mensagem do 409.

import { el, estadoAtendimento } from "./prescricaoHelpers.js";
import { executarDownload, pdfAtendimento, pdfPrescricao } from "../../../../shared/downloadPdf.js";

function botao(texto, classe = "btn-ghost") {
  const b = el("button", classe, texto);
  b.type = "button";
  return b;
}

/** @param {object|null} resultado  prescrição em foco (rascunho, confirmada ou null) */
export function renderDocumentos(alvo, resultado) {
  alvo.replaceChildren();
  const a = estadoAtendimento.atendimento;
  if (!a) return;

  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", "Documentos"));
  const acoes = el("div", "cons-panel-acoes");

  if (resultado) {
    const confirmada = resultado.status === "confirmado";
    const prescricao = botao("Baixar prescrição (PDF)", confirmada ? "btn-primary" : "btn-ghost");
    if (confirmada) {
      prescricao.addEventListener("click", () => executarDownload(prescricao, () => pdfPrescricao(resultado.uuid)));
    } else {
      prescricao.disabled = true;
      prescricao.title = "Disponível depois de confirmar a prescrição.";
    }
    acoes.appendChild(prescricao);
  }

  const resumo = botao("Atendimento: resumo (PDF)");
  if (a.status === "finalizado") {
    resumo.addEventListener("click", () => executarDownload(resumo, () => pdfAtendimento(a.uuid, "resumo")));
  } else {
    resumo.disabled = true;
    resumo.title = "O resumo só existe para atendimento finalizado.";
  }
  const detalhado = botao(`Atendimento: detalhado (PDF)${a.status === "em-andamento" ? " (parcial)" : ""}`);
  detalhado.addEventListener("click", () => executarDownload(detalhado, () => pdfAtendimento(a.uuid, "detalhado")));
  acoes.append(resumo, detalhado);
  painel.appendChild(acoes);

  if (resultado && resultado.status !== "confirmado") {
    painel.appendChild(el("p", "field-hint", "A prescrição em PDF fica disponível depois de confirmada."));
  }
  if (a.status !== "finalizado") {
    painel.appendChild(el("p", "field-hint", "O resumo do atendimento fica disponível depois de finalizar. O detalhado sai agora, marcado como parcial."));
  }
  painel.appendChild(el("p", "field-hint",
    "O PDF da prescrição não tem assinatura digital: é uma via informativa e só vale como receita quando assinado pelo médico responsável."));
  alvo.appendChild(painel);
}