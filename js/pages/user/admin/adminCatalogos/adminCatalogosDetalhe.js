// adminCatalogosDetalhe.js
//
// Drawer lateral de detalhe do protocolo (intenção "informação"):
// preenche o overlay #catalogo-drawer-overlay de adminCatalogos.html
// com a explicação estruturada (o_que_e / quando_usar / como_interpretar),
// metadados (órgão emissor, versão, vigência, referência) e as mesmas
// opções por papel do card.
//
// Dados: o resumo do card (com liberado_pela_empresa e politica) vem
// junto na chamada -- o detalhe GET /<uuid> NÃO repete esses campos
// (ProtocoloCatalogo.to_dict não os tem), então o drawer depende dos
// dois: resumo para badges/ações, detalhe para explicação e metadados.
//
// A explicação vem do seed (Caminho A -- schema ExplicacaoProtocolo) e
// é somente leitura; por isso o detalhe já funciona neste degrau,
// enquanto executar/liberação/destaque seguem como "em breve".

import { ApiError, buscarProtocolo } from "./adminCatalogosApi.js";
import {
  rotuloEscopoPopulacao,
  rotuloEscopoUso,
  rotuloPolitica,
  rotuloTipoProtocolo,
  rotuloTipoResultado,
} from "./adminCatalogosLabels.js";
import { souAdmin, souProfissionalDeSaude } from "./adminCatalogosSessao.js";

let resumoAtual = null; // item do card que abriu o drawer

document.addEventListener('DOMContentLoaded', configurarDrawer);

function configurarDrawer() {
  const overlay = document.getElementById('catalogo-drawer-overlay');
  if (!overlay) return;

  document.getElementById('catalogo-drawer-close')
    ?.addEventListener('click', fecharDrawer);

  // Clique no fundo escuro (fora do painel) também fecha.
  overlay.addEventListener('click', (evento) => {
    if (evento.target === overlay) fecharDrawer();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && overlay.classList.contains('catalogo-drawer-overlay--visible')) {
      fecharDrawer();
    }
  });
}

/** Abre o drawer para o protocolo do card clicado. */
export function abrirDrawerProtocolo(resumo) {
  resumoAtual = resumo;
  preencherCabecalho(resumo);
  mostrarOverlay();
  carregarDetalhe(resumo.uuid);
}

function mostrarOverlay() {
  const overlay = document.getElementById('catalogo-drawer-overlay');
  overlay.classList.add('catalogo-drawer-overlay--visible');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll'); // token reaproveitado de settings.css
}

function fecharDrawer() {
  const overlay = document.getElementById('catalogo-drawer-overlay');
  overlay.classList.remove('catalogo-drawer-overlay--visible');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
  resumoAtual = null;
}

// ============================================
// Cabeçalho e ações -- vêm do resumo do card
// ============================================
function preencherCabecalho(resumo) {
  definirTexto('drawer-nome', resumo.nome_protocolo);
  definirTexto('drawer-sigla', resumo.sigla);

  const badges = document.getElementById('drawer-badges');
  if (badges) {
    badges.innerHTML = '';
    badges.append(
      criarBadge(rotuloTipoProtocolo(resumo.tipo_protocolo), 'catalog-badge--info'),
      criarBadge(rotuloEscopoPopulacao(resumo.escopo_populacao)),
      criarBadge(rotuloEscopoUso(resumo.escopo_uso)),
      resumo.liberado_pela_empresa
        ? criarBadge('Liberado pela instituição', 'catalog-badge--liberado')
        : criarBadge('Não liberado', 'catalog-badge--bloqueado'),
    );
    const politica = rotuloPolitica(resumo.politica);
    if (politica) badges.appendChild(criarBadge(politica, 'catalog-badge--politica'));
  }

  renderizarAcoes(resumo);
}

