// adminPacientesLista.js
//
// Lista de pacientes: busca (client-side, só na página carregada),
// filtros (status, quem cadastrou, data de cadastro -- resolvidos no
// servidor) e paginação por número de página. Espelha o padrão de
// adminProfissionaisLista.js.
//
// Modelo de dados que a API devolve na listagem (GET /pacientes/resumo,
// Paciente.to_dict_few()):
//   { uuid, nome_completo, cpf_inicio, cadastrado_por, criado_em,
//     sexo_biologico, status }
// nome_completo e cpf_inicio já vêm descriptografados pelo service;
// cadastrado_por é o NOME de quem cadastrou (string), não um uuid --
// não há um segundo campo com o uuid nesta listagem.
//
// Qualquer outro dado do paciente (CPF completo, endereço, prontuário
// etc.) só é acessado depois de um step-up de identidade -- o botão
// "Ver ficha" abaixo navega para adminPacientesDetalhe.html, que é
// quem de fato pede a confirmação e busca os dados completos (ver
// buscarDetalheCompleto em adminPacientesApi.js). Nada sensível é
// buscado aqui na lista.
//
// Paginação: mesmo esquema de profissionais -- 'pagina' é o número da
// página (0, 1, 2...), tamanho fixo em 8 por página (repo faz
// .limit(8)), sem total de itens vindo da API. A existência de
// próxima página é uma heurística (página cheia sugere que pode haver
// mais); ver comentário extenso equivalente em
// adminProfissionaisLista.js.
//
// Filtros no servidor: SÓ status e sexo_biologico (ver
// repository.find_all_param no backend). NÃO existe filtro por quem
// cadastrou nem por data de cadastro na API hoje -- ambos ficam de
// fora do request e são só placeholders de UI por enquanto (ver
// configurarFiltros abaixo).
//
// Busca: a rota não tem parâmetro de busca textual -- nome e CPF
// vivem cifrados no banco (AES-256-GCM), então não dá pra fazer
// ILIKE direto (ver docstring de find_all_param no backend). A busca
// no campo de pesquisa aqui filtra só os itens já carregados na
// página atual (nome_completo e cpf_inicio), igual ao padrão já usado
// em profissionais.
// ============================================

import { ApiError, listarPacientes } from "./adminPacientesApi.js";

const POR_PAGINA = 8;

const STATUS_VALIDOS = new Set(['ativo', 'inativo', 'obito']);
const SEXO_VALIDOS = new Set(['masculino', 'feminino']); // TODO: confirmar valores exatos aceitos por sexo_biologico no backend

let itensPaginaAtual = [];
let temProximaPagina = false;
let paginaAtual = 0;
let termoBusca = '';
let filtroStatus = '';
let filtroSexoBiologico = '';
let carregando = false;

document.addEventListener('DOMContentLoaded', () => {
  configurarBusca();
  configurarFiltros();
  carregarERenderizar();
});

/** Recarrega a lista a partir da página/filtros atuais, sem alterá-los. */
export function recarregarLista() {
  return carregarERenderizar();
}

// ============================================
// Busca (client-side, restrita à página atual -- ver nota no topo)
// ============================================
function configurarBusca() {
  const input = document.getElementById('busca-paciente');
  if (!input) return;

  input.addEventListener('input', () => {
    termoBusca = input.value.trim().toLowerCase();
    renderizarLista();
  });
}

// ============================================
// Filtros: status e sexo_biologico vão pro servidor (únicos que a API
// aceita hoje -- ver find_all_param no backend). "Quem cadastrou"
// fica como placeholder de UI: não há filtro correspondente na API.
// ============================================
function configurarFiltros() {
  const btn = document.getElementById('btn-toggle-filtros');
  const painel = document.getElementById('filter-panel');
  const selectStatus = document.getElementById('filtro-status');
  const selectSexo = document.getElementById('filtro-sexo-biologico');
  if (!btn || !painel) return;

  btn.addEventListener('click', () => {
    const abrir = !painel.classList.contains('filter-panel--visible');
    painel.classList.toggle('filter-panel--visible', abrir);
    btn.classList.toggle('btn-filter--active', abrir);
  });

  const aplicarFiltros = () => {
    const statusEscolhido = selectStatus?.value.trim() || '';
    filtroStatus = STATUS_VALIDOS.has(statusEscolhido) ? statusEscolhido : '';
    const sexoEscolhido = selectSexo?.value.trim() || '';
    filtroSexoBiologico = SEXO_VALIDOS.has(sexoEscolhido) ? sexoEscolhido : '';
    resetarPaginacao();
    carregarERenderizar();
  };

  selectStatus?.addEventListener('change', aplicarFiltros);
  selectSexo?.addEventListener('change', aplicarFiltros);

  // TODO: "quem cadastrou" não tem filtro correspondente na API
  // (find_all_param não aceita esse parâmetro) -- qualquer pessoa
  // pode cadastrar um paciente, só o nome de quem cadastrou é exibido
  // no card (ver criarCardPaciente), não é filtrável no servidor por
  // ora. Este botão fica só como placeholder até existir um endpoint
  // de apoio; quando existir, trocar por um select real e ligar no
  // aplicarFiltros acima (e adicionar o parâmetro correspondente em
  // adminPacientesApi.js/listarPacientes).
  const btnCadastradoPor = document.getElementById('btn-filtro-cadastrado-por');
  if (btnCadastradoPor) {
    btnCadastradoPor.addEventListener('click', () => {
      console.log('TODO: filtro por "quem cadastrou" ainda não existe na API.');
    });
  }

  const btnLimpar = document.getElementById('btn-limpar-filtros');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      if (selectStatus) selectStatus.selectedIndex = 0;
      if (selectSexo) selectSexo.selectedIndex = 0;
      filtroStatus = '';
      filtroSexoBiologico = '';
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

  const container = document.getElementById('lista-pacientes');
  if (container) {
    container.innerHTML = '<p class="empty-state-text" style="padding: 24px 0;">Carregando pacientes…</p>';
  }

  try {
    const resposta = await listarPacientes({
      pagina: paginaAtual,
      status: filtroStatus || undefined,
      sexoBiologico: filtroSexoBiologico || undefined,
    });
    itensPaginaAtual = resposta.data || [];

    temProximaPagina = itensPaginaAtual.length === POR_PAGINA;

    if (itensPaginaAtual.length === 0 && paginaAtual > 0) {
      paginaAtual -= 1;
      temProximaPagina = false;
      carregando = false;
      return carregarERenderizar();
    }
  } catch (erro) {
    itensPaginaAtual = [];
    temProximaPagina = false;
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os pacientes.';
    exibirMensagemNaLista(mensagem);
    carregando = false;
    return;
  }

  carregando = false;
  renderizarLista();
}

