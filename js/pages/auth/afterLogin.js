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
//                              só por senha.
//                              ALTERADO 2 (escolha de método -- ver
//                              status.py::status_sessao,
//                              mfa.py::metodos_2fa_disponiveis): o
//                              backend agora manda `metodosDisponiveis`
//                              (lista completa), não só um `metodo`
//                              preferencial único. Com 2+ métodos, o
//                              usuário ESCOLHE qual usar (telas
//                              #escolha-mfa-metodo, iguais em espírito
//                              à escolha do onboarding). Com 1 só, vai
//                              direto sem perguntar. Com 0 (dado
//                              legado inconsistente), bloqueio direto.
//                              O fallback por erro (WebAuthn falha por
//                              falta de autenticador/limite -> tenta
//                              TOTP automaticamente) continua existindo,
//                              mas só dispara se o usuário TAMBÉM tiver
//                              TOTP disponível -- ver iniciarMetodo().
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
// is_admin=True e funcao_clinica='medico' ao mesmo tempo).
//
// ALTERADO 2 (adminMedicHomePage): admin NÃO tem mais prioridade cega
// sobre função clínica -- um médico-admin agora cai numa terceira home
// dedicada (DESTINO_ADMIN_MEDICO), que combina os dois contextos.
// Só entra em DESTINO_ADMIN "puro" quem é admin sem função clínica
// nenhuma (ou, na Opção A abaixo, admin + função clínica que não seja
// 'medico' -- ver decidirDestino()).
const DESTINO_POR_FUNCAO_CLINICA = {
  medico: "../../../html/pages/user/standartUser/medicHomePage.html",
  enfermeiro: "../../../html/pages/user/standartUser/medicHomePage.html",
};
const DESTINO_ADMIN = "../../../html/pages/user/admin/adminHomePage.html";
const DESTINO_ADMIN_MEDICO = "../../../html/pages/user/admin/adminMedicHomePage.html";

const ROTA_LOGIN = "../../../html/pages/auth/login.html";

const botaoTentarNovamente = document.getElementById("btn-tentar-novamente");

// Elementos da tela de escolha de método (ver afterLogin.html).
const escolhaMfaMetodo = document.getElementById("escolha-mfa-metodo");
const btnMfaEscolherWebauthn = document.getElementById("btn-mfa-escolher-webauthn");
const btnMfaEscolherTotp = document.getElementById("btn-mfa-escolher-totp");

// Guarda a última lista de métodos disponíveis recebida de
// /auth/status -- usada pelo botão "tentar novamente" (que não tem
// acesso ao `resultado` original de tratarPosLogin) e pelo fallback
// por erro do WebAuthn (para saber se vale tentar TOTP em seguida).
let ultimosMetodosDisponiveis = [];

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
  await tratarMfaPendente(ultimosMetodosDisponiveis);
});

btnMfaEscolherWebauthn.addEventListener("click", () => {
  escolhaMfaMetodo.hidden = true;
  iniciarMetodo("webauthn");
});

