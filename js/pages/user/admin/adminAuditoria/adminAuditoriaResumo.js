// adminAuditoriaResumo.js
//
// View 1 — resumo por profissional (a "tela principal" da auditoria,
// ver controller.py). Uma página de profissionais em ordem alfabética,
// cada card com seu último acesso e sua última alteração; clicar em
// "Ver histórico" troca para a view de detalhe (adminAuditoriaDetalhe.js).
//
// Diferenças importantes em relação a adminProfissionaisLista.js:
// - A busca por nome é SERVER-SIDE (a rota tem param `nome`, ilike no
//   backend), então ela reinicia a paginação e recarrega da API, com
//   debounce para não disparar um request por tecla.
// - A paginação aqui é NUMÉRICA de verdade: o backend devolve
//   `paginacao: {total, page, limit}`, então não precisamos da
//   heurística de "página cheia". `page` é 1-INDEXADO.
// - O tamanho de página é configurável (10/25/50), respeitando o
//   teto de 50 travado no backend (LIMIT_MAXIMO).
//
// Item que a API devolve (service.listar_resumo_por_profissional):
//   { uuid_usuario, nome,
//     ultimo_acesso?:    { uuid, frase_acao, data_hora },  -- ausente se nunca acessou
//     ultima_alteracao?: { uuid, frase_acao, data_hora } } -- ausente se nunca alterou
//
// Filtros da rota: nome, funcao_clinica ("medico"/"enfermeiro"),
// is_admin ("true"/"false") e acao (texto livre) -- são independentes
// e combináveis no backend; aqui no front cada um já dispara a
// recarga sozinho.

import { ApiError, listarResumoProfissionais } from "./adminAuditoriaApi.js";
import { abrirDetalheProfissional } from "./adminAuditoriaDetalhe.js";
import { criarEstadoVazio, formatarDataHora } from "./adminAuditoriaHelpers.js";

const DEBOUNCE_BUSCA_MS = 350;

let paginaAtual = 1;   // 1-indexado, bate com o backend (page default 1)
let limiteAtual = 10;
let filtros = { nome: '', funcaoClinica: '', isAdmin: null, acao: '' };
let carregando = false;
let timerDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
  configurarBusca();
  configurarFiltros();
  configurarLimite();
  carregarERenderizar();
});

// ============================================
// Busca por nome — server-side com debounce
// ============================================
function configurarBusca() {
  const input = document.getElementById('aud-busca');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(() => {
      filtros.nome = input.value.trim();
      paginaAtual = 1; // qualquer mudança de filtro volta pra primeira página
      carregarERenderizar();
    }, DEBOUNCE_BUSCA_MS);
  });
}

// ============================================
// Painel de filtros (função clínica / admin / ação)
// ============================================
function configurarFiltros() {
  const btn = document.getElementById('aud-btn-toggle-filtros');
  const painel = document.getElementById('aud-filter-panel');
  if (!btn || !painel) return;

  btn.addEventListener('click', () => {
    const abrir = !painel.classList.contains('filter-panel--visible');
    painel.classList.toggle('filter-panel--visible', abrir);
    btn.classList.toggle('btn-filter--active', abrir);
  });

  const aplicar = () => {
    filtros.funcaoClinica = document.getElementById('aud-filtro-funcao')?.value.trim() || '';
    const adminRaw = document.getElementById('aud-filtro-admin')?.value.trim() || '';
    filtros.isAdmin = adminRaw === '' ? null : adminRaw === 'true';
    paginaAtual = 1;
    carregarERenderizar();
  };

  document.getElementById('aud-filtro-funcao')?.addEventListener('change', aplicar);
  document.getElementById('aud-filtro-admin')?.addEventListener('change', aplicar);

  // "Ação" também é server-side, então entra no mesmo debounce da busca
  const inputAcao = document.getElementById('aud-filtro-acao');
  inputAcao?.addEventListener('input', () => {
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(() => {
      filtros.acao = inputAcao.value.trim();
      paginaAtual = 1;
      carregarERenderizar();
    }, DEBOUNCE_BUSCA_MS);
  });

  document.getElementById('aud-btn-limpar-filtros')?.addEventListener('click', () => {
    painel.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
    painel.querySelectorAll('input').forEach(i => { i.value = ''; });
    document.getElementById('aud-busca').value = '';
    filtros = { nome: '', funcaoClinica: '', isAdmin: null, acao: '' };
    paginaAtual = 1;
    carregarERenderizar();
  });
}

// ============================================
// Tamanho de página (10/25/50) — zera a paginação e recarrega
// ============================================
function configurarLimite() {
  const select = document.getElementById('aud-limite');
  if (!select) return;
  select.addEventListener('change', () => {
    limiteAtual = Number(select.value) || 10;
    paginaAtual = 1;
    carregarERenderizar();
  });
}

// ============================================
// Dados — carregamento via API
// ============================================
async function carregarERenderizar() {
  if (carregando) return;
  carregando = true;

  const container = document.getElementById('aud-lista-resumo');
  if (container) {
    container.innerHTML = '<p class="aud-loading" style="padding: 24px 0;">Carregando…</p>';
  }

  try {
    const resposta = await listarResumoProfissionais({
      nome: filtros.nome || undefined,
      funcaoClinica: filtros.funcaoClinica || undefined,
      isAdmin: filtros.isAdmin,
      acao: filtros.acao || undefined,
      page: paginaAtual,
      limit: limiteAtual,
    });
    renderizarLista(resposta.data?.itens ?? []);
    renderizarPaginacao(resposta.data?.paginacao ?? null);
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar a auditoria.';
    exibirErroNaLista(mensagem);
    renderizarPaginacao(null);
  } finally {
    carregando = false;
  }
}

