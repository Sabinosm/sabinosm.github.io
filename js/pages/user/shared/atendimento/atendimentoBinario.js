// atendimentoBinario.js
//
// Aba do binário: as 4 seções (alergias, medicamentos, tipo sanguíneo,
// doença crônica) com a máquina de estados do back (binario.py):
//
//   pendente (sem chave)        -> card amarelo, formulário livre
//   automatico (derivado)       -> card neutro com badge "Derivado — confirme";
//                                  radios PRÉ-SELECIONADOS com os valores atuais
//                                  (o POST sobrescreve automático sem 409)
//   manual (conferido aqui)     -> card verde TRAVADO (reconferir = 409 no back;
//                                  nem oferecemos o formulário)
//   requer-revisao              -> card laranja "Requer revisão" com o motivo;
//                                  o profissional precisa reconfirmar (não vale
//                                  no gate do back)
//
// ITENS ESTRUTURADOS: quando a resposta é "possui", o profissional pode
// preencher itens novos em formulário próprio por seção — validados pelas
// validações de DOMÍNIO já existentes (o binário "possui" grava/atualiza o
// dado do paciente). Se o dado já consta na lista vigente, basta conferir
// sem repetir o item (itens: [] confirma o registro ativo).
//
// Pré-preenchimento: SEMPRE busca GET /binario/do-paciente junto com o estado
// (não só no 1º atendimento). Os registros ativos do paciente alimentam os cards
// (via dadosPaciente()) e pré-selecionam a resposta quando a seção ainda não
// foi conferida neste atendimento.
//
// Escrita: rota granular por seção. O "Conferir todas" monta o agregado das 4
// e só funciona quando as 4 têm resposta (nenhuma travada em manual).
// 409 "já conferida" NÃO é erro de usuário: recarrega e segue.

import {
  estadoBinario, binarioDoPaciente, conferirSecao, conferirBinario, ApiError,
} from "./atendimentoApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, EVENTO_BINARIO_CARREGADO,
  SECOES_BINARIO, normalizarSecoesBinario, classeSecao, ESTADO_SECAO_LABELS,
  MOTIVO_REVISAO_LABELS, dadosPaciente, podeEscrever, el, textoItem,
} from "./atendimentoHelpers.js";
import { validarSecaoBinario, montarPayloadAgregado } from "../../../../sharedConfig/validacoes/atendimentoValidation.js";
import {
  validarCriarMedicamentoEmUso,
} from "../../../../sharedConfig/validacoes/medicamentosEmUsoValidation.js";
import {
  validarCriarDoencaCronica,
} from "../../../../sharedConfig/validacoes/doencaCronicaValidation.js";
import {
  validarRegistrarTipoSanguineo, TIPOS_SANGUINEOS,
} from "../../../../sharedConfig/validacoes/tipoSanguineoValidation.js";
import { CAMPO_GERAL, resultado, setErro, strip, tam } from "../../../../sharedConfig/validacoes/generalValidation.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

// ------------------------------------------------------------ domínio: itens
//
// Campos de cada item novo, por seção (espelho dos schemas de criação).
// A validação de cada item é da validação de domínio correspondente.
// ALERGIA: espelho local do AlergiaCreateSchema (substancia + uma reação:
// tipo_reacao, gravidade, descricao_reacao). Quando o alergiaValidation.js
// ganhar o contrato de criação, trocar `validarCriarAlergiaLocal` por ele.

const MANIFESTACOES = [
  ["cutanea", "Cutânea"], ["respiratoria", "Respiratória"], ["anafilaxia", "Anafilaxia"],
  ["gastrointestinal", "Gastrointestinal"], ["cardiovascular", "Cardiovascular"], ["sistemica", "Sistêmica"],
];
const GRAVIDADES = [["leve", "Leve"], ["moderada", "Moderada"], ["grave", "Grave"]];

const CAMPOS_ITEM = {
  alergias: [
    { campo: "substancia", label: "Substância", placeholder: "ex.: Dipirona" },
    { campo: "tipo_reacao", label: "Manifestação", tipo: "select", options: MANIFESTACOES },
    { campo: "gravidade", label: "Gravidade", tipo: "select", options: GRAVIDADES },
    { campo: "descricao_reacao", label: "Descrição da reação" },
  ],
  medicamentos: [
    { campo: "descricao", label: "Descrição", placeholder: "ex.: Dipirona 500mg" },
    { campo: "dose", label: "Dose", placeholder: "ex.: 500 mg" },
    { campo: "frequencia", label: "Frequência", placeholder: "ex.: 8/8h" },
    { campo: "desde", label: "Desde", tipo: "date" },
  ],
  doenca_cronica: [
    { campo: "codigo_cid10", label: "CID-10", placeholder: "ex.: E11" },
    { campo: "descricao_cid10", label: "Descrição do CID", placeholder: "ex.: Diabetes mellitus tipo 2" },
    { campo: "desde", label: "Desde", tipo: "date" },
    { campo: "status", label: "Status", tipo: "select", options: [["ativa", "Ativa"], ["em-remissao", "Em remissão"]] },
    { campo: "observacoes", label: "Observações" },
  ],
};

