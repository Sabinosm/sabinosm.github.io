// atendimentoSinais.js
//
// Aba de sinais vitais: registro em LOTE (1 a 50 por requisição, tudo ou
// nada no back -- espelhamos validando tudo antes de enviar). NÃO exige
// binário: pode ser preenchido a qualquer momento do atendimento.
//
// - unidade travada por tipo (select do tipo preenche sozinho; o back
//   rejeita unidade errada com 422, mas aqui nem chega a acontecer);
// - sítio de medição só aparece para os tipos que o têm (schema.py);
// - "últimos registrados" vem de /binario/novo-atendimento (dados do
//   paciente) quando existir -- leitura pura, sem rota própria.

import { registrarSinaisVitais, ApiError } from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, EVENTO_BINARIO_CARREGADO,
  UNIDADE_POR_TIPO, TIPO_PARAMETRO_LABELS, SITIOS_POR_TIPO, SITIO_LABELS,
  dadosPaciente, podeEscrever, el,
} from "./atendimentoHelpers.js";
import { validarSinaisVitais } from "../../../../sharedConfig/validacoes/atendimentoValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
const MAX_LINHAS = 50;
let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  $("aten-sv-add")?.addEventListener("click", () => adicionarLinha());
  $("aten-sv-salvar")?.addEventListener("click", salvar);
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, carregar);
  document.addEventListener(EVENTO_BINARIO_CARREGADO, renderAnteriores);
});

async function carregar() {
  if (!estadoAtendimento.atendimento) return;
  renderAnteriores();

  const corpo = $("aten-sv-linhas");
  corpo.innerHTML = "";
  adicionarLinha();

  const pode = podeEscrever();
  $("aten-sv-add").hidden = !pode;
  $("aten-sv-salvar").hidden = !pode;
  $("aten-sv-leitura-hint").hidden = pode;
}

/** Sinais anteriores do paciente (vindos em /novo-atendimento), só leitura. */
function renderAnteriores() {
  const caixa = $("aten-sv-anteriores");
  if (!caixa) return;
  const anteriores = dadosPaciente().sinais_vitais;
  caixa.innerHTML = "";
  if (!Array.isArray(anteriores) || anteriores.length === 0) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  caixa.appendChild(el("h3", "cons-panel-titulo", "Últimos registrados (referência)"));
  const ul = el("ul", "aten-lista-ref");
  anteriores.slice(-10).forEach((s) => {
    const tipo = TIPO_PARAMETRO_LABELS[s.tipo_parametro] ?? s.tipo_parametro;
    ul.appendChild(el("li", null, `${tipo}: ${s.valor_numerico} ${s.unidade ?? ""}`.trim()));
  });
  caixa.appendChild(ul);
}

// ============================================
// Linhas do lote
// ============================================
function adicionarLinha() {
  const corpo = $("aten-sv-linhas");
  if (!corpo || corpo.children.length >= MAX_LINHAS) return;

  const tr = document.createElement("tr");

  // tipo
  const tdTipo = document.createElement("td");
  const selectTipo = document.createElement("select");
  selectTipo.className = "field-input aten-sv-tipo";
  selectTipo.appendChild(el("option", null, "Selecione"));
  Object.entries(TIPO_PARAMETRO_LABELS).forEach(([valor, label]) => {
    selectTipo.appendChild(el("option", null, label)).value = valor;
  });
  // (el() com texto devolve o option; ajustar valor abaixo)
  [...selectTipo.options].forEach((opt, i) => { if (i > 0) opt.value = Object.keys(TIPO_PARAMETRO_LABELS)[i - 1]; });
  tdTipo.appendChild(selectTipo);
  tr.appendChild(tdTipo);

  // valor
  const tdValor = document.createElement("td");
  const inputValor = document.createElement("input");
  inputValor.type = "number";
  inputValor.min = "0";
  inputValor.step = "any";
  inputValor.className = "field-input aten-sv-valor";
  tdValor.appendChild(inputValor);
  tr.appendChild(tdValor);

  // unidade (readonly, preenchida pelo tipo)
  const tdUn = document.createElement("td");
  const inputUn = document.createElement("input");
  inputUn.className = "field-input aten-sv-unidade";
  inputUn.readOnly = true;
  inputUn.placeholder = "—";
  tdUn.appendChild(inputUn);
  tr.appendChild(tdUn);

  // sítio
  const tdSitio = document.createElement("td");
  const selectSitio = document.createElement("select");
  selectSitio.className = "field-input aten-sv-sitio";
  tdSitio.appendChild(selectSitio);
  tr.appendChild(tdSitio);

  // DPOC
  const tdDpoc = document.createElement("td");
  const labelDpoc = el("label", "aten-sv-dpoc");
  const inputDpoc = document.createElement("input");
  inputDpoc.type = "checkbox";
  labelDpoc.append(inputDpoc, document.createTextNode(" DPOC"));
  tdDpoc.appendChild(labelDpoc);
  tr.appendChild(tdDpoc);

  // remover
  const tdRem = document.createElement("td");
  const btnRem = el("button", "btn-ghost aten-sv-remover", "×");
  btnRem.type = "button";
  btnRem.title = "Remover linha";
  btnRem.addEventListener("click", () => tr.remove());
  tdRem.appendChild(btnRem);
  tr.appendChild(tdRem);

  selectTipo.addEventListener("change", () => aoTrocarTipo(tr, selectTipo.value));
  corpo.appendChild(tr);
}

function aoTrocarTipo(tr, tipo) {
  tr.querySelector(".aten-sv-unidade").value = UNIDADE_POR_TIPO[tipo] ?? "";

  const selectSitio = tr.querySelector(".aten-sv-sitio");
  selectSitio.innerHTML = "";
  selectSitio.appendChild(el("option", null, "—"));
  (SITIOS_POR_TIPO[tipo] ?? []).forEach((s) => {
    const opt = el("option", null, SITIO_LABELS[s] ?? s);
    opt.value = s;
    selectSitio.appendChild(opt);
  });
}

function lerLinhas() {
  return [...$("aten-sv-linhas").querySelectorAll("tr")].map((tr) => ({
    tipo_parametro: tr.querySelector(".aten-sv-tipo").value,
    valorTexto: tr.querySelector(".aten-sv-valor").value,
    sitio: tr.querySelector(".aten-sv-sitio").value || null,
    dpoc: tr.querySelector(".aten-sv-dpoc input").checked,
  }));
}

// ============================================
// Envio
// ============================================
async function salvar() {
  if (enviando) return;

  const validacao = validarSinaisVitais(lerLinhas());
  if (!validacao.ok) {
    exibirMensagem(validacao.erros._geral ?? "Verifique os sinais.", "erro");
    return;
  }

  enviando = true;
  $("aten-sv-salvar").disabled = true;
  try {
    await registrarSinaisVitais(
      estadoAtendimento.atendimento.uuid,
      estadoAtendimento.consulta.paciente_uuid,
      validacao.dados,
    );
    exibirMensagem("Sinais vitais registrados.", "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível registrar os sinais.", "erro");
  } finally {
    enviando = false;
    $("aten-sv-salvar").disabled = false;
  }
}