function renderizarAcoes(resumo) {
  const container = document.getElementById('drawer-acoes');
  if (!container) return;
  container.innerHTML = '';

  // "Ver campos" é a pesquisa do protocolo (GET /<id>/campos, aberta a
  // qualquer logado) -- neste degrau renderiza junto das opções "em
  // breve", com o mesmo aviso.
  const btnCampos = document.createElement('button');
  btnCampos.className = 'btn-ghost';
  btnCampos.textContent = 'Ver campos';
  btnCampos.addEventListener('click', () =>
    mostrarToast('A visualização dos campos do protocolo chega em breve.'));
  container.appendChild(btnCampos);

  if (souProfissionalDeSaude()) {
    const btnExecutar = document.createElement('button');
    btnExecutar.className = 'btn-primary';
    btnExecutar.textContent = 'Executar';
    btnExecutar.disabled = !resumo.liberado_pela_empresa;
    btnExecutar.title = resumo.liberado_pela_empresa ? '' : 'Protocolo não liberado pela instituição';
    btnExecutar.addEventListener('click', () =>
      mostrarToast('A execução de protocolos chega no próximo passo.'));
    container.appendChild(btnExecutar);
  }

  if (souAdmin()) {
    const btnLiberacao = document.createElement('button');
    btnLiberacao.className = 'btn-ghost';
    btnLiberacao.textContent = resumo.liberado_pela_empresa
      ? 'Desativar para a instituição'
      : 'Liberar para a instituição';
    btnLiberacao.addEventListener('click', () =>
      mostrarToast('A liberação institucional será configurável em breve.'));
    container.appendChild(btnLiberacao);
  }
}

// ============================================
// Detalhe -- GET /<uuid>
// ============================================
async function carregarDetalhe(uuid) {
  // Estado de carregamento nas seções vindas do detalhe (o cabeçalho,
  // do resumo, já está preenchido).
  definirTexto('drawer-o-que-e', 'Carregando…');
  definirTexto('drawer-quando-usar', 'Carregando…');
  definirTexto('drawer-como-interpretar', 'Carregando…');
  ['drawer-orgao', 'drawer-versao', 'drawer-vigencia', 'drawer-referencia']
    .forEach(id => definirTexto(id, '—'));

  let detalhe;
  try {
    const resposta = await buscarProtocolo(uuid);
    detalhe = resposta.data;
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar o detalhe.';
    definirTexto('drawer-o-que-e', mensagem);
    definirTexto('drawer-quando-usar', '');
    definirTexto('drawer-como-interpretar', '');
    return;
  }

  // Explicação estruturada (seed, Caminho A). Seção ausente do payload
  // esconde a seção inteira em vez de mostrar vazio.
  preencherSecaoExplicacao('secao-o-que-e', 'drawer-o-que-e', detalhe.explicacao?.o_que_e);
  preencherSecaoExplicacao('secao-quando-usar', 'drawer-quando-usar', detalhe.explicacao?.quando_usar);
  preencherSecaoExplicacao('secao-como-interpretar', 'drawer-como-interpretar', detalhe.explicacao?.como_interpretar);

  // Metadados -- só vêm no detalhe, não no resumo do card.
  definirTexto('drawer-orgao', detalhe.orgao_emissor ?? '—');
  definirTexto('drawer-versao', detalhe.versao_vigente ?? '—');
  definirTexto('drawer-vigencia', formatarData(detalhe.data_vigencia));
  definirTexto('drawer-referencia', detalhe.referencia_bibliografica ?? '—');

  // Tipo de resultado só existe no detalhe -- entra nos badges.
  if (detalhe.tipo_resultado) {
    document.getElementById('drawer-badges')
      ?.appendChild(criarBadge(rotuloTipoResultado(detalhe.tipo_resultado), 'catalog-badge--info'));
  }
}

function preencherSecaoExplicacao(idSecao, idTexto, texto) {
  const secao = document.getElementById(idSecao);
  if (!secao) return;
  if (!texto) {
    secao.hidden = true;
    return;
  }
  secao.hidden = false;
  definirTexto(idTexto, texto);
}

function formatarData(valor) {
  if (!valor) return '—';
  // O back serializa Date como "AAAA-MM-DD"; o `T00:00:00` evita o
  // deslocamento de fuso do `new Date("AAAA-MM-DD")`.
  const data = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString('pt-BR');
}

// ============================================
// Pequenos helpers de DOM
// ============================================
function definirTexto(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto ?? '—';
}

function criarBadge(texto, modificador) {
  const badge = document.createElement('span');
  badge.className = `catalog-badge${modificador ? ` ${modificador}` : ''}`;
  badge.textContent = texto;
  return badge;
}

// Toast próprio do drawer (o da lista é privado de lá) -- mesma classe
// CSS, mesma ideia.
let toastTimer = null;

function mostrarToast(mensagem) {
  let toast = document.getElementById('catalogo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'catalogo-toast';
    toast.className = 'catalogo-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.classList.add('catalogo-toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('catalogo-toast--visible'), 3200);
}