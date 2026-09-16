//
// TOTP (aplicativo autenticador): alternância de estados na UI,
// fluxo de cadastro (QR code + confirmação) e remoção.

import {
  iniciarCadastroTOTP,
  confirmarCadastroTOTP,
  removerTOTP,
  ErroCadastroTOTP,
} from '../../pages/auth/totp.js';
import { atualizarTotpCache } from '../userCache.js';
import { atualizarAvisoUnicoFator } from './preencherAvisos.js';

/**
 * Alterna entre os estados "não configurado" / "configurado" da seção
 * TOTP, a partir do payload de /me (`totp: null` ou `totp: {...}`).
 */
export function preencherTotp(totp) {
  const painelNaoConfigurado = document.getElementById('totp-nao-configurado');
  const painelConfigurado = document.getElementById('totp-configurado');
  if (!painelNaoConfigurado || !painelConfigurado) return;

  const configurado = Boolean(totp?.confirmado);

  painelNaoConfigurado.hidden = configurado;
  painelConfigurado.hidden = !configurado;

  if (configurado) {
    const meta = document.getElementById('totp-configurado-meta');
    if (meta) meta.textContent = `Configurado em ${totp.criado_em}`;
  }

  configurarBotaoConfigurarTotp();
  configurarBotaoRemoverTotp();
}

function configurarBotaoConfigurarTotp() {
  const botao = document.getElementById('btn-configurar-totp');
  if (!botao || botao.dataset.listenerAtivo) return;
  botao.dataset.listenerAtivo = 'true';

  botao.addEventListener('click', iniciarFluxoCadastroTOTP);
}

function configurarBotaoRemoverTotp() {
  const botao = document.getElementById('btn-remover-totp');
  if (!botao || botao.dataset.listenerAtivo) return;
  botao.dataset.listenerAtivo = 'true';

  botao.addEventListener('click', () => tratarCliqueRemoverTotp(botao));
}

/**
 * Abre o painel de cadastro TOTP: pede o secret ao backend, renderiza
 * o QR code (via lib `qrcode` carregada globalmente -- ver
 * settingsModal.html/página que injeta este modal) e mostra o texto
 * do secret como alternativa para digitação manual.
 */
async function iniciarFluxoCadastroTOTP() {
  const painel = document.getElementById('totp-cadastro-painel');
  const qrContainer = document.getElementById('totp-qrcode-container');
  const secretTexto = document.getElementById('totp-secret-texto');
  const erroEl = document.getElementById('totp-cadastro-erro');
  const inputCodigo = document.getElementById('totp-codigo-confirmacao');

  erroEl.textContent = '';
  inputCodigo.value = '';
  qrContainer.innerHTML = '';

  document.getElementById('totp-nao-configurado').hidden = true;
  painel.hidden = false;

  let dados;
  try {
    dados = await iniciarCadastroTOTP();
  } catch (erro) {
    console.error('Falha ao iniciar cadastro TOTP', erro);
    erroEl.textContent = erro instanceof ErroCadastroTOTP ? erro.message : 'Não foi possível gerar o código de configuração.';
    painel.hidden = true;
    document.getElementById('totp-nao-configurado').hidden = false;
    return;
  }

  // Não bloqueia o texto do secret nem o foco do input -- o usuário já
  // pode começar a digitar manualmente enquanto o QR (se demorar)
  // ainda está sendo esperado.
  renderizarQrCode(qrContainer, dados.otpauth_uri).catch((erro) => {
    console.error('Falha inesperada ao renderizar QR code TOTP', erro);
  });
  secretTexto.textContent = `Ou digite manualmente: ${dados.secret_texto}`;
  inputCodigo.focus();
}

/**
 * Espera a lib `qrcode` (window.QRCode) ficar disponível, até um
 * limite de tempo -- CORRIGIDO: a lib é carregada via <script> de CDN
 * na página host, num caminho completamente separado da cadeia de
 * módulos deste modal (fetch do partial -> inject -> import dinâmico
 * de settings.js -> import de preencherPerfil.js/preencherTotp.js,
 * ver settingsLoader.js). Nada nessa cadeia aguarda o <script> do CDN
 * terminar de carregar, então existe uma janela real em que o usuário
 * já consegue clicar em "Configurar aplicativo autenticador" antes da
 * lib estar pronta -- a checagem antiga (`typeof window.QRCode ===
 * 'undefined'`) rodava nesse instante, achava que a lib nunca ia
 * carregar, e desistia pra sempre (só um warning no console, nada
 * visível pro usuário), mesmo que a lib chegasse meio segundo depois.
 *
 * @param {number} timeoutMs Tempo máximo de espera.
 * @returns {Promise<boolean>} true se a lib ficou disponível a tempo.
 */
