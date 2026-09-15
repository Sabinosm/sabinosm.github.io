// preencherPerfil.js
//
// Ponto de entrada: preenche a UI (sidebar + modal de configurações)
// com os dados retornados por /me: { usuario, configuracoes, webauthn, totp }.
//
// Não busca dado nenhum sozinho -- recebe o payload já pronto (seja
// vindo de sessionStorage, salvo pelo afterLogin.js após o /me, seja
// de um fetch direto). Mantém a lógica de "onde exibir o quê" isolada
// da lógica de "como buscar".
//
// Este módulo é só o orquestrador: cada área da UI (identidade,
// dispositivos, TOTP, tema, avisos) tem seu helper em ./helpers/.

import { preencherIdentidade, preencherDadosInstitucionais } from './preencherHelpers/preencherIdentidade.js';
import { preencherDispositivos } from './preencherHelpers/preencherDispositivosWebauthn.js';
import { preencherTotp } from './preencherHelpers/preencherTotp.js';
import { preencherTema } from './preencherHelpers/preencherTema.js';
import { atualizarAvisoUnicoFator } from './preencherHelpers/preencherAvisos.js';

/**
 * Preenche toda a UI de perfil a partir do payload de /me.
 * @param {{ usuario: object, configuracoes: object, webauthn: object, totp: object|null }} dados
 */
export function preencherPainelPerfil(dados) {
  const { usuario, configuracoes, webauthn, totp } = dados;

  preencherIdentidade(usuario);
  preencherDadosInstitucionais(usuario);
  preencherDispositivos(webauthn);
  preencherTotp(totp);
  atualizarAvisoUnicoFator(webauthn, totp);
  preencherTema(configuracoes);
}