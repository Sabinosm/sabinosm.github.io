// adminAuditoriaHelpers.js
//
// Utilitários puros da tela de Auditoria: formatação de data/hora,
// labels legíveis dos enums de log, cores de badge, validação da
// janela de consulta de 7 dias e builders de estado vazio.
//
// Nada aqui tem estado de página -- cada função recebe o que precisa
// e devolve o resultado, para poder ser reaproveitada tanto pela
// view de resumo quanto pela view de detalhe.

// Alinhado com JANELA_MAXIMA_DIAS do service.py. Se o backend mudar,
// mudar aqui também (a validação definitiva continua sendo a do
// backend; isto aqui é só para falhar rápido, sem round-trip).
export const JANELA_MAXIMA_DIAS = 7;

// ============================================
// Datas — o backend grava em UTC e serializa com
// datetime.isoformat() (com offset). new Date() interpreta o offset
// corretamente e toLocaleString exibe no fuso local do navegador.
// ============================================
export function formatarDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================
// Labels dos enums (LogAcesso.operacao / resultado,
// LogAlteracao.operacao) -- valores desconhecidos caem no próprio
// valor, nunca em branco, para um log antigo/não mapeado ainda
// aparecer na tela.
// ============================================
const OPERACAO_ACESSO_LABELS = {
  'leitura': 'Leitura',
  'escrita': 'Escrita',
  'exclusao-logica': 'Exclusão lógica',
  'exportacao': 'Exportação',
};

const OPERACAO_ALTERACAO_LABELS = {
  'INSERT': 'Inclusão',
  'UPDATE': 'Alteração',
  'DELETE': 'Exclusão',
};

const RESULTADO_ACESSO_LABELS = {
  'sucesso': 'Sucesso',
  'falha-autenticacao': 'Falha de autenticação',
  'acesso-negado': 'Acesso negado',
  'timeout': 'Timeout',
};

export function labelOperacaoAcesso(valor) {
  return OPERACAO_ACESSO_LABELS[valor] ?? valor ?? '—';
}

export function labelOperacaoAlteracao(valor) {
  return OPERACAO_ALTERACAO_LABELS[valor] ?? valor ?? '—';
}

export function labelResultadoAcesso(valor) {
  return RESULTADO_ACESSO_LABELS[valor] ?? valor ?? '—';
}

// ============================================
// Badges — devolvem { classe, texto } prontos para montarBadge().
// As classes aud-badge--* variam só --status-fg/--status-bg, que
// vêm da paleta de status de themes.css (funciona em todos os temas).
// ============================================
export function badgeOperacaoAcesso(valor) {
  switch (valor) {
    case 'leitura':         return { classe: 'aud-badge--blue',    texto: labelOperacaoAcesso(valor) };
    case 'escrita':         return { classe: 'aud-badge--yellow',  texto: labelOperacaoAcesso(valor) };
    case 'exclusao-logica': return { classe: 'aud-badge--red',     texto: labelOperacaoAcesso(valor) };
    case 'exportacao':      return { classe: 'aud-badge--neutral', texto: labelOperacaoAcesso(valor) };
    default:                return { classe: 'aud-badge--neutral', texto: labelOperacaoAcesso(valor) };
  }
}

export function badgeOperacaoAlteracao(valor) {
  switch (valor) {
    case 'INSERT': return { classe: 'aud-badge--green',  texto: labelOperacaoAlteracao(valor) };
    case 'UPDATE': return { classe: 'aud-badge--yellow', texto: labelOperacaoAlteracao(valor) };
    case 'DELETE': return { classe: 'aud-badge--red',    texto: labelOperacaoAlteracao(valor) };
    default:       return { classe: 'aud-badge--neutral', texto: labelOperacaoAlteracao(valor) };
  }
}

export function badgeResultadoAcesso(valor) {
  switch (valor) {
    case 'sucesso': return { classe: 'aud-badge--green',  texto: labelResultadoAcesso(valor) };
    case 'timeout': return { classe: 'aud-badge--orange', texto: labelResultadoAcesso(valor) };
    default:        return { classe: 'aud-badge--red',    texto: labelResultadoAcesso(valor) };
  }
}

export function montarBadge(info) {
  const span = document.createElement('span');
  span.className = `aud-badge ${info.classe}`;
  span.textContent = info.texto;
  return span;
}

// ============================================
// Janela de consulta — o backend rejeita períodos maiores que
// JANELA_MAXIMA_DIAS (DadosInvalidosError) no detalhe. Validar no
// front antes de chamar evita round-trip e deixa a mensagem junto
// dos campos. Recebe strings "YYYY-MM-DD" (valor de <input type="date">).
// ============================================
export function validarJanelaDias(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return { ok: true };

  const ini = new Date(`${dataInicio}T00:00:00`);
  const fim = new Date(`${dataFim}T00:00:00`);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) {
    return { ok: false, mensagem: 'Datas inválidas.' };
  }
  if (fim < ini) {
    return { ok: false, mensagem: 'A data final não pode ser anterior à data inicial.' };
  }
  const diffDias = (fim - ini) / 86400000;
  if (diffDias > JANELA_MAXIMA_DIAS) {
    return { ok: false, mensagem: `Período máximo de consulta é de ${JANELA_MAXIMA_DIAS} dias.` };
  }
  return { ok: true };
}

// ============================================
// Estado vazio (mesmo formato visual de adminProfissionais.css,
// reimplementado aqui porque aquele arquivo não é carregado nesta
// página -- ver nota no topo de adminAuditoria.css).
// ============================================
export function criarEstadoVazio(titulo, texto) {
  const div = document.createElement('div');
  div.className = 'empty-state';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'empty-state-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.innerHTML = '<circle cx="11" cy="11" r="7" stroke-linecap="round"/><path d="M21 21l-4.3-4.3" stroke-linecap="round"/>';

  const h = document.createElement('p');
  h.className = 'empty-state-title';
  h.textContent = titulo;

  const p = document.createElement('p');
  p.className = 'empty-state-text';
  p.textContent = texto;

  div.append(icon, h, p);
  return div;
}