function aguardarLibQrCode(timeoutMs = 4000) {
  if (typeof window.QRCode !== 'undefined') return Promise.resolve(true);

  return new Promise((resolve) => {
    const intervaloMs = 100;
    let decorrido = 0;

    const id = setInterval(() => {
      if (typeof window.QRCode !== 'undefined') {
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

/**
 * Renderiza o QR code a partir da URI otpauth:// usando a lib
 * `qrcode` (window.QRCode) carregada via CDN. Se a lib demorar mas
 * chegar dentro do prazo, o QR aparece normalmente. Só se ela
 * realmente não chegar a tempo é que caímos no fallback -- e nesse
 * caso avisamos na própria tela (não só no console), já que o secret
 * em texto sozinho é fácil de passar despercebido pelo usuário.
 */
async function renderizarQrCode(container, otpauthUri) {
  const disponivel = await aguardarLibQrCode();

  if (!disponivel) {
    console.warn('Lib QRCode não carregou a tempo -- cadastro TOTP seguirá só com o secret em texto.');
    const erroEl = document.getElementById('totp-cadastro-erro');
    if (erroEl) {
      erroEl.textContent = 'Não foi possível carregar o QR code agora -- use o código abaixo para configurar manualmente, ou recarregue a página e tente de novo.';
    }
    return;
  }

  new window.QRCode(container, {
    text: otpauthUri,
    width: 180,
    height: 180,
  });
}

/**
 * Confirma o cadastro TOTP com o código digitado pelo usuário. Em
 * caso de sucesso, sincroniza UI e cache (mesmo padrão de
 * tratarCliqueAdicionarDispositivo para WebAuthn).
 */
async function tratarSubmitConfirmarTOTP(event) {
  event.preventDefault();
  const inputCodigo = document.getElementById('totp-codigo-confirmacao');
  const erroEl = document.getElementById('totp-cadastro-erro');
  const codigo = inputCodigo.value.trim();
  if (!codigo) return;

  const botaoSubmit = event.target.querySelector('button[type=submit]');
  botaoSubmit.disabled = true;
  erroEl.textContent = '';

  try {
    const { totp } = await confirmarCadastroTOTP(codigo);
    atualizarTotpCache(totp);
    document.getElementById('totp-cadastro-painel').hidden = true;
    preencherTotp(totp);
    // Reflete o novo total de fatores no aviso de redundância -- para
    // isso precisamos do estado atual de WebAuthn, já refletido no DOM
    // (ver device-list), então relemos a contagem direto da lista.
    const qtdWebauthn = document.querySelectorAll('#device-list .device-item').length;
    atualizarAvisoUnicoFator({ credenciais: new Array(qtdWebauthn) }, totp);
  } catch (erro) {
    console.error('Falha ao confirmar cadastro TOTP', erro);
    erroEl.textContent = erro instanceof ErroCadastroTOTP ? erro.message : 'Não foi possível confirmar o código.';
  } finally {
    botaoSubmit.disabled = false;
  }
}

function tratarCancelarCadastroTOTP() {
  document.getElementById('totp-cadastro-painel').hidden = true;
  document.getElementById('totp-nao-configurado').hidden = false;
}

/**
 * Remove o TOTP cadastrado, com confirmação -- mesmo padrão de
 * removerDispositivo (WebAuthn).
 */
async function tratarCliqueRemoverTotp(botao) {
  const confirmou = window.confirm(
    'Remover o aplicativo autenticador? Você precisará configurá-lo de novo para voltar a usá-lo como segundo fator.'
  );
  if (!confirmou) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Removendo...';

  try {
    await removerTOTP();
    atualizarTotpCache(null);
    preencherTotp(null);
    const qtdWebauthn = document.querySelectorAll('#device-list .device-item').length;
    atualizarAvisoUnicoFator({ credenciais: new Array(qtdWebauthn) }, null);
  } catch (erro) {
    console.error('Falha ao remover TOTP', erro);
    window.alert(erro instanceof ErroCadastroTOTP ? erro.message : 'Não foi possível remover o autenticador.');
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

// Liga o listener do form de confirmação uma única vez. Chamado direto
// (sem esperar DOMContentLoaded) porque este módulo só é importado
// depois que settingsModal.html já foi injetado no DOM (ver
// settingsLoader.js) -- DOMContentLoaded já pode ter disparado antes
// deste import rodar.
//
// Como o import abaixo vem de preencherPerfil.js (que settingsLoader.js
// carrega), o timing é o mesmo de antes da divisão.
ligarListenersFormularioTotp();

function ligarListenersFormularioTotp() {
  const form = document.getElementById('totp-form-confirmar');
  const btnCancelar = document.getElementById('btn-cancelar-cadastro-totp');
  form?.addEventListener('submit', tratarSubmitConfirmarTOTP);
  btnCancelar?.addEventListener('click', tratarCancelarCadastroTOTP);
}