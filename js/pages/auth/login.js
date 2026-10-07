// login.js
//
// Lida com login por senha e login via Google. Quando o backend pede
// confirmação de 2FA (mfa_pendente), delega ao webauthn.js — este
// arquivo não conhece os detalhes de navigator.credentials.
//
// Animação de fundo: /js/shared/particles.js
// Mensagens de feedback: /js/shared/feedback.js

import { exibirMensagem } from "../../shared/feedback.js";
import { URL_BASE_API, FRONT_ORIGIN } from "../../sharedConfig/urlConfig.js";
import { ativarTogglesSenha } from "../../sharedConfig/passwordManagement/passwordToggle.js";

ativarTogglesSenha('#senha, #confirmar_senha');

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const dadosObjeto = Object.fromEntries(formData.entries());

  try {
    const resultado = await enviarLogin(dadosObjeto);

    window.location.href = '../../../html/pages/auth/afterLogin.html';

  } catch (erro) {
    console.error("Falha na comunicação:", erro);
    exibirMensagem(erro.message || "Ocorreu um erro ao enviar os dados. Tente novamente.", "erro");
  }
});

/**
 * Envia login/senha para a API. Lança erro se a resposta HTTP não for
 * 2xx (ex: 401 credenciais inválidas, 422 campos faltando).
 */
async function enviarLogin(dados) {
  const response = await fetch(`${URL_BASE_API}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include", // necessário para o cookie httpOnly de sessão
    body: JSON.stringify(dados),
  });

  const resultado = await response.json();

  if (!response.ok) {
    throw new Error(resultado.message || `Erro no servidor: ${response.status}`);
  }

  return resultado;
}

// ============================================
// Login com Google em popup -- mesmo padrão do step-up
// (stepUpCaminhoFallback.js): o popup avisa a janela que o abriu via
// window.opener.postMessage() e se fecha. O backend (oauth.py) não
// precisa saber que é popup.
//
//   - Sucesso: o Google volta em oauth_callback.html, que manda
//     { tipo: "oauth_concluido" } para cá e fecha o popup; seguimos
//     para afterLogin.html (onde mfa_pendente/onboarding_pendente é
//     tratado).
//   - Erro (usuário não cadastrado/inativo): oauth.py redireciona para
//     login.html?erro=... -- dentro do popup. A parte "dentro do popup"
//     deste mesmo arquivo (no fim) repassa o erro para a janela
//     original e fecha o popup.
//   - Popup bloqueado pelo navegador: cai no redirect normal na mesma
//     página.
// ============================================

const MENSAGENS_ERRO_OAUTH = {
  usuario_nao_cadastrado: "Usuário não cadastrado.",
  conta_inativa: "Conta inativa.",
};

function mostrarErroOauth(codigo) {
  exibirMensagem(
    MENSAGENS_ERRO_OAUTH[codigo] || "Não foi possível entrar com o Google.",
    "erro"
  );
}

function origemEhConfiavel(origin) {
  return origin === FRONT_ORIGIN || origin === window.location.origin;
}

const botaoGoogle = document.querySelector(".btn-google");
if (botaoGoogle) {
  botaoGoogle.addEventListener("click", () => {
    const largura = 500;
    const altura = 650;
    const esquerda = window.screenX + (window.outerWidth - largura) / 2;
    const topo = window.screenY + (window.outerHeight - altura) / 2;

    const popup = window.open(
      `${URL_BASE_API}/auth/google/login`,
      "google_oauth",
      `width=${largura},height=${altura},left=${esquerda},top=${topo}`
    );

    if (!popup) {
      window.location.href = `${URL_BASE_API}/auth/google/login`;
    }
  });
}

// Janela original: recebe o resultado do popup.
window.addEventListener("message", (event) => {
  if (!origemEhConfiavel(event.origin)) return;
  if (event.data?.tipo !== "oauth_concluido") return;

  if (event.data.erro) {
    mostrarErroOauth(event.data.erro);
    return;
  }

  window.location.href = "../../../html/pages/auth/afterLogin.html";
});

// ?erro=... na URL: ou estamos dentro do popup (erro do oauth.py), ou
// foi o fallback sem popup (oauth_callback.html -> login.html?erro=...).
const erroNaUrl = new URLSearchParams(window.location.search).get("erro");
if (erroNaUrl) {
  let repassado = false;

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({ tipo: "oauth_concluido", erro: erroNaUrl }, FRONT_ORIGIN);
      repassado = true;
      window.close();
    } catch (e) {
      console.error("login: falha ao repassar o erro para a janela original", e);
    }
  }

  if (!repassado || !window.closed) {
    mostrarErroOauth(erroNaUrl);
    const urlLimpa = new URL(window.location.href);
    urlLimpa.searchParams.delete("erro");
    window.history.replaceState({}, "", urlLimpa);
  }
}