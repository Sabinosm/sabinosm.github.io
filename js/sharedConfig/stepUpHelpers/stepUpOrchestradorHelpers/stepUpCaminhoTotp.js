// stepUpOrchestratorHelpers/stepUpCaminhoTotp.js
//
// Caminho 2 -- TOTP: confirmação pelo aplicativo autenticador,
// alcançado quando o WebAuthn falha (ver stepUpCaminhoWebAuthn.js)
// ou quando o backend já indicou que não há credencial WebAuthn.

import { confirmarStepUpTOTP, LimiteTentativasTotpExcedidoError, CodigoTotpInvalidoError } from "../../../pages/auth/totp.js";
import { mostrarErro, mostrarPainelSenha } from "./stepUpUi.js";
import { resolverComToken } from "./stepUpCicloDeVida.js";

export async function onSubmitTotp(ctx, e) {
  e.preventDefault();
  const { formTotp, inputTotp, painelTotp } = ctx.refs;
  const codigo = inputTotp.value.trim();
  if (!codigo) return;

  const botaoSubmit = formTotp.querySelector("button[type=submit]");
  botaoSubmit.disabled = true;

  try {
    const token = await confirmarStepUpTOTP(ctx.acao, codigo);
    resolverComToken(ctx, token);
  } catch (erroTotp) {
    botaoSubmit.disabled = false;

    if (erroTotp instanceof LimiteTentativasTotpExcedidoError) {
      // ALTERADO: diferente da versão anterior deste fluxo, isso
      // NÃO é mais fim de linha -- cai no fallback senha+Google,
      // igual a quando o usuário não tem WebAuthn nem TOTP (ver
      // docstring de step_up.py: o step-up sempre mantém uma
      // saída, diferente do login).
      painelTotp.hidden = true;
      mostrarErro(ctx, "Não foi possível confirmar pelo aplicativo autenticador.");
      mostrarPainelSenha(ctx);
      return;
    }

    if (erroTotp instanceof CodigoTotpInvalidoError) {
      mostrarErro(ctx,
        `${erroTotp.message}${erroTotp.tentativasRestantes != null ? ` (${erroTotp.tentativasRestantes} tentativa(s) restante(s))` : ""}`
      );
      inputTotp.value = "";
      inputTotp.focus();
      return;
    }

    mostrarErro(ctx, erroTotp.message || "Não foi possível confirmar o código.");
  }
}