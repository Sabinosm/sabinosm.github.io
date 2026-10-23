// atendimentoColeta.js
//
// Aba de coleta clínica + input de protocolo.
//
// GATE: o back exige o binário COMPLETO para coleta e input (409). O
// front espelha: a aba coleta escuta EVENTO_BINARIO_CARREGADO e só
// libera o formulário quando estadoAtendimento.binarioCompleto.
//
// LIMITAÇÃO DE BACK (conhecida): não existe GET de coletas/input de um
// atendimento. Para não perder o que foi criado num refresh, a lista de
// coletas do atendimento atual fica em sessionStorage
// ("aten:coletas:<uuid_atendimento>"). Os dados de atendimentos
// ANTERIORES vêm em /binario/novo-atendimento (dados do paciente) e
// aparecem como referência somente leitura.

import { registrarColeta, registrarInputProtocolo, ApiError } from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, EVENTO_BINARIO_CARREGADO,
  dadosPaciente, podeEscrever, el, formatarDataHora,
} from "./atendimentoHelpers.js";
import { validarColeta, validarInputProtocolo } from "./atendimentoValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  $("aten-co-criar")?.addEventListener("click", criarColeta);
  // inputs são salvos por delegação (botões criados dinamicamente)
  $("aten-co-lista")?.addEventListener("click", (e) => {
    if (e.target.closest(".aten-ip-salvar")) {
      salvarInput(e.target.closest(".aten-co-item"));
    }
  });
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, carregar);
  document.addEventListener(EVENTO_BINARIO_CARREGADO, atualizarGate);
});

async function carregar() {
  if (!estadoAtendimento.atendimento) return;
  atualizarGate();
  renderColetas();
  renderAnteriores();
}

// ============================================
// Gate do binário
// ============================================
function atualizarGate() {
  const liberado = podeEscrever() && estadoAtendimento.binarioCompleto;
  const soLeitura = !podeEscrever();

  $("aten-co-gate").hidden = liberado || soLeitura;
  $("aten-co-form-wrap").hidden = !liberado;
  $("aten-co-lista").querySelectorAll("input, textarea, button").forEach((c) => {
    c.disabled = !liberado;
  });
  $("aten-co-leitura-hint").hidden = !soLeitura;
}

// ============================================
// Coletas do atendimento atual (sessionStorage)
// ============================================
const chave = () => `aten:coletas:${estadoAtendimento.atendimento.uuid}`;

function lerColetas() {
  try {
    return JSON.parse(sessionStorage.getItem(chave()) ?? "[]");
  } catch { return []; }
}

function gravarColetas(lista) {
  try {
    sessionStorage.setItem(chave(), JSON.stringify(lista));
  } catch (e) { console.warn("aten: falha ao gravar coletas no sessionStorage", e); }
}

function renderColetas() {
  const container = $("aten-co-lista");
  container.innerHTML = "";

  const lista = lerColetas();
  if (lista.length === 0) {
    container.appendChild(el("p", "field-hint", "Nenhuma coleta registrada neste atendimento ainda."));
    return;
  }

  lista.forEach((coleta, idx) => container.appendChild(criarCardColeta(coleta, idx)));
}

function criarCardColeta(coleta, idx) {
  const card = el("section", "cons-panel aten-co-item");
  card.dataset.idx = String(idx);

  const titulo = el("h3", "cons-panel-titulo",
    `Coleta ${idx + 1}${coleta.desde_quando_sintomas != null ? ` — sintomas há ${coleta.desde_quando_sintomas}h` : ""}`);
  card.appendChild(titulo);

  if (coleta.input_registrado) {
    card.appendChild(el("p", "field-hint", "Input de protocolo registrado para esta coleta."));
    return card;
  }

  // --- formulário de input (queixa / avpu / input_json)
  const form = el("div", "aten-ip-form");
  form.appendChild(campoTextarea(`aten-ip-queixa-${idx}`, "Queixa principal", 3));
  form.appendChild(campoInput(`aten-ip-avpu-${idx}`, "AVPU", "ex.: A"));
  form.appendChild(campoTextarea(`aten-ip-json-${idx}`, "Respostas do protocolo (JSON, opcional)", 3));

  const erro = el("p", "field-error");
  erro.id = `aten-ip-erro-${idx}`;
  form.appendChild(erro);

  const salvar = el("button", "btn-primary aten-ip-salvar", "Registrar input de protocolo");
  salvar.type = "button";
  form.appendChild(salvar);

  card.appendChild(form);
  return card;
}

