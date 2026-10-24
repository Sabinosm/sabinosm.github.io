// atendimentoAcoes.js
//
// Fim do ciclo do atendimento em andamento: FINALIZAR e CANCELAR.
//
//   finalizar -> POST /<uuid>/finalizar  {observacoes?}
//                só o dono (403); exige binário COMPLETO (409). O front
//                espelha o gate desabilitando o botão, mas o back decide.
//   cancelar  -> POST /<uuid>/cancelar   {motivo_cancelamento?} (não exige binário)
//
// Depois de qualquer um dos dois o atendimento deixa de estar em andamento:
// zeramos o estado local e disparamos EVENTO_ATENDIMENTO_ALTERADA. O
// orquestrador re-lê consulta + atendimentos e o status_consulta novo
// (aguardando-medico, em-observacao, aguardando-triagem...) vem do back --
// o front não calcula transição de estado.

import { finalizarAtendimento, cancelarAtendimento, ApiError } from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, EVENTO_BINARIO_CARREGADO, podeEscrever,
  MOTIVO_CANCELAMENTO_LABELS,
} from "./atendimentoHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  popularMotivos();
  $("aten-fin-finalizar")?.addEventListener("click", finalizar);
  $("aten-fin-cancelar")?.addEventListener("click", cancelar);
  // Só atualizam a tela; nenhum dos dois dispara evento -- sem loop.
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, atualizar);
  document.addEventListener(EVENTO_BINARIO_CARREGADO, atualizar);
});

/** Preenche o select de motivo (enum do back); vazio = sem motivo, o corpo vai sem o campo. */
function popularMotivos() {
  const select = $("aten-fin-motivo");
  if (!select) return;
  select.innerHTML = "";
  const vazio = document.createElement("option");
  vazio.value = "";
  vazio.textContent = "Sem motivo informado";
  select.appendChild(vazio);
  Object.entries(MOTIVO_CANCELAMENTO_LABELS).forEach(([valor, texto]) => {
    const opt = document.createElement("option");
    opt.value = valor;
    opt.textContent = texto;
    select.appendChild(opt);
  });
}

/** Mostra a barra só para o dono com atendimento em andamento; gate do binário no finalizar. */
function atualizar() {
  const painel = $("aten-acoes");
  if (!painel) return;

  const pode = podeEscrever();
  painel.hidden = !pode;
  if (!pode) return;

  const completo = estadoAtendimento.binarioCompleto;
  $("aten-fin-hint").hidden = completo;
  $("aten-fin-finalizar").disabled = enviando || !completo;
  $("aten-fin-cancelar").disabled = enviando;
}

function travar(valor) {
  enviando = valor;
  atualizar();
}

/** O atendimento acabou: limpa o estado local e deixa o orquestrador re-ler o back. */
function aoTerminar() {
  const obs = $("aten-fin-observacoes");
  if (obs) obs.value = "";
  const motivo = $("aten-fin-motivo");
  if (motivo) motivo.value = "";
  $("aten-fin-erro").textContent = "";
  estadoAtendimento.atendimento = null;
  estadoAtendimento.binarioCompleto = false;
  document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
}

function mostrarErro(erro, padrao) {
  const msg = erro instanceof ApiError ? erro.message : padrao;
  $("aten-fin-erro").textContent = msg;
  exibirMensagem(msg, "erro");
}

async function finalizar() {
  if (enviando || !podeEscrever()) return;
  $("aten-fin-erro").textContent = "";

  const observacoes = $("aten-fin-observacoes").value.trim();
  const payload = observacoes ? { observacoes } : {};

  travar(true);
  try {
    await finalizarAtendimento(estadoAtendimento.atendimento.uuid, payload);
    exibirMensagem("Atendimento finalizado.", "sucesso");
    enviando = false;
    aoTerminar();
  } catch (erro) {
    // 409 (binário incompleto) e 403 (não é o dono) chegam com mensagem pronta do back.
    mostrarErro(erro, "Não foi possível finalizar o atendimento.");
  } finally {
    travar(false);
  }
}

async function cancelar() {
  if (enviando || !podeEscrever()) return;
  if (!window.confirm("Cancelar este atendimento? Ele deixa de estar em andamento e a consulta volta ao estado anterior.")) return;
  $("aten-fin-erro").textContent = "";

  travar(true);
  try {
    const motivo = $("aten-fin-motivo")?.value;
    await cancelarAtendimento(estadoAtendimento.atendimento.uuid, motivo ? { motivo_cancelamento: motivo } : {});
    exibirMensagem("Atendimento cancelado.", "sucesso");
    enviando = false;
    aoTerminar();
  } catch (erro) {
    mostrarErro(erro, "Não foi possível cancelar o atendimento.");
  } finally {
    travar(false);
  }
}