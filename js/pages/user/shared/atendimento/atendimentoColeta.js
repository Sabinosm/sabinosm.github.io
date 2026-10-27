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
//
// LÓGICA DE PROTOCOLO (módulos puros, sem DOM/fetch, na mesma pasta):
//   atendimentoProtocoloCampos.js     campo do back -> formato único (tipo, opções {valor, rótulo})
//   atendimentoProtocoloValidacao.js  validação por campo antes do POST (tipo, opção, faixa)
//   atendimentoProtocoloInput.js      snapshot dos campos usados (mostrado no card)
//   atendimentoProtocoloResultado.js  execução -> classificação, escore, trilha, módulos
// A camada de rede segue sendo o atendimentoApi.js; nada de catalogos/ é usado
// ou alterado (a exibição fora do atendimento continua como estava).

import {
  registrarColeta, registrarInputProtocolo, executarProtocolo,
  listarProtocolosDisponiveis, estruturaProtocolo, ApiError,
} from "./atendimentoApi.js";
import { normalizarCampo } from "./atendimentoProtocoloCampos.js";
import { validarRespostas } from "./atendimentoProtocoloValidacao.js";
import { montarSnapshotCampos } from "./atendimentoProtocoloInput.js";
import { formatarResultado } from "./atendimentoProtocoloResultado.js";
import { escopoDoAtendimentoDe, protocoloPadraoDe, preencherSelect } from "./atendimentoProtocoloSelect.js";
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
const camposPorProtocolo = {};    // uuid_protocolo -> campos normalizados (cache)