function campoTextarea(id, labelTexto, rows) {
  const grupo = el("div", "field-group");
  grupo.appendChild(el("label", "field-label", labelTexto)).htmlFor = id;
  const t = document.createElement("textarea");
  t.className = "field-input";
  t.id = id;
  t.rows = rows;
  grupo.appendChild(t);
  const erro = el("p", "field-error");
  erro.id = `${id}-error`;
  grupo.appendChild(erro);
  return grupo;
}

function campoInput(id, labelTexto, placeholder) {
  const grupo = el("div", "field-group");
  const label = el("label", "field-label", labelTexto);
  label.htmlFor = id;
  grupo.appendChild(label);
  const i = document.createElement("input");
  i.className = "field-input";
  i.id = id;
  i.placeholder = placeholder;
  grupo.appendChild(i);
  const erro = el("p", "field-error");
  erro.id = `${id}-error`;
  grupo.appendChild(erro);
  return grupo;
}

async function criarColeta() {
  if (enviando) return;
  $("aten-co-desde-error").textContent = "";

  const validacao = validarColeta({ desdeTexto: $("aten-co-desde").value });
  if (!validacao.ok) {
    $("aten-co-desde-error").textContent = validacao.erros._geral ?? "Valor inválido.";
    return;
  }

  enviando = true;
  $("aten-co-criar").disabled = true;
  try {
    const resp = await registrarColeta(
      estadoAtendimento.atendimento.uuid,
      estadoAtendimento.consulta.paciente_uuid,
      validacao.dados,
    );
    const lista = lerColetas();
    lista.push({
      uuid: resp.data?.uuid ?? null,
      desde_quando_sintomas: validacao.dados.desde_quando_sintomas ?? null,
      input_registrado: false,
    });
    gravarColetas(lista);
    $("aten-co-desde").value = "";
    exibirMensagem("Coleta clínica registrada.", "sucesso");
    renderColetas();
    atualizarGate();
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível registrar a coleta.", "erro");
  } finally {
    enviando = false;
    $("aten-co-criar").disabled = false;
  }
}

async function salvarInput(card) {
  if (enviando || !card) return;
  const idx = Number(card.dataset.idx);
  const lista = lerColetas();
  const coleta = lista[idx];
  if (!coleta || coleta.input_registrado) return;

  $(`aten-ip-erro-${idx}`).textContent = "";

  const validacao = validarInputProtocolo({
    queixa: $(`aten-ip-queixa-${idx}`)?.value,
    avpu: $(`aten-ip-avpu-${idx}`)?.value,
    jsonTexto: $(`aten-ip-json-${idx}`)?.value,
  });
  if (!validacao.ok) {
    $(`aten-ip-erro-${idx}`).textContent =
      validacao.erros._geral ?? Object.values(validacao.erros)[0] ?? "Verifique o input.";
    return;
  }

  enviando = true;
  try {
    await registrarInputProtocolo(
      estadoAtendimento.atendimento.uuid,
      estadoAtendimento.consulta.paciente_uuid,
      coleta.uuid,
      validacao.dados,
    );
    lista[idx] = { ...coleta, input_registrado: true };
    gravarColetas(lista);
    exibirMensagem("Input de protocolo registrado.", "sucesso");
    renderColetas();
  } catch (erro) {
    $(`aten-ip-erro-${idx}`).textContent = erro instanceof ApiError ? erro.message : "Não foi possível registrar o input.";
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível registrar o input.", "erro");
  } finally {
    enviando = false;
  }
}

// ============================================
// Coletas anteriores (referência, /novo-atendimento)
// ============================================
function renderAnteriores() {
  const caixa = $("aten-co-anteriores");
  if (!caixa) return;
  const anteriores = dadosPaciente().coletas_clinicas;
  caixa.innerHTML = "";
  if (!Array.isArray(anteriores) || anteriores.length === 0) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  caixa.appendChild(el("h3", "cons-panel-titulo", "Coletas de atendimentos anteriores (referência)"));
  const ul = el("ul", "aten-lista-ref");
  anteriores.forEach((c) => {
    ul.appendChild(el("li", null,
      `Sintomas há ${c.desde_quando_sintomas ?? "?"}h${c.data_hora ? ` — ${formatarDataHora(c.data_hora)}` : ""}`));
  });
  caixa.appendChild(ul);
}
