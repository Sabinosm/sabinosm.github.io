// userCacheHelpers/userCacheProtocolos.js
//
// Helper de propósito específico para dados.configuracoes.protocolos do
// snapshot (ver Configuracao.to_dict no backend): um objeto indexado
// pela SIGLA do protocolo, uma entrada por linha de ConfiguracaoProtocolo
// do usuário (favoritos, inclusive os pausados):
//
//   protocolos: {
//     "NEWS2": { nome, tipo, id, uuid, em_uso, escopo_default },
//     ...
//   }
//
// `id` é o id do PROTOCOLO no catálogo (p.id_protocolo no back), não o da
// linha de configuração. Fica separado de userCacheConfiguracoes.js por
// ter regra própria (a troca de padrão mexe em mais de uma entrada).

import { atualizarDadosUsuarioCache, lerDadosUsuarioCache } from './userCacheCore.js';

/**
 * Reflete no cache o resultado de uma ação pessoal (favoritar,
 * desfavoritar, definir/remover padrão pessoal).
 *
 * `linha` é a resposta do back, ConfiguracaoProtocolo.to_dict():
 *   { id, id_protocolo, uuid, sigla, nome, tipo, em_uso, escopo_default, ... }
 *
 * Um só patch (uma só gravação) faz duas coisas:
 *   1. grava/atualiza a entrada deste protocolo (o merge do core preserva
 *      as entradas dos outros);
 *   2. se este protocolo ficou como padrão de um escopo, zera o
 *      escopo_default das OUTRAS entradas desse mesmo escopo -- o back só
 *      admite um padrão pessoal por escopo e tira o anterior na mesma
 *      transação; sem isso o cache mostraria dois.
 *
 * Mesma chave do back: sigla, com o id do protocolo de fallback.
 */
export function atualizarProtocoloCache(linha) {
  const chave = linha.sigla ?? linha.id_protocolo;
  const protocolos = {
    [chave]: {
      nome: linha.nome ?? null,
      tipo: linha.tipo ?? null,
      id: linha.id_protocolo,
      uuid: linha.uuid ?? null,
      em_uso: Boolean(linha.em_uso),
      escopo_default: linha.escopo_default ?? null,
    },
  };

  if (linha.escopo_default) {
    const existentes = lerDadosUsuarioCache()?.configuracoes?.protocolos ?? {};
    Object.entries(existentes).forEach(([outraChave, entrada]) => {
      if (String(outraChave) !== String(chave) && entrada?.escopo_default === linha.escopo_default) {
        protocolos[outraChave] = { escopo_default: null };
      }
    });
  }

  return atualizarDadosUsuarioCache({ configuracoes: { protocolos } });
}