document.addEventListener("DOMContentLoaded", () => {
  $("aten-co-criar")?.addEventListener("click", criarColeta);
  // delegação: botões e selects dos cards são criados dinamicamente
  $("aten-co-lista")?.addEventListener("click", (e) => {
    const card = e.target.closest(".aten-co-item");
    if (e.target.closest(".aten-ip-salvar")) salvarInput(card);
    const fav = e.target.closest(".aten-ip-fav");
    if (fav) escolherFavorito(card, fav.dataset.uuid);
    if (e.target.closest(".aten-exec-executar")) executar(card);
  });
  $("aten-co-lista")?.addEventListener("change", (e) => {
    if (e.target.closest(".aten-ip-protocolo")) {
      const cardEscolha = e.target.closest(".aten-co-item");
      marcarFavoritoAtivo(cardEscolha, e.target.value);
      aoEscolherProtocolo(cardEscolha, e.target.value);
    }
    if (e.target.closest(".aten-exec-protocolo")) {
      avisarProtocoloDiferente(e.target.closest(".aten-co-item"), e.target.value);
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
  const campos = (camposPorProtocolo[uuidProtocolo] ??= (est.campos ?? []).map(normalizarCampo));
  campos.forEach((c) => area.appendChild(campoDinamico(c)));
  if (!campos.length) {
    area.appendChild(el("p", "field-hint", "Este protocolo não declara campos de entrada."));
  }
}

/** <option> com value explícito. O placeholder usa value "" — sem isso o value
 *  seria o próprio texto ("—", "Selecione") e iria para o input_json. */
function opcaoSelect(valor, texto) {
  const opt = el("option", null, texto);
  opt.value = valor;
  return opt;
}

/** Um campo do protocolo (já normalizado), conforme tipo/opções. O nome do
 *  campo vai em data-campo e vira chave do input_json. */
function campoDinamico(campo) {
  const grupo = el("div", "field-group");
  const titulo = campo.unidade ? `${campo.rotulo} (${campo.unidade})` : campo.rotulo;
  grupo.appendChild(el("label", "field-label", campo.obrigatorio ? `${titulo} *` : titulo));

  let input;
  if (campo.tipo === "booleano") {
    input = document.createElement("select");
    input.appendChild(opcaoSelect("", "—"));
    input.appendChild(opcaoSelect("sim", "Sim"));
    input.appendChild(opcaoSelect("nao", "Não"));
  } else if (campo.tipo === "categorico" || campo.opcoes.length) {
    input = document.createElement("select");
    input.appendChild(opcaoSelect("", "Selecione"));
    campo.opcoes.forEach((o) => input.appendChild(opcaoSelect(o.valor, o.rotulo)));
  } else if (campo.tipo === "numerico") {
    input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    if (campo.min != null) input.min = String(campo.min);
    if (campo.max != null) input.max = String(campo.max);
  } else {
    input = document.createElement("input");
    input.type = "text";
  }
  input.className = "field-input aten-ip-campo";
  input.dataset.campo = campo.campo;
  grupo.appendChild(input);

  const erro = el("p", "field-error aten-ip-campo-erro");
  erro.dataset.campo = campo.campo;
  grupo.appendChild(erro);
  return grupo;
}

/** Respostas CRUAS do formulário: {campo: valor} só com o que foi preenchido.
 *  A conversão/validação é de validarRespostas. */
function lerRespostas(idx) {
  const json = {};
  $(`aten-ip-campos-${idx}`)?.querySelectorAll(".aten-ip-campo").forEach((input) => {
    const v = input.value;
    if (v !== "" && v !== null && v !== undefined) json[input.dataset.campo] = v;
  });
  return json;
}

function limparErrosCampos(idx) {
  $(`aten-ip-campos-${idx}`)?.querySelectorAll(".aten-ip-campo-erro").forEach((p) => {
    p.textContent = "";
  });
}

function mostrarErrosCampos(idx, erros) {
  const area = $(`aten-ip-campos-${idx}`);
  Object.entries(erros).forEach(([campo, msg]) => {
    const p = area?.querySelector(`.aten-ip-campo-erro[data-campo="${CSS.escape(campo)}"]`);
    if (p) p.textContent = msg;
  });
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

  // Protocolo já pré-selecionado (padrão pessoal/institucional ou escolhido antes):
  // carrega os campos sem exigir um clique extra.
  container.querySelectorAll(".aten-co-item").forEach((card) => {
    const valor = card.querySelector(".aten-ip-protocolo")?.value;
    if (valor) {
      marcarFavoritoAtivo(card, valor);
      aoEscolherProtocolo(card, valor);
    }
  });
}

function criarCardColeta(coleta, idx) {
  const card = el("section", "cons-panel aten-co-item");
  card.dataset.idx = String(idx);

  const titulo = el("h3", "cons-panel-titulo",
    `Coleta ${idx + 1}${coleta.desde_quando_sintomas != null ? ` — sintomas há ${coleta.desde_quando_sintomas}h` : ""}`);
  card.appendChild(titulo);

  if (coleta.input_registrado) {
    card.appendChild(el("p", "field-hint", "Input de protocolo registrado para esta coleta."));
    if (coleta.campos_usados?.length) card.appendChild(criarListaCamposUsados(coleta.campos_usados));
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

/** Campos registrados no input (snapshot guardado junto da coleta). */
function criarListaCamposUsados(campos) {
  const caixa = el("div", "aten-ip-usados");
  caixa.appendChild(el("h4", "cons-panel-titulo", "Campos registrados no input"));
  const ul = el("ul", "aten-lista-ref");
  campos.forEach((c) => {
    ul.appendChild(el("li", null,
      c.ausente ? `${c.rotulo}: não informado` : `${c.rotulo}: ${c.valor_exibido}`));
  });
  caixa.appendChild(ul);
  return caixa;
}

// ============================================
// Escolha do protocolo: liberados pela empresa + favoritos do profissional
// ============================================
// Cada item de `protocolos` (GET .../protocolos-disponiveis) traz, além do
// catálogo: favorito (true/false), default_pessoal e padrao_institucional
// (escopo em que é padrão, ou null), politica ("obrigatorio"/"opcional").
// O back já ordena os favoritos primeiro.

// Lógica do select (favoritos, rótulos, padrão) vive em atendimentoProtocoloSelect.js,
// compartilhada com a aba de conduta. Aqui só ligamos ao estado desta aba.
const escopoDoAtendimento = () => escopoDoAtendimentoDe(estadoAtendimento.atendimento);
const protocoloPadrao = () => protocoloPadraoDe(protocolos, escopoDoAtendimento());
const preencherSelectProtocolos = (select, selecionado) =>
  preencherSelect(select, protocolos, { selecionado, escopo: escopoDoAtendimento() });

/** Atalhos de um clique para os favoritos (só aparece se houver). */
function criarAtalhosFavoritos() {
  const favoritos = protocolos.filter((p) => p.favorito);
  if (!favoritos.length) return null;
  const linha = el("div", "aten-ip-favoritos");
  linha.appendChild(el("span", "aten-ip-favoritos-rotulo", "★ Favoritos:"));
  favoritos.forEach((p) => {
    const btn = el("button", "btn-ghost aten-ip-fav", p.sigla ?? p.nome_protocolo ?? p.uuid);
    btn.type = "button";
    btn.dataset.uuid = p.uuid;
    btn.title = p.nome_protocolo ?? "";
    linha.appendChild(btn);
  });
  return linha;
}

function marcarFavoritoAtivo(card, uuid) {
  card?.querySelectorAll(".aten-ip-fav").forEach((b) => {
    const ativo = b.dataset.uuid === uuid;
    b.classList.toggle("aten-ip-fav--ativo", ativo);
    b.setAttribute("aria-pressed", String(ativo));
  });
}

function escolherFavorito(card, uuid) {
  const select = card?.querySelector(".aten-ip-protocolo");
  if (!select || select.disabled) return;
  select.value = uuid;
  marcarFavoritoAtivo(card, uuid);
  aoEscolherProtocolo(card, uuid);
}

function campoSelectProtocolo(coleta, idx) {
  const grupo = el("div", "field-group");
  const label = el("label", "field-label", "Protocolo");
  label.htmlFor = `aten-ip-protocolo-${idx}`;
  grupo.appendChild(label);

  const atalhos = criarAtalhosFavoritos();
  if (atalhos) grupo.appendChild(atalhos);

  const select = document.createElement("select");
  select.className = "field-input aten-ip-protocolo";
  select.id = `aten-ip-protocolo-${idx}`;
  // já escolhido nesta coleta > padrão pessoal > padrão da instituição
  preencherSelectProtocolos(select, coleta.protocolo_uuid ?? protocoloPadrao()?.uuid ?? null);
  grupo.appendChild(select);

  // quem tem papel clínico mas ainda não favoritou nada: ensina onde fazer
  if (protocolos.length && !protocolos.some((p) => p.favorito) && protocolos.some((p) => p.favorito === false)) {
    grupo.appendChild(el("p", "field-hint",
      "Dica: adicione protocolos aos favoritos na página de catálogo para vê-los aqui em destaque."));
  }
  return grupo;
}

// ============================================
// Execução de protocolo
// ============================================
function criarAreaExecucao(coleta, idx) {
  const area = el("div", "aten-exec-area");

  if (coleta.resultado) {
    renderizarResultado(area, coleta.resultado);
    return area;
  }

  const grupo = el("div", "field-group");
  const select = document.createElement("select");
  select.className = "field-input aten-exec-protocolo";
  select.id = `aten-exec-protocolo-${idx}`;
  preencherSelectProtocolos(select, coleta.protocolo_uuid);
  grupo.appendChild(select);
  area.appendChild(grupo);

  const aviso = el("p", "field-hint");
  aviso.id = `aten-exec-aviso-${idx}`;
  area.appendChild(aviso);

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

/** O input só traz os campos do protocolo em que foi preenchido. Executar outro
 *  protocolo é permitido pelo back, mas sai incompleto — avisa antes do clique. */
function avisarProtocoloDiferente(card, uuidEscolhido) {
  const idx = Number(card?.dataset.idx);
  const aviso = $(`aten-exec-aviso-${idx}`);
  if (!aviso) return;
  const coleta = lerColetas()[idx];
  const diferente = uuidEscolhido && coleta?.protocolo_uuid && uuidEscolhido !== coleta.protocolo_uuid;
  aviso.textContent = diferente
    ? "Este input foi preenchido com os campos de outro protocolo: a execução tende a sair incompleta. " +
      "Para um resultado completo, registre um novo input com os campos deste protocolo."
    : "";
}

/** Resultado da execução: classificação, escore, ação, trilha, módulos e ausentes. */
function renderizarResultado(area, resultado) {
  const nome = resultado.nome_protocolo ?? "protocolo";
  const r = formatarResultado(resultado.dados);

  const resumo = [];
  if (r.classificacao) resumo.push(r.classificacao);
  if (r.multiplos) resumo.push("vários resultados (ver módulos)");
  if (r.escoreTotal != null) resumo.push(`escore ${r.escoreTotal}${r.escoreParcial ? " (parcial)" : ""}`);
  area.appendChild(el("p", "field-hint",
    resumo.length ? `Resultado (${nome}): ${resumo.join(" · ")}` : `Resultado (${nome}): registrado.`));

  if (r.overrideDisparado) {
    area.appendChild(el("p", "field-hint", "Regra de override disparada: a classificação foi elevada por um parâmetro isolado."));
  }
  if (r.acao) area.appendChild(el("p", "field-hint", `Ação recomendada: ${r.acao}`));
  if (r.status === "incompleta") {
    area.appendChild(el("p", "field-hint", "Execução incompleta: faltaram dados."));
  }

  if (r.passos.length) {
    const ul = el("ul", "aten-lista-ref");
    r.passos.forEach((p) => ul.appendChild(el("li", null, `${p.rotulo}: ${p.valor} → ${p.resultado}`)));
    area.appendChild(ul);
  }

  if (r.modulos.length) {
    const ul = el("ul", "aten-lista-ref");
    r.modulos.forEach((m) => {
      const partes = [m.sigla, m.status, m.saida].filter(Boolean).join(" — ");
      ul.appendChild(el("li", null, m.motivo ? `${partes} (${m.motivo})` : partes));
    });
    area.appendChild(ul);
  }

  if (r.ausentes.length) {
    area.appendChild(el("p", "field-hint", `Dados ausentes: ${r.ausentes.join(", ")}`));
  }
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

  // validação por campo (tipo, opção, faixa) antes de ir ao back
  const campos = camposPorProtocolo[uuidProt];
  if (!campos) {
    $(`aten-ip-erro-${idx}`).textContent = "Aguarde o carregamento dos campos do protocolo.";
    return;
  }
  limparErrosCampos(idx);
  const respostas = validarRespostas(campos, lerRespostas(idx));
  if (!respostas.ok) {
    mostrarErrosCampos(idx, respostas.erros);
    $(`aten-ip-erro-${idx}`).textContent = "Corrija os campos destacados.";
    return;
  }

  const validacao = validarInputProtocolo({
    queixa: $(`aten-ip-queixa-${idx}`)?.value,
    avpu: $(`aten-ip-avpu-${idx}`)?.value,
    jsonTexto: JSON.stringify(respostas.validados), // mantém o contrato atual do validator
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
    lista[idx] = {
      ...coleta,
      input_registrado: true,
      protocolo_uuid: uuidProt,
      input_json: respostas.validados,                          // o que foi enviado ao back
      campos_usados: montarSnapshotCampos(campos, respostas),   // para exibir no card
    };
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