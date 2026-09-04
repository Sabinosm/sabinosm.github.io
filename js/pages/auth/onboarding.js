// onboarding.js
//
// Fluxo de primeiro acesso, chamado quando a sessão está em estado
// `onboarding_pendente` (usuário ainda sem senha definida -- pode ter
// vindo tanto de login por senha quanto de login via Google).
//
// Único passo: definir senha. O cadastro de WebAuthn não faz mais
// parte do onboarding -- fica disponível depois, nas configurações da
// conta, para quem quiser usá-lo como segundo fator em logins futuros
// por senha. Ao definir a senha com sucesso, o backend já libera a
// sessão completa.
import { exibirMensagem } from "../../shared/feedback.js";
import { URL_BASE_API } from "../../urlConfig.js";

const formSenha = document.getElementById("form-senha");

// A URL (?senha_definida=) é só um hint de UX vindo do afterLogin.js,
// não a fonte de verdade -- o usuário pode editá-la livremente. Quem
// decide de fato se ainda há algo a fazer aqui é o servidor,
// consultado via /auth/status -- a mesma rota que afterLogin.js já
// usa para decidir o estado da sessão.
await sincronizarPasso();

async function sincronizarPasso() {
  try {
    const resp = await fetch(`${URL_BASE_API}/auth/status`, {
      method: "GET",
      credentials: "include",
    });

    if (!resp.ok) {
      // Sessão inválida/expirada -- volta para o login.
      window.location.href = "../../../html/pages/auth/login.html";
      return;
    }

    const dados = await resp.json();

    if (dados.status !== "onboarding_pendente") {
      // Sessão não está mais em onboarding (ex.: concluído em outra
      // aba, ou já completa) -- deixa o afterLogin decidir o destino
      // certo em vez de assumir aqui.
      window.location.href = "../../../html/pages/auth/afterLogin.html";
      return;
    }

    if (dados.senha_definida) {
      // Idempotência do backend: usuário já tem senha (ex.:
      // cadastrado por admin), então /definir-senha já conclui o
      // onboarding sem pedir senha nova. Envia direto.
      await concluirOnboarding();
    }
  } catch (erro) {
    console.error("Erro ao verificar etapa do onboarding:", erro);
    exibirMensagem("Não foi possível carregar seu progresso. Recarregue a página.", "erro");
  }
}

formSenha.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(formSenha);
  const senha = formData.get("senha");

  try {
    await concluirOnboarding(senha);
    exibirMensagem("Cadastro concluído! Redirecionando...", "sucesso");
    window.location.href = "../../../html/pages/user/standartUser/medicHomePage.html";
  } catch (erro) {
    console.error("Falha ao definir senha:", erro);
    exibirMensagem(erro.message || "Não foi possível definir a senha.", "erro");
  }
});

/**
 * Envia a nova senha (se houver) para /onboarding/definir-senha, que
 * já conclui o onboarding e libera a sessão completa.
 * Lança erro com a mensagem do backend em caso de senha inválida.
 */
async function concluirOnboarding(senha) {
  const resp = await fetch(`${URL_BASE_API}/auth/onboarding/definir-senha`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ senha }),
  });

  const dados = await resp.json();

  if (!resp.ok) {
    // validar_senha() devolve o motivo específico da invalidação
    throw new Error(dados.erro || dados.message || "Senha inválida.");
  }

  return dados;
}