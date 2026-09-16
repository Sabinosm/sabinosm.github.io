// stepUpOrchestratorHelpers/stepUpCaminhoWebAuthn.js
//
// Caminho 1 -- WebAuthn: autenticação local ao navegador (sem popup)
// via navigator.credentials, e o desvio para TOTP quando falha.

import { startAuthentication } from "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@11/dist/bundle/index.js";
import { URL_BASE_API } from "../../urlConfig.js";
import { iniciarStepUpTOTP, TotpNaoCadastradoError } from "../../../pages/auth/totp.js";
import { mostrarErro, mostrarPainelSenha } from "./stepUpUi.js";
import { resolverComToken } from "./stepUpCicloDeVida.js";

/**
 * ALTERADO: ao falhar (qualquer motivo -- cancelamento, timeout,
 * sem autenticador, assinatura inválida), não oferece mais só
 * "tentar de novo" no mesmo WebAuthn -- tenta TOTP como próximo
 * método. Se o usuário quiser insistir no WebAuthn mesmo assim,
 * o botão "Tentar novamente" continua disponível no painel
 * WebAuthn (btnTentarWebauthnNovamente) para esse caso.
 */
export async function executarWebauthn(ctx, options) {
  const { acao } = ctx;

  let credencial;
  try {
    credencial = await startAuthentication({ optionsJSON: options });
  } catch (erro) {
    mostrarErro(ctx, "Não foi possível confirmar via chave de segurança.");
    await tentarProximoMetodoTotp(ctx);
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
    await tentarProximoMetodoTotp(ctx);
  }
}

/**
 * TOTP como segundo método -- só é chamado DEPOIS do WebAuthn falhar.
 */
export async function tentarProximoMetodoTotp(ctx) {
  const { painelWebauthn, painelTotp, inputTotp, feedback } = ctx.refs;

  try {
    await iniciarStepUpTOTP(ctx.acao);
    painelWebauthn.hidden = true;
    painelTotp.hidden = false;
    feedback.textContent = "";
    feedback.className = "stepup-feedback";
    inputTotp.value = "";
    inputTotp.focus();
  } catch (erroTotp) {
    if (erroTotp instanceof TotpNaoCadastradoError) {
      // Usuário não tem TOTP -- ALTERADO: em vez de manter só o
      // painel WebAuthn (que acabou de falhar), oferece o
      // fallback senha+Google diretamente. Mesmo racional de
      // step_up.py: o step-up sempre mantém uma saída disponível.
      painelWebauthn.hidden = true;
      mostrarPainelSenha(ctx);
      return;
    }
    console.error("stepUp: falha ao iniciar TOTP", erroTotp);
    mostrarErro(ctx, "Não foi possível verificar o método de confirmação por código.");
  }
}