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

// settings.js NÃO pode ser importado estaticamente aqui: ele (e os
// helpers dele) fazem getElementById no escopo do módulo e assumem que
// o settingsModal.html já foi injetado. Este arquivo entra no grafo do
// initPagina, que avalia ANTES da injeção -- um import estático
// quebraria com "Cannot read properties of null". O settingsLoader.js
// já importa settings.js no momento certo; aqui só pegamos o módulo já
// avaliado (import() devolve o mesmo, do cache), sempre depois de
// modalConfiguracoesPronto (preencherPainelPerfil aguarda).
const carregarApiModalTotp = () => import('../settings.js');

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
  ligarListenerFormularioTotp();
}

function configurarBotaoConfigurarTotp() {
  const botao = document.getElementById('btn-configurar-totp');
  if (!botao || botao.dataset.listenerAtivo) return;
  botao.dataset.listenerAtivo = 'true';

  botao.addEventListener('click', async () => {
    try {
      const { abrirModalTotp } = await carregarApiModalTotp();
      abrirModalTotp(iniciarCadastroTOTP, extrairMensagemErroInicial);
    } catch (erro) {
      console.error('TOTP: não foi possível abrir o modal de cadastro', erro);
    }
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
  const { fecharModalTotp, refsFormTotp } = await carregarApiModalTotp();
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

// Liga o listener do form de confirmação uma única vez. NÃO roda no
// escopo do módulo: nesse momento o settingsModal.html (onde vive o
// #totp-form-confirmar) ainda não foi injetado. É chamada por
// preencherTotp(), que o preencherPainelPerfil executa depois de
// modalConfiguracoesPronto. Idempotente (preencherTotp roda de novo
// após confirmar/remover).
async function ligarListenerFormularioTotp() {
  try {
    const { refsFormTotp } = await carregarApiModalTotp();
    const { form } = refsFormTotp();
    if (!form || form.dataset.listenerAtivo) return;
    form.dataset.listenerAtivo = 'true';
    form.addEventListener('submit', tratarSubmitConfirmarTOTP);
  } catch (erro) {
    console.error('TOTP: não foi possível ligar o formulário de confirmação', erro);
  }
}