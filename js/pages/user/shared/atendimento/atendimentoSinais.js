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
// - "registrados neste atendimento" vem do GET .../detalhe (persiste no
//   refresh). É leitura auditada: busca 1x por atendimento e de novo só após
//   registrar sinais; se falhar, cai no sessionStorage com o que foi enviado.

import { registrarSinaisVitais, ApiError } from "./atendimentoApi.js";
import { buscarDetalheAtendimento } from "./atendimentoDetalhe/atendimentoDetalheApi.js";
import {
  estadoAtendimento, EVENTO_ATENDIMENTO_ALTERADA, EVENTO_BINARIO_CARREGADO,
  UNIDADE_POR_TIPO, TIPO_PARAMETRO_LABELS, SITIOS_POR_TIPO, SITIO_LABELS,
  dadosPaciente, podeEscrever, el, formatarDataHora,
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
  renderRegistrados();      // imediato (cache/fallback)
  atualizarRegistrados();   // busca no detalhe só se ainda não buscou

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
// Sinais registrados NESTE atendimento
// ============================================
// Fonte principal: GET .../detalhe (persiste no refresh; leitura auditada).
// Fallback (detalhe indisponível/sem permissão): o que este navegador enviou
// com sucesso, guardado no sessionStorage por atendimento.
const chave = () => `aten:sinais:${estadoAtendimento.atendimento.uuid}`;

function lerRegistrados() {
  try {
    return JSON.parse(sessionStorage.getItem(chave()) ?? "[]");
  } catch { return []; }
}

function gravarRegistrados(lista) {
  try {
    sessionStorage.setItem(chave(), JSON.stringify(lista));
  } catch (e) { console.warn("aten: falha ao gravar sinais no sessionStorage", e); }
}

let sinaisDetalhe = null;   // sinais vindos do /detalhe
let uuidDetalhe = null;     // atendimento a que o cache se refere
let buscando = null;        // promessa em voo (carregar dispara várias vezes na abertura)

async function atualizarRegistrados(forcar = false) {
  const uuid = estadoAtendimento.atendimento?.uuid;
  if (!uuid) return;
  if (buscando) await buscando;   // não sobrepor uma busca em voo
  if (!forcar && uuidDetalhe === uuid && sinaisDetalhe) return;
  buscando = (async () => {
    try {
      const d = await buscarDetalheAtendimento(uuid);
      sinaisDetalhe = d?.sinais ?? [];
      uuidDetalhe = uuid;
    } catch (e) {
      console.warn("aten: detalhe indisponível, usando registro local dos sinais:", e?.message);
    } finally {
      buscando = null;
    }
    renderRegistrados();
  })();
  return buscando;
}

function itensRegistrados() {
  const uuid = estadoAtendimento.atendimento?.uuid;
  if (sinaisDetalhe && uuidDetalhe === uuid) {
    return sinaisDetalhe.map((v) => ({
      texto: [`${v.rotulo}: ${v.valor} ${v.unidade ?? ""}`.trim(), v.sitio, v.quando_texto,
              v.fora ? "fora do limite esperado" : null].filter(Boolean).join(" · "),
    }));
  }
  // fallback: o que este navegador enviou (sessionStorage), mais recente primeiro
  return [...lerRegistrados()].reverse().map((s) => {
    const tipo = TIPO_PARAMETRO_LABELS[s.tipo_parametro] ?? s.tipo_parametro;
    const partes = [`${tipo}: ${s.valor_numerico} ${s.unidade ?? ""}`.trim()];
    if (s.sitio_medicao) partes.push(SITIO_LABELS[s.sitio_medicao] ?? s.sitio_medicao);
    if (s.flag_escala_dpoc) partes.push("DPOC");
    if (s.quando) partes.push(formatarDataHora(s.quando));
    return { texto: partes.join(" · ") };
  });
}

function renderRegistrados() {
  const caixa = $("aten-sv-registrados");
  if (!caixa || !estadoAtendimento.atendimento) return;
  const lista = itensRegistrados();
  caixa.innerHTML = "";
  if (lista.length === 0) { caixa.hidden = true; return; }
  caixa.hidden = false;
  caixa.appendChild(el("h3", "cons-panel-titulo", `Registrados neste atendimento (${lista.length})`));
  const ul = el("ul", "aten-lista-ref");
  lista.forEach((i) => ul.appendChild(el("li", null, i.texto)));
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
    const agora = new Date().toISOString();
    gravarRegistrados([
      ...lerRegistrados(),
      ...validacao.dados.sinais.map((x) => ({ ...x, quando: agora })),
    ]);
    await atualizarRegistrados(true);   // puxa do detalhe o que acabou de entrar
    exibirMensagem(`Sinais vitais registrados (${validacao.dados.sinais.length}).`, "sucesso");
    document.dispatchEvent(new CustomEvent(EVENTO_ATENDIMENTO_ALTERADA));
  } catch (erro) {
    exibirMensagem(erro instanceof ApiError ? erro.message : "Não foi possível registrar os sinais.", "erro");
  } finally {
    enviando = false;
    $("aten-sv-salvar").disabled = false;
  }
}