// stepUpOrchestratorHelpers/stepUpCaminhoTotp.js
//
// Caminho 2 -- TOTP: confirmação pelo aplicativo autenticador,
// alcançado quando o backend já indica TOTP como método principal
// (ver stepUpIniciar.js) ou quando o WebAuthn falha (ver
// stepUpCaminhoWebauthn.js).

import { confirmarStepUpTOTP, iniciarStepUpTOTP, LimiteTentativasTotpExcedidoError, CodigoTotpInvalidoError, TotpNaoCadastradoError } from "../../../pages/auth/totp.js";
import { mostrarErro, mostrarPainelSenha } from "./stepUpUi.js";
import { resolverComToken } from "./stepUpCicloDeVida.js";

/**
 * Abre o painel TOTP para `ctx.acao`, chamando /stepup/iniciar do
 * TOTP para resetar as tentativas desta abertura do modal.
 *
 * Usado em dois lugares:
 *  - stepUpIniciar.js, quando o backend já respondeu
 *    metodo === "totp" na etapa 1 (TOTP como método principal);
 *  - stepUpCaminhoWebauthn.js, como segundo método depois que o
 *    WebAuthn falha (aí `ocultarWebauthn: true`, pra esconder o
 *    painel que acabou de falhar).
 *
 * Se o usuário não tiver TOTP cadastrado (TotpNaoCadastradoError), só
 * tem WebAuthn: o painel WebAuthn continua aberto para tentar de novo,
 * porque o fallback de senha só é liberado pelo backend para quem não
 * tem nenhum fator ou esgotou as tentativas de TOTP (ver step_up.py).
 *
 * `jaIniciado: true` pula a chamada a /totp/2fa/stepup/iniciar --
 * usado quando /stepup/iniciar já resetou as tentativas e devolveu
 * `tentativas_restantes` junto (metodo === "totp" como método
 * principal, ver stepUpIniciar.js). No caminho de fallback do
 * WebAuthn (stepUpCaminhoWebauthn.js) o reset ainda não aconteceu,
 * então esse caminho continua chamando iniciarStepUpTOTP normalmente.
 */
export async function iniciarPainelTotp(ctx, { ocultarWebauthn = false, jaIniciado = false } = {}) {
  const { painelWebauthn, painelTotp, inputTotp } = ctx.refs;

  const mostrarPainel = () => {
    if (ocultarWebauthn) painelWebauthn.hidden = true;
    painelTotp.hidden = false;
    inputTotp.value = "";
    inputTotp.focus();
  };

  if (jaIniciado) {
    mostrarPainel();
    return;
  }

  try {
    await iniciarStepUpTOTP(ctx.acao);
    mostrarPainel();
  } catch (erroTotp) {
    if (erroTotp instanceof TotpNaoCadastradoError) {
      mostrarErro(
        ctx,
        "Não foi possível confirmar pela chave de segurança. Tente novamente ou, se perdeu o acesso a ela, contate o administrador."
      );
      return;
    }
    console.error("stepUp: falha ao iniciar TOTP", erroTotp);
    mostrarErro(ctx, "Não foi possível verificar o método de confirmação por código.");
  }
}

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

    // O backend libera o fallback assim que a última tentativa é gasta
    // (tentativasRestantes === 0), sem exigir um pedido a mais só para
    // receber o 429.
    const tentativasEsgotadas =
      erroTotp instanceof LimiteTentativasTotpExcedidoError ||
      (erroTotp instanceof CodigoTotpInvalidoError && erroTotp.tentativasRestantes === 0);

    if (tentativasEsgotadas) {
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