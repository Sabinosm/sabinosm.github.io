// consultaNova.js
//
// Modal "Nova consulta". Uma aba por forma do corpo de POST /consultas/:
//   cadastrado  -> { uuid_paciente }
//   novo        -> { paciente: {...} }
//   emergencia  -> { paciente_nao_identificado: true, motivo_emergencia, sexo_biologico? }
// Mais origem_encaminhamento (vale para as três).
//
// Fluxo do envio:
//   1. monta o payload da aba ativa e checa o que é da própria aba
//      (paciente escolhido, motivo preenchido, campos do novo paciente);
//   2. validarAberturaConsulta (espelho do schema do back: formas
//      exclusivas, regras cruzadas, enums);
//   3. abrirConsulta. Sucesso -> vai para o detalhe da consulta (é lá
//      que ficam consentimento e atendimentos).
//
// 409 "já possui consulta aberta" não é erro de formulário: abre o
// diálogo para continuar a consulta existente ou ir encerrá-la. O uuid
// da aberta só vem dentro da mensagem do backend (extrairUuid); se não
// vier (ex: corrida entre duas aberturas), o diálogo só informa.
//
// Busca de paciente (aba "cadastrado"): GET /pacientes/pessoal/resumo
// com `q`. O parâmetro `q` ainda precisa existir no backend (ver nota
// em consultaApi.listarPacientesResumo).
//
// Aba "novo": espelha PacienteCriarSchema (schema_paciente.py). Obrigatórios:
// sexo_biologico, data_nascimento, nome_completo e cpf. Telefone e e-mail são
// opcionais; endereço, RG e contato de emergência ficam para depois
// (PUT /pacientes/pessoal/<uuid>). A leitura e a validação do formulário ficam
// em consultaPacienteForm.js (compartilhadas com a identificação de paciente).

import { ApiError, abrirConsulta, listarPacientesResumo } from "./consultaApi.js";
import { validarAberturaConsulta } from "../../../../sharedConfig/validacoes/consultaValidation.js";
import { CAMPO_GERAL, hojeIso } from "../../../../sharedConfig/validacoes/generalValidation.js";
import { CAMPOS_PACIENTE, lerPacienteForm } from "./consultaPacienteForm.js";
import { extrairUuid, urlDetalhe } from "./consultaHelpers.js";

const CLASSE_VISIVEL = "settings-overlay--visible"; // mesmo padrão do modal de profissionais
const DEBOUNCE_BUSCA_MS = 350;
const MIN_CARACTERES_BUSCA = 2;
const ATRASO_REDIRECIONAR_MS = 600;
const FORMAS = ["cadastrado", "novo", "emergencia"];

// Campo do schema do back -> id do input no HTML (para pintar o erro no lugar certo).
// "sexo_biologico" existe nas duas abas (emergência e novo paciente), então o id
// depende da aba ativa: ver idDoCampo().
const CAMPOS_COMUNS = {
  uuid_paciente: "cons-paciente-busca",
  motivo_emergencia: "cons-motivo-emergencia",
  origem_encaminhamento: "cons-origem",
};

function idDoCampo(chave) {
  if (forma === "novo" && chave in CAMPOS_PACIENTE) return CAMPOS_PACIENTE[chave];
  if (forma === "emergencia" && chave === "sexo_biologico") return "cons-sexo-emergencia";
  return CAMPOS_COMUNS[chave] ?? null;
}

const $ = (id) => document.getElementById(id);

let forma = "cadastrado";
let pacienteSelecionado = null; // { uuid, nome }
let timerBusca = null;
let seqBusca = 0;               // descarta resposta de busca que chegou atrasada
let enviando = false;
let redirecionando = false;
let uuidConsultaAberta = null;  // vindo do 409