const VALIDADOR_ITEM = {
  alergias: validarCriarAlergiaLocal,
  medicamentos: validarCriarMedicamentoEmUso,
  doenca_cronica: validarCriarDoencaCronica,
};

function validarCriarAlergiaLocal(payload) {
  const erros = {};
  const out = {};

  const s = strip(payload?.substancia ?? "");
  if (!s) setErro(erros, "substancia", "Informe a substância.");
  else if (tam(s) > 255) setErro(erros, "substancia", "No máximo 255 caracteres.");
  else out.substancia = s;

  if (!MANIFESTACOES.some(([v]) => v === payload?.tipo_reacao)) {
    setErro(erros, "tipo_reacao", "Selecione a manifestação.");
  } else out.tipo_reacao = payload.tipo_reacao;

  if (!GRAVIDADES.some(([v]) => v === payload?.gravidade)) {
    setErro(erros, "gravidade", "Selecione a gravidade.");
  } else out.gravidade = payload.gravidade;

  // espelha o validador do back: anafilaxia leve é clinicamente incoerente
  if (out.tipo_reacao === "anafilaxia" && out.gravidade === "leve") {
    setErro(erros, "gravidade", "Anafilaxia não pode ser classificada como leve.");
  }

  const d = strip(payload?.descricao_reacao ?? "");
  if (tam(d) > 2000) setErro(erros, "descricao_reacao", "No máximo 2000 caracteres.");
  else if (d) out.descricao_reacao = d;

  return resultado(out, erros);
}

const $ = (id) => document.getElementById(id);
let secoes = null; // {alergias: sec|null, ...} (normalizado)
let enviando = false;

document.addEventListener("DOMContentLoaded", () => {
  $("aten-bin-conferir-tudo")?.addEventListener("click", conferirTudo);
  document.addEventListener(EVENTO_ATENDIMENTO_ALTERADA, carregar);
});

// ============================================
// Carregamento
// ============================================
async function carregar() {
  const a = estadoAtendimento.atendimento;
  if (!a) return;

  try {
    // Estado (máquina de estados) e dados do paciente em paralelo. Falha da rota
    // do paciente não quebra a aba: segue sem pré-preenchimento.
    const [respEstado, respPaciente] = await Promise.all([
      estadoBinario(a.uuid),
      binarioDoPaciente(a.uuid).catch((e) => {
        console.warn("binario/do-paciente indisponível:", e?.message);
        return null;
      }),
    ]);

    const norm = normalizarSecoesBinario(respEstado.data);

    // Resposta inteira + `dados_paciente`, que é o que dadosPaciente() lê
    // (listas por seção + tipo sanguíneo vigente).
    const p = respPaciente?.data ?? null;
    estadoAtendimento.dadosNovoAtendimento = p && {
      ...p,
      dados_paciente: {
        alergias: p.binario.alergias.itens,
        medicamentos: p.binario.medicamentos.itens,
        doenca_cronica: p.binario.doenca_cronica.itens,
        tipo_sanguineo: p.binario.tipo_sanguineo.tipo_sanguineo,
      },
    };

    secoes = norm.secoes;
    estadoAtendimento.binarioCompleto = norm.completo;
    render();
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível carregar o binário.", "erro");
  } finally {
    document.dispatchEvent(new CustomEvent(EVENTO_BINARIO_CARREGADO));
  }
}

// ============================================
// Renderização
// ============================================
function render() {
  if (!secoes) return;

  const total = SECOES_BINARIO.length;
  const conferidas = SECOES_BINARIO.filter(({ id }) => secoes[id]?.conferida).length;
  const resumo = $("aten-bin-resumo");
  resumo.textContent = `${conferidas}/${total} conferidas`;
  resumo.classList.toggle("aten-bin-resumo--ok", conferidas === total);

  $("aten-bin-completo-hint").hidden = conferidas !== total;

  const travadaManual = SECOES_BINARIO.some(({ id }) => classeSecao(secoes[id]) === "manual");
  $("aten-bin-conferir-tudo").hidden = !podeEscrever() || travadaManual;

  const container = $("aten-bin-secoes");
  container.innerHTML = "";
  SECOES_BINARIO.forEach((meta) => container.appendChild(criarCard(meta)));
}

