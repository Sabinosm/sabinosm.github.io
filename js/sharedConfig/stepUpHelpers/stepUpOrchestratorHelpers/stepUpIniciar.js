// stepUpOrchestratorHelpers/stepUpIniciar.js
//
// Etapa 1 -- pergunta ao backend qual método usar e direciona para o
// caminho correspondente -- e o "tentar novamente" do painel
// WebAuthn, que reinicia do zero.

import { URL_BASE_API } from "../../urlConfig.js";
import { limparEstadoVisual, mostrarPainelSenha } from "./stepUpUi.js";
import { encerrar } from "./stepUpCicloDeVida.js";
import { executarWebauthn } from "./stepUpCaminhoWebAuthn.js";

export async function iniciar(ctx) {
  const { refs } = ctx;
  limparEstadoVisual(ctx);
  refs.tituloAcao.textContent = ctx.acao;
  refs.overlay.classList.add("stepup-overlay--visible");
  document.body.classList.add("no-scroll");
  refs.painelCarregando.hidden = false;

  let dados;
  try {
    const resp = await fetch(`${URL_BASE_API}/stepup/iniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ acao: ctx.acao }),
    });
    dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || "Não foi possível iniciar a confirmação.");
  } catch (erro) {
    encerrar(ctx);
    ctx.reject(erro instanceof Error ? erro : new Error("Não foi possível iniciar a confirmação."));
    return;
  }

  refs.painelCarregando.hidden = true;

  if (dados.metodo === "webauthn") {
    refs.painelWebauthn.hidden = false;
    executarWebauthn(ctx, dados);
  } else {
    mostrarPainelSenha(ctx);
  }
}

/**
 * Botão "Tentar novamente" do painel WebAuthn: limpa o feedback e
 * recomeça do zero (nova chamada a /stepup/iniciar -- o backend pode
 * até já ter mudado de método, e recomeçar de fora pega isso).
 */
export function onTentarWebauthnNovamente(ctx) {
  const { feedback } = ctx.refs;
  feedback.textContent = "";
  feedback.className = "stepup-feedback";
  iniciar(ctx);
}