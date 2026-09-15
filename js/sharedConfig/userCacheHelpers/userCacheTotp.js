// userCacheHelpers/userCacheTotp.js
//
// Helper de propósito específico para a seção dados.totp do snapshot
// (ver TotpModel.to_dict no backend).

import { substituirSecaoCache } from './userCacheCore.js';

/**
 * Substitui dados.totp inteiro. Diferente do WebAuthn (lista),
 * `dados.totp` é um valor único que alterna entre `null` (não
 * cadastrado) e o objeto do autenticador -- por isso a substituição é
 * do campo inteiro direto via substituirSecaoCache, sem precisar
 * preservar sub-chaves como no caso de webauthn.credenciais.
 *
 * Ex: atualizarTotpCache({ id_credencial, confirmado: true, criado_em })
 * Ex: atualizarTotpCache(null) // depois de remover
 */
export function atualizarTotpCache(novoTotp) {
  return substituirSecaoCache('totp', novoTotp);
}