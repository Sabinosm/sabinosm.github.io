// onboarding.js
//
// Fluxo de primeiro acesso, chamado quando a sessão está em estado
// `onboarding_pendente` (usuário ainda sem senha definida e/ou sem
// 2FA escolhido -- pode ter vindo tanto de login por senha quanto de
// login via Google).
//
// ALTERADO (2FA sempre obrigatório -- ver mfa.py/login.py/oauth.py/
// onboarding.py no backend): volta a ter DOIS passos, não um só:
//   1) definir senha (/definir-senha);
//   2) escolher e confirmar WebAuthn OU TOTP (/webauthn/registrar/*
//      ou /totp/registrar/*, reaproveitados de webauthn.js/totp.js),
//      depois concluir via /2fa/status + /concluir.
// Login sem 2FA algum deixou de existir no sistema -- se o onboarding
// liberasse a sessão sem nenhum fator cadastrado, o usuário nunca
// mais conseguiria logar de novo.

import { exibirMensagem } from "../../shared/feedback.js";
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";
import { registrarNovoDispositivo, ErroRegistroDispositivo } from "./webauthn.js";
import { iniciarCadastroTOTP, confirmarCadastroTOTP, ErroCadastroTOTP } from "./totp.js";
import { validarSenha } from "../../shared/passwordValidation.js";
import { ativarTogglesSenha } from "../../shared/passwordToggle.js";

const passoSenha = document.getElementById("passo-senha");
const passoTwoFa = document.getElementById("passo-2fa");
const formSenha = document.getElementById("form-senha");
const inputSenha = document.getElementById("senha");
const inputConfirmarSenha = document.getElementById("confirmar_senha");

ativarTogglesSenha([inputSenha, inputConfirmarSenha]);

// Mesmo padrão simples de setError/clearError de adminValidation.js
// (Cadastro de administrador) -- não justifica um módulo de validação
// dedicado aqui, já que este form só tem os dois campos de senha.
function setErroCampo(fieldId, mensagem) {
  const input = document.getElementById(fieldId);
  const field = input?.closest(".field");
  const errEl = document.getElementById("err-" + fieldId);
  field?.classList.add("has-error");
  if (errEl) errEl.textContent = mensagem;
}

function limparErroCampo(fieldId) {
  const input = document.getElementById(fieldId);
  const field = input?.closest(".field");
  const errEl = document.getElementById("err-" + fieldId);
  field?.classList.remove("has-error");
  if (errEl) errEl.textContent = "";
}

const escolha2faOpcoes = document.getElementById("escolha-2fa-opcoes");
const painelWebauthn = document.getElementById("painel-2fa-webauthn");
const painelTotp = document.getElementById("painel-2fa-totp");
const btnEscolherWebauthn = document.getElementById("btn-escolher-webauthn");
const btnEscolherTotp = document.getElementById("btn-escolher-totp");
const btnCadastrarWebauthn = document.getElementById("btn-cadastrar-webauthn");
const btnVoltarEscolhaWebauthn = document.getElementById("btn-voltar-escolha-webauthn");
const btnVoltarEscolhaTotp = document.getElementById("btn-voltar-escolha-totp");
const formTotpConfirmar = document.getElementById("form-totp-confirmar");

// CORRIGIDO: antes apontava fixo para a home de médico
// (medicHomePage.html), o que estava certo por acaso enquanto só
// profissionais clínicos completavam onboarding, mas manda o admin
// fundador (ou qualquer futuro admin que passe por onboarding) para a
// home errada -- afterLogin.js::irParaHomeDoUsuario() já centraliza
// essa decisão (is_admin tem prioridade sobre funcao_clinica, com
// tratamento de papel desconhecido), então delegamos pra lá em vez de
// duplicar a lógica aqui.
const DESTINO_APOS_CONCLUIR = "../../../html/pages/auth/afterLogin.html";

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
      // CORRIGIDO: antes pulava direto para a TELA de 2FA sem checar
      // se já havia um método confirmado. Isso podia acontecer mesmo
      // com um TOTP/WebAuthn já funcionando -- por exemplo, se
      // /onboarding/concluir nunca chegou a rodar numa sessão anterior
      // (ver onboarding.py) e o backend te devolve aqui de novo. Nesse
      // caso, entrar na tela de cadastro de TOTP dispara
      // /totp/registrar/iniciar de novo, que podia (antes de corrigido
      // no backend) desconfirmar o fator que já existia -- ou, mesmo
      // corrigido lá, força o usuário a escanear um QR code de novo à
      // toa. Agora checamos /2fa/status primeiro: se já há um método
      // confirmado, o único passo que falta é concluir.
      const tem2fa = await usuarioJaTem2fa();
      if (tem2fa) {
        await concluirOnboarding();
        return;
      }
      await irParaPasso2fa();
    }
  } catch (erro) {
    console.error("Erro ao verificar etapa do onboarding:", erro);
    exibirMensagem("Não foi possível carregar seu progresso. Recarregue a página.", "erro");
  }
}

