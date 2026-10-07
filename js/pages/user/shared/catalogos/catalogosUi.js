// catalogosUi.js
//
// Helpers de DOM compartilhados por lista e página de detalhe: toast, modal de
// confirmação, trava de botão durante requisição e construtores de
// badge/botão/select. Sem estado de negócio -- as regras vivem em
// catalogosRegras.js e as ações em catalogosAcoes.js.

import {
  rotuloEscopoPopulacao,
  rotuloEscopoUso,
  rotuloPadraoInstitucional,
  rotuloPadraoPessoal,
  rotuloPolitica,
  rotuloTipoProtocolo,
} from "./catalogosLabels.js";

// ============================================
// Toast
// ============================================
let toastTimer = null;

export function mostrarToast(mensagem) {
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

// ============================================
// Confirmação (modal próprio) -- resolve true/false
// ============================================
export function confirmar({ titulo, texto, rotuloConfirmar = 'Confirmar' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'catalogo-confirm-overlay';

    const caixa = document.createElement('div');
    caixa.className = 'catalogo-confirm';
    caixa.setAttribute('role', 'alertdialog');
    caixa.setAttribute('aria-modal', 'true');
    caixa.setAttribute('aria-labelledby', 'catalogo-confirm-titulo');

    const h = document.createElement('h3');
    h.id = 'catalogo-confirm-titulo';
    h.className = 'catalogo-confirm-titulo';
    h.textContent = titulo;

    const p = document.createElement('p');
    p.className = 'catalogo-confirm-texto';
    p.textContent = texto;

    const acoes = document.createElement('div');
    acoes.className = 'catalogo-confirm-acoes';
    const btnCancelar = criarBotao('Cancelar', 'btn-ghost', { onClick: () => fechar(false) });
    const btnConfirmar = criarBotao(rotuloConfirmar, 'btn-primary', { onClick: () => fechar(true) });
    acoes.append(btnCancelar, btnConfirmar);

    caixa.append(h, p, acoes);
    overlay.appendChild(caixa);

    // Fundo escuro cancela.
    overlay.addEventListener('click', (evento) => {
      if (evento.target === overlay) fechar(false);
    });

    // Escape cancela o modal; a captura + stopPropagation evita que outro
    // listener de Escape da página aja junto.
    function aoTeclar(evento) {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      fechar(false);
    }
    document.addEventListener('keydown', aoTeclar, true);

    function fechar(resultado) {
      document.removeEventListener('keydown', aoTeclar, true);
      overlay.remove();
      resolve(resultado);
    }

    document.body.appendChild(overlay);
    btnCancelar.focus(); // foco no lado seguro
  });
}

// ============================================
// Trava de botão durante a requisição (anti duplo clique)
// ============================================
export async function comTrava(botao, funcao) {
  if (botao) botao.disabled = true;
  try {
    return await funcao();
  } finally {
    // Se a tela foi redesenhada após o sucesso o botão antigo já saiu do
    // DOM; se a ação falhou ele continua lá e volta a ficar clicável.
    if (botao?.isConnected) botao.disabled = false;
  }
}

// ============================================
// Construtores
// ============================================
export function criarBadge(texto, modificador) {
  const badge = document.createElement('span');
  badge.className = `catalog-badge${modificador ? ` ${modificador}` : ''}`;
  badge.textContent = texto;
  return badge;
}

/** Badges de classificação/estado -- iguais no card e na página de detalhe. */
export function criarBadgesProtocolo(p) {
  const badges = [
    criarBadge(rotuloTipoProtocolo(p.tipo_protocolo), 'catalog-badge--info'),
    criarBadge(rotuloEscopoPopulacao(p.escopo_populacao)),
    criarBadge(rotuloEscopoUso(p.escopo_uso)),
    p.liberado_pela_empresa
      ? criarBadge('Liberado pela instituição', 'catalog-badge--liberado')
      : criarBadge('Não liberado', 'catalog-badge--bloqueado'),
  ];
  const politica = rotuloPolitica(p.politica);
  if (politica) badges.push(criarBadge(politica, 'catalog-badge--politica'));

  const padraoInstitucional = rotuloPadraoInstitucional(p.padrao_institucional);
  if (padraoInstitucional) badges.push(criarBadge(padraoInstitucional, 'catalog-badge--info'));

  const padraoPessoal = rotuloPadraoPessoal(p.default_pessoal);
  if (padraoPessoal) badges.push(criarBadge(padraoPessoal, 'catalog-badge--info'));

  return badges;
}

/** `onClick` recebe o próprio botão (para usar com comTrava). */
export function criarBotao(texto, classe, { desabilitado = false, titulo = '', onClick } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = classe;
  btn.textContent = texto;
  btn.disabled = desabilitado;
  if (titulo) btn.title = titulo;
  if (onClick) btn.addEventListener('click', () => onClick(btn));
  return btn;
}

/** opcoes: [{ valor, rotulo }] */
export function criarSelect(opcoes, selecionado, desabilitado = false) {
  const select = document.createElement('select');
  select.className = 'catalogo-select';
  select.disabled = desabilitado;
  opcoes.forEach(({ valor, rotulo }) => {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = rotulo;
    select.appendChild(opt);
  });
  if (selecionado !== undefined && selecionado !== null) select.value = selecionado;
  return select;
}

// ============================================
// Texto da página de detalhe
// ============================================
const ROTULOS_EXPLICACAO = {
  o_que_e: 'O que é',
  quando_usar: 'Quando usar',
  como_interpretar: 'Como interpretar',
};

/**
 * Bloco de explicação de um módulo. Defensivo quanto ao formato: string
 * vira um parágrafo; objeto mostra cada valor de texto (as três chaves
 * conhecidas com rótulo próprio, as demais com a chave humanizada).
 * Devolve null se não houver nada a mostrar.
 */
export function criarBlocoExplicacao(explicacao) {
  if (!explicacao) return null;

  const bloco = document.createElement('div');
  bloco.className = 'detalhe-explicacao';

  if (typeof explicacao === 'string') {
    if (!explicacao.trim()) return null;
    const p = document.createElement('p');
    p.className = 'detalhe-texto';
    p.textContent = explicacao;
    bloco.appendChild(p);
    return bloco;
  }

  const entradas = Object.entries(explicacao)
    .filter(([, valor]) => typeof valor === 'string' && valor.trim());
  if (entradas.length === 0) return null;

  entradas.forEach(([chave, valor]) => {
    const rotulo = ROTULOS_EXPLICACAO[chave]
      ?? (chave.charAt(0).toUpperCase() + chave.slice(1).replace(/_/g, ' '));
    const h = document.createElement('h4');
    h.className = 'detalhe-explicacao-titulo';
    h.textContent = rotulo;
    const p = document.createElement('p');
    p.className = 'detalhe-texto';
    p.textContent = valor;
    bloco.append(h, p);
  });
  return bloco;
}

/** Referência bibliográfica: se o texto inteiro for uma URL, vira link. */
export function criarReferencia(texto) {
  if (!texto) return document.createTextNode('—');
  if (/^https?:\/\/\S+$/i.test(texto.trim())) {
    const a = document.createElement('a');
    a.href = texto.trim();
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = texto.trim();
    return a;
  }
  return document.createTextNode(texto);
}