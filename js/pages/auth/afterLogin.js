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

// ... (bloco DESTINO_POR_FUNCAO_CLINICA / DESTINO_ADMIN / ROTA_LOGIN inalterado)

const botaoTentarNovamente = document.getElementById("btn-tentar-novamente");

// Novo: elementos da tela de escolha de método.
const escolhaMfaMetodo = document.getElementById("escolha-mfa-metodo");
const btnMfaEscolherWebauthn = document.getElementById("btn-mfa-escolher-webauthn");
const btnMfaEscolherTotp = document.getElementById("btn-mfa-escolher-totp");

window.addEventListener("pageshow", async () => {
  await tratarPosLogin();
});

botaoTentarNovamente.addEventListener("click", async () => {
  botaoTentarNovamente.hidden = true;
  await tratarMfaPendente(ultimosMetodosDisponiveis);
});

// Guarda a última lista recebida para o botão "tentar novamente" (que
// não tem acesso ao `resultado` original de tratarPosLogin) e para o
// clique nos cartões de escolha poder saber qual método sobrou.
let ultimosMetodosDisponiveis = [];

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
    if (resultado.motivo === "status_desconhecido") {
      console.error("Status de sessão desconhecido:", resultado.bruto);
    }
    window.location.href = ROTA_LOGIN;
    return;
  }

  switch (resultado.status) {
    case "mfa_pendente":
      ultimosMetodosDisponiveis = resultado.metodosDisponiveis || [];
      await tratarMfaPendente(ultimosMetodosDisponiveis);
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
 * Decide o que mostrar ao entrar em mfa_pendente:
 *   - 0 métodos: estado inconsistente (dado legado) -- bloqueio direto,
 *     mesmo comportamento de esgotamento total.
 *   - 1 método: comportamento anterior, sem escolha -- vai direto para
 *     o único método disponível.
 *   - 2+ métodos: mostra os cartões de escolha (novo).
 */
async function tratarMfaPendente(metodosDisponiveis) {
  if (!metodosDisponiveis || metodosDisponiveis.length === 0) {
    console.error("Nenhum método de 2FA disponível para este usuário -- estado inconsistente.");
    mostrarBloqueio();
    return;
  }

  if (metodosDisponiveis.length === 1) {
    await iniciarMetodo(metodosDisponiveis[0]);
    return;
  }

  mostrarEscolhaMetodo();
}

function mostrarEscolhaMetodo() {
  const spinner = document.querySelector(".loading-wrap");
  if (spinner) spinner.hidden = true;
  botaoTentarNovamente.hidden = true;
  const painelTotp = document.getElementById("painel-totp");
  if (painelTotp) painelTotp.hidden = true;

  escolhaMfaMetodo.hidden = false;
}

btnMfaEscolherWebauthn.addEventListener("click", () => {
  escolhaMfaMetodo.hidden = true;
  iniciarMetodo("webauthn");
});

btnMfaEscolherTotp.addEventListener("click", () => {
  escolhaMfaMetodo.hidden = true;
  iniciarMetodo("totp");
});

/**
 * Dispara a confirmação do método escolhido (ou único disponível).
 * Substitui a antiga tratarMfaPendente() que sempre chamava WebAuthn
 * primeiro incondicionalmente.
 */
async function iniciarMetodo(metodo) {
  exibirMensagem("Confirme sua identidade para continuar...", "info");

  if (metodo === "totp") {
    await iniciarFluxoTotpLogin();
    return;
  }

  // metodo === "webauthn"
  try {
    await confirmarSegundoFator();
    exibirMensagem("Login realizado com sucesso!", "sucesso");
    await irParaHomeDoUsuario();
  } catch (erro) {
    console.error("Falha na confirmação via WebAuthn:", erro);

    // Fallback por erro: só faz sentido tentar TOTP automaticamente
    // se o usuário TAMBÉM tiver TOTP disponível -- senão é bloqueio
    // direto, igual já era antes desta mudança.
    const totpTambemDisponivel = ultimosMetodosDisponiveis.includes("totp");

    if (
      (erro instanceof LimiteTentativasExcedidoError || erro instanceof SemAutenticadorDisponivelError)
      && totpTambemDisponivel
    ) {
      exibirMensagem(
        "Não foi possível confirmar pela chave de segurança. Tentando código do aplicativo autenticador...",
        "info"
      );
      await iniciarFluxoTotpLogin();
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
 * Wrapper fino sobre o antigo tentarProximoMetodoTOTP -- agora chamado
 * tanto no caminho direto (usuário só tem TOTP, ou escolheu TOTP)
 * quanto no fallback por erro do WebAuthn (usuário tem os dois).
 */
async function iniciarFluxoTotpLogin() {
  try {
    await iniciarSegundoFatorTOTP();
    exibirMensagem("Digite o código do seu aplicativo autenticador.", "info");
    mostrarPainelCodigoTOTP();
  } catch (erroTotp) {
    if (erroTotp instanceof TotpNaoCadastradoError) {
      // Não deveria ocorrer se metodosDisponiveis disse que tinha TOTP
      // -- mas trata explicitamente em vez de mascarar como bloqueio
      // silencioso de outro tipo.
      console.error("Backend indicou TOTP disponível em /auth/status mas totp/2fa/iniciar recusou.");
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

// (mostrarPainelCodigoTOTP, onSubmitCodigoTOTP, mostrarBloqueio, 
//  irParaHomeDoUsuario permanecem exatamente como estão hoje)

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