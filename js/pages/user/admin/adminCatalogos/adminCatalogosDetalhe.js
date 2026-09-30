// adminCatalogosDetalhe.js
//
// Drawer lateral de detalhe do protocolo: preenche o overlay
// #catalogo-drawer-overlay de adminCatalogos.html com a explicação
// estruturada (o_que_e / quando_usar / como_interpretar), metadados
// (órgão emissor, versão, vigência, referência) e dois blocos de
// configuração:
//
//   - "Minha configuração" (médico/enfermeiro -- o back manda favorito
//     null aos demais): favorito e padrão pessoal.
//   - "Governança da instituição" (is_admin): liberar/desativar, política
//     (opcional/obrigatório) e padrão da instituição.
//
// A EXECUÇÃO do protocolo não acontece aqui: vive na página de consultas.
//
// Dados: o resumo do card (com liberado_pela_empresa, politica, favorito,
// default_pessoal, padrao_institucional) vem junto na chamada -- o detalhe
// GET /<uuid> NÃO repete esses campos, então o drawer depende dos dois:
// resumo para badges/configuração, detalhe para explicação e metadados.
//
// O objeto do resumo é o MESMO da lista: as ações (adminCatalogosAcoes.js)
// o atualizam in-place e disparam EVENTO_ATUALIZADO, que redesenha badges
// e blocos de configuração sem novo fetch.

import { ApiError, buscarProtocolo } from "./adminCatalogosApi.js";
import {
  POLITICAS,
  rotuloEscopoUso,
  rotuloOpcaoPolitica,
  rotuloTipoResultado,
} from "./adminCatalogosLabels.js";
import { souAdmin } from "./adminCatalogosSessao.js";
import {
  EVENTO_ATUALIZADO,
  alterarLiberacao,
  alternarFavorito,
  definirDefaultPessoal,
  definirPadraoInstitucional,
  removerDefaultPessoal,
} from "./adminCatalogosAcoes.js";
import {
  regrasEstrela,
  regrasLiberacao,
  regrasPadraoInstitucional,
  regrasPadraoPessoal,
} from "./adminCatalogosRegras.js";
import {
  comTrava,
  confirmar,
  criarBadge,
  criarBadgesProtocolo,
  criarBotao,
  criarSelect,
  mostrarToast,
} from "./adminCatalogosUi.js";

let resumoAtual = null;       // item do card que abriu o drawer (mesma referência da lista)
let tipoResultadoAtual = null; // só existe no detalhe -- entra nos badges

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

  // Uma ação terminou: o resumo já foi atualizado in-place.
  document.addEventListener(EVENTO_ATUALIZADO, () => {
    if (resumoAtual) renderizarEstado();
  });
}

/** Abre o drawer para o protocolo do card clicado. */
export function abrirDrawerProtocolo(resumo) {
  resumoAtual = resumo;
  tipoResultadoAtual = null;
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
  tipoResultadoAtual = null;
}

// ============================================
// Cabeçalho, badges e configuração -- vêm do resumo do card
// ============================================
function preencherCabecalho(resumo) {
  definirTexto('drawer-nome', resumo.nome_protocolo);
  definirTexto('drawer-sigla', resumo.sigla);
  renderizarAcoes();
  renderizarEstado();
}

/** Tudo que depende do estado mutável do resumo. */
function renderizarEstado() {
  renderizarBadges();
  renderizarConfigPessoal(resumoAtual);
  renderizarConfigAdmin(resumoAtual);
}

function renderizarBadges() {
  const badges = document.getElementById('drawer-badges');
  if (!badges || !resumoAtual) return;
  badges.innerHTML = '';
  badges.append(...criarBadgesProtocolo(resumoAtual));
  if (tipoResultadoAtual) {
    badges.appendChild(criarBadge(rotuloTipoResultado(tipoResultadoAtual), 'catalog-badge--info'));
  }
}

