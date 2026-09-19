// ============================================
// Modal de cadastro de TOTP (#totp-modal-overlay, ver settingsModal.html)
//
// Este modal vive no mesmo partial de #settings-overlay e por isso já
// está garantido no DOM neste ponto (settingsLoader.js só importa este
// módulo DEPOIS de injetar o HTML) -- por isso os elementos podem ser
// resolvidos direto aqui embaixo, sem precisar de nenhuma Promise de
// "carregado" separada nem de um loader/import à parte.
//
// A lógica de negócio do cadastro (chamar iniciarCadastroTOTP /
// confirmarCadastroTOTP, atualizar cache, atualizar o painel
// resumo/aviso de redundância) continua em preencherTotp.js -- este
// módulo só cuida do modal em si (abrir, fechar, trocar entre os
// estados carregando/pronto/erro, esperar a lib QRCode). Exportamos
// as funções que preencherTotp.js precisa chamar, e ele nos passa de
// volta os callbacks que rodam com o resultado.
// ============================================

const totpOverlay = document.getElementById('totp-modal-overlay');
const totpBtnFechar = document.getElementById('totp-modal-close');
const totpPainelCarregando = document.getElementById('totp-modal-carregando');
const totpPainelPronto = document.getElementById('totp-modal-pronto');
const totpPainelErroInicial = document.getElementById('totp-modal-erro-inicial');
const totpErroInicialTexto = document.getElementById('totp-erro-inicial-texto');
const totpBtnTentarNovamente = document.getElementById('btn-tentar-novamente-totp');
const totpQrContainer = document.getElementById('totp-qrcode-container');
const totpSecretTexto = document.getElementById('totp-secret-texto');
const totpErroEl = document.getElementById('totp-cadastro-erro');
const totpForm = document.getElementById('totp-form-confirmar');
const totpInputCodigo = document.getElementById('totp-codigo-confirmacao');
const totpBtnCancelar = document.getElementById('btn-cancelar-cadastro-totp');

// Guarda o callback de "iniciar cadastro" fornecido por
// preencherTotp.js em abrirModalTotp() -- usado tanto na abertura
// quanto pelo botão "Tentar novamente".
let totpOnIniciar = null;

/**
 * Abre o modal de TOTP e chama `onIniciar` para buscar o QR/secret.
 *
 * @param {() => Promise<{otpauth_uri: string, secret_texto: string}>} onIniciar
 *   Chamado para efetivamente iniciar o cadastro (ex: iniciarCadastroTOTP()
 *   de totp.js) -- preencherTotp.js decide como buscar os dados, este
 *   módulo só decide o que fazer com eles na UI.
 * @param {(erro: unknown) => string} onErroIniciar
 *   Chamado se `onIniciar` rejeitar, para extrair a mensagem a exibir.
 */
export async function abrirModalTotp(onIniciar, onErroIniciar) {
  if (!totpOverlay) {
    console.error('#totp-modal-overlay não encontrado -- settingsModal.html está desatualizado?');
    return;
  }

  totpOnIniciar = { onIniciar, onErroIniciar };

  totpOverlay.classList.add('totp-modal-overlay--visible');
  document.body.classList.add('no-scroll');

  await executarIniciarCadastro();
}

export function fecharModalTotp() {
  if (!totpOverlay) return;
  totpOverlay.classList.remove('totp-modal-overlay--visible');
  document.body.classList.remove('no-scroll');
}

/** Elementos do form de confirmação, para preencherTotp.js ligar seu próprio submit. */
export function refsFormTotp() {
  return { form: totpForm, inputCodigo: totpInputCodigo, erroEl: totpErroEl };
}

async function executarIniciarCadastro() {
  if (!totpOnIniciar) return;
  const { onIniciar, onErroIniciar } = totpOnIniciar;

  totpErroEl.textContent = '';
  totpInputCodigo.value = '';
  totpQrContainer.innerHTML = '';
  totpSecretTexto.textContent = '';

  totpPainelErroInicial.hidden = true;
  totpPainelPronto.hidden = true;
  totpPainelCarregando.hidden = false;

  let dados;
  try {
    dados = await onIniciar();
  } catch (erro) {
    console.error('Falha ao iniciar cadastro TOTP', erro);
    totpPainelCarregando.hidden = true;
    totpPainelErroInicial.hidden = false;
    totpErroInicialTexto.textContent = onErroIniciar(erro);
    return;
  }

  totpPainelCarregando.hidden = true;
  totpPainelPronto.hidden = false;

  // Não bloqueia o texto do secret nem o foco do input -- o usuário já
  // pode começar a digitar manualmente enquanto o QR (se demorar)
  // ainda está sendo esperado.
  renderizarQrCodeTotp(totpQrContainer, dados.otpauth_uri).catch((erro) => {
    console.error('Falha inesperada ao renderizar QR code TOTP', erro);
  });
  totpSecretTexto.textContent = `Ou digite manualmente: ${dados.secret_texto}`;
  totpInputCodigo.focus();
}

/**
 * Espera a lib `qrcode` (window.QRCode) ficar disponível, até um
 * limite de tempo, em vez de desistir na primeira checagem -- a lib é
 * carregada via <script> de CDN na página host, um caminho
 * desacoplado da cadeia de módulos deste modal, então não há garantia
 * de que já esteja pronta no instante em que o usuário clica em
 * "Configurar". Se ela realmente não chegar a tempo, mostramos aviso
 * visível (não só no console) -- o secret em texto sozinho é fácil de
 * passar despercebido.
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

async function renderizarQrCodeTotp(container, otpauthUri) {
  const disponivel = await aguardarLibQrCode();

  if (!disponivel) {
    console.warn('Lib QRCode não carregou a tempo -- cadastro TOTP seguirá só com o secret em texto.');
    totpErroEl.textContent = 'Não foi possível carregar o QR code agora -- use o código abaixo para configurar manualmente, ou recarregue a página e tente de novo.';
    return;
  }

  new window.QRCode(container, {
    text: otpauthUri,
    width: 180,
    height: 180,
  });
}

totpBtnFechar?.addEventListener('click', fecharModalTotp);
totpBtnCancelar?.addEventListener('click', fecharModalTotp);
totpOverlay?.addEventListener('click', (e) => {
  if (e.target === totpOverlay) fecharModalTotp();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && totpOverlay?.classList.contains('totp-modal-overlay--visible')) {
    fecharModalTotp();
  }
});
totpBtnTentarNovamente?.addEventListener('click', executarIniciarCadastro);