// catalogosDetalhe.js
//
// Página de detalhe do protocolo (catalogosDetalhe.html?uuid=...).
// Substitui o antigo drawer: um protocolo pode ser grande (composto com
// vários módulos), então tem página própria.
//
// Ordem na tela: sigla/nome + versão -> badges -> configuração (favorito,
// padrão, governança) -> campos de entrada -> composição (só composto) ->
// explicação -> referência/metadados.
//
// Carrega sozinha por uuid (sobrevive a F5): GET /catalogo/<uuid> traz
// protocolo + resumo (liberação/favoritos) + versão ativa. Os campos vêm de
// uma segunda chamada, feita pelo ADAPTADOR da família do protocolo
// (familias/index.js) -- NEWS2 e composto hoje; as demais famílias mostram
// um aviso no lugar dos campos. Ver é aberto a qualquer logado, liberado ou
// não. A EXECUÇÃO não acontece aqui: vive na página de consultas.
//
// O resumo é atualizado in-place pelas ações (catalogosAcoes.js) e o
// EVENTO_ATUALIZADO redesenha badges e blocos de configuração sem novo fetch.

import { ApiError, buscarDetalheCatalogo } from "./catalogosApi.js";
import { rotuloTipoResultado } from "./catalogosLabels.js";
import { EVENTO_ATUALIZADO } from "./catalogosAcoes.js";
import { criarListaCampos } from "./catalogosCampos.js";
import { renderizarConfigAdmin, renderizarConfigPessoal } from "./catalogosConfig.js";
import { criarBadge, criarBadgesProtocolo, criarReferencia } from "./catalogosUi.js";
import { adaptadorDe } from "./familias/index.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

let resumo = null;          // mesmo formato do card; mutado in-place pelas ações
let tipoResultado = null;   // só existe no detalhe -- entra nos badges

document.addEventListener('DOMContentLoaded', iniciar);

async function iniciar() {
  iniciarPagina();
  configurarVoltar();

  const uuid = new URLSearchParams(location.search).get('uuid');
  if (!uuid) {
    mostrarEstado('Nenhum protocolo foi informado.', true);
    return;
  }

  document.addEventListener(EVENTO_ATUALIZADO, () => {
    if (resumo) renderizarEstado();
  });

  let dados;
  try {
    dados = (await buscarDetalheCatalogo(uuid)).data;
  } catch (erro) {
    mostrarEstado(erro instanceof ApiError ? erro.message : 'Não foi possível carregar o protocolo.', true);
    return;
  }

  const { protocolo, versao_ativa: versaoAtiva } = dados;
  resumo = dados.resumo;
  tipoResultado = protocolo.tipo_resultado ?? null;

  document.getElementById('detalhe-estado').hidden = true;
  document.getElementById('detalhe-conteudo').hidden = false;
  document.title = `${protocolo.sigla} — Catálogo de Protocolos`;

  preencherCabecalho(protocolo, versaoAtiva);
  renderizarEstado();
  preencherExplicacao(protocolo.explicacao);
  preencherMetadados(protocolo);
  // O tipo_protocolo só vem no resumo; a sigla vem nos dois.
  carregarCampos(uuid, { ...protocolo, ...resumo });
}

// ============================================
// Navegação
// ============================================
function configurarVoltar() {
  const link = document.getElementById('btn-voltar');
  if (!link) return;

  // Veio da lista? history.back() preserva página e filtros (a lista guarda
  // o estado na própria URL). Abriu direto por link? segue o href normal.
  link.addEventListener('click', (evento) => {
    try {
      const origem = new URL(document.referrer);
      if (origem.origin === location.origin && origem.pathname.endsWith('/catalogos.html')) {
        evento.preventDefault();
        history.back();
      }
    } catch {
      // sem referrer válido: deixa o href agir
    }
  });
}

function mostrarEstado(mensagem, erro = false) {
  const estado = document.getElementById('detalhe-estado');
  estado.hidden = false;
  estado.textContent = mensagem;
  estado.classList.toggle('detalhe-estado--erro', erro);
  document.getElementById('detalhe-conteudo').hidden = true;
}

