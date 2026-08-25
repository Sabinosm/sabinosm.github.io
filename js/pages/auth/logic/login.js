// login.js
//
// Lida com login por senha e login via Google. Quando o backend pede
// confirmação de 2FA (mfa_pendente), delega ao webauthn.js — este
// arquivo não conhece os detalhes de navigator.credentials.
//
// Animação de fundo: /js/shared/particles.js
// Mensagens de feedback: /js/shared/feedback.js

import { exibirMensagem } from "../../../shared/feedback.js";
import { URL_BASE_API } from "../../../config.js";


document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const dadosObjeto = Object.fromEntries(formData.entries());

  try {
    const resultado = await enviarLogin(dadosObjeto);

    window.location.href = '/html/pages/auth/afterLogin.html';

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

// Botão de login com Google — redirect real de navegador, não fetch:
// essa etapa do OAuth2 precisa ser navegação real, não uma chamada AJAX.
// O Google vai trazer o usuário de volta em afterLogin.html, não aqui —
// é lá que o estado mfa_pendente/onboarding_pendente é tratado.

const botaoGoogle = document.querySelector(".btn-google");
if (botaoGoogle) {
  botaoGoogle.addEventListener("click", () => {
    window.location.href = `${URL_BASE_API}/auth/google/login`;
  });
}