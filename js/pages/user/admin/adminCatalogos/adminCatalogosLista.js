// adminCatalogosLista.js
//
// Lista do catálogo de protocolos: busca (client-side, só na página
// carregada), filtros (tipo de protocolo, escopo de população, escopo
// de uso e "somente liberados" — resolvidos no servidor) e paginação
// por número de página.
//
// O drawer de detalhe vive em adminCatalogosDetalhe.js -- este arquivo
// o abre ao clicar em "Detalhes" num card (abrirDrawerProtocolo).
//
// Modelo de dados que a API devolve (ProtocoloCatalogoService._montar_resumo):
//   { uuid, nome_protocolo, sigla, tipo_protocolo, escopo_populacao,
//     escopo_uso, liberado_pela_empresa, politica,
//     padrao_institucional, favorito, default_pessoal }
// onde favorito é null para quem não tem papel clínico (sem estrela).
//
// Escopo: o card mostra o catálogo, o Detalhes e a estrela de favorito
// (só para médico/enfermeiro). Os controles de configuração mais
// pesados -- padrão pessoal, liberação, política e padrão da
// instituição -- ficam no drawer (adminCatalogosDetalhe.js). A EXECUÇÃO
// de protocolos não acontece nesta página: vive na página de consultas.
//
// As ações mutam o objeto do card in-place (adminCatalogosAcoes.js) e
// avisam por evento; aoProtocoloAtualizado redesenha a lista SEM
// recarregar da API -- um card recém-desativado continua visível até o
// próximo carregamento, o que também preserva a heurística de página
// cheia da paginação.
//
// Paginação: GET /catalogo/filtrar usa 'pagina' como NÚMERO DA
// PÁGINA (0, 1, 2...); o backend multiplica por 20 internamente. O
// front só manda o número da página. Tamanho de página FIXO em
// POR_PAGINA=20 (não há parâmetro de limit) e o servidor NÃO devolve
// total nem flag "há próxima página".
//
// Por isso a existência de próxima página é uma HEURÍSTICA, mesmo
// raciocínio documentado em adminProfissionaisLista.js: se a resposta
// veio com exatamente POR_PAGINA itens, assumimos que pode haver mais
// e habilitamos "Próxima". Se a heurística errar (total múltiplo
// exato de 20), a página seguinte vem vazia e voltamos uma página
// automaticamente (ver carregarERenderizar). Se a rota um dia
// devolver total ou "tem_proxima", trocar a heurística por esse dado.
//
// Busca: a rota não tem parâmetro de busca textual -- a busca por
// nome/sigla no campo de pesquisa é aplicada só sobre os itens já
// carregados na página atual (20 no máximo). Se a API ganhar ?q=,
// trocar para usá-la no request.

import { ApiError, listarProtocolos } from "./adminCatalogosApi.js";
import { abrirDrawerProtocolo } from "./adminCatalogosDetalhe.js";
import { EVENTO_ATUALIZADO, alternarFavorito } from "./adminCatalogosAcoes.js";
import { regrasEstrela } from "./adminCatalogosRegras.js";
import { comTrava, criarBadgesProtocolo } from "./adminCatalogosUi.js";

const POR_PAGINA = 20;

let itensPaginaAtual = [];    // itens da página atual, já carregados da API
let temProximaPagina = false; // heurística: true se a última página veio cheia
let paginaAtual = 0;          // número da página (0-indexado, bate com o backend)
let termoBusca = '';
let filtroTipoProtocolo = '';
let filtroEscopoPopulacao = '';
let filtroEscopoUso = '';
let filtroApenasLiberados = false;
let carregando = false; // trava contra requests de listagem sobrepostos

document.addEventListener('DOMContentLoaded', () => {
  configurarBusca();
  configurarFiltros();
  document.addEventListener(EVENTO_ATUALIZADO, aoProtocoloAtualizado);
  carregarERenderizar();
});

/**
 * Uma ação de configuração terminou (card ou drawer). O objeto do card já
 * foi atualizado in-place; aqui só limpamos o "padrão" que o back tirou de
 * OUTRO protocolo da página (um só padrão por escopo) e redesenhamos.
 */
function aoProtocoloAtualizado(evento) {
  const { uuid, limparOutros } = evento.detail || {};
  if (limparOutros) {
    itensPaginaAtual.forEach(item => {
      if (item.uuid !== uuid && item[limparOutros.campo] === limparOutros.escopo) {
        item[limparOutros.campo] = null;
      }
    });
  }
  renderizarLista();
}

