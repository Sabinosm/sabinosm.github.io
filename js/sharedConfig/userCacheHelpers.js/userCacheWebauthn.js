// userCacheHelpers/userCacheWebauthn.js
//
// Helper de propósito específico para a seção dados.webauthn do
// snapshot (ver CredencialWebauthnModel.to_dict no backend).

import { lerDadosUsuarioCache, substituirSecaoCache } from './userCacheCore.js';

/**
 * Substitui a lista inteira de credenciais WebAuthn
 * (dados.webauthn.credenciais). Diferente dos helpers de
 * usuario/configuracoes, aqui é substituição total da lista, não
 * merge por chave -- não faz sentido mesclar arrays de credenciais
 * por índice. Quem chama monta a lista completa atualizada (ex:
 * resposta do POST de adicionar dispositivo, ou a lista filtrada
 * depois de um DELETE).
 *
 * Não usa substituirSecaoCache direto porque a chave substituída é
 * `webauthn.credenciais` (aninhada), não `webauthn` inteiro -- precisa
 * preservar outras chaves de dados.webauthn caso existam no futuro.
 *
 * Ex: atualizarCredenciaisWebauthnCache(novaListaCompleta)
 */
export function atualizarCredenciaisWebauthnCache(novaListaCredenciais) {
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    console.error('userCache: tentativa de atualizar credenciais em cache inexistente');
    return null;
  }

  const webauthnAtualizado = { ...(dados.webauthn ?? {}), credenciais: novaListaCredenciais };
  return substituirSecaoCache('webauthn', webauthnAtualizado);
}