function exibirErroNaLista(texto) {
  const container = document.getElementById('aud-lista-resumo');
  if (!container) return;
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
      <path d="M12 8v5M12 16h.01" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p class="empty-state-title">Não foi possível carregar</p>
    <p class="empty-state-text"></p>
  `;
  div.querySelector('.empty-state-text').textContent = texto;
  container.appendChild(div);
}

// ============================================
// Renderização
// ============================================
function renderizarLista(itens) {
  const container = document.getElementById('aud-lista-resumo');
  if (!container) return;

  container.innerHTML = '';

  if (itens.length === 0) {
    container.appendChild(criarEstadoVazio(
      'Nenhum profissional encontrado',
      'Tente ajustar a busca ou os filtros.'
    ));
    return;
  }

  itens.forEach(item => container.appendChild(criarCardProfissional(item)));
}

function criarCardProfissional(item) {
  const card = document.createElement('article');
  card.className = 'aud-card';

  const main = document.createElement('div');
  main.className = 'aud-card-main';

  const nome = document.createElement('h3');
  nome.className = 'aud-card-nome';
  nome.textContent = item.nome ?? '—';
  main.appendChild(nome);

  main.appendChild(criarLinhaEvento('Último acesso', item.ultimo_acesso));
  main.appendChild(criarLinhaEvento('Última alteração', item.ultima_alteracao));

  const btn = document.createElement('button');
  btn.className = 'btn-ghost';
  btn.textContent = 'Ver histórico';
  btn.addEventListener('click', () => abrirDetalheProfissional(item));

  card.append(main, btn);
  return card;
}

function criarLinhaEvento(rotulo, evento) {
  const linha = document.createElement('p');
  linha.className = 'aud-card-evento';

  const label = document.createElement('span');
  label.className = 'aud-card-evento-label';
  label.textContent = rotulo;

  const frase = document.createElement('span');
  frase.className = evento ? 'aud-card-evento-frase' : 'aud-card-evento-vazio';
  frase.textContent = evento ? (evento.frase_acao ?? '—') : 'sem registro';

  linha.appendChild(label);
  linha.appendChild(frase);

  if (evento?.data_hora) {
    const data = document.createElement('span');
    data.className = 'aud-card-evento-data';
    data.textContent = formatarDataHora(evento.data_hora);
    linha.appendChild(data);
  }

  return linha;
}

// ============================================
// Paginação numérica — o backend devolve total, então sabemos
// exatamente quantas páginas existem (sem heurística).
// ============================================
function renderizarPaginacao(paginacao) {
  const info = document.getElementById('aud-paginacao-info');
  const controles = document.getElementById('aud-paginacao-controles');
  if (!info || !controles) return;

  controles.innerHTML = '';

  const total = paginacao?.total ?? 0;
  if (total === 0) {
    info.textContent = 'Nenhum resultado';
    return;
  }

  const page = paginacao.page ?? paginaAtual;
  const limit = paginacao.limit ?? limiteAtual;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));

  info.textContent = `${total} ${total === 1 ? 'profissional' : 'profissionais'} · página ${page} de ${totalPaginas}`;

  controles.appendChild(criarBotaoSeta({
    label: 'Página anterior',
    desabilitado: page <= 1,
    onClick: () => irParaPagina(page - 1),
  }));

  for (const p of paginasVisiveis(page, totalPaginas)) {
    if (p === '…') {
      const sep = document.createElement('span');
      sep.className = 'pagination-ellipsis';
      sep.textContent = '…';
      controles.appendChild(sep);
    } else {
      controles.appendChild(criarBotaoNumero(p, p === page));
    }
  }

  controles.appendChild(criarBotaoSeta({
    label: 'Próxima página',
    desabilitado: page >= totalPaginas,
    onClick: () => irParaPagina(page + 1),
  }));
}

/**
 * Janela de páginas visíveis: com até 7 páginas mostra tudo; acima
 * disso mostra primeira, última e uma vizinhança da atual, com
 * reticências nos gaps. Ex.: [1, '…', 4, 5, 6, '…', 12].
 */
function paginasVisiveis(page, totalPaginas) {
  if (totalPaginas <= 7) {
    return Array.from({ length: totalPaginas }, (_, i) => i + 1);
  }
  const candidatas = new Set([1, totalPaginas, page - 1, page, page + 1]);
  const ordenadas = [...candidatas]
    .filter(p => p >= 1 && p <= totalPaginas)
    .sort((a, b) => a - b);

  const resultado = [];
  let anterior = 0;
  for (const p of ordenadas) {
    if (p - anterior > 1) resultado.push('…');
    resultado.push(p);
    anterior = p;
  }
  return resultado;
}

function criarBotaoSeta({ label, desabilitado, onClick }) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.setAttribute('aria-label', label);
  btn.disabled = desabilitado;
  const direcao = label === 'Página anterior' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${direcao}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function criarBotaoNumero(numero, ativo) {
  const btn = document.createElement('button');
  btn.className = ativo ? 'page-btn page-btn--active' : 'page-btn';
  btn.textContent = String(numero);
  btn.setAttribute('aria-label', `Página ${numero}`);
  btn.addEventListener('click', () => irParaPagina(numero));
  return btn;
}

function irParaPagina(numero) {
  if (numero < 1 || numero === paginaAtual) return;
  paginaAtual = numero;
  carregarERenderizar();
  document.getElementById('view-resumo')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}