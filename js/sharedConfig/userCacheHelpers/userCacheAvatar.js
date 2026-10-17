// userCacheHelpers/userCacheAvatar.js
//
// Helper de propósito específico para dados.usuario.avatar_url no
// snapshot de sessão (ver UsuarioModel.to_dict no backend).
//
// O valor tem três estados, e a diferença entre eles é o que evita
// chamadas repetidas à API:
//   - string  -> o usuário tem foto (URL pública do bucket)
//   - null    -> o usuário NÃO tem foto (já consultado, não consultar de novo)
//   - ausente -> cache antigo, nunca consultado (avatar.js faz 1 GET /avatar)
//
// Por isso aqui se grava `null` explicitamente quando a foto é
// removida, em vez de apagar a chave.

import { atualizarUsuarioCache } from './userCacheUsuario.js';

/**
 * Atualiza dados.usuario.avatar_url no snapshot.
 *
 * Ex: atualizarAvatarCache('https://.../abc.webp')  // tem foto
 *     atualizarAvatarCache(null)                    // não tem foto
 */
export function atualizarAvatarCache(url) {
  return atualizarUsuarioCache({ avatar_url: url ?? null });
}