function criarCard(meta) {
  const sec = secoes[meta.id];
  const classe = classeSecao(sec);
  const card = el("section", `aten-bin-card aten-bin--${classe}`);
  card.dataset.secao = meta.id;

  // --- cabeçalho do card
  const head = el("div", "aten-bin-card-head");
  head.appendChild(el("strong", "aten-bin-card-titulo", meta.label));
  head.appendChild(el("span", "aten-bin-badge", ESTADO_SECAO_LABELS[classe]));
  card.appendChild(head);

  // --- pré-visualização dos dados vigentes (vem de /binario/do-paciente)
  const dados = dadosPaciente()[meta.id];
  if (Array.isArray(dados) && dados.length > 0) {
    const ul = el("ul", "aten-bin-dados");
    dados.slice(0, 8).forEach((item) => ul.appendChild(el("li", null, textoItem(item))));
    if (dados.length > 8) ul.appendChild(el("li", "aten-bin-dados-mais", `+ ${dados.length - 8} registros`));
    card.appendChild(ul);
  }

  // --- revisão: explica o que mudou
  if (classe === "revisao" && sec?.revisao) {
    const motivo = MOTIVO_REVISAO_LABELS[sec.revisao.motivo] ?? "O dado mudou desde a última conferência.";
    card.appendChild(el("p", "aten-bin-revisao", `⚠ ${motivo} Reconfirme abaixo.`));
  }

  // --- formulário (não existe para manual nem em modo leitura)
  if (classe !== "manual" && podeEscrever()) {
    card.appendChild(criarForm(meta, sec, classe));
  } else if (classe === "manual") {
    const extra = sec?.reconciliado ? " (reconciliada com registro novo)" : "";
    card.appendChild(el("p", "field-hint", `Conferido neste atendimento${extra}. Reconferir é recusado pelo back (409).`));
  }

  return card;
}

/** O estado do atendimento manda; sem ele, vale o que o paciente tem (/do-paciente). */
function respostaPre(meta, sec, classe) {
  if (classe === "revisao") return ""; // o dado mudou: força escolha ativa
  if (sec && classe === "automatico") {
    return sec.possui === true ? "possui" : sec.possui === false ? "nega" : "nao-coletado";
  }
  const b = estadoAtendimento.dadosNovoAtendimento?.binario?.[meta.id];
  if (!b || b.possui === null || b.possui === undefined) return "";
  if (b.possui) return "possui";
  return b.nao_foi_possivel_coletar ? "nao-coletado" : "nega";
}

