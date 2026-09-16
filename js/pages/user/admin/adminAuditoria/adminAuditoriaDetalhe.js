// adminAuditoriaDetalhe.js
//
// View 2 — detalhe de UM profissional (GET /profissionais/<uuid>/
// detalhe): dois blocos lado a lado (Acessos | Alterações), cada um
// paginado por cursor de data com botão "Carregar mais".
//
// Camadas de filtro (conforme respondido no alinhamento da tela):
//   - Tipo: "Ambos" | "Acessos" | "Alterações" — é um filtro de
//     APRESENTAÇÃO (só esconde/mostra bloco; os dados dos dois blocos
//     chegam juntos no mesmo response e mantêm cursor independente).
//   - Período (data_inicio/data_fim) — janela máxima de 7 dias,
//     validada no front (validarJanelaDias) E no backend.
//   - Ação (texto livre) — `acao`; bate em LogAlteracao.acao e, no
//     bloco de acessos, o backend aplica como operacao.
//   - Operação (acessos) — `operacao_acesso`; select com o Enum de
//     LogAcesso.operacao (leitura/escrita/exclusao-logica/exportacao).
//     Só se aplica ao bloco de acessos, então fica desabilitado quando
//     o filtro de tipo é "Alterações".
//
// NOTA sobre o backend: em service.detalhe_profissional a chamada ao
// repo de alterações passa `operacao=acao`. Com acao sendo texto
// livre, _operacoes_sql_para_filtro devolve () e o filtro vira
// .in_(()) — o bloco de alterações volta SEMPRE vazio quando `acao`
// é informado. O front aqui assume o contrato correto (acao filtra
// alteracao.acao); a correção é não passar `operacao` nessa chamada
// no service.py.
//
// Estado dos cursores: guardamos por bloco o `proximo_cursor` que o
// backend devolve ({cursor_data, cursor_uuid}) e devolvemos intacto
// na próxima chamada. Sem cursor = primeira página (mais recentes).

import { ApiError, detalheProfissional } from "./adminAuditoriaApi.js";
import {
  badgeOperacaoAcesso,
  badgeOperacaoAlteracao,
  badgeResultadoAcesso,
  criarEstadoVazio,
  formatarDataHora,
  labelOperacaoAcesso,
  labelOperacaoAlteracao,
  montarBadge,
  validarJanelaDias,
} from "./adminAuditoriaHelpers.js";

const LIMITE_BLOCO = 10;

const IDS_LISTA = { acessos: 'aud-lista-acessos', alteracoes: 'aud-lista-alteracoes' };
const IDS_BTN_MAIS = { acessos: 'aud-carregar-acessos', alteracoes: 'aud-carregar-alteracoes' };

let profissionalAtual = null;   // { uuid_usuario, nome } vindo do card do resumo
let filtroTipo = 'ambos';
let filtrosDetalhe = { dataInicio: '', dataFim: '', acao: '', operacaoAcesso: '' };

// estado por bloco — cursor vem do backend, nunca é montado na mão
const estadoBlocos = {
  acessos: { cursor: null, temMais: false },
  alteracoes: { cursor: null, temMais: false },
};
const carregandoBloco = { acessos: false, alteracoes: false };

document.addEventListener('DOMContentLoaded', () => {
  configurarVoltar();
  configurarSegmentado();
  configurarAplicarLimpar();
  configurarCarregarMais();
});

// ============================================
// Abertura — chamada por adminAuditoriaResumo.js ao clicar num card
// ============================================
export function abrirDetalheProfissional(item) {
  profissionalAtual = item;

  document.getElementById('aud-detalhe-nome').textContent = item.nome ?? '—';

  // reseta tudo: filtros de período/ação voltam ao padrão, cursores
  // zerados e o seletor de tipo volta para "Ambos"
  limparCamposDetalhe();
  filtrosDetalhe = { dataInicio: '', dataFim: '', acao: '', operacaoAcesso: '' };
  definirTipoFiltro('ambos');
  resetarBlocos();
  esconderFeedback();

  mostrarViewDetalhe(true);
  carregarAmbosBlocos();
}

function mostrarViewDetalhe(visivel) {
  document.getElementById('view-resumo').hidden = visivel;
  document.getElementById('view-detalhe').hidden = !visivel;
  if (visivel) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function configurarVoltar() {
  document.getElementById('aud-btn-voltar')?.addEventListener('click', () => {
    mostrarViewDetalhe(false);
  });
}

// ============================================
// Seletor de tipo (Ambos / Acessos / Alterações) — filtro de
// apresentação: só alterna a visibilidade dos blocos. Não dispara
// reload, porque os dois blocos já vêm no mesmo response.
// ============================================
function configurarSegmentado() {
  document.getElementById('aud-filtro-tipo')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-item');
    if (!btn) return;
    definirTipoFiltro(btn.dataset.tipo);
  });
}

