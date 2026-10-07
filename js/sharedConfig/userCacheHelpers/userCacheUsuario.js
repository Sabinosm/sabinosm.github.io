// userCacheHelpers/userCacheUsuario.js
//
// Helper de propósito específico para a seção dados.usuario do
// snapshot (nome, telefone, etc -- ver UsuarioModel.to_dict no
// backend).
//
// Por quê ter isso além de atualizarDadosUsuarioCache genérico: quem
// chama passa um objeto "plano" com o que mudou em dados.usuario, sem
// se preocupar em replicar a chave `usuario` do payload -- se o
// formato de /me mudar, só este arquivo (e userCacheCore.js) precisam
// saber.

import { atualizarDadosUsuarioCache, lerDadosUsuarioCache } from './userCacheCore.js';

/**
 * Atualiza campos de dados.usuario (nome, telefone, etc). Aceita um
 * patch parcial: só os campos passados são sobrescritos.
 *
 * Ex: atualizarUsuarioCache({ telefone: '11999999999' })
 */
export function atualizarUsuarioCache(patchUsuario) {
  return atualizarDadosUsuarioCache({ usuario: patchUsuario });
}

/**
 * uuid do usuário logado, ou null se não houver snapshot. É
 * IDENTIDADE (ex: "este profissional da lista sou eu"), não
 * permissão -- por isso não mora em userCachePermissoes.js.
 */
export function lerUuidUsuarioCache() {
  return lerDadosUsuarioCache()?.usuario?.uuid ?? null;
}