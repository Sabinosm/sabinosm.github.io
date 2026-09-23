// stepUpOrchestratorHelpers/stepUpCaminhoWebAuthn.js
//
// Caminho 1 -- WebAuthn: autenticação local ao navegador (sem popup)
// via navigator.credentials, e o desvio para TOTP quando falha.

import { startAuthentication } from "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11/dist/bundle/index.js";
import { URL_BASE_API } from "../../urlConfig.js";
import { mostrarErro } from "./stepUpUi.js";
import { resolverComToken } from "./stepUpCicloDeVida.js";
import { iniciarPainelTotp } from "./stepUpCaminhoTotp.js";

/**
 * Ao falhar (qualquer motivo -- cancelamento, timeout, sem
 * autenticador, assinatura inválida), não oferece só "tentar de novo"
 * no mesmo WebAuthn -- tenta TOTP como próximo método via
 * iniciarPainelTotp(). Se o usuário quiser insistir no WebAuthn mesmo
 * assim, o botão "Tentar novamente" continua disponível no painel
 * WebAuthn (btnTentarWebauthnNovamente) para esse caso.
 */
export async function executarWebauthn(ctx, options) {
  const { acao } = ctx;

  let credencial;
  try {
    credencial = await startAuthentication({ optionsJSON: options });
  } catch (erro) {
    mostrarErro(ctx, "Não foi possível confirmar via chave de segurança.");
    await iniciarPainelTotp(ctx, { ocultarWebauthn: true });
    return;
  }

  try {
    const resp = await fetch(`${URL_BASE_API}/stepup/confirmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ acao, credencial }),
    });
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Confirmação recusada.");
    resolverComToken(ctx, dados.token_confirmacao);
  } catch (erro) {
    mostrarErro(ctx, erro.message || "Não foi possível confirmar sua identidade.");
    await iniciarPainelTotp(ctx, { ocultarWebauthn: true });
  }
}