function definirTipoFiltro(tipo) {
  filtroTipo = tipo;

  document.querySelectorAll('#aud-filtro-tipo .segmented-item').forEach(btn => {
    btn.classList.toggle('segmented-item--active', btn.dataset.tipo === tipo);
  });

  document.getElementById('bloco-acessos').hidden = (tipo === 'alteracoes');
  document.getElementById('bloco-alteracoes').hidden = (tipo === 'acessos');

  // operação de acesso não faz sentido quando o bloco de acessos está
  // fora de cena
  const selectOperacao = document.getElementById('aud-detalhe-operacao-acesso');
  if (selectOperacao) selectOperacao.disabled = (tipo === 'alteracoes');
}

// ============================================
// Período / ação / operação — aplicados explicitamente no botão
// (dois date pickers + texto não dão para aplicar "ao digitar" com
// segurança). Limpar volta ao estado padrão e recarrega.
// ============================================
function configurarAplicarLimpar() {
  document.getElementById('aud-btn-aplicar-filtros')?.addEventListener('click', () => {
    const dataInicio = document.getElementById('aud-data-inicio').value;
    const dataFim = document.getElementById('aud-data-fim').value;

    const validacao = validarJanelaDias(dataInicio, dataFim);
    if (!validacao.ok) {
      exibirFeedback(validacao.mensagem, 'erro');
      return;
    }

    filtrosDetalhe = {
      dataInicio,
      dataFim,
      acao: document.getElementById('aud-detalhe-acao').value.trim(),
      operacaoAcesso: document.getElementById('aud-detalhe-operacao-acesso').value,
    };

    esconderFeedback();
    resetarBlocos();
    carregarAmbosBlocos();
  });

  document.getElementById('aud-btn-limpar-detalhe')?.addEventListener('click', () => {
    limparCamposDetalhe();
    filtrosDetalhe = { dataInicio: '', dataFim: '', acao: '', operacaoAcesso: '' };
    esconderFeedback();
    resetarBlocos();
    carregarAmbosBlocos();
  });
}