// ============================================
// Busca (client-side, restrita à página atual -- ver nota no topo)
// ============================================
function configurarBusca() {
  const input = document.getElementById('busca-protocolo');
  if (!input) return;

  input.addEventListener('input', () => {
    termoBusca = input.value.trim().toLowerCase();
    renderizarLista(); // não recarrega da API -- filtra só o que já está na página
  });
}

// ============================================
// Filtros (painel expansível) -- vão todos pro servidor
// ============================================
function configurarFiltros() {
  const btn = document.getElementById('btn-toggle-filtros');
  const painel = document.getElementById('filter-panel');
  const selectTipo = document.getElementById('filtro-tipo-protocolo');
  const selectPopulacao = document.getElementById('filtro-escopo-populacao');
  const selectUso = document.getElementById('filtro-escopo-uso');
  const checkboxLiberados = document.getElementById('filtro-apenas-liberados');
  if (!btn || !painel) return;

  btn.addEventListener('click', () => {
    const abrir = !painel.classList.contains('filter-panel--visible');
    painel.classList.toggle('filter-panel--visible', abrir);
    btn.classList.toggle('btn-filter--active', abrir);
  });

  const aplicarFiltros = () => {
    filtroTipoProtocolo = selectTipo?.value.trim() || '';
    filtroEscopoPopulacao = selectPopulacao?.value.trim() || '';
    filtroEscopoUso = selectUso?.value.trim() || '';
    filtroApenasLiberados = Boolean(checkboxLiberados?.checked);
    resetarPaginacao();
    carregarERenderizar();
  };

  selectTipo?.addEventListener('change', aplicarFiltros);
  selectPopulacao?.addEventListener('change', aplicarFiltros);
  selectUso?.addEventListener('change', aplicarFiltros);
  checkboxLiberados?.addEventListener('change', aplicarFiltros);

  const btnLimpar = document.getElementById('btn-limpar-filtros');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      painel.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
      if (checkboxLiberados) checkboxLiberados.checked = false;
      filtroTipoProtocolo = '';
      filtroEscopoPopulacao = '';
      filtroEscopoUso = '';
      filtroApenasLiberados = false;
      resetarPaginacao();
      carregarERenderizar();
    });
  }
}

function resetarPaginacao() {
  paginaAtual = 0;
}

// ============================================
// Dados — carregamento via API
// ============================================
async function carregarERenderizar() {
  if (carregando) return;
  carregando = true;

  const container = document.getElementById('lista-protocolos');
  if (container) {
    container.innerHTML = '<p class="catalog-empty-text" style="padding: 24px 0;">Carregando protocolos…</p>';
  }

  try {
    const resposta = await listarProtocolos({
      pagina: paginaAtual,
      tipo_protocolo: filtroTipoProtocolo || undefined,
      escopo_populacao: filtroEscopoPopulacao || undefined,
      escopo_uso: filtroEscopoUso || undefined,
      apenas_liberados: filtroApenasLiberados,
    });
    itensPaginaAtual = resposta.data || [];

    // Heurística (ver nota no topo do arquivo): página cheia sugere
    // que pode haver mais itens depois dela.
    temProximaPagina = itensPaginaAtual.length === POR_PAGINA;

    // Heurística errou (total múltiplo de 20): voltar uma página em
    // vez de mostrar um vazio depois do fim real.
    if (itensPaginaAtual.length === 0 && paginaAtual > 0) {
      paginaAtual -= 1;
      temProximaPagina = false;
      carregando = false;
      return carregarERenderizar();
    }
  } catch (erro) {
    itensPaginaAtual = [];
    temProximaPagina = false;
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os protocolos.';
    exibirErroNaLista(mensagem);
    carregando = false;
    return;
  }

  carregando = false;
  renderizarLista();
}

function filtrarPorBusca(lista) {
  if (!termoBusca) return lista;
  return lista.filter(p =>
    (p.nome_protocolo ?? '').toLowerCase().includes(termoBusca) ||
    (p.sigla ?? '').toLowerCase().includes(termoBusca)
  );
}

// ============================================
// Renderização da lista + paginação
// ============================================
function renderizarLista() {
  const container = document.getElementById('lista-protocolos');
  if (!container) return;

  const visiveis = filtrarPorBusca(itensPaginaAtual);

  container.innerHTML = '';

  if (visiveis.length === 0) {
    container.appendChild(criarEstadoVazio());
  } else {
    visiveis.forEach(p => container.appendChild(criarCardProtocolo(p)));
  }

  renderizarPaginacao();
}

function exibirErroNaLista(texto) {
  const container = document.getElementById('lista-protocolos');
  if (!container) return;
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'catalog-empty';
  div.innerHTML = `
    <svg class="catalog-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
      <path d="M12 8v5M12 16h.01" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="catalog-empty-title">Não foi possível carregar</p>
    <p class="catalog-empty-text">${texto}</p>
  `;
  container.appendChild(div);
}

