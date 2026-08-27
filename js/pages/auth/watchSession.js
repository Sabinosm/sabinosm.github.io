// watchSession.js
//
// Roda dentro de medicHomePage.html (e adminHomePage.html) durante
// toda a sessão de uso -- diferente de afterLogin.js, que só existe
// no trânsito entre o OAuth e o destino final.
//
// Responsabilidade única: perceber que a sessão morreu enquanto a
// página já estava aberta (token expirou, sessão foi revogada em
// outra aba, etc.) e mandar de volta pro login. Não trata
// onboarding_pendente/mfa_pendente aqui -- se isso acontecer no meio
// do uso é um estado inesperado (não deveria ocorrer pós-login
// completo), então cai no mesmo tratamento de "sessão inválida".

import { consultarStatusSessao } from "./sessionStatus.js";

// Ajuste conforme a estrutura real do projeto.
import { exibirMensagem } from "../../shared/feedback.js";

const ROTA_LOGIN = "../../../html/pages/auth/login.html";
const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000; // 5 minutos

let intervaloId = null;

/**
 * Inicia a checagem periódica de sessão. Chame uma vez, no carregamento
 * da home, depois que os dados iniciais do usuário já foram exibidos.
 */
export function iniciarMonitoramentoSessao() {
  // Verifica também quando a aba volta a ficar visível -- cobre o caso
  // comum de deixar a aba em segundo plano por horas e voltar a ela,
  // sem depender só do intervalo fixo.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      verificarSessao();
    }
  });

  intervaloId = setInterval(verificarSessao, INTERVALO_VERIFICACAO_MS);
}

export function pararMonitoramentoSessao() {
  if (intervaloId !== null) {
    clearInterval(intervaloId);
    intervaloId = null;
  }
}

async function verificarSessao() {
  let resultado;

  try {
    resultado = await consultarStatusSessao();
  } catch (erro) {
    // Falha de rede pontual (ex: sem internet por um instante) não
    // deve derrubar o usuário da tela -- só loga e tenta de novo no
    // próximo ciclo.
    console.error("Falha ao verificar sessão:", erro);
    return;
  }

  if (resultado.ok && resultado.status === "completa") {
    return; // segue tudo normal
  }

  // Qualquer coisa que não seja "completa" aqui dentro da home é
  // tratado como sessão encerrada -- não há UI de onboarding/mfa
  // nesta página, então não tentamos decidir entre elas.
  pararMonitoramentoSessao();
  exibirMensagem("Sua sessão expirou. Faça login novamente.", "erro");
  setTimeout(() => {
    window.location.href = ROTA_LOGIN;
  }, 2000);
}