function filtrarPorBusca(lista) {
  if (!termoBusca) return lista;
  return lista.filter(p =>
    (p.nome_completo ?? '').toLowerCase().includes(termoBusca) ||
    (p.cpf_inicio ?? '').toLowerCase().includes(termoBusca)
  );
}

// ============================================
// Renderização da lista + paginação
// ============================================
function renderizarLista() {
  const container = document.getElementById('lista-pacientes');
  if (!container) return;

  const visiveis = filtrarPorBusca(itensPaginaAtual);

  container.innerHTML = '';

  if (visiveis.length === 0) {
    container.appendChild(criarEstadoVazio());
  } else {
    visiveis.forEach(p => container.appendChild(criarCardPaciente(p)));
  }

  renderizarPaginacao();
}

function exibirMensagemNaLista(texto) {
  const container = document.getElementById('lista-pacientes');
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
    <p class="empty-state-text">${texto}</p>
  `;
  container.appendChild(div);
}

function criarEstadoVazio() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="11" cy="11" r="7" stroke-linecap="round"/>
      <path d="M21 21l-4.3-4.3" stroke-linecap="round"/>
    </svg>
    <p class="empty-state-title">Nenhum paciente encontrado</p>
    <p class="empty-state-text">Tente ajustar a busca ou os filtros.</p>
  `;
  return div;
}

function formatarData(isoOuData) {
  if (!isoOuData) return '—';
  // Aceita tanto "2026-03-12" quanto um ISO completo com hora.
  const somenteData = String(isoOuData).slice(0, 10);
  const [ano, mes, dia] = somenteData.split('-');
  if (!ano || !mes || !dia) return somenteData;
  return `${dia}/${mes}/${ano}`;
}

function criarCardPaciente(p) {
  const card = document.createElement('article');
  card.className = 'consult-card';

  const status = document.createElement('div');
  if (p.status === 'ativo') {
    status.className = 'consult-status status--em-atendimento';
    status.innerHTML = `<span class="status-dot"></span> Ativo`;
  } else if (p.status === 'obito') {
    status.className = 'consult-status status--inativo';
    status.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
        <path d="M8 12h8" stroke-linecap="round"/>
      </svg>
      Óbito`;
  } else {
    // status === 'inativo'
    status.className = 'consult-status status--inativo';
    status.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
        <path d="M8 8l8 8M16 8l-8 8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Inativo`;
  }

  const main = document.createElement('div');
  main.className = 'consult-main';
  const nome = document.createElement('h3');
  nome.className = 'consult-patient';
  nome.textContent = p.nome_completo;
  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  meta.textContent = `CPF ${p.cpf_inicio ?? '****'}.***.***-** · Cadastrado em ${formatarData(p.criado_em)} por ${p.cadastrado_por ?? '—'}`;
  main.append(nome, meta);

  const btn = document.createElement('button');
  btn.className = 'btn-ghost';
  btn.textContent = 'Ver ficha';
  btn.addEventListener('click', () => abrirFichaPaciente(p));

  card.append(status, main, btn);
  return card;
}

// ============================================
// Ficha do paciente — navega para a página de detalhe, que é quem
// pede o step-up e busca os dados completos (clínico + pessoal). O
// uuid vai na querystring; nada sensível trafega aqui na lista.
// ============================================
function abrirFichaPaciente(pacienteResumo) {
  const params = new URLSearchParams({ uuid: pacienteResumo.uuid });
  window.location.href = `adminPacientesDetalhe.html?${params.toString()}`;
}

// ============================================
// Paginação (setas Anterior/Próxima) — mesmo padrão de profissionais
// ============================================
function renderizarPaginacao() {
  const container = document.getElementById('paginacao');
  if (!container) return;

  container.innerHTML = '';

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = itensPaginaAtual.length === 0
    ? 'Nenhum resultado'
    : `Página ${paginaAtual + 1}`;

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
  document.getElementById('lista-pacientes')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function irParaPaginaAnterior() {
  if (paginaAtual === 0) return;
  paginaAtual -= 1;
  carregarERenderizar();
  document.getElementById('lista-pacientes')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}