/**
 * Consulta /onboarding/2fa/status -- usado em sincronizarPasso() para
 * não reabrir a tela de cadastro de 2FA quando já existe um método
 * confirmado (ver comentário em sincronizarPasso).
 */
async function usuarioJaTem2fa() {
  try {
    const resp = await fetch(`${URL_BASE_API}/auth/onboarding/2fa/status`, {
      method: "GET",
      credentials: "include",
    });
    if (!resp.ok) return false;
    const dados = await resp.json();
    return Boolean(dados.tem_2fa);
  } catch (erro) {
    console.error("Erro ao verificar status de 2FA no onboarding:", erro);
    return false;
  }
}

// ============================================
// Passo 1: senha
// ============================================

formSenha.addEventListener("submit", async (event) => {
  event.preventDefault();

  limparErroCampo("senha");
  limparErroCampo("confirmar_senha");

  const senha = inputSenha.value;
  const confirmarSenha = inputConfirmarSenha.value;

  // Pré-filtro client-side espelhando validar_senha() do backend (ver
  // ../../shared/passwordValidation.js) -- só para feedback rápido.
  // A validação real e definitiva continua sendo do backend (ver
  // catch abaixo, que mostra cru o motivo devolvido por
  // /onboarding/definir-senha quando ele reprovar algo que passou
  // aqui).
  const { valida: senhaValida, mensagem: mensagemSenha } = validarSenha(senha);
  if (!senhaValida) {
    setErroCampo("senha", mensagemSenha);
    return;
  }

  if (senha !== confirmarSenha) {
    setErroCampo("confirmar_senha", "As senhas não coincidem.");
    return;
  }

  const botaoSubmit = formSenha.querySelector("button[type=submit]");

  botaoSubmit.disabled = true;
  try {
    await definirSenha(senha);
    await irParaPasso2fa();
  } catch (erro) {
    console.error("Falha ao definir senha:", erro);
    exibirMensagem(erro.message || "Não foi possível definir a senha.", "erro");
    botaoSubmit.disabled = false;
  }
});

/**
 * Envia a nova senha para /onboarding/definir-senha -- ALTERADO: não
 * conclui mais o onboarding sozinha, só avança para o passo de 2FA
 * (ver onboarding.py, docstring do módulo).
 */