document.addEventListener("DOMContentLoaded", () => {
  $("cons-pac-nascimento")?.setAttribute("max", hojeIso());
  $("btn-nova-consulta")?.addEventListener("click", abrirModal);
  $("cons-modal-close")?.addEventListener("click", fecharModal);
  $("cons-modal-cancel")?.addEventListener("click", fecharModal);
  $("cons-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("cons-modal-overlay")) fecharModal();
  });

  $("cons-nova-abas")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-item");
    if (btn) definirForma(btn.dataset.forma);
  });

  $("cons-paciente-busca")?.addEventListener("input", aoDigitarBusca);
  $("cons-paciente-trocar")?.addEventListener("click", trocarPaciente);
  $("form-nova-consulta")?.addEventListener("submit", aoSubmeter);

  // diálogo de consulta duplicada
  $("cons-duplicada-fechar")?.addEventListener("click", fecharDialogoDuplicada);
  $("cons-duplicada-overlay")?.addEventListener("click", (e) => {
    if (e.target === $("cons-duplicada-overlay")) fecharDialogoDuplicada();
  });
  $("cons-duplicada-continuar")?.addEventListener("click", () => {
    if (uuidConsultaAberta) window.location.href = urlDetalhe(uuidConsultaAberta);
  });
  $("cons-duplicada-encerrar")?.addEventListener("click", () => {
    if (uuidConsultaAberta) window.location.href = urlDetalhe(uuidConsultaAberta, "encerrar");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("cons-duplicada-overlay")?.classList.contains(CLASSE_VISIVEL)) fecharDialogoDuplicada();
    else if ($("cons-modal-overlay")?.classList.contains(CLASSE_VISIVEL)) fecharModal();
  });
});

// ============================================
// Abrir / fechar
// ============================================
function abrirModal() {
  limparFormulario();
  definirForma("cadastrado");
  $("cons-modal-overlay").classList.add(CLASSE_VISIVEL);
  $("cons-paciente-busca")?.focus();
}

function fecharModal() {
  if (redirecionando) return;
  $("cons-modal-overlay")?.classList.remove(CLASSE_VISIVEL);
  fecharDialogoDuplicada();
  limparFormulario();
}

function limparFormulario() {
  clearTimeout(timerBusca);
  seqBusca += 1;
  $("form-nova-consulta")?.reset();
  pacienteSelecionado = null;
  mostrarBuscaPaciente(true);
  renderizarResultados([]);
  limparErros();
  esconderFeedback();
  const salvar = $("cons-modal-save");
  if (salvar) salvar.disabled = false;
  enviando = false;
}

// ============================================
// Abas
// ============================================
function definirForma(nova) {
  if (!FORMAS.includes(nova)) return;
  forma = nova;

  document.querySelectorAll("#cons-nova-abas .segmented-item").forEach((btn) => {
    btn.classList.toggle("segmented-item--active", btn.dataset.forma === forma);
  });
  FORMAS.forEach((f) => {
    const aba = $(`cons-aba-${f}`);
    if (aba) aba.hidden = f !== forma;
  });

  limparErros();
  esconderFeedback();
}

// ============================================
// Aba "paciente cadastrado": busca e seleção
// ============================================
function aoDigitarBusca(e) {
  clearTimeout(timerBusca);
  const q = e.target.value.trim();
  limparErroCampo("cons-paciente-busca");

  if (q.length < MIN_CARACTERES_BUSCA) {
    seqBusca += 1; // invalida busca em andamento
    renderizarResultados([]);
    return;
  }
  timerBusca = setTimeout(() => buscarPacientes(q), DEBOUNCE_BUSCA_MS);
}

async function buscarPacientes(q) {
  const seq = ++seqBusca;
  try {
    const resposta = await listarPacientesResumo({ q });
    if (seq !== seqBusca) return;
    renderizarResultados(extrairItens(resposta.data));
  } catch (erro) {
    if (seq !== seqBusca) return;
    renderizarResultados([]);
    exibirErroCampo("cons-paciente-busca", erro instanceof ApiError ? erro.message : "Não foi possível buscar pacientes.");
  }
}

/** A rota de resumo pode devolver o array direto ou um objeto com a lista. */
function extrairItens(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.itens)) return data.itens;
  if (Array.isArray(data?.pacientes)) return data.pacientes;
  return [];
}

function renderizarResultados(itens) {
  const container = $("cons-paciente-resultados");
  if (!container) return;
  container.innerHTML = "";

  // paciente não identificado não tem nome para escolher aqui
  itens.filter((p) => p.uuid && p.nome_completo).forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cons-resultado-item";
    btn.setAttribute("role", "option");

    const nome = document.createElement("span");
    nome.textContent = p.nome_completo;
    btn.appendChild(nome);

    if (p.cpf_inicio) {
      const cpf = document.createElement("small");
      cpf.textContent = `CPF ${p.cpf_inicio}…`;
      btn.appendChild(cpf);
    }

    btn.addEventListener("click", () => selecionarPaciente({ uuid: p.uuid, nome: p.nome_completo }));
    container.appendChild(btn);
  });
}

