// stepUpOrchestratorHelpers/../stepUpOrchestrador.js
//
// Orquestração do modal de step-up. ANTES da divisão este arquivo era
// uma única closure (abrirModalConfirmacao) com ~20 funções internas
// compartilhando estado via closure. Agora:
//
//   - o estado vive num ctx montado por stepUpCtx.js (mesmas
//     variáveis, explícitas no lugar de implícitas);
//   - cada grupo de funções mora no seu módulo em
//     ./stepUpOrchestratorHelpers/:
//       stepUpCtx.js           -- estado + refs do DOM
//       stepUpUi.js            -- painéis e feedback (só DOM)
//       stepUpCicloDeVida.js   -- encerrar/cancelar/resolver
//       stepUpCaminhoWebAuthn.js -- caminho 1 + desvio p/ TOTP
//       stepUpCaminhoTotp.js   -- caminho 2
//       stepUpCaminhoFallback.js -- caminho 3 (senha + Google)
//       stepUpIniciar.js       -- etapa 1 + "tentar novamente"
//
// O que este arquivo ainda faz sozinho: criar a Promise, montar o
// ctx e REGISTRAR os listeners que conectam o DOM aos handlers dos
// módulos acima.

import { montarCtx } from "./stepUpOrchestratorHelpers/stepUpCtx.js";
import { onCancelar, onClickOverlay, onKeydown } from "./stepUpOrchestratorHelpers/stepUpCicloDeVida.js";
import { onSubmitSenha } from "./stepUpOrchestratorHelpers/stepUpCaminhoFallback.js";
import { onSubmitTotp } from "./stepUpOrchestratorHelpers/stepUpCaminhoTotp.js";
import { iniciar, onTentarWebauthnNovamente } from "./stepUpOrchestratorHelpers/stepUpIniciar.js";

/**
 * Abre o modal e resolve/rejeita conforme o usuário confirma ou
 * desiste. Toda a lógica de caminhos está nos módulos importados
 * acima; aqui só há o "acoplamento" entre o DOM e esses handlers.
 */
export function abrirModalConfirmacao(acao) {
  return new Promise((resolve, reject) => {
    const ctx = montarCtx(acao, resolve, reject);
    const { refs, signal } = ctx;

    // Todos com { signal }: encerrar() remove todos de uma vez via
    // ctx.abortController.abort() -- ver stepUpCicloDeVida.js.
    refs.formSenha.addEventListener("submit", (e) => onSubmitSenha(ctx, e), { signal });
    refs.formTotp.addEventListener("submit", (e) => onSubmitTotp(ctx, e), { signal });
    refs.btnFechar.addEventListener("click", () => onCancelar(ctx), { signal });
    refs.btnCancelar.addEventListener("click", () => onCancelar(ctx), { signal });
    refs.overlay.addEventListener("click", (e) => onClickOverlay(ctx, e), { signal });
    document.addEventListener("keydown", (e) => onKeydown(ctx, e), { signal });
    refs.btnTentarWebauthnNovamente?.addEventListener("click", () => onTentarWebauthnNovamente(ctx), { signal });

    iniciar(ctx);
  });
}