async function definirSenha(senha) {
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

// ============================================
// Passo 2: escolha de método 2FA
// ============================================

async function irParaPasso2fa() {
  passoSenha.hidden = true;
  passoTwoFa.hidden = false;
  mostrarEscolha2fa();
}

function mostrarEscolha2fa() {
  escolha2faOpcoes.hidden = false;
  painelWebauthn.hidden = true;
  painelTotp.hidden = true;
}

btnEscolherWebauthn.addEventListener("click", () => {
  escolha2faOpcoes.hidden = true;
  painelWebauthn.hidden = false;
});

btnEscolherTotp.addEventListener("click", () => {
  escolha2faOpcoes.hidden = true;
  iniciarFluxoTotp();
});

btnVoltarEscolhaWebauthn.addEventListener("click", mostrarEscolha2fa);
btnVoltarEscolhaTotp.addEventListener("click", mostrarEscolha2fa);

// ---- Sub-fluxo WebAuthn ----

btnCadastrarWebauthn.addEventListener("click", async () => {
  const apelidoPadrao = "Meu dispositivo";
  btnCadastrarWebauthn.disabled = true;
  btnCadastrarWebauthn.textContent = "Aguardando confirmação...";

  try {
    // Reaproveita registrarNovoDispositivo de webauthn.js -- a rota
    // no backend (/webauthn/registrar/iniciar e /confirmar) já aceita
    // tanto sessão completa quanto onboarding_pendente (ver
    // session.py::requer_login_ou_onboarding_pendente).
    await registrarNovoDispositivo(apelidoPadrao, "desktop");
    await concluirOnboarding();
  } catch (erro) {
    console.error("Falha ao cadastrar WebAuthn no onboarding:", erro);
    exibirMensagem(
      erro instanceof ErroRegistroDispositivo ? erro.message : "Não foi possível cadastrar a chave de segurança.",
      "erro"
    );
    btnCadastrarWebauthn.disabled = false;
    btnCadastrarWebauthn.textContent = "Cadastrar chave de segurança";
  }
});

// ---- Sub-fluxo TOTP ----

async function iniciarFluxoTotp() {
  const qrContainer = document.getElementById("totp-qrcode-container");
  const secretTexto = document.getElementById("totp-secret-texto");
  const inputCodigo = document.getElementById("totp-codigo");

  qrContainer.innerHTML = "";
  secretTexto.textContent = "";
  inputCodigo.value = "";
  painelTotp.hidden = false;

  let dados;
  try {
    dados = await iniciarCadastroTOTP();
  } catch (erro) {
    console.error("Falha ao iniciar cadastro TOTP no onboarding:", erro);
    exibirMensagem(
      erro instanceof ErroCadastroTOTP ? erro.message : "Não foi possível gerar o código de configuração.",
      "erro"
    );
    mostrarEscolha2fa();
    return;
  }

  // Não bloqueia o texto do secret nem o foco do input -- o usuário já
  // pode começar a digitar manualmente enquanto o QR (se demorar)
  // ainda está sendo esperado.
  renderizarQrCode(qrContainer, dados.otpauth_uri).catch((erro) => {
    console.error("Falha inesperada ao renderizar QR code TOTP no onboarding:", erro);
  });
  secretTexto.textContent = `Ou digite manualmente: ${dados.secret_texto}`;
  inputCodigo.focus();
}

/**
 * Espera a lib `qrcode` (window.QRCode) ficar disponível, até um
 * limite de tempo -- mesma correção aplicada em preencherTotp.js
 * (Configurações). A janela de corrida aqui é menor porque o
 * onboarding não passa por fetch+inject de partial nem import
 * dinâmico de módulo (a lib e este script chegam por caminhos mais
 * diretos), mas não é zero -- a tag <script> do CDN ainda é
 * carregada de forma desacoplada do restante do JS da página, então
 * nada garante ordem entre os dois. Sem isso, a checagem antiga
 * (`typeof window.QRCode === "undefined"`) podia desistir pra sempre
 * de um QR que só chegaria alguns milissegundos depois.
 */
function aguardarLibQrCode(timeoutMs = 4000) {
  if (typeof window.QRCode !== "undefined") return Promise.resolve(true);

  return new Promise((resolve) => {
    const intervaloMs = 100;
    let decorrido = 0;

    const id = setInterval(() => {
      if (typeof window.QRCode !== "undefined") {
        clearInterval(id);
        resolve(true);
        return;
      }
      decorrido += intervaloMs;
      if (decorrido >= timeoutMs) {
        clearInterval(id);
        resolve(false);
      }
    }, intervaloMs);
  });
}

async function renderizarQrCode(container, otpauthUri) {
  const disponivel = await aguardarLibQrCode();

  if (!disponivel) {
    console.warn("Lib QRCode não carregou a tempo -- cadastro TOTP seguirá só com o secret em texto.");
    exibirMensagem(
      "Não foi possível carregar o QR code agora -- use o código exibido para configurar manualmente, ou recarregue a página.",
      "erro"
    );
    return;
  }

  new window.QRCode(container, {
    text: otpauthUri,
    width: 180,
    height: 180,
  });
}

formTotpConfirmar.addEventListener("submit", async (event) => {
  event.preventDefault();
  const inputCodigo = document.getElementById("totp-codigo");
  const codigo = inputCodigo.value.trim();
  if (!codigo) return;

  const botaoSubmit = formTotpConfirmar.querySelector("button[type=submit]");
  botaoSubmit.disabled = true;

  try {
    await confirmarCadastroTOTP(codigo);
    await concluirOnboarding();
  } catch (erro) {
    console.error("Falha ao confirmar TOTP no onboarding:", erro);
    exibirMensagem(
      erro instanceof ErroCadastroTOTP ? erro.message : "Não foi possível confirmar o código.",
      "erro"
    );
    botaoSubmit.disabled = false;
    inputCodigo.value = "";
    inputCodigo.focus();
  }
});

// ============================================
// Conclusão -- chamado depois que WebAuthn OU TOTP foi confirmado
// ============================================

/**
 * Chama /onboarding/concluir, que confirma que senha + pelo menos um
 * método de 2FA já estão prontos e libera a sessão completa -- mesmo
 * papel que a antiga /definir-senha cumpria sozinha antes desta
 * mudança (ver onboarding.py).
 */
async function concluirOnboarding() {
  const resp = await fetch(`${URL_BASE_API}/auth/onboarding/concluir`, {
    method: "POST",
    credentials: "include",
  });

  const dados = await resp.json();

  if (!resp.ok) {
    // Não deveria ocorrer numa navegação normal (o frontend só chama
    // isto depois de confirmar um método) -- mas se ocorrer (ex:
    // corrida entre abas), mostra o erro em vez de mascarar.
    throw new Error(dados.erro || "Não foi possível concluir o cadastro.");
  }

  exibirMensagem("Cadastro concluído! Redirecionando...", "sucesso");
  window.location.href = DESTINO_APOS_CONCLUIR;
}