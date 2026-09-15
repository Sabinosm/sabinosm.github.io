// userCacheHelpers/userCacheConfiguracoes.js
//
// Helpers de propósito específico para a seção dados.configuracoes do
// snapshot (design e preferencias -- ver ConfiguracaoModel.to_dict no
// backend). Agrupados no mesmo arquivo por serem sub-seções da mesma
// chave (`configuracoes`) do payload de /me.

import { atualizarDadosUsuarioCache } from './userCacheCore.js';

/**
 * Atualiza campos de dados.configuracoes.design (tema,
 * tamanho_fonte).
 *
 * Ex: atualizarDesignCache({ tema: 'dark' })
 */
export function atualizarDesignCache(patchDesign) {
  return atualizarDadosUsuarioCache({ configuracoes: { design: patchDesign } });
}

/**
 * Atualiza campos de dados.configuracoes.preferencias (linguagem).
 *
 * Ex: atualizarPreferenciasCache({ linguagem: ['en-US'] })
 */
export function atualizarPreferenciasCache(patchPreferencias) {
  return atualizarDadosUsuarioCache({ configuracoes: { preferencias: patchPreferencias } });
}