function criarForm(meta, sec, classe) {
  const form = el("div", "aten-bin-form");

  // resposta pré-selecionada (derivada/automática ou vinda dos registros do paciente)
  const pre = respostaPre(meta, sec, classe);

  const nomeRadio = `aten-bin-est-${meta.id}`;
  const opcoes = meta.tipoSanguineo
    ? [["possui", "Informado"], ["nao-coletado", "Não foi possível coletar"]]
    : [["possui", "Possui"], ["nega", "Nega"], ["nao-coletado", "Não foi possível coletar"]];

  const radios = el("div", "aten-bin-radios");
  for (const [valor, labelTexto] of opcoes) {
    const label = el("label", "aten-bin-radio");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = nomeRadio;
    input.value = valor;
    if (valor === pre) input.checked = true;
    input.addEventListener("change", () => atualizarCampos(meta));
    label.append(input, document.createTextNode(` ${labelTexto}`));
    radios.appendChild(label);
  }
  form.appendChild(radios);

  if (meta.tipoSanguineo) {
    // select com os valores válidos (tipoSanguineoValidation normaliza caixa)
    const grupo = el("div", "field-group aten-bin-campo aten-bin-campo--possui");
    const select = document.createElement("select");
    select.className = "field-input";
    select.id = `aten-bin-tipo-${meta.id}`;
    select.appendChild(el("option", null, "Selecione"));
    TIPOS_SANGUINEOS.forEach((t) => select.appendChild(el("option", null, t)).value = t);
    [...select.options].forEach((opt, i) => { if (i > 0) opt.value = TIPOS_SANGUINEOS[i - 1]; });
    if (pre === "possui") {
      const ts = dadosPaciente().tipo_sanguineo;
      const vigente = typeof ts === "string" ? ts : ts?.tipo_sanguineo;
      if (vigente && TIPOS_SANGUINEOS.includes(vigente)) select.value = vigente;
    }
    grupo.appendChild(select);
    form.appendChild(grupo);
  } else if (meta.comItens) {
    // editor de itens: lista de formulários de item (validação de domínio)
    const area = el("div", "aten-bin-campo aten-bin-campo--possui aten-bin-itens-area");
    const temVigentes = Array.isArray(dadosPaciente()[meta.id]) && dadosPaciente()[meta.id].length > 0;
    area.appendChild(el("p", "field-hint",
      temVigentes
        ? "Os dados vigentes já estão listados acima: para confirmar, basta conferir. Adicione item só se houver dado NOVO."
        : "Adicione os itens que o paciente possui."));
    const lista = el("div", "aten-bin-itens-lista");
    lista.dataset.secao = meta.id;
    area.appendChild(lista);
    const add = el("button", "btn-ghost aten-bin-add-item", "+ Adicionar item");
    add.type = "button";
    add.addEventListener("click", () => lista.appendChild(criarItemForm(meta)));
    area.appendChild(add);
    if (!temVigentes) lista.appendChild(criarItemForm(meta));
    form.appendChild(area);
  }

  const erro = el("p", "field-error");
  erro.id = `aten-bin-erro-${meta.id}`;
  form.appendChild(erro);

  const botao = el("button", "btn-primary aten-bin-conferir", classe === "revisao" ? "Reconfirmar seção" : "Conferir seção");
  botao.type = "button";
  botao.addEventListener("click", () => conferirSecaoClick(meta.id));
  form.appendChild(botao);

  atualizarCampos(meta);
  return form;
}

/** Formulário de UM item novo, com os campos da seção (validação de domínio). */
function criarItemForm(meta) {
  const item = el("div", "aten-bin-item");

  const grid = el("div", "aten-bin-item-grid");
  (CAMPOS_ITEM[meta.id] ?? []).forEach((c) => {
    const grupo = el("div", "field-group");
    grupo.appendChild(el("label", "field-label", c.label));
    let input;
    if (c.tipo === "select") {
      input = document.createElement("select");
      const ph = el("option", null, "Selecione");
      ph.value = "";
      input.appendChild(ph);
      (c.options ?? []).forEach(([valor, texto]) => {
        const opt = el("option", null, texto);
        opt.value = valor;
        input.appendChild(opt);
      });
    } else {
      input = document.createElement("input");
      input.type = c.tipo ?? "text";
      if (c.placeholder) input.placeholder = c.placeholder;
    }
    input.className = "field-input";
    input.dataset.campo = c.campo;
    grupo.appendChild(input);
    grid.appendChild(grupo);
  });

  const remover = el("button", "btn-ghost aten-bin-item-remover", "remover");
  remover.type = "button";
  remover.addEventListener("click", () => item.remove());

  item.appendChild(grid);
  item.appendChild(el("p", "field-error aten-bin-item-erro"));
  item.appendChild(remover);
  return item;
}

/** Mostra os campos condicionais só quando "possui" está marcado. */
function atualizarCampos(meta) {
  const card = document.querySelector(`.aten-bin-card[data-secao="${meta.id}"]`);
  if (!card) return;
  const marcado = card.querySelector(`input[name="aten-bin-est-${meta.id}"]:checked`)?.value;
  card.querySelectorAll(".aten-bin-campo--possui").forEach((campo) => {
    campo.classList.toggle("aten-bin-campo--visivel", marcado === "possui");
  });
}

// ============================================
// Leitura do formulário
// ============================================
function cardSecao(id) {
  return document.querySelector(`.aten-bin-card[data-secao="${id}"]`);
}

function respostaSelecionada(id) {
  return cardSecao(id)?.querySelector(`input[name="aten-bin-est-${id}"]:checked`)?.value ?? null;
}

/**
 * Lê e valida os itens novos da seção com a validação de DOMÍNIO.
 * Devolve { ok, itens } -- itens já no formato do schema de criação.
 */