btnMfaEscolherTotp.addEventListener("click", () => {
  escolhaMfaMetodo.hidden = true;
  iniciarMetodo("totp");
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
 * Decide o destino pós-login com base em is_admin + funcao_clinica.
 *
 * Três ramos reais (não dá mais para expressar isso num ternário só,
 * ver histórico do arquivo):
 *   1. admin + função clínica 'medico'  -> home combinada dedicada.
 *   2. admin (sem função clínica, OU com função clínica diferente de
 *      'medico' -- ver nota abaixo)     -> home de admin padrão.
 *   3. só função clínica, sem admin     -> home clínica padrão.
 *
 * NOTA (Opção A vs B, decisão de produto pendente de confirmação):
 * hoje só 'medico'-admin ganha a home combinada. Um enfermeiro-admin
 * cai em DESTINO_ADMIN puro (ramo 2), não em DESTINO_ADMIN_MEDICO.
 * Se o produto decidir que QUALQUER função clínica + admin deveria
 * cair na home combinada, troque a condição do primeiro `if` por só
 * `if (ehAdmin && funcaoClinica)` (remove o `=== "medico"`).
 *
 * @returns {string|undefined} undefined = nenhum destino mapeado
 *   (estado inconsistente) -- quem chama deve tratar como erro.
 */
function decidirDestino(ehAdmin, funcaoClinica) {
  if (ehAdmin && funcaoClinica === "medico") {
    return DESTINO_ADMIN_MEDICO;
  }

  if (ehAdmin) {
    return DESTINO_ADMIN;
  }

  return DESTINO_POR_FUNCAO_CLINICA[funcaoClinica];
}

/**
 * Busca /me (agora que a sessão está completa), guarda o payload
 * inteiro no cache de sessão via userCache.js (definirDadosUsuarioCache)
 * -- para as homes lerem sem precisar refazer o fetch -- e redireciona
 * conforme is_admin/funcao_clinica (ver decidirDestino()).
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

  const destino = decidirDestino(ehAdmin, funcaoClinica);

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

/**
 * Decide o que mostrar ao entrar em mfa_pendente:
 *   - 0 métodos: estado inconsistente (dado legado sem WebAuthn nem
 *     TOTP) -- bloqueio direto, mesmo tratamento de esgotamento total.
 *   - 1 método: vai direto para o único disponível, sem perguntar
 *     (comportamento equivalente ao anterior a esta mudança).
 *   - 2+ métodos: mostra a tela de escolha.
 */
async function tratarMfaPendente(metodosDisponiveis) {
  exibirMensagem("Confirme sua identidade para continuar...", "info");

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

/**
 * Dispara a confirmação do método escolhido (ou único disponível).
 * Ponto único de entrada para os dois métodos -- substitui a antiga
 * tratarMfaPendente(), que sempre chamava WebAuthn primeiro
 * incondicionalmente, mesmo para quem só tinha TOTP cadastrado (o que
 * desperdiçava uma tentativa de MAX_TENTATIVAS_MFA à toa).
 */
async function iniciarMetodo(metodo) {
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
    // direto (ver branch else no final).
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
 * Inicia o fluxo de TOTP no login -- chamado tanto no caminho direto
 * (usuário só tem TOTP, ou escolheu TOTP na tela de escolha) quanto
 * no fallback por erro do WebAuthn (usuário tem os dois métodos).
 */
async function iniciarFluxoTotpLogin() {
  escolhaMfaMetodo.hidden = true; // garante que some se veio da escolha

  try {
    await iniciarSegundoFatorTOTP();
    exibirMensagem("Digite o código do seu aplicativo autenticador.", "info");
    mostrarPainelCodigoTOTP();
  } catch (erroTotp) {
    if (erroTotp instanceof TotpNaoCadastradoError) {
      // Não deveria ocorrer se metodosDisponiveis disse que tinha TOTP
      // -- mas trata explicitamente em vez de mascarar como outro
      // tipo de bloqueio silencioso.
      console.error("Backend indicou TOTP disponível em /auth/status mas /totp/2fa/iniciar recusou.");
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
  escolhaMfaMetodo.hidden = true;

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
      // método (WebAuthn já tinha esgotado, ou nem era o método deste
      // usuário, antes de chegar em TOTP). Sem fallback para Google
      // aqui -- login sempre exige 2FA.
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
 * caminho de login. Substitui a antiga exibirMensagemVoltarAoLogin(),
 * que oferecia um link "Voltar para o login" -- isso fazia sentido
 * quando Google era um fallback sem 2FA, mas não faz mais (Google
 * também exige 2FA agora, ver oauth.py). Voltar ao login só repetiria
 * a mesma exigência.
 *
 * Não oferece nenhuma ação própria de recuperação -- só orienta
 * contato com o administrador, que pode resetar as credenciais de
 * 2FA do usuário.
 */
function mostrarBloqueio() {
  const spinner = document.querySelector(".loading-wrap");
  if (spinner) spinner.hidden = true;
  botaoTentarNovamente.hidden = true;
  escolhaMfaMetodo.hidden = true;

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