function renderizarAcoes() {
  const container = document.getElementById('drawer-acoes');
  if (!container) return;
  container.innerHTML = '';

  // "Ver campos" é a pesquisa do protocolo (GET /<id>/campos, aberta a
  // qualquer logado) -- ainda não implementada no front.
  container.appendChild(criarBotao('Ver campos', 'btn-ghost', {
    onClick: () => mostrarToast('A visualização dos campos do protocolo chega em breve.'),
  }));
}

// ============================================
// Bloco "Minha configuração" (médico/enfermeiro)
// ============================================
function renderizarConfigPessoal(p) {
  const secao = document.getElementById('drawer-config-pessoal');
  const corpo = document.getElementById('drawer-config-pessoal-corpo');
  if (!secao || !corpo || !p) return;

  const estrela = regrasEstrela(p);
  secao.hidden = !estrela.visivel;
  corpo.innerHTML = '';
  if (!estrela.visivel) return;

  // --- Favorito ---
  const btnFavorito = criarBotao(
    estrela.cheia ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
    'btn-ghost',
    {
      desabilitado: !estrela.habilitada,
      titulo: estrela.titulo,
      onClick: (btn) => comTrava(btn, () => alternarFavorito(p)),
    },
  );
  corpo.appendChild(criarLinha(
    'Favorito',
    p.favorito
      ? 'Este protocolo está entre os seus favoritos.'
      : 'Favoritos aparecem em destaque na consulta. Não bloqueiam nada: só organizam a sua tela.',
    [btnFavorito],
  ));

  // --- Padrão pessoal ---
  const regras = regrasPadraoPessoal(p);
  const select = criarSelect(
    regras.escopos.map(e => ({ valor: e, rotulo: rotuloEscopoUso(e) })),
    regras.atual ?? regras.escopos[0],
    !regras.habilitado,
  );
  const btnDefinir = criarBotao('Definir como meu padrão', 'btn-ghost', {
    titulo: regras.motivo ?? '',
    onClick: (btn) => comTrava(btn, () => definirDefaultPessoal(p, select.value)),
  });
  const atualizarBotao = () => {
    btnDefinir.disabled = !regras.habilitado || select.value === regras.atual;
  };
  select.addEventListener('change', atualizarBotao);
  atualizarBotao();

  const controles = [select, btnDefinir];
  if (regras.atual) {
    controles.push(criarBotao('Voltar ao padrão da instituição', 'btn-ghost', {
      onClick: (btn) => comTrava(btn, () => removerDefaultPessoal(p)),
    }));
  }
  corpo.appendChild(criarLinha(
    'Padrão pessoal',
    regras.atual
      ? `É o seu padrão para: ${rotuloEscopoUso(regras.atual)}.`
      : 'Carregado automaticamente na consulta. Sem escolha sua, vale o padrão da instituição.',
    controles,
    !regras.habilitado ? regras.motivo : null,
  ));
}