function selecionarPaciente(p) {
  pacienteSelecionado = p;
  $("cons-paciente-selecionado-nome").textContent = p.nome;
  mostrarBuscaPaciente(false);
  renderizarResultados([]);
  limparErroCampo("cons-paciente-busca");
}

function trocarPaciente() {
  pacienteSelecionado = null;
  mostrarBuscaPaciente(true);
  const input = $("cons-paciente-busca");
  if (input) {
    input.value = "";
    input.focus();
  }
}

function mostrarBuscaPaciente(mostrar) {
  const grupoBusca = $("cons-paciente-busca")?.closest(".field-group");
  if (grupoBusca) grupoBusca.hidden = !mostrar;
  const selecionado = $("cons-paciente-selecionado");
  if (selecionado) selecionado.hidden = mostrar;
}

// ============================================
// Montagem do payload por aba
// ============================================

/** Monta o corpo da aba ativa. `erros` vem indexado por id de input. */
function montarPayload() {
  const erros = {};
  let payload = {};

  if (forma === "cadastrado") {
    if (!pacienteSelecionado) erros["cons-paciente-busca"] = "Busque e selecione um paciente.";
    else payload = { uuid_paciente: pacienteSelecionado.uuid };
  } else if (forma === "novo") {
    const lido = lerPacienteForm();
    Object.assign(erros, lido.erros);
    payload = { paciente: lido.paciente };
  } else {
    const motivo = $("cons-motivo-emergencia").value.trim();
    if (!motivo) erros["cons-motivo-emergencia"] = "Informe o motivo da emergência.";
    payload = { paciente_nao_identificado: true, motivo_emergencia: motivo };
    const sexo = $("cons-sexo-emergencia").value;
    if (sexo) payload.sexo_biologico = sexo;
  }

  const origem = $("cons-origem")?.value;
  if (origem) payload.origem_encaminhamento = origem;

  return { payload, erros };
}

// ============================================
// Envio
// ============================================
async function aoSubmeter(e) {
  e.preventDefault();
  if (enviando) return;

  limparErros();
  esconderFeedback();

  const montado = montarPayload();
  if (Object.keys(montado.erros).length > 0) {
    exibirErrosPorId(montado.erros);
    return;
  }

  const validacao = validarAberturaConsulta(montado.payload);
  if (!validacao.ok) {
    exibirErrosPorCampo(validacao.erros);
    return;
  }

  enviando = true;
  $("cons-modal-save").disabled = true;

  try {
    const resposta = await abrirConsulta(validacao.dados);
    redirecionando = true;
    exibirFeedback("Consulta aberta. Abrindo o detalhe…", "sucesso");
    const uuid = resposta.data?.uuid;
    setTimeout(() => {
      window.location.href = uuid ? urlDetalhe(uuid) : window.location.href;
    }, ATRASO_REDIRECIONAR_MS);
  } catch (erro) {
    tratarErroEnvio(erro);
  } finally {
    if (!redirecionando) {
      enviando = false;
      $("cons-modal-save").disabled = false;
    }
  }
}

function tratarErroEnvio(erro) {
  if (!(erro instanceof ApiError)) {
    exibirFeedback("Não foi possível abrir a consulta.", "erro");
    return;
  }

  // 409 de consulta duplicada: não é erro de formulário. Outros 409
  // (ex: CPF já cadastrado) seguem o caminho normal de erro.
  if (erro.status === 409 && /consulta aberta/i.test(erro.message)) {
    abrirDialogoDuplicada(erro.message);
    return;
  }

  // CPF já cadastrado na empresa (409): o erro é do campo, e a saída é
  // usar a aba de paciente cadastrado.
  if (erro.status === 409 && forma === "novo" && /\bCPF\b/.test(erro.message)) {
    exibirErroCampo("cons-pac-cpf", `${erro.message} Use a aba “Paciente cadastrado”.`);
    return;
  }

  if (erro.erros && Object.keys(erro.erros).length > 0) {
    exibirErrosPorCampo(erro.erros);
    return;
  }

  // Erros do schema de paciente chegam como texto "campo: msg; campo2: msg2"
  // (DadosInvalidosError do service, sem `erros`). Separa o que dá para
  // atribuir a um input; o resto vai inteiro para a mensagem do topo.
  const { porCampo, residual } = separarErrosDeTexto(erro.message);
  if (Object.keys(porCampo).length > 0) exibirErrosPorCampo(porCampo);
  if (residual) exibirFeedback(residual, "erro");
  else if (Object.keys(porCampo).length === 0) exibirFeedback(erro.message, "erro");
}

