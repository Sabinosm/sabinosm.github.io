// afterLogin.js
//
// Ponto de chegada depois do callback do Google OAuth
// (oauth.py -> google_callback redireciona para cá).
//
// oauth.py não manda o estado da sessão na URL -- ele fica no cookie
// httpOnly. Por isso, o primeiro passo aqui é sempre consultar
// /auth/status (via sessionStatus.js) para saber o que fazer em seguida:
//   - "mfa_pendente"       -> pedir confirmação. ALTERADO (2FA sempre
//                              obrigatório -- ver mfa.py/login.py/
//                              oauth.py no backend): agora ocorre
//                              também vindo de login por Google, não
//                              só por senha. É uma cadeia WebAuthn ->
//                              TOTP -> BLOQUEIO (sem fallback nenhum)
//                              -- ver tratarMfaPendente/
//                              tentarProximoMetodoTOTP/mostrarBloqueio.
//                              Cada método só é tentado se o usuário
//                              tiver a credencial correspondente. Se
//                              nenhum dos dois resolver, não sobra
//                              caminho de login algum -- nem por
//                              senha, nem por Google -- só recuperação
//                              via administrador.
//   - "onboarding_pendente" -> mandar para a página de onboarding
//   - "completa"           -> sessão já pronta, ir para o dashboard
//   - qualquer outra coisa / erro -> volta para o login

import { confirmarSegundoFator, SemAutenticadorDisponivelError, LimiteTentativasExcedidoError } from "./webauthn.js";
import { iniciarSegundoFatorTOTP, confirmarSegundoFatorTOTP, TotpNaoCadastradoError, LimiteTentativasTotpExcedidoError, CodigoTotpInvalidoError } from "./totp.js";
import { exibirMensagem } from "../../shared/feedback.js";
import { consultarStatusSessao } from "./sessionStatus.js";
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";
import { definirDadosUsuarioCache } from "../../sharedConfig/userCache.js";

// Destino por papel -- centralizado aqui porque é o único lugar que
// decide navegação inicial pós-login. watchSession.js (rodando dentro
// das homes) nunca precisa disso, só sabe voltar pro login.
//
// ALTERADO (assertivo, sem alias): tipo_usuario saiu do payload de
// /me -- is_admin (bool) e funcao_clinica ('medico' | 'enfermeiro' |
// null) entram no lugar, e são ortogonais (um médico-admin tem
// is_admin=True e funcao_clinica='medico' ao mesmo tempo). Como um
// usuário pode ser as duas coisas, a prioridade de destino precisa
// ser decidida explicitamente: admin manda para a home de admin
// mesmo quando também tem função clínica, porque a home de admin é
// que dá acesso à gestão da empresa -- ver irParaHomeDoUsuario().
const DESTINO_POR_FUNCAO_CLINICA = {
  medico: "../../../html/pages/user/standartUser/medicHomePage.html",
  enfermeiro: "../../../html/pages/user/standartUser/medicHomePage.html",
};
const DESTINO_ADMIN = "../../../html/pages/user/admin/adminHomePage.html";

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
 * inteiro no cache de sessão via userCache.js (definirDadosUsuarioCache)
 * -- para as homes lerem sem precisar refazer o fetch -- e redireciona
 * conforme is_admin/funcao_clinica.
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

  const ehAdmin = Boolean(payload?.usuario?.is_admin);
  const funcaoClinica = payload?.usuario?.funcao_clinica;

  // is_admin tem prioridade: um médico-admin vai para a home de
  // admin, não a clínica -- é lá que a gestão da empresa fica.
  const destino = ehAdmin ? DESTINO_ADMIN : DESTINO_POR_FUNCAO_CLINICA[funcaoClinica];

  if (!destino) {
    // Nem admin, nem função clínica mapeada -- mais seguro travar
    // aqui do que adivinhar uma home genérica pra um perfil desconhecido.
    console.error("Usuário sem destino mapeado (is_admin/funcao_clinica):", { ehAdmin, funcaoClinica });
    window.location.href = ROTA_LOGIN;
    return;
  }

  definirDadosUsuarioCache(payload);
  window.location.href = destino;
}