// ============================================
// Cabeçalho, badges e configuração -- vêm do resumo
// ============================================
function preencherCabecalho(protocolo, versaoAtiva) {
  definirTexto('detalhe-sigla', protocolo.sigla);
  definirTexto('detalhe-nome', protocolo.nome_protocolo);

  // Versão no canto: a ativa de ProtocoloVersao (a que a execução registra),
  // com fallback para a string `versao_vigente` do catálogo.
  const numero = versaoAtiva?.numero_versao ?? protocolo.versao_vigente;
  definirTexto('detalhe-versao-numero', numero ? `v${numero}` : '—');
  const desde = formatarData(versaoAtiva?.vigente_desde ?? protocolo.data_vigencia);
  definirTexto('detalhe-versao-vigencia', desde === '—' ? '' : `em vigor desde ${desde}`);
}

/** Tudo que depende do estado mutável do resumo. */
function renderizarEstado() {
  const badges = document.getElementById('detalhe-badges');
  if (badges) {
    badges.innerHTML = '';
    badges.append(...criarBadgesProtocolo(resumo));
    if (tipoResultado) {
      badges.appendChild(criarBadge(rotuloTipoResultado(tipoResultado), 'catalog-badge--info'));
    }
  }
  renderizarConfigPessoal(resumo);
  renderizarConfigAdmin(resumo);
}

// ============================================
// Campos de entrada -- via adaptador da família
// ============================================
async function carregarCampos(uuid, protocolo) {
  const corpo = document.getElementById('campos-corpo');
  const extras = document.getElementById('composicao-corpo');
  const secaoExtras = document.getElementById('secao-composicao');
  corpo.textContent = 'Carregando campos…';

  const adaptador = adaptadorDe(protocolo);

  let resultado;
  try {
    resultado = await adaptador.carregar(uuid);
  } catch (erro) {
    corpo.textContent = erro instanceof ApiError ? erro.message : 'Não foi possível carregar os campos.';
    return;
  }

  corpo.innerHTML = '';
  if (resultado.aviso) {
    corpo.textContent = resultado.aviso;
  } else if (!resultado.campos?.length) {
    corpo.textContent = 'Este protocolo não declara campos de entrada.';
  } else {
    corpo.appendChild(criarListaCampos(resultado.campos));
  }

  if (adaptador.renderizarExtras && resultado.dados) {
    secaoExtras.hidden = false;
    adaptador.renderizarExtras(extras, resultado.dados);
  }
}

// ============================================
// Explicação, referência e metadados
// ============================================
function preencherExplicacao(explicacao) {
  // Seção ausente do payload esconde a seção inteira em vez de mostrar vazio.
  preencherSecao('secao-o-que-e', 'detalhe-o-que-e', explicacao?.o_que_e);
  preencherSecao('secao-quando-usar', 'detalhe-quando-usar', explicacao?.quando_usar);
  preencherSecao('secao-como-interpretar', 'detalhe-como-interpretar', explicacao?.como_interpretar);
}

function preencherSecao(idSecao, idTexto, texto) {
  const secao = document.getElementById(idSecao);
  if (!secao) return;
  secao.hidden = !texto;
  if (texto) definirTexto(idTexto, texto);
}

function preencherMetadados(protocolo) {
  const referencia = document.getElementById('detalhe-referencia');
  const secaoReferencia = document.getElementById('secao-referencia');
  secaoReferencia.hidden = !protocolo.referencia_bibliografica;
  if (protocolo.referencia_bibliografica) {
    referencia.innerHTML = '';
    referencia.appendChild(criarReferencia(protocolo.referencia_bibliografica));
  }

  definirTexto('detalhe-orgao', protocolo.orgao_emissor ?? '—');
  definirTexto('detalhe-vigencia', formatarData(protocolo.data_vigencia));
  const fim = document.getElementById('meta-vigencia-fim');
  if (fim) fim.hidden = !protocolo.data_vigencia_fim;
  if (protocolo.data_vigencia_fim) definirTexto('detalhe-vigencia-fim', formatarData(protocolo.data_vigencia_fim));
}

function formatarData(valor) {
  if (!valor) return '—';
  // "AAAA-MM-DD" (Date) ganha T00:00:00 para evitar o deslocamento de fuso;
  // datetimes ISO (vigente_desde) já trazem horário.
  const data = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString('pt-BR');
}

function definirTexto(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto ?? '—';
}