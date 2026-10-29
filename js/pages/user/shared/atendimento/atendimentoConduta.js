// atendimentoConduta.js
//
// Aba de conduta de enfermagem (só em atendimento de TRIAGEM -- o
// orquestrador esconde a aba nos demais tipos). Insert-only: após
// salvar, recarrega a lista (GET por atendimento existe).
//
// PROTOCOLO (opcional): select com os protocolos LIBERADOS pela empresa para
// este atendimento, favoritos em destaque (GET .../protocolos-disponiveis, o
// mesmo da aba de coleta; a lógica do select é atendimentoProtocoloSelect.js).
// Não pré-seleciona padrão: a conduta só aponta para um protocolo se o
// profissional escolher. O valor enviado continua sendo o uuid do catálogo.

import {
  registrarConduta, listarCondutasDoAtendimento, listarProtocolosDisponiveis, ApiError,
} from "./atendimentoApi.js";
import { escopoDoAtendimentoDe, preencherSelect } from "./atendimentoProtocolo/atendimentoProtocoloSelect.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, podeEscrever, el, formatarDataHora,
} from "./atendimentoHelpers.js";
import { validarConduta } from "../../../../sharedConfig/validacoes/atendimentoValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let enviando = false;
let protocolos = [];   // liberados + favoritos (re-lido a cada carregar)

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

  await carregarProtocolos(a);

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

/** Lista os protocolos liberados no select. Falhou? A conduta continua valendo sem protocolo. */
async function carregarProtocolos(a) {
  const select = $("aten-cond-protocolo");
  if (!select) return;
  const escolhido = select.value || null; // não perde a escolha em andamento ao recarregar
  try {
    const resp = await listarProtocolosDisponiveis(a.uuid, estadoAtendimento.consulta.paciente_uuid);
    protocolos = resp.data ?? [];
  } catch (erro) {
    console.warn("protocolos-disponiveis indisponível:", erro?.message);
    protocolos = [];
  }
  preencherSelect(select, protocolos, {
    selecionado: escolhido,
    escopo: escopoDoAtendimentoDe(a),
    placeholder: "Nenhum (conduta sem protocolo)",
    textoVazio: "Nenhum protocolo liberado — a conduta vale sem protocolo",
  });
  // sem protocolos o select vem desabilitado: o valor vazio segue valendo no envio
}

/** Nome do protocolo a partir do uuid guardado na conduta (se ainda estiver liberado). */
function nomeDoProtocolo(uuid) {
  const p = protocolos.find((x) => x.uuid === uuid);
  return p ? (p.nome_protocolo ?? p.sigla ?? null) : null;
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
    if (c.uuid_protocolo_catalogo) {
      const nome = nomeDoProtocolo(c.uuid_protocolo_catalogo);
      meta.push(nome ? `Protocolo: ${nome}` : "do catálogo de protocolos");
    }
    if (meta.length) card.appendChild(el("p", "field-hint", meta.join(" — ")));
    container.appendChild(card);
  });
}

async function salvar() {
  if (enviando) return;
  limparErros();

  const validacao = validarConduta({
    descricao: $("aten-cond-descricao").value,
    uuidProtocolo: $("aten-cond-protocolo")?.value ?? "", // campo opcional: tolera a página sem o select
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
    const selProtocolo = $("aten-cond-protocolo");
    if (selProtocolo) selProtocolo.value = "";
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
