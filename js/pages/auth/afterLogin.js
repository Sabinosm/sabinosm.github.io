// afterLogin.js
//
// Ponto de chegada depois do callback do Google OAuth
// (oauth.py -> google_callback redireciona para cá).
//
// oauth.py não manda o estado da sessão na URL -- ele fica no cookie
// httpOnly. Por isso, o primeiro passo aqui é sempre consultar
// /auth/status (via sessionStatus.js) para saber o que fazer em seguida:
//   - "mfa_pendente"       -> pedir confirmação WebAuthn (só ocorre
//                              vindo de login por senha; login via
//                              Google nunca cai neste estado)
//   - "onboarding_pendente" -> mandar para a página de onboarding
//   - "completa"           -> sessão já pronta, ir para o dashboard
//   - qualquer outra coisa / erro -> volta para o login

import { confirmarSegundoFator, SemAutenticadorDisponivelError, LimiteTentativasExcedidoError } from "./webauthn.js";
import { exibirMensagem } from "../../shared/feedback.js";
import { consultarStatusSessao } from "./sessionStatus.js";
import { URL_BASE_API } from "../../urlConfig.js";

const CHAVE_SESSION_STORAGE = "bion-dados-usuario";

// Destino por tipo_usuario -- centralizado aqui porque é o único lugar
// que decide navegação inicial pós-login. watchSession.js (rodando
// dentro das homes) nunca precisa disso, só sabe voltar pro login.
const DESTINO_POR_TIPO = {
  medico: "../../../html/pages/user/standartUser/medicHomePage.html",
  enfermeiro: "../../../html/pages/user/standartUser/medicHomePage.html",
  admin: "../../../html/pages/user/admin/adminHomePage.html",
};

const ROTA_LOGIN = "../../../html/pages/auth/login.html";

const botaoTentarNovamente = document.getElementById("btn-tentar-novamente");

// pageshow dispara tanto no carregamento normal quanto quando a
// página é restaurada do bfcache do navegador (ex.: botão "voltar"
// depois de já ter saído desta página). DOMContentLoaded sozinho não
// dispara nesse segundo caso, o que deixava o spinner girando pra
// sempre -- a checagem de status nunca era refeita.
window.addEventListener("pageshow", async () => {
  await tratarPosLogin();
});

botaoTentarNovamente.addEventListener("click", async () => {
  botaoTentarNovamente.hidden = true;
  await tratarMfaPendente();
});

async function tratarPosLogin() {
  let resultado;

  try {
    resultado = await consultarStatusSessao();
  } catch (erro) {
    console.error("Erro ao verificar status da sessão:", erro);
    exibirMensagem("Não foi possível verificar sua sessão. Tente entrar novamente.", "erro");
    setTimeout(() => { window.location.href = ROTA_LOGIN; }, 2000);
    return;
  }

  if (!resultado.ok) {
    // Cobre tanto "nao_autenticado" (401) quanto "status_desconhecido"
    // -- em ambos os casos não assumimos sucesso silenciosamente.
    if (resultado.motivo === "status_desconhecido") {
      console.error("Status de sessão desconhecido:", resultado.bruto);
    }
    window.location.href = ROTA_LOGIN;
    return;
  }

  switch (resultado.status) {
    case "mfa_pendente":
      await tratarMfaPendente();
      break;

    case "onboarding_pendente": {
      const senhaJaDefinida = resultado.senhaDefinida ? "1" : "0";
      window.location.href = `../../../html/pages/auth/onboarding.html?senha_definida=${senhaJaDefinida}`;
      break;
    }

    case "completa":
      await irParaHomeDoUsuario();
      break;
  }
}

/**
 * Busca /me (agora que a sessão está completa), guarda o payload
 * inteiro em sessionStorage -- para as homes lerem sem precisar
 * refazer o fetch -- e redireciona conforme tipo_usuario.
 *
 * usuario.to_dict() não expõe token/sessão nenhuma, só dados de
 * perfil; o cookie httpOnly continua sendo a única credencial real,
 * nunca acessível via JS.
 */
async function irParaHomeDoUsuario() {
  let payload;

  try {
    const resp = await fetch(`${URL_BASE_API}/auth/me`, {
      method: "GET",
      credentials: "include",
    });

    if (!resp.ok) {
      throw new Error(`/me respondeu ${resp.status}`);
    }

    const corpo = await resp.json();
    payload = corpo.data ?? corpo; // json_success envelopa em { data, message }
  } catch (erro) {
    console.error("Falha ao buscar dados do usuário em /me:", erro);
    exibirMensagem("Não foi possível carregar seus dados. Tente entrar novamente.", "erro");
    setTimeout(() => { window.location.href = ROTA_LOGIN; }, 2000);
    return;
  }

  const tipo = payload?.usuario?.tipo_usuario;
  const destino = DESTINO_POR_TIPO[tipo];

  if (!destino) {
    // tipo_usuario ausente ou não mapeado -- mais seguro travar aqui
    // do que adivinhar uma home genérica pra um perfil desconhecido.
    console.error("tipo_usuario sem destino mapeado:", tipo);
    window.location.href = ROTA_LOGIN;
    return;
  }

  sessionStorage.setItem(CHAVE_SESSION_STORAGE, JSON.stringify(payload));
  window.location.href = destino;
}

async function tratarMfaPendente() {
  exibirMensagem("Confirme sua identidade para continuar...", "info");

  try {
    await confirmarSegundoFator();
    exibirMensagem("Login realizado com sucesso!", "sucesso");
    await irParaHomeDoUsuario();
  } catch (erro) {
    console.error("Falha na confirmação de identidade:", erro);

    if (erro instanceof LimiteTentativasExcedidoError) {
      // Sem mais tentativas nesta sessão -- não há fallback aqui, o
      // caminho é voltar ao login e reautenticar (por senha, o que
      // reinicia o contador, ou por Google, que não exige 2FA).
      exibirMensagemVoltarAoLogin(
        "Limite de tentativas de confirmação atingido. " +
        "Entre novamente para tentar de novo."
      );
      return;
    }

    if (erro instanceof SemAutenticadorDisponivelError) {
      // Nenhum autenticador disponível nesta máquina (sem
      // PIN/biometria configurados, sem Bluetooth para QR code) --
      // não adianta insistir no mesmo WebAuthn. Orienta o usuário a
      // voltar ao login e entrar por senha ou por Google.
      exibirMensagemVoltarAoLogin(
        "Não encontramos nenhum método de confirmação disponível neste " +
        "dispositivo (sem PIN ou biometria configurados, e sem Bluetooth " +
        "para usar o celular). Entre novamente para tentar de outra forma."
      );
      return;
    }

    exibirMensagem(
      erro.message || "Não foi possível confirmar sua identidade. Tente novamente.",
      "erro"
    );
    botaoTentarNovamente.hidden = false;
  }
}

/**
 * Mostra uma mensagem de erro com um link para reiniciar o login,
 * usado quando não há mais nada a fazer nesta tela (limite de
 * tentativas esgotado ou nenhum autenticador disponível).
 *
 * `exibirMensagem` (shared/feedback.js) só aceita texto simples, então
 * o link é montado à parte e anexado ao container de feedback.
 */
function exibirMensagemVoltarAoLogin(mensagem) {
  exibirMensagem(mensagem, "erro");

  const container = document.getElementById("mensagemFeedback");
  if (!container) return;

  const link = document.createElement("a");
  link.href = ROTA_LOGIN;
  link.textContent = "Voltar para o login";
  link.className = "link-fallback-google";
  container.appendChild(document.createElement("br"));
  container.appendChild(link);
}