/** "cpf: CPF inválido; telefone: ..." -> { porCampo: {cpf, telefone}, residual: "..." } (só campos conhecidos). */
function separarErrosDeTexto(mensagem) {
  const porCampo = {};
  const restantes = [];

  String(mensagem ?? "").split(";").forEach((parte) => {
    const trecho = parte.trim();
    if (!trecho) return;
    const i = trecho.indexOf(":");
    const campo = i === -1 ? "" : trecho.slice(0, i).trim().split(".").pop();
    if (campo && idDoCampo(campo)) porCampo[campo] = trecho.slice(i + 1).trim();
    else restantes.push(trecho);
  });

  return { porCampo, residual: restantes.join("; ") };
}

// ============================================
// Diálogo: já existe consulta aberta
// ============================================
function abrirDialogoDuplicada(mensagem) {
  uuidConsultaAberta = extrairUuid(mensagem);
  $("cons-duplicada-mensagem").textContent = mensagem;

  // sem uuid não há para onde levar o usuário: só informa e deixa fechar
  const temDestino = Boolean(uuidConsultaAberta);
  $("cons-duplicada-continuar").hidden = !temDestino;
  $("cons-duplicada-encerrar").hidden = !temDestino;

  $("cons-duplicada-overlay").classList.add(CLASSE_VISIVEL);
}

function fecharDialogoDuplicada() {
  $("cons-duplicada-overlay")?.classList.remove(CLASSE_VISIVEL);
  uuidConsultaAberta = null;
}

// ============================================
// Erros e feedback
// ============================================

/** Erros já indexados por id de input (montados nesta tela). */
function exibirErrosPorId(erros) {
  Object.entries(erros).forEach(([id, msg]) => exibirErroCampo(id, msg));
}

/**
 * Erros indexados por campo do schema (validarAberturaConsulta e o
 * `erros` do backend). Campo sem input correspondente, e a chave
 * "_geral", vão para a mensagem do topo do modal. Erros do paciente
 * aninhado podem vir como "paciente.cpf": usa só o último trecho.
 */
function exibirErrosPorCampo(erros) {
  const gerais = [];

  Object.entries(erros).forEach(([campo, msg]) => {
    const chave = campo.split(".").pop();
    const id = campo === CAMPO_GERAL ? null : idDoCampo(chave);
    if (id && $(id)) exibirErroCampo(id, msg);
    else gerais.push(campo === CAMPO_GERAL || campo === "paciente" ? msg : `${campo}: ${msg}`);
  });

  if (gerais.length > 0) exibirFeedback(gerais.join(" "), "erro");
}

function exibirErroCampo(id, mensagem) {
  const input = $(id);
  const erroEl = $(`${id}-error`);
  input?.closest(".field-group")?.classList.add("field-group--has-error");
  input?.classList.add("field-input--invalid");
  if (erroEl) erroEl.textContent = mensagem;
}

function limparErroCampo(id) {
  const input = $(id);
  const erroEl = $(`${id}-error`);
  input?.closest(".field-group")?.classList.remove("field-group--has-error");
  input?.classList.remove("field-input--invalid");
  if (erroEl) erroEl.textContent = "";
}

function limparErros() {
  const form = $("form-nova-consulta");
  if (!form) return;
  form.querySelectorAll(".field-group--has-error").forEach((el) => el.classList.remove("field-group--has-error"));
  form.querySelectorAll(".field-input--invalid").forEach((el) => el.classList.remove("field-input--invalid"));
  form.querySelectorAll(".field-error").forEach((el) => { el.textContent = ""; });
}

function exibirFeedback(texto, tipo) {
  const el = $("mensagemFeedbackConsulta");
  if (!el) return;
  el.textContent = texto;
  el.className = `cons-form-feedback ${tipo}`;
}

function esconderFeedback() {
  const el = $("mensagemFeedbackConsulta");
  if (!el) return;
  el.textContent = "";
  el.className = "cons-form-feedback";
}