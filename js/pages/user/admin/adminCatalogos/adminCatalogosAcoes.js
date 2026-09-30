// adminCatalogosAcoes.js
//
// Executa as ações de configuração (favorito, padrão pessoal, liberação,
// política e padrão institucional): chama a API, aplica a resposta no
// objeto do card (mutação in-place -- lista e drawer compartilham a mesma
// referência) e avisa a página pelo evento EVENTO_ATUALIZADO.
//
// Atualização PESSIMISTA: nada muda na tela antes do back responder,
// porque as regras de recusa (obrigatório, padrão da instituição,
// mínimo de 2 ativos...) vivem no servidor. Erro vira toast com a
// mensagem do back e o estado local fica intacto.

import {
  ApiError,
  alterarStatusProtocolo,
  definirDefaultPessoal as apiDefinirDefaultPessoal,
  definirPadraoInstitucional as apiDefinirPadraoInstitucional,
  desabilitarProtocolo,
  habilitarProtocolo,
  removerDefaultPessoal as apiRemoverDefaultPessoal,
} from "./adminCatalogosApi.js";
import { mostrarToast } from "./adminCatalogosUi.js";
import { atualizarProtocoloCache } from "../../../../sharedConfig/userCache.js";

/** detail: { uuid, limparOutros?: { campo, escopo } } */
export const EVENTO_ATUALIZADO = 'catalogo:protocolo-atualizado';

// Guarda por protocolo: card e drawer podem disparar a mesma ação; só uma
// requisição por protocolo voa por vez.
const emAndamento = new Set();

async function executar(p, chamada, aplicar, mensagemSucesso, extra = {}) {
  if (emAndamento.has(p.uuid)) return false;
  emAndamento.add(p.uuid);
  try {
    const resposta = await chamada();
    aplicar(resposta.data);
    document.dispatchEvent(new CustomEvent(EVENTO_ATUALIZADO, { detail: { uuid: p.uuid, ...extra } }));
    if (mensagemSucesso) mostrarToast(mensagemSucesso);
    return true;
  } catch (erro) {
    mostrarToast(erro instanceof ApiError ? erro.message : 'Não foi possível concluir a ação.');
    return false;
  } finally {
    emAndamento.delete(p.uuid);
  }
}

// --- respostas -> objeto do card ---------------------------------------
function aplicarPessoal(p, d) {
  p.favorito = Boolean(d.em_uso);
  p.default_pessoal = d.escopo_default ?? null;
  // configuracoes.protocolos também vai no /me: sem isto, o snapshot do
  // login ficaria com o estado antigo nas outras páginas (ver userCache.js).
  // A liberação institucional não precisa: não faz parte do /me.
  atualizarProtocoloCache(d);
}

function aplicarInstitucional(p, d) {
  p.liberado_pela_empresa = Boolean(d.ativo);
  p.politica = d.politica ?? p.politica;
  p.padrao_institucional = d.escopo_default_institucional ?? null;
}

// --- preferência pessoal -----------------------------------------------
export function alternarFavorito(p) {
  const adicionar = !p.favorito;
  return executar(
    p,
    () => (adicionar ? habilitarProtocolo(p.uuid) : desabilitarProtocolo(p.uuid)),
    (d) => aplicarPessoal(p, d),
    adicionar ? 'Adicionado aos seus favoritos.' : 'Removido dos seus favoritos.',
  );
}

export function definirDefaultPessoal(p, escopo) {
  return executar(
    p,
    () => apiDefinirDefaultPessoal(p.uuid, escopo),
    (d) => aplicarPessoal(p, d),
    'Padrão pessoal definido.',
    // O back tira o padrão do protocolo anterior desse escopo: os outros
    // cards da página precisam refletir isso.
    { limparOutros: { campo: 'default_pessoal', escopo } },
  );
}

export function removerDefaultPessoal(p) {
  return executar(
    p,
    () => apiRemoverDefaultPessoal(p.uuid),
    (d) => aplicarPessoal(p, d),
    'Padrão pessoal removido; vale o padrão da instituição.',
  );
}

// --- governança da instituição (admin) ---------------------------------
/** { ativo: bool, politica?: 'opcional' | 'obrigatorio' } */
export function alterarLiberacao(p, { ativo, politica }) {
  const jaLiberado = p.liberado_pela_empresa;
  const mensagem = !ativo
    ? 'Protocolo desativado para a instituição.'
    : jaLiberado ? 'Política atualizada.' : 'Protocolo liberado para a instituição.';
  return executar(
    p,
    () => alterarStatusProtocolo(p.uuid, { ativo, politica }),
    (d) => aplicarInstitucional(p, d),
    mensagem,
  );
}

export function definirPadraoInstitucional(p, escopo) {
  return executar(
    p,
    () => apiDefinirPadraoInstitucional(p.uuid, escopo),
    (d) => aplicarInstitucional(p, d),
    'Padrão da instituição definido.',
    { limparOutros: { campo: 'padrao_institucional', escopo } },
  );
}