function criarEstadoVazio() {
  const div = document.createElement('div');
  div.className = 'catalog-empty';
  div.innerHTML = `
    <svg class="catalog-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="11" cy="11" r="7" stroke-linecap="round"/>
      <path d="M21 21l-4.3-4.3" stroke-linecap="round"/>
    </svg>
    <p class="catalog-empty-title">Nenhum protocolo encontrado</p>
    <p class="catalog-empty-text">Tente ajustar a busca ou os filtros aplicados.</p>
  `;
  return div;
}

// ============================================
// Card de protocolo
//
// Ações do card: "Detalhes" e a estrela de favorito. A estrela só existe
// se o back mandou favorito (true/false); admin puro recebe null e não a
// vê. Cheia = favorito; travada quando obrigatório/padrão da instituição
// (regras em adminCatalogosRegras.js). O back protege as rotas reais.
// ============================================
function criarCardProtocolo(p) {
  const card = document.createElement('article');
  card.className = 'catalog-card';

  // --- Cabeçalho: nome + sigla ---
  const header = document.createElement('div');
  header.className = 'catalog-card-header';

  const titulo = document.createElement('div');
  titulo.className = 'catalog-card-titulo';
  const nome = document.createElement('h3');
  nome.className = 'catalog-card-nome';
  nome.textContent = p.nome_protocolo;
  titulo.appendChild(nome);

  header.appendChild(titulo);
  header.appendChild(criarBadgeSigla(p.sigla));

  // --- Badges de classificação e estado ---
  const badges = document.createElement('div');
  badges.className = 'catalog-card-badges';
  badges.append(...criarBadgesProtocolo(p));

  // --- Ações ---
  const acoes = document.createElement('div');
  acoes.className = 'catalog-card-acoes';

  const btnDetalhes = document.createElement('button');
  btnDetalhes.className = 'btn-ghost';
  btnDetalhes.textContent = 'Detalhes';
  btnDetalhes.addEventListener('click', () => abrirDrawerProtocolo(p));
  acoes.appendChild(btnDetalhes);

  const btnEstrela = criarBotaoEstrela(p);
  if (btnEstrela) acoes.appendChild(btnEstrela);

  card.append(header, badges, acoes);
  return card;
}

function criarBotaoEstrela(p) {
  const regras = regrasEstrela(p);
  if (!regras.visivel) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `catalog-icon-btn${regras.cheia ? ' catalog-icon-btn--ativo' : ''}`;
  btn.setAttribute('aria-label', regras.cheia ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
  btn.setAttribute('aria-pressed', String(regras.cheia));
  btn.title = regras.titulo;
  btn.disabled = !regras.habilitada;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="${regras.cheia ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" width="18" height="18">
      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8L12 3z" stroke-linejoin="round"/>
    </svg>`;
  btn.addEventListener('click', () => comTrava(btn, () => alternarFavorito(p)));
  return btn;
}

function criarBadgeSigla(sigla) {
  const badge = document.createElement('span');
  badge.className = 'catalog-badge catalog-badge--sigla';
  badge.textContent = sigla ?? '—';
  return badge;
}

// ============================================
// Paginação (setas Anterior/Próxima) -- mesmo padrão de
// adminProfissionaisLista.js: sem total da API, não há páginas
// numeradas, só avançar/voltar guiados pela heurística.
// ============================================
function renderizarPaginacao() {
  const container = document.getElementById('paginacao');
  if (!container) return;

  container.innerHTML = '';

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = itensPaginaAtual.length === 0
    ? 'Nenhum resultado'
    : `Página ${paginaAtual + 1}`; // exibição 1-indexada

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';

  controls.appendChild(criarBotaoPagina({
    conteudoSvg: `<path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: 'Página anterior',
    desabilitado: paginaAtual === 0,
    onClick: irParaPaginaAnterior,
  }));

  controls.appendChild(criarBotaoPagina({
    conteudoSvg: `<path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>`,
    label: 'Próxima página',
    desabilitado: !temProximaPagina,
    onClick: irParaProximaPagina,
  }));

  container.append(info, controls);
}

function criarBotaoPagina({ conteudoSvg, label, desabilitado, onClick }) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.setAttribute('aria-label', label);
  btn.disabled = desabilitado;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${conteudoSvg}</svg>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function irParaProximaPagina() {
  if (!temProximaPagina) return;
  paginaAtual += 1;
  carregarERenderizar();
  document.getElementById('lista-protocolos')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function irParaPaginaAnterior() {
  if (paginaAtual === 0) return;
  paginaAtual -= 1;
  carregarERenderizar();
  document.getElementById('lista-protocolos')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}