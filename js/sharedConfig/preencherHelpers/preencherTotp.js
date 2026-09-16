//
// TOTP (aplicativo autenticador): alternância de estados na UI,
// fluxo de cadastro (QR code + confirmação) e remoção.
//
// ALTERADO: o modal de cadastro (QR + confirmação) agora vive dentro
// do mesmo settingsModal.html/settings.js (ver #totp-modal-overlay lá
// e a seção "Modal de cadastro de TOTP" em settings.js) -- não é mais
// um painel inline nem um modal com HTML/loader próprios. Este módulo
// continua dono da LÓGICA de negócio (chamar as rotas, atualizar
// cache, refletir no painel resumo), só delegando a abertura/fechamento
// visual do modal para as funções que settings.js expõe.

import {
  iniciarCadastroTOTP,
  confirmarCadastroTOTP,
  removerTOTP,
  ErroCadastroTOTP,
} from '../../pages/auth/totp.js';
import { atualizarTotpCache } from '../userCache.js';
import { atualizarAvisoUnicoFator } from './preencherAvisos.js';
import { abrirModalTotp, fecharModalTotp, refsFormTotp } from '../../pages/user/admin/settings.js';

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

  botao.addEventListener('click', () => {
    abrirModalTotp(iniciarCadastroTOTP, extrairMensagemErroInicial);
  });
}

function configurarBotaoRemoverTotp() {
  const botao = document.getElementById('btn-remover-totp');
  if (!botao || botao.dataset.listenerAtivo) return;
  botao.dataset.listenerAtivo = 'true';

  botao.addEventListener('click', () => tratarCliqueRemoverTotp(botao));
}

function extrairMensagemErroInicial(erro) {
  return erro instanceof ErroCadastroTOTP
    ? erro.message
    : 'Não foi possível gerar o código de configuração.';
}

/**
 * Confirma o cadastro TOTP com o código digitado pelo usuário. Em
 * caso de sucesso, sincroniza UI e cache, e fecha o modal.
 */
async function tratarSubmitConfirmarTOTP(event) {
  event.preventDefault();
  const { inputCodigo, erroEl } = refsFormTotp();
  const codigo = inputCodigo.value.trim();
  if (!codigo) return;

  const botaoSubmit = event.target.querySelector('button[type=submit]');
  botaoSubmit.disabled = true;
  erroEl.textContent = '';

  try {
    const { totp } = await confirmarCadastroTOTP(codigo);
    atualizarTotpCache(totp);
    fecharModalTotp();
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

// Liga o listener do form de confirmação uma única vez -- o form em si
// (#totp-form-confirmar) vive dentro do mesmo settingsModal.html que
// #settings-overlay, então já está garantido no DOM neste ponto (mesmo
// raciocínio de settings.js: settingsLoader.js só importa módulos que
// dependem desse HTML depois de injetá-lo).
ligarListenerFormularioTotp();

function ligarListenerFormularioTotp() {
  const { form } = refsFormTotp();
  form?.addEventListener('submit', tratarSubmitConfirmarTOTP);
}