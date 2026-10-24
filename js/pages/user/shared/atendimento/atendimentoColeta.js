// atendimentoColeta.js
//
// Aba de coleta clínica + input de protocolo + execução de protocolo.
//
// GATE: o back exige o binário COMPLETO para coleta e input (409). O
// front espelha: a aba coleta escuta EVENTO_BINARIO_CARREGADO e só
// libera o formulário quando estadoAtendimento.binarioCompleto.
//
// FLUXO DE PROTOCOLO:
//   1. select de protocolos (GET .../protocolos-disponiveis — catálogo
//      ativo, escopo compatível com o tipo de atendimento e liberado
//      pela empresa);
//   2. ao escolher, GET .../protocolos/<uuid>/estrutura renderiza um
//      campo por campo esperado (booleano -> select Sim/Não — o back
//      traduz em traduzir_booleano; numérico -> number; opcoes -> select);
//   3. "Registrar input" monta input_json dos campos e chama o POST
//      de input-protocolo (o validator atual segue recebendo jsonTexto);
//   4. com input registrado, o card ganha "Executar protocolo"
//      (POST .../protocolos/<uuid>/executar, sobre o input vigente —
//      409 se o mesmo protocolo já rodou neste input; novo input
//      permite nova execução). Resultado fica no sessionStorage.
//
// LIMITAÇÃO DE BACK (conhecida): não existe GET de coletas/input/execuções
// de um atendimento. A lista do atendimento atual fica em sessionStorage
// ("aten:coletas:<uuid_atendimento>"); refresh perde o que não foi
// persistido no back — mesma ressalva de antes.

import {
  registrarColeta, registrarInputProtocolo, executarProtocolo,
  listarProtocolosDisponiveis, estruturaProtocolo, ApiError,
} from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, EVENTO_BINARIO_CARREGADO,
  dadosPaciente, podeEscrever, el, formatarDataHora,
} from "./atendimentoHelpers.js";
import { validarColeta, validarInputProtocolo } from "../../../../sharedConfig/validacoes/atendimentoValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

const $ = (id) => document.getElementById(id);
let enviando = false;
let protocolos = [];              // catálogo disponível (re-lido por atendimento)
const estruturas = {};            // uuid_protocolo -> {campos: [...]} (cache)