// ============================================
// Bloco "Governança da instituição" (admin)
// ============================================
function renderizarConfigAdmin(p) {
  const secao = document.getElementById('drawer-config-admin');
  const corpo = document.getElementById('drawer-config-admin-corpo');
  if (!secao || !corpo || !p) return;

  const admin = souAdmin();
  secao.hidden = !admin;
  corpo.innerHTML = '';
  if (!admin) return;

  // --- Liberação + política ---
  const lib = regrasLiberacao(p);
  const politicaAtual = p.politica || 'opcional';
  const selPolitica = criarSelect(
    POLITICAS.map(v => ({ valor: v, rotulo: rotuloOpcaoPolitica(v) })),
    politicaAtual,
  );
  const controlesLiberacao = [selPolitica];

  if (!lib.liberado) {
    controlesLiberacao.push(criarBotao('Liberar para a instituição', 'btn-primary', {
      onClick: (btn) => comTrava(btn, () =>
        alterarLiberacao(p, { ativo: true, politica: selPolitica.value })),
    }));
  } else {
    const btnPolitica = criarBotao('Aplicar política', 'btn-ghost', {
      desabilitado: true, // habilita quando o seletor muda
      onClick: (btn) => comTrava(btn, () =>
        alterarLiberacao(p, { ativo: true, politica: selPolitica.value })),
    });
    selPolitica.addEventListener('change', () => {
      btnPolitica.disabled = selPolitica.value === politicaAtual;
    });
    controlesLiberacao.push(btnPolitica);

    controlesLiberacao.push(criarBotao('Desativar', 'btn-ghost', {
      desabilitado: !lib.podeDesativar,
      titulo: lib.motivoDesativar ?? '',
      onClick: (btn) => comTrava(btn, async () => {
        const ok = await confirmar({
          titulo: 'Desativar protocolo?',
          texto: `«${p.nome_protocolo}» deixará de estar disponível para toda a instituição. ` +
            'Os favoritos dos profissionais são preservados.',
          rotuloConfirmar: 'Desativar',
        });
        if (ok) await alterarLiberacao(p, { ativo: false });
      }),
    }));
  }

  corpo.appendChild(criarLinha(
    'Liberação e política',
    lib.liberado
      ? 'Liberado. "Obrigatório" impede que os profissionais tirem o protocolo dos favoritos.'
      : 'Não liberado. Escolha a política e libere: "obrigatório" impede que os profissionais tirem o protocolo dos favoritos.',
    controlesLiberacao,
    lib.liberado && !lib.podeDesativar ? lib.motivoDesativar : null,
  ));

  // --- Padrão da instituição ---
  const padrao = regrasPadraoInstitucional(p);
  const selEscopo = criarSelect(
    padrao.escopos.map(e => ({ valor: e, rotulo: rotuloEscopoUso(e) })),
    padrao.atual ?? padrao.escopos[0],
    !padrao.habilitado,
  );
  const btnPadrao = criarBotao('Definir como padrão da instituição', 'btn-ghost', {
    desabilitado: !padrao.habilitado,
    titulo: padrao.motivo ?? '',
    onClick: (btn) => comTrava(btn, async () => {
      const escopo = selEscopo.value;
      const ok = await confirmar({
        titulo: 'Definir padrão da instituição?',
        texto: `«${p.nome_protocolo}» passa a ser o padrão de "${rotuloEscopoUso(escopo)}" ` +
          'para quem não escolheu o próprio. Substitui o padrão atual desse escopo.',
        rotuloConfirmar: 'Definir padrão',
      });
      if (ok) await definirPadraoInstitucional(p, escopo);
    }),
  });
  corpo.appendChild(criarLinha(
    'Padrão da instituição',
    padrao.atual
      ? `É o padrão da instituição para: ${rotuloEscopoUso(padrao.atual)}. Não pode ser desativado.`
      : 'Usado como padrão por quem não escolheu o próprio.',
    [selEscopo, btnPadrao],
    !padrao.habilitado ? padrao.motivo : null,
  ));
}

/** Linha de configuração: título, nota, controles e (opcional) motivo de bloqueio. */
function criarLinha(titulo, nota, controles, motivoBloqueio = null) {
  const linha = document.createElement('div');
  linha.className = 'catalogo-config-linha';

  const t = document.createElement('span');
  t.className = 'catalogo-config-titulo';
  t.textContent = titulo;

  const n = document.createElement('p');
  n.className = 'catalogo-config-nota';
  n.textContent = nota;

  const c = document.createElement('div');
  c.className = 'catalogo-config-controles';
  c.append(...controles);

  linha.append(t, n, c);

  if (motivoBloqueio) {
    const m = document.createElement('p');
    m.className = 'catalogo-config-nota';
    m.textContent = motivoBloqueio;
    linha.appendChild(m);
  }
  return linha;
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
    if (resumoAtual?.uuid !== uuid) return; // drawer fechado/trocado durante o fetch
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível carregar o detalhe.';
    definirTexto('drawer-o-que-e', mensagem);
    definirTexto('drawer-quando-usar', '');
    definirTexto('drawer-como-interpretar', '');
    return;
  }

  if (resumoAtual?.uuid !== uuid) return; // resposta atrasada de outro protocolo

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

  // Tipo de resultado só existe no detalhe -- entra nos badges (e sobrevive
  // aos redesenhos causados pelas ações).
  tipoResultadoAtual = detalhe.tipo_resultado ?? null;
  renderizarBadges();
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

function definirTexto(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto ?? '—';
}