// atendimentoConduta.js
//
// Aba de conduta de enfermagem (só em atendimento de TRIAGEM -- o
// orquestrador esconde a aba nos demais tipos). Insert-only: após
// salvar, recarrega a lista (GET por atendimento existe).

import { registrarConduta, listarCondutasDoAtendimento, ApiError } from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, podeEscrever, el, formatarDataHora,
} from "./atendimentoHelpers.js";
import { validarConduta } from "../../../../sharedConfig/validacoes/atendimentoValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  $("aten-cond-salvar")?.addEventListener("click", salvar);
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, carregar);
});

async function carregar() {
  const a = estadoAtendimento.atendimento;
  if (!a || a.tipo_atendimento !== "triagem") return;

  const pode = podeEscrever();
  $("aten-cond-form-wrap").hidden = !pode;
  $("aten-cond-leitura-hint").hidden = pode;

  try {
    const resp = await listarCondutasDoAtendimento(a.uuid);
    renderLista(resp.data ?? []);
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 404) {
      renderLista([]); // rota ainda não deployada: não quebra a aba
      return;
    }
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível carregar as condutas.", "erro");
  }
}

function renderLista(condutas) {
  const container = $("aten-cond-lista");
  container.innerHTML = "";

  if (!condutas.length) {
    container.appendChild(el("p", "field-hint", "Nenhuma conduta registrada neste atendimento."));
    return;
  }

  condutas.forEach((c) => {
    const card = el("div", "cons-panel aten-cond-item");
    card.appendChild(el("p", "aten-cond-descricao", c.descricao_conduta ?? ""));
    const meta = [];
    if (c.data_hora ?? c.criado_em) meta.push(formatarDataHora(c.data_hora ?? c.criado_em));
    if (c.uuid_protocolo_catalogo) meta.push("do catálogo de protocolos");
    if (meta.length) card.appendChild(el("p", "field-hint", meta.join(" — ")));
    container.appendChild(card);
  });
}

async function salvar() {
  if (enviando) return;
  limparErros();

  const validacao = validarConduta({
    descricao: $("aten-cond-descricao").value,
    uuidProtocolo: $("aten-cond-protocolo").value,
  });
  if (!validacao.ok) {
    pintarErros(validacao.erros);
    return;
  }

  enviando = true;
  $("aten-cond-salvar").disabled = true;
  try {
    await registrarConduta(
      estadoAtendimento.atendimento.uuid,
      estadoAtendimento.consulta.paciente_uuid,
      validacao.dados,
    );
    $("aten-cond-descricao").value = "";
    $("aten-cond-protocolo").value = "";
    exibirMensagem("Conduta de enfermagem registrada.", "sucesso");
    await carregar(); // insert-only: recarrega a lista
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível registrar a conduta.", "erro");
  } finally {
    enviando = false;
    $("aten-cond-salvar").disabled = false;
  }
}

function pintarErros(erros) {
  const mapa = { descricao_conduta: "aten-cond-descricao", uuid_protocolo_catalogo: "aten-cond-protocolo" };
  Object.entries(erros).forEach(([campo, msg]) => {
    const id = mapa[campo];
    if (!id) return;
    $(id)?.closest(".field-group")?.classList.add("field-group--has-error");
    const elErro = $(`${id}-error`);
    if (elErro) elErro.textContent = msg;
  });
}

function limparErros() {
  ["aten-cond-descricao", "aten-cond-protocolo"].forEach((id) => {
    $(id)?.closest(".field-group")?.classList.remove("field-group--has-error");
    const elErro = $(`${id}-error`);
    if (elErro) elErro.textContent = "";
  });
}