document.addEventListener("DOMContentLoaded", () => {
  $("aten-co-criar")?.addEventListener("click", criarColeta);
  // delegação: botões e selects dos cards são criados dinamicamente
  $("aten-co-lista")?.addEventListener("click", (e) => {
    const card = e.target.closest(".aten-co-item");
    if (e.target.closest(".aten-ip-salvar")) salvarInput(card);
    if (e.target.closest(".aten-exec-executar")) executar(card);
  });
  $("aten-co-lista")?.addEventListener("change", (e) => {
    if (e.target.closest(".aten-ip-protocolo")) {
      aoEscolherProtocolo(e.target.closest(".aten-co-item"), e.target.value);
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
  await carregarProtocolos(); // re-renderiza com os selects preenchidos
}

// ============================================
// Protocolos disponíveis (catálogo + estrutura)
// ============================================
async function carregarProtocolos() {
  const a = estadoAtendimento.atendimento;
  if (!a) return;
  try {
    const resp = await listarProtocolosDisponiveis(a.uuid, estadoAtendimento.consulta.paciente_uuid);
    protocolos = resp.data ?? [];
  } catch (e) {
    console.warn("protocolos-disponiveis indisponível:", e?.message);
    protocolos = [];
  }
  renderColetas(); // re-render só preenche selects; formulários em edição perdem valor (mesmo comportamento de refresh)
}

async function aoEscolherProtocolo(card, uuidProtocolo) {
  const idx = Number(card?.dataset.idx);
  const area = $(`aten-ip-campos-${idx}`);
  if (!area) return;
  area.innerHTML = "";
  if (!uuidProtocolo) return;

  let est = estruturas[uuidProtocolo];
  if (!est) {
    area.appendChild(el("p", "field-hint", "Carregando campos do protocolo…"));
    try {
      const resp = await estruturaProtocolo(
        estadoAtendimento.atendimento.uuid,
        estadoAtendimento.consulta.paciente_uuid,
        uuidProtocolo,
      );
      est = estruturas[uuidProtocolo] = resp.data;
    } catch (erro) {
      area.innerHTML = "";
      area.appendChild(el("p", "field-error",
        erro instanceof ApiError ? erro.message : "Não foi possível carregar o protocolo."));
      return;
    }
  }

  area.innerHTML = "";
  const campos = est.campos ?? [];
  campos.forEach((c) => area.appendChild(campoDinamico(c)));
  if (!campos.length) {
    area.appendChild(el("p", "field-hint", "Este protocolo não declara campos de entrada."));
  }
}

/** Um campo do protocolo, conforme tipo_campo/opcoes. O nome do campo
 *  vai em data-campo e vira chave do input_json. */
function campoDinamico(campo) {
  const grupo = el("div", "field-group");
  grupo.appendChild(el("label", "field-label", campo.label ?? campo.campo));
  let input;
  if (campo.tipo_campo === "booleano") {
    input = document.createElement("select");
    input.appendChild(el("option", null, "—"));
    [["sim", "Sim"], ["nao", "Não"]].forEach(([v, t]) => {
      const opt = el("option", null, t);
      opt.value = v;
      input.appendChild(opt);
    });
  } else if (campo.opcoes?.length) {
    input = document.createElement("select");
    input.appendChild(el("option", null, "Selecione"));
    campo.opcoes.forEach((o) => {
      const valor = typeof o === "object" ? (o.valor ?? o.value) : o;
      const texto = typeof o === "object" ? (o.texto ?? o.label ?? valor) : o;
      const opt = el("option", null, texto);
      opt.value = valor;
      input.appendChild(opt);
    });
  } else if (campo.tipo_campo === "numerico") {
    input = document.createElement("input");
    input.type = "number";
    input.step = "any";
  } else {
    input = document.createElement("input");
    input.type = "text";
  }
  input.className = "field-input aten-ip-campo";
  input.dataset.campo = campo.campo;
  grupo.appendChild(input);
  return grupo;
}

/** input_json = {campo: valor} só com o que foi respondido. */
function montarInputJson(idx) {
  const json = {};
  $(`aten-ip-campos-${idx}`)?.querySelectorAll(".aten-ip-campo").forEach((input) => {
    const v = input.value;
    if (v !== "" && v !== null && v !== undefined) json[input.dataset.campo] = v;
  });
  return json;
}

// ============================================
// Gate do binário
// ============================================
function atualizarGate() {
  const liberado = podeEscrever() && estadoAtendimento.binarioCompleto;
  const soLeitura = !podeEscrever();

  $("aten-co-gate").hidden = liberado || soLeitura;
  $("aten-co-form-wrap").hidden = !liberado;
  $("aten-co-lista").querySelectorAll("input, textarea, select, button").forEach((c) => {
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
    card.appendChild(criarAreaExecucao(coleta, idx));
    return card;
  }

  // --- formulário de input (protocolo -> campos dinâmicos -> queixa/avpu)
  const form = el("div", "aten-ip-form");
  form.appendChild(campoSelectProtocolo(coleta, idx));
  const campos = el("div", "aten-ip-campos");
  campos.id = `aten-ip-campos-${idx}`;
  form.appendChild(campos);
  form.appendChild(campoTextarea(`aten-ip-queixa-${idx}`, "Queixa principal", 3));
  form.appendChild(campoInput(`aten-ip-avpu-${idx}`, "AVPU", "ex.: A"));

  const erro = el("p", "field-error");
  erro.id = `aten-ip-erro-${idx}`;
  form.appendChild(erro);

  const salvar = el("button", "btn-primary aten-ip-salvar", "Registrar input de protocolo");
  salvar.type = "button";
  form.appendChild(salvar);

  card.appendChild(form);
  return card;
}

function campoSelectProtocolo(coleta, idx) {
  const grupo = el("div", "field-group");
  const label = el("label", "field-label", "Protocolo");
  label.htmlFor = `aten-ip-protocolo-${idx}`;
  grupo.appendChild(label);
  const select = document.createElement("select");
  select.className = "field-input aten-ip-protocolo";
  select.id = `aten-ip-protocolo-${idx}`;
  select.appendChild(el("option", null, "Selecione o protocolo"));
  protocolos.forEach((p) => {
    const opt = el("option", null, p.nome_protocolo ?? p.sigla ?? p.uuid);
    opt.value = p.uuid;
    if (p.uuid === coleta.protocolo_uuid) opt.selected = true;
    select.appendChild(opt);
  });
  grupo.appendChild(select);
  return grupo;
}

// ============================================
// Execução de protocolo
// ============================================
function criarAreaExecucao(coleta, idx) {
  const area = el("div", "aten-exec-area");

  if (coleta.resultado) {
    area.appendChild(el("p", "field-hint",
      `Resultado (${coleta.resultado.nome_protocolo ?? "protocolo"}): ${textoResultado(coleta.resultado)}`));
    if (coleta.resultado.ausentes?.length) {
      area.appendChild(el("p", "field-hint",
        `Dados ausentes: ${coleta.resultado.ausentes.join(", ")}`));
    }
    return area;
  }

  const grupo = el("div", "field-group");
  const select = document.createElement("select");
  select.className = "field-input aten-exec-protocolo";
  select.id = `aten-exec-protocolo-${idx}`;
  select.appendChild(el("option", null, "Selecione o protocolo"));
  protocolos.forEach((p) => {
    const opt = el("option", null, p.nome_protocolo ?? p.sigla ?? p.uuid);
    opt.value = p.uuid;
    if (p.uuid === coleta.protocolo_uuid) opt.selected = true;
    select.appendChild(opt);
  });
  grupo.appendChild(select);
  area.appendChild(grupo);

  const erro = el("p", "field-error");
  erro.id = `aten-exec-erro-${idx}`;
  area.appendChild(erro);

  const btn = el("button", "btn-primary aten-exec-executar", "Executar protocolo");
  btn.type = "button";
  area.appendChild(btn);

  if (coleta.executado) {
    area.appendChild(el("p", "field-hint",
      "Protocolo já executado para este input — registre um novo input para executar novamente."));
  }
  return area;
}

function textoResultado(r) {
  const d = r.dados ?? {};
  if (d.resultado_json) return JSON.stringify(d.resultado_json);
  if (d.resultado != null) return String(d.resultado);
  return "registrado (ver detalhe no back)";
}

async function executar(card) {
  if (enviando || !card) return;
  const idx = Number(card.dataset.idx);
  const lista = lerColetas();
  const coleta = lista[idx];
  if (!coleta || !coleta.input_registrado) return;

  const errEl = $(`aten-exec-erro-${idx}`);
  if (errEl) errEl.textContent = "";

  const uuidProt = $(`aten-exec-protocolo-${idx}`)?.value;
  if (!uuidProt) {
    if (errEl) errEl.textContent = "Escolha o protocolo para executar.";
    return;
  }

  enviando = true;
  try {
    const resp = await executarProtocolo(
      estadoAtendimento.atendimento.uuid,
      estadoAtendimento.consulta.paciente_uuid,
      uuidProt,
    );
    const dados = resp.data ?? {};
    lista[idx] = {
      ...coleta,
      executado: true,
      resultado: {
        nome_protocolo: dados.protocolo_catalogo?.nome_protocolo ?? null,
        dados,
        ausentes: dados.dados_ausentes_json ?? null,
      },
    };
    gravarColetas(lista);
    exibirMensagem("Protocolo executado.", "sucesso");
    renderColetas();
  } catch (erro) {
    // 409 = mesmo protocolo já executado neste input; o recarregamento
    // do input (novo registro) é o caminho de nova execução.
    const msg = erro instanceof ApiError ? erro.message : "Não foi possível executar o protocolo.";
    if (errEl) errEl.textContent = msg;
    exibirMensagem(msg, "erro");
  } finally {
    enviando = false;
  }
}

// ============================================
// Campos auxiliares
// ============================================
function campoTextarea(id, labelTexto, rows) {
  const grupo = el("div", "field-group");
  const label = el("label", "field-label", labelTexto);
  label.htmlFor = id;
  grupo.appendChild(label);
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

// ============================================
// Criação de coleta e registro de input
// ============================================
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
      protocolo_uuid: null,
      executado: false,
      resultado: null,
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

  // protocolo é obrigatório no front: é ele que define os campos do input
  const uuidProt = $(`aten-ip-protocolo-${idx}`)?.value;
  if (!uuidProt) {
    $(`aten-ip-erro-${idx}`).textContent = "Escolha o protocolo antes de registrar o input.";
    return;
  }

  const validacao = validarInputProtocolo({
    queixa: $(`aten-ip-queixa-${idx}`)?.value,
    avpu: $(`aten-ip-avpu-${idx}`)?.value,
    jsonTexto: JSON.stringify(montarInputJson(idx)), // mantém o contrato atual do validator
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
    lista[idx] = { ...coleta, input_registrado: true, protocolo_uuid: uuidProt };
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