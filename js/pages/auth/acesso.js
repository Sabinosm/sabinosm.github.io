// acesso.js
//
// Guarda de acesso por página, SEM efeitos colaterais ao ser importado.
// A página DECLARA quem pode abrir no <body>; este módulo só avalia:
//
//   <body data-requer="gerenciar">                              basta UMA capacidade (OU)
//   <body data-requer-todas="gerenciar,atenderClinicamente">    TODAS (E)
//
// Falha fechada: sem declaração, sem snapshot ou sem capacidade, o
// acesso é negado. [] / data-requer="" = qualquer usuário logado.
//
// Isto é só UX: quem autoriza de verdade é o back. O código da página
// continua sendo baixável por URL -- a barreira real são os decorators.
//
// Usado por:
//   - guardarPagina.js (páginas com bootstrap próprio: só o guarda)
//   - initPagina.js    (páginas no bootstrap completo)

import { lerDadosUsuarioCache } from "../../sharedConfig/userCache.js";
import { derivarPermissoes, temAlguma } from "../../sharedConfig/userCacheHelpers/userCachePermissoes.js";
import { ROTAS } from "../../sharedConfig/loaders/rotas.js";

/** "a, b" -> ["a","b"]; atributo ausente (undefined) -> undefined. */
export function lerLista(valor) {
  if (valor === undefined) return undefined;
  return valor.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Avalia o acesso. Não navega.
 * @param {{ requer?: string[], requerTodas?: string[] }} [opcoes]
 *   sobrescrevem o que o <body> declara.
 * @returns {{ ok: true, dados: object, permissoes: object }
 *         | { ok: false, destino: string }}
 */
export function verificarAcesso(opcoes = {}) {
  const corpo = document.body?.dataset ?? {};
  const requer = opcoes.requer ?? lerLista(corpo.requer);
  const requerTodas = opcoes.requerTodas ?? lerLista(corpo.requerTodas);

  if (!Array.isArray(requer) && !Array.isArray(requerTodas)) {
    // Página sem declaração: negar é mais seguro que liberar por omissão.
    console.error(
      'acesso: página sem declaração de acesso (<body data-requer="...">). Negando por segurança.'
    );
    return { ok: false, destino: ROTAS.erro403 };
  }

  const dados = lerDadosUsuarioCache();
  if (!dados) {
    // Cache vazio/corrompido = chegou sem passar pelo afterLogin
    // (ex: digitou a URL direto) ou a aba anterior foi fechada.
    return { ok: false, destino: ROTAS.erro401 };
  }

  const permissoes = derivarPermissoes(dados.usuario);

  const ok =
    (!requer?.length || temAlguma(permissoes, ...requer)) &&
    (!requerTodas?.length || requerTodas.every((c) => permissoes[c] === true));

  return ok ? { ok: true, dados, permissoes } : { ok: false, destino: ROTAS.erro403 };
}

/**
 * Avalia e, se negado, esconde a página e redireciona. `replace` (e
 * não `href =`) tira a página negada do histórico: o botão "voltar"
 * não devolve o usuário a ela.
 */
export function exigirAcesso(opcoes) {
  const resultado = verificarAcesso(opcoes);
  if (!resultado.ok) {
    document.documentElement.hidden = true; // sem flash de conteúdo proibido
    window.location.replace(resultado.destino);
  }
  return resultado;
}