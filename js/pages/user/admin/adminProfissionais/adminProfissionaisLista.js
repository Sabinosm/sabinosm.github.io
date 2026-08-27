// adminProfissionaisLista.js
//
// Lista de profissionais: busca (client-side, só na página carregada),
// filtros (especialidade e status, resolvidos no servidor) e
// paginação por número de página.
//
// O modal de cadastro/edição/ativação vive em adminProfissionaisModal.js
// -- os dois se chamam de volta um ao outro: este arquivo abre o modal
// ao clicar num card (abrirModalProfissional, importado de lá), e o
// modal chama de volta recarregarLista (exportada daqui) depois de
// salvar/ativar/desativar, para a lista refletir a mudança.
//
// Modelo de dados que a API devolve (Usuario.to_dict_few(), usado na
// listagem GET /):
//   { uuid, nome_completo, email, tipo_usuario, status, is_admin }
// Campos sensíveis (cpf, atributos_profissionais/CRM-COREN) só vêm no
// detalhe (GET /<uuid>, Usuario.to_dict() completo), buscado em
// adminProfissionaisModal.js quando o admin abre a edição.
//
// ALTERADO (múltiplos admins por empresa):
// - A listagem agora PODE incluir admins comuns (o backend só exclui
//   o super admin/fundador -- ver repository.find_all_param). Cada
//   item vem com `is_admin` para o card diferenciar o rótulo.
// - O botão "Convidar profissional" abre um seletor de tipo quando o
//   usuário logado é super admin (pode convidar médico, enfermeiro ou
//   admin); para admin comum, continua abrindo direto o formulário de
//   médico/enfermeiro (ele nunca pode criar admin -- ver
//   adminProfissionaisModal.js).
// - `souSuperAdmin` é lido da sessão (GET /me, já chamado em algum
//   lugar do carregamento da página -- aqui é lido de window.__sessaoUsuario
//   se disponível, com fallback pedindo pro modal checar via API caso
//   ainda não tenha sido carregado). Ver nota em configurarSessao().
//
// Paginação: GET /?pagina=&status=&especialidade= usa 'pagina' como
// NÚMERO DA PÁGINA (0, 1, 2...), não offset em itens -- o backend
// multiplica por 8 internamente para achar o offset real. O front só
// manda o número da página, sem fazer essa conta. O tamanho de página
// é FIXO em POR_PAGINA=8 (não há parâmetro de limit). O servidor
// também não devolve total de itens nem uma flag de "há próxima
// página".
//
// Por isso a existência de próxima página é uma HEURÍSTICA, não uma
// garantia: se a resposta veio com exatamente POR_PAGINA itens,
// assumimos que pode haver mais e habilitamos "Próxima". Isso erra
// exatamente no caso em que o total de itens é múltiplo exato de 8
// -- aí o botão "Próxima" fica habilitado, mas a página seguinte
// vem vazia; tratamos isso mostrando o estado vazio e desabilitando
// "Próxima" a partir daquele ponto (ver carregarERenderizar). Sem
// contagem total, não há como fazer melhor do lado do cliente; se a
// rota um dia devolver um total ou um "tem_proxima", trocar a
// heurística abaixo por esse dado.
//
// Busca: a rota não tem parâmetro de busca textual -- só filtra por
// 'especialidade' e 'status'. A busca por nome/e-mail/login no campo
// de pesquisa é aplicada só sobre os itens já carregados na página
// atual (8 no máximo), não sobre a base inteira. Se um dia a API
// ganhar busca textual (ex: ?q=), trocar para usá-la no request.
// ============================================

import { ApiError, listarProfissionais } from "./adminProfissionaisApi.js";
import { abrirModalProfissional, abrirModalConvite } from "./adminProfissionaisModal.js";

const POR_PAGINA = 8;

// Mapa entre o valor exibido no select de status e o que a API aceita
// como PARÂMETRO de filtro: 'pendente' | 'ativo' | 'desativado'.
// Atenção -- isso é diferente do valor que vem no campo `status` de
// cada item da resposta, que continua sendo 'inativo' (não
// 'desativado') para usuário desativado. Ver criarCardProfissional.
const STATUS_VALIDOS = new Set(['pendente', 'ativo', 'desativado']);