function limparCamposDetalhe() {
  ['aud-data-inicio', 'aud-data-fim', 'aud-detalhe-acao'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const selectOperacao = document.getElementById('aud-detalhe-operacao-acesso');
  if (selectOperacao) selectOperacao.selectedIndex = 0;
}

// ============================================
// "Carregar mais" — por bloco, usando o cursor devolvido pelo backend
// na página anterior daquele bloco
// ============================================
function configurarCarregarMais() {
  document.getElementById('aud-carregar-acessos')?.addEventListener('click', () => carregarBloco('acessos', true));
  document.getElementById('aud-carregar-alteracoes')?.addEventListener('click', () => carregarBloco('alteracoes', true));
}

function resetarBlocos() {
  estadoBlocos.acessos = { cursor: null, temMais: false };
  estadoBlocos.alteracoes = { cursor: null, temMais: false };
  document.getElementById(IDS_BTN_MAIS.acessos).hidden = true;
  document.getElementById(IDS_BTN_MAIS.alteracoes).hidden = true;
}

async function carregarAmbosBlocos() {
  await Promise.all([carregarBloco('acessos'), carregarBloco('alteracoes')]);
}

async function carregarBloco(bloco, appendar = false) {
  if (!profissionalAtual || carregandoBloco[bloco]) return;
  carregandoBloco[bloco] = true;

  const lista = document.getElementById(IDS_LISTA[bloco]);
  if (!appendar) lista.innerHTML = '<p class="aud-loading">Carregando…</p>';

  try {
    const resposta = await detalheProfissional(profissionalAtual.uuid_usuario, {
      acao: filtrosDetalhe.acao || undefined,
      operacaoAcesso: filtrosDetalhe.operacaoAcesso || undefined,
      dataInicio: filtrosDetalhe.dataInicio || undefined,
      dataFim: filtrosDetalhe.dataFim || undefined,
      limit: LIMITE_BLOCO,
      // no "carregar mais", manda o cursor daquele bloco; no reset,
      // nada (primeira página, mais recentes primeiro)
      cursorAcessos: bloco === 'acessos' && appendar ? estadoBlocos.acessos.cursor : null,
      cursorAlteracoes: bloco === 'alteracoes' && appendar ? estadoBlocos.alteracoes.cursor : null,
    });

    const dados = resposta.data?.[bloco] ?? { itens: [], tem_mais: false, proximo_cursor: null };

    // guarda o estado do bloco para a próxima página — o cursor é
    // usado EXATAMENTE como veio, sem desmontar/remontar
    estadoBlocos[bloco].cursor = dados.proximo_cursor ?? null;
    estadoBlocos[bloco].temMais = Boolean(dados.tem_mais);
    document.getElementById(IDS_BTN_MAIS[bloco]).hidden = !estadoBlocos[bloco].temMais;

    if (!appendar) lista.innerHTML = '';
    if (dados.itens.length === 0 && !appendar) {
      lista.appendChild(criarEstadoVazio(
        'Nenhum registro',
        'Nada encontrado para os filtros atuais.'
      ));
    } else {
      dados.itens.forEach(item => {
        lista.appendChild(bloco === 'acessos' ? criarItemAcesso(item) : criarItemAlteracao(item));
      });
    }
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar o histórico.';
    if (!appendar) {
      lista.innerHTML = '';
      lista.appendChild(criarEstadoVazio('Não foi possível carregar', mensagem));
    }
    exibirFeedback(mensagem, 'erro');
  } finally {
    carregandoBloco[bloco] = false;
  }
}

// ============================================
// Itens de log
// ============================================
function criarItemAcesso(item) {
  const el = document.createElement('article');
  el.className = 'log-item';

  const topo = document.createElement('div');
  topo.className = 'log-item-topo';

  const frase = document.createElement('span');
  frase.className = 'log-item-frase';
  frase.textContent = `${labelOperacaoAcesso(item.operacao)} em ${item.recurso_acessado}`;

  topo.appendChild(frase);
  topo.appendChild(montarBadge(badgeOperacaoAcesso(item.operacao)));
  topo.appendChild(montarBadge(badgeResultadoAcesso(item.resultado)));

  const data = document.createElement('span');
  data.className = 'log-item-data';
  data.textContent = formatarDataHora(item.data_hora);

  el.append(topo, data);

  // motivo_negacao so vem preenchido quando resultado != "sucesso" --
  // colapsado por padrao, mesmo padrao do diff de alteracao (pode ser
  // dado sensivel/detalhado demais pra lista corrida)
  if (item.motivo_negacao) {
    const detalhe = document.createElement('div');
    detalhe.className = 'log-diff';
    detalhe.hidden = true;
    detalhe.appendChild(linhaDiff('Motivo', item.motivo_negacao));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'log-item-toggle';
    toggle.textContent = 'Ver detalhes';
    toggle.addEventListener('click', () => {
      detalhe.hidden = !detalhe.hidden;
      toggle.textContent = detalhe.hidden ? 'Ver detalhes' : 'Ocultar detalhes';
    });

    el.append(toggle, detalhe);
  }

  return el;
}

function criarItemAlteracao(item) {
  const el = document.createElement('article');
  el.className = 'log-item';

  const topo = document.createElement('div');
  topo.className = 'log-item-topo';

  // prioriza `acao` (mais legível); fallback igual ao
  // to_dict_resumido do model para logs antigos sem acao
  const frase = document.createElement('span');
  frase.className = 'log-item-frase';
  frase.textContent = item.acao || `${labelOperacaoAlteracao(item.operacao)} em ${item.tabela_origem}`;

  topo.appendChild(frase);
  topo.appendChild(montarBadge(badgeOperacaoAlteracao(item.operacao)));

  const meta = document.createElement('span');
  meta.className = 'log-item-meta';
  meta.textContent = item.campo_alterado
    ? `${item.tabela_origem}.${item.campo_alterado}`
    : item.tabela_origem;

  const data = document.createElement('span');
  data.className = 'log-item-data';
  data.textContent = formatarDataHora(item.alterado_em);

  el.append(topo, meta, data);

  // diff + justificativa ficam colapsados por padrão -- podem conter
  // dado sensível, então não exibimos sem um clique explícito
  const temDiff = item.valor_anterior != null || item.valor_novo != null || item.justificativa;
  if (temDiff) {
    const diff = document.createElement('div');
    diff.className = 'log-diff';
    diff.hidden = true;

    if (item.valor_anterior != null) diff.appendChild(linhaDiff('Anterior', item.valor_anterior, 'log-diff-valor--removido'));
    if (item.valor_novo != null) diff.appendChild(linhaDiff('Novo', item.valor_novo, 'log-diff-valor--adicionado'));
    if (item.justificativa) diff.appendChild(linhaDiff('Justificativa', item.justificativa));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'log-item-toggle';
    toggle.textContent = 'Ver detalhes';
    toggle.addEventListener('click', () => {
      diff.hidden = !diff.hidden;
      toggle.textContent = diff.hidden ? 'Ver detalhes' : 'Ocultar detalhes';
    });

    el.append(toggle, diff);
  }

  return el;
}

function linhaDiff(rotulo, valor, classeExtra = '') {
  const row = document.createElement('div');
  row.className = 'log-diff-row';

  const label = document.createElement('span');
  label.className = 'log-diff-label';
  label.textContent = rotulo;

  const val = document.createElement('span');
  val.className = `log-diff-valor ${classeExtra}`;
  val.textContent = valor;

  row.append(label, val);
  return row;
}

// ============================================
// Feedback (erros de validação de período / falha de API)
// ============================================
function exibirFeedback(texto, tipo) {
  const fb = document.getElementById('aud-detalhe-feedback');
  if (!fb) return;
  fb.textContent = texto;
  fb.className = `aud-feedback ${tipo}`;
}

function esconderFeedback() {
  const fb = document.getElementById('aud-detalhe-feedback');
  if (!fb) return;
  fb.textContent = '';
  fb.className = 'aud-feedback';
}