function lerItensSecao(id) {
  const lista = cardSecao(id)?.querySelector(".aten-bin-itens-lista");
  if (!lista) return { ok: true, itens: [] };

  const validador = VALIDADOR_ITEM[id];
  const itens = [];
  let ok = true;

  [...lista.querySelectorAll(".aten-bin-item")].forEach((form, i) => {
    const payload = {};
    form.querySelectorAll("[data-campo]").forEach((input) => {
      payload[input.dataset.campo] = input.value;
    });

    const erroEl = form.querySelector(".aten-bin-item-erro");
    const r = validador(payload);
    if (!r.ok) {
      ok = false;
      const msg = Object.values(r.erros)[0] ?? "Item inválido.";
      erroEl.textContent = `Item ${i + 1}: ${msg}`;
    } else {
      erroEl.textContent = "";
      // só envia item que tem ao menos um campo preenchido
      if (Object.values(r.dados).some((v) => v !== null && v !== undefined && v !== "")) {
        itens.push(r.dados);
      }
    }
  });

  return { ok, itens };
}

function pintarErroSecao(id, msg) {
  const elErro = $(`aten-bin-erro-${id}`);
  if (elErro) elErro.textContent = msg ?? "";
}

// ============================================
// Montagem do payload da seção (resposta + itens validados)
// ============================================
function montarSecao(id) {
  const meta = SECOES_BINARIO.find((s) => s.id === id);
  const resposta = respostaSelecionada(id);

  let itens = [];
  if (resposta === "possui" && meta.comItens) {
    const r = lerItensSecao(id);
    if (!r.ok) return { ok: false, erro: "Verifique os itens destacados." };
    itens = r.itens;
  }

  let tipoSanguineo;
  if (meta.tipoSanguineo && resposta === "possui") {
    const r = validarRegistrarTipoSanguineo({ tipo_sanguineo: $(`aten-bin-tipo-${id}`)?.value ?? "" });
    if (!r.ok) return { ok: false, erro: r.erros.tipo_sanguineo ?? "Tipo sanguíneo inválido." };
    tipoSanguineo = r.dados.tipo_sanguineo;
  }

  const validacao = validarSecaoBinario(id, { resposta, itens, tipoSanguineo });
  if (!validacao.ok) return { ok: false, erro: validacao.erros[CAMPO_GERAL] ?? "Seção inválida." };
  return { ok: true, dados: validacao.dados };
}

// ============================================
// Escrita
// ============================================
async function conferirSecaoClick(id) {
  if (enviando) return;
  pintarErroSecao(id, "");

  const secao = montarSecao(id);
  if (!secao.ok) {
    pintarErroSecao(id, secao.erro);
    return;
  }

  enviando = true;
  try {
    await conferirSecao(estadoAtendimento.atendimento.uuid, uuidPaciente(), id, secao.dados);
    exibirMensagem(`Seção conferida.`, "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    tratarErroEscrita(erro, id);
  } finally {
    enviando = false;
  }
}

async function conferirTudo() {
  if (enviando) return;
  SECOES_BINARIO.forEach(({ id }) => pintarErroSecao(id, ""));

  const valores = {};
  for (const { id } of SECOES_BINARIO) {
    const secao = montarSecao(id);
    if (!secao.ok) {
      pintarErroSecao(id, secao.erro);
      valores[id] = null;
      continue;
    }
    valores[id] = { resposta: respostaSelecionada(id), itens: secao.dados.itens ?? [], tipoSanguineo: secao.dados.tipo_sanguineo };
  }

  if (Object.values(valores).some((v) => v === null)) {
    exibirMensagem("Responda as 4 seções para conferir todas de uma vez.", "erro");
    return;
  }

  const agregado = montarPayloadAgregado(valores);
  if (!agregado.ok) {
    Object.entries(agregado.erros).forEach(([id, msg]) => pintarErroSecao(id, msg));
    return;
  }

  enviando = true;
  try {
    await conferirBinario(estadoAtendimento.atendimento.uuid, uuidPaciente(), agregado.dados);
    exibirMensagem("Binário conferido (4 seções).", "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    tratarErroEscrita(erro, null);
  } finally {
    enviando = false;
  }
}

/** 409 "já conferida" = evento de sincronização, não erro: recarrega e segue. */
function tratarErroEscrita(erro, idSecao) {
  if (erro instanceof ApiError && erro.status === 409 && /j[aá] conferid/i.test(erro.message)) {
    exibirMensagem("Seção já conferida — recarregando o estado atual.", "info");
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
    return;
  }
  if (idSecao) pintarErroSecao(idSecao, erro instanceof ApiError ? erro.message : "Não foi possível conferir.");
  exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível conferir o binário.", "erro");
}

function uuidPaciente() {
  return estadoAtendimento.consulta?.paciente_uuid;
}