let itensPaginaAtual = [];    // itens da página atual, já carregados da API
let temProximaPagina = false; // heurística: true se a última página veio cheia (ver carregarERenderizar)
let paginaAtual = 0;          // número da página (0, 1, 2...) -- backend multiplica por 8 internamente
let termoBusca = '';
let filtroEspecialidade = '';
let filtroStatus = '';
let carregando = false; // trava contra requests de listagem sobrepostos

document.addEventListener('DOMContentLoaded', () => {
  configurarBusca();
  configurarFiltros();
  configurarBotaoConvidar();
  carregarERenderizar();
});

/**
 * Recarrega a lista a partir da página/filtros atuais, sem alterá-los.
 * Chamada pelo modal (adminProfissionaisModal.js) depois de salvar,
 * criar ou ativar/desativar um profissional, para a lista refletir
 * a mudança sem precisar resetar página ou filtros.
 */
export function recarregarLista() {
  return carregarERenderizar();
}

// ============================================
// Botão "Convidar profissional" -- abre o modal certo conforme o
// papel de quem está logado (ver adminProfissionaisModal.js sobre
// como ele decide se oferece a opção "Administrador").
// ============================================
function configurarBotaoConvidar() {
  const btn = document.getElementById('btn-convidar-profissional');
  if (!btn) return;
  btn.addEventListener('click', () => abrirModalConvite());
}

// ============================================
// Busca (client-side, restrita à página atual -- ver nota no topo)
// ============================================
function configurarBusca() {
  const input = document.getElementById('busca-profissional');
  if (!input) return;

  input.addEventListener('input', () => {
    termoBusca = input.value.trim().toLowerCase();
    renderizarLista(); // não recarrega da API -- filtra só o que já está na página
  });
}

// ============================================
// Filtros (painel expansível) -- especialidade e status vão pro servidor
// ============================================
function configurarFiltros() {
  const btn = document.getElementById('btn-toggle-filtros');
  const painel = document.getElementById('filter-panel');
  const selectEspecialidade = document.getElementById('filtro-especialidade');
  const selectStatus = document.getElementById('filtro-status');
  if (!btn || !painel) return;

  btn.addEventListener('click', () => {
    const abrir = !painel.classList.contains('filter-panel--visible');
    painel.classList.toggle('filter-panel--visible', abrir);
    btn.classList.toggle('btn-filter--active', abrir);
  });

  const aplicarFiltros = () => {
    filtroEspecialidade = selectEspecialidade?.value.trim() || '';
    const statusEscolhido = selectStatus?.value.trim() || '';
    filtroStatus = STATUS_VALIDOS.has(statusEscolhido) ? statusEscolhido : '';
    resetarPaginacao();
    carregarERenderizar();
  };

  selectEspecialidade?.addEventListener('change', aplicarFiltros);
  selectStatus?.addEventListener('change', aplicarFiltros);

  const btnLimpar = document.getElementById('btn-limpar-filtros');
  if (btnLimpar) {
    btnLimpar.addEventListener('click', () => {
      painel.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
      filtroEspecialidade = '';
      filtroStatus = '';
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

  const container = document.getElementById('lista-profissionais');
  if (container) {
    container.innerHTML = '<p class="empty-state-text" style="padding: 24px 0;">Carregando profissionais…</p>';
  }

  try {
    const resposta = await listarProfissionais({
      pagina: paginaAtual,
      status: filtroStatus || undefined,
      especialidade: filtroEspecialidade || undefined,
    });
    itensPaginaAtual = resposta.data || [];

    // Heurística (ver nota no topo do arquivo): página cheia sugere
    // que pode haver mais itens depois dela.
    temProximaPagina = itensPaginaAtual.length === POR_PAGINA;

    // Caso a heurística tenha errado na página anterior (total múltiplo
    // de 8): chegamos aqui com uma página vazia além do fim real. Volta
    // automaticamente para a página anterior em vez de mostrar um vazio
    // "Próxima" confuso, e não deixa mais avançar.
    if (itensPaginaAtual.length === 0 && paginaAtual > 0) {
      paginaAtual -= 1;
      temProximaPagina = false;
      carregando = false;
      return carregarERenderizar();
    }
  } catch (erro) {
    itensPaginaAtual = [];
    temProximaPagina = false;
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os profissionais.';
    exibirMensagemNaLista(mensagem);
    carregando = false;
    return;
  }

  carregando = false;
  renderizarLista();
}

function filtrarPorBusca(lista) {
  if (!termoBusca) return lista;
  // Busca só por nome e e-mail -- user_login não vem na listagem
  // (GET /), que usa to_dict_few no backend para reduzir o payload.
  // O login continua visível/editável no modal de detalhe (GET
  // /<uuid>, que traz o objeto completo), só não é pesquisável aqui.
  return lista.filter(p =>
    (p.nome_completo ?? '').toLowerCase().includes(termoBusca) ||
    (p.email ?? '').toLowerCase().includes(termoBusca)
  );
}

// ============================================
// Renderização da lista + paginação
// ============================================
function renderizarLista() {
  const container = document.getElementById('lista-profissionais');
  if (!container) return;

  const visiveis = filtrarPorBusca(itensPaginaAtual);

  container.innerHTML = '';

  if (visiveis.length === 0) {
    container.appendChild(criarEstadoVazio());
  } else {
    visiveis.forEach(p => container.appendChild(criarCardProfissional(p)));
  }

  renderizarPaginacao();
}

function exibirMensagemNaLista(texto) {
  const container = document.getElementById('lista-profissionais');
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
    <p class="empty-state-title">Nenhum profissional encontrado</p>
    <p class="empty-state-text">Tente ajustar a busca ou os filtros, ou convide um novo profissional para a equipe.</p>
  `;
  return div;
}

function criarCardProfissional(p) {
  const card = document.createElement('article');
  card.className = 'consult-card';
  // ADICIONADO: marcador visual leve para admin (ver CSS) -- não é
  // estritamente necessário, mas ajuda a diferenciar o card de admin
  // dos de médico/enfermeiro numa lista mista.
  if (p.is_admin) card.classList.add('consult-card--admin');

  const status = document.createElement('div');
  if (p.status === 'ativo') {
    status.className = 'consult-status status--em-atendimento';
    status.innerHTML = `<span class="status-dot"></span> Ativo`;
  } else if (p.status === 'pendente') {
    status.className = 'consult-status status--aguardando-medico';
    status.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
        <path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Onboarding pendente`;
  } else {
    // status === 'inativo' (usuário desativado -- ver nota no topo
    // do arquivo sobre a diferença entre o valor salvo no banco,
    // 'inativo', e o nome do parâmetro de filtro, 'desativado')
    status.className = 'consult-status status--inativo';
    status.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke-linecap="round"/>
        <path d="M8 8l8 8M16 8l-8 8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Desativado`;
  }

  const main = document.createElement('div');
  main.className = 'consult-main';
  const nome = document.createElement('h3');
  nome.className = 'consult-patient';
  nome.textContent = p.nome_completo;
  const meta = document.createElement('p');
  meta.className = 'consult-meta';
  // ADICIONADO: rótulo "Administrador" -- p.tipo_usuario já vem como
  // "admin" nesse caso (Usuario.tipo_usuario property), então só
  // precisa de um label amigável a mais no mapa abaixo.
  const tipoLabel = p.tipo_usuario === 'medico' ? 'Médico'
    : p.tipo_usuario === 'enfermeiro' ? 'Enfermeiro'
    : p.tipo_usuario === 'admin' ? 'Administrador'
    : (p.tipo_usuario || '—');
  meta.textContent = `${tipoLabel} · ${p.email}`;
  main.append(nome, meta);

  const btn = document.createElement('button');
  btn.className = 'btn-ghost';
  btn.textContent = 'Gerenciar';
  btn.addEventListener('click', () => abrirModalProfissional(p));

  card.append(status, main, btn);
  return card;
}

// ============================================
// Paginação (setas Anterior/Próxima).
// Sem total de itens vindo da API, não há como numerar páginas fixas
// -- por isso não há botões numéricos, só avançar/voltar.
// ============================================
function renderizarPaginacao() {
  const container = document.getElementById('paginacao');
  if (!container) return;

  container.innerHTML = '';

  const info = document.createElement('span');
  info.className = 'pagination-info';
  info.textContent = itensPaginaAtual.length === 0
    ? 'Nenhum resultado'
    : `Página ${paginaAtual + 1}`; // exibição 1-indexada; paginaAtual é 0-indexado (bate com o backend)

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
  document.getElementById('lista-profissionais')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function irParaPaginaAnterior() {
  if (paginaAtual === 0) return;
  paginaAtual -= 1;
  carregarERenderizar();
  document.getElementById('lista-profissionais')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}