async function tratarMfaPendente() {
  exibirMensagem("Confirme sua identidade para continuar...", "info");

  try {
    await confirmarSegundoFator();
    exibirMensagem("Login realizado com sucesso!", "sucesso");
    await irParaHomeDoUsuario();
  } catch (erro) {
    console.error("Falha na confirmação via WebAuthn:", erro);

    // ALTERADO: antes de desistir para o login geral, tenta TOTP como
    // segundo método -- só nos dois casos em que insistir no mesmo
    // WebAuthn não adianta (sem autenticador disponível, ou tentativas
    // esgotadas). Um TentativaFalhouError comum (PIN errado, etc.)
    // continua oferecendo "tentar novamente" no próprio WebAuthn, sem
    // pular para TOTP -- ver branch else no final.
    if (erro instanceof LimiteTentativasExcedidoError || erro instanceof SemAutenticadorDisponivelError) {
      await tentarProximoMetodoTOTP(erro);
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
 * Chamado quando o WebAuthn não pode mais ser tentado (sem
 * autenticador disponível, ou tentativas esgotadas). Verifica se o
 * usuário tem TOTP cadastrado; se tiver, mostra o painel de código.
 * Se não tiver, mostra o estado de BLOQUEIO -- ALTERADO: não existe
 * mais "voltar ao login" como saída, porque login (por senha ou
 * Google) sempre exige 2FA agora. Sem WebAuthn nem TOTP disponíveis,
 * não sobra nenhum caminho de entrada.
 */
async function tentarProximoMetodoTOTP(erroOriginalWebauthn) {
  try {
    await iniciarSegundoFatorTOTP();
    exibirMensagem(
      "Não foi possível confirmar pela chave de segurança. Digite o código do seu aplicativo autenticador.",
      "info"
    );
    mostrarPainelCodigoTOTP();
  } catch (erroTotp) {
    if (erroTotp instanceof TotpNaoCadastradoError) {
      // Sem TOTP cadastrado E WebAuthn esgotado/indisponível -- não
      // há mais nada a tentar. Bloqueio real.
      mostrarBloqueio();
      return;
    }
    console.error("Falha ao iniciar segundo fator via TOTP:", erroTotp);
    exibirMensagem(
      "Não foi possível verificar o método de confirmação por código. Tente recarregar a página.",
      "erro"
    );
    botaoTentarNovamente.hidden = false;
  }
}

// ============================================
// Painel de código TOTP -- reaproveita os elementos já existentes em
// afterLogin.html (mensagemFeedback, spinner) e injeta um form simples
// para o código, sem precisar de um modal separado (diferente do
// step-up, que já tem modal próprio) -- esta é uma página inteira
// dedicada à confirmação, não um overlay sobre outra tela.
// ============================================

let painelTotpCriado = false;

function mostrarPainelCodigoTOTP() {
  const spinner = document.querySelector(".loading-wrap");
  if (spinner) spinner.hidden = true;
  botaoTentarNovamente.hidden = true;

  if (painelTotpCriado) {
    document.getElementById("painel-totp").hidden = false;
    document.getElementById("totp-codigo").focus();
    return;
  }

  const card = document.querySelector(".card");
  const painel = document.createElement("div");
  painel.id = "painel-totp";
  painel.innerHTML = `
    <form id="form-totp-codigo">
      <div class="field-group">
        <label class="field-label" for="totp-codigo">Código do autenticador</label>
        <input class="field-input" type="text" id="totp-codigo" inputmode="numeric"
               autocomplete="one-time-code" maxlength="6" placeholder="000000" required>
      </div>
      <button class="btn-primary" type="submit">Confirmar</button>
    </form>
  `;
  card.insertBefore(painel, document.getElementById("mensagemFeedback"));
  painelTotpCriado = true;

  document.getElementById("form-totp-codigo").addEventListener("submit", onSubmitCodigoTOTP);
  document.getElementById("totp-codigo").focus();
}

async function onSubmitCodigoTOTP(event) {
  event.preventDefault();
  const input = document.getElementById("totp-codigo");
  const codigo = input.value.trim();
  if (!codigo) return;

  const botaoSubmit = event.target.querySelector("button[type=submit]");
  botaoSubmit.disabled = true;

  try {
    await confirmarSegundoFatorTOTP(codigo);
    exibirMensagem("Login realizado com sucesso!", "sucesso");
    await irParaHomeDoUsuario();
  } catch (erro) {
    botaoSubmit.disabled = false;

    if (erro instanceof LimiteTentativasTotpExcedidoError) {
      // FIM DA LINHA de verdade -- ALTERADO: não sobra mais nenhum
      // método (WebAuthn já tinha esgotado antes de chegar em TOTP).
      // Sem fallback para Google aqui -- login sempre exige 2FA.
      document.getElementById("painel-totp").hidden = true;
      mostrarBloqueio();
      return;
    }

    if (erro instanceof CodigoTotpInvalidoError) {
      exibirMensagem(
        `${erro.message}${erro.tentativasRestantes != null ? ` (${erro.tentativasRestantes} tentativa(s) restante(s))` : ""}`,
        "erro"
      );
      input.value = "";
      input.focus();
      return;
    }

    console.error("Falha inesperada ao confirmar código TOTP:", erro);
    exibirMensagem(erro.message || "Não foi possível confirmar o código. Tente novamente.", "erro");
  }
}

/**
 * Mostra o estado de BLOQUEIO -- usado quando WebAuthn e TOTP se
 * esgotaram (ou não estão disponíveis) e não sobra mais nenhum
 * caminho de login. ALTERADO: substitui a antiga
 * exibirMensagemVoltarAoLogin(), que oferecia um link "Voltar para o
 * login" -- isso fazia sentido quando Google era um fallback sem 2FA,
 * mas não faz mais (Google também exige 2FA agora, ver oauth.py).
 * Voltar ao login só repetiria a mesma exigência.
 *
 * Não oferece nenhuma ação própria de recuperação -- só orienta
 * contato com o administrador, que pode resetar as credenciais de
 * 2FA do usuário.
 */
function mostrarBloqueio() {
  const spinner = document.querySelector(".loading-wrap");
  if (spinner) spinner.hidden = true;
  botaoTentarNovamente.hidden = true;

  const painelTotp = document.getElementById("painel-totp");
  if (painelTotp) painelTotp.hidden = true;

  exibirMensagem(
    "Não foi possível confirmar sua identidade pelos métodos cadastrados. " +
    "Por segurança, não é possível continuar agora.",
    "erro"
  );

  const container = document.getElementById("mensagemFeedback");
  if (!container) return;

  const aviso = document.createElement("p");
  aviso.textContent = "Entre em contato com o administrador para verificar suas credenciais de segurança.";
  container.appendChild(document.createElement("br"));
  container.appendChild(aviso);
}