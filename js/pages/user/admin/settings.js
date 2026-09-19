// ============================================
// B-íon — Modal de Configurações
// Save/Cancel agora é POR PAINEL (não global).
// Cada painel decide se participa do fluxo salvar/cancelar
// adicionando [data-savable] na sua <section class="settings-panel">.
// Painéis sem [data-savable] (ex: Segurança) nunca mostram a save-bar,
// pois cada ação lá (remover dispositivo, trocar senha) já é
// destrutiva/imediata e não passa por "salvar em lote".
// ============================================

import { exibirMensagem } from '../../../shared/feedback.js';
import {URL_BASE_API} from '../../../sharedConfig/urlConfig.js';
import { atualizarDesignCache, atualizarPreferenciasCache } from '../../../sharedConfig/userCache.js';
import { pedirConfirmacao, ConfirmacaoCanceladaError } from '../../../shared/stepUp.js';

const THEME_STORAGE_KEY = 'bion-theme';
const CONFIGURACAO_API_URL = URL_BASE_API +'/configuracoes/';

const FEEDBACK_SUCESSO_DURACAO_MS = 2500;
let feedbackTimeoutId = null;

// exibirMensagem faz feedback.className = tipo, sobrescrevendo TODA a
// classe do elemento (não só adicionando) -- isso apagaria a classe
// base "feedback-mensagem" do CSS. Como esse comportamento é
// compartilhado com login/onboarding e não queremos mexer nele aqui,
// reforçamos a classe base logo em seguida, só neste módulo.

function exibirFeedbackConfiguracoes(texto, tipo) {
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  exibirMensagem(texto, tipo);
  const el = document.getElementById('mensagemFeedback');
  if (el) el.classList.add('feedback-mensagem');
}

function limparFeedbackConfiguracoes() {
  const el = document.getElementById('mensagemFeedback');
  if (!el) return;
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId);
    feedbackTimeoutId = null;
  }
  el.textContent = '';
  el.className = 'feedback-mensagem';
}

/**
 * Mostra o feedback de sucesso e some sozinho depois de um tempo --
 * erro fica até o usuário agir (corrigir e salvar de novo, ou sair).
 */
function exibirFeedbackSucessoTemporario(texto) {
  exibirFeedbackConfiguracoes(texto, 'sucesso');
  if (feedbackTimeoutId !== null) clearTimeout(feedbackTimeoutId);
  feedbackTimeoutId = setTimeout(() => {
    feedbackTimeoutId = null;
    limparFeedbackConfiguracoes();
  }, FEEDBACK_SUCESSO_DURACAO_MS);
}


// ============================================
// Mapeamento entre os elementos [data-track] do painel Preferências
// (identificados pelo id do elemento, ver settingsModal.html) e a
// estrutura de configuracoes que a API espera (ver
// ConfiguracaoService.CONFIGURACOES_DEFAULT):
//   { design: { tema, tamanho_fonte }, preferencias: { linguagem } }
//
// f-idioma: <select> já tem value="pt-BR"/"en-US" no HTML -- envia
// o value direto, sem transformação.
//
// f-fonte: <input type="range" min="0" max="2">, não texto -- precisa
// converter o índice para o nome que o schema.py do backend espera.
// Se o range de opções mudar no HTML, ajustar este mapa junto.
// ============================================

const TAMANHO_FONTE_POR_INDICE = ['pequeno', 'medio', 'grande'];

/**
 * Monta o corpo de configuracoes no formato da API a partir do payload
 * plano { idDoElemento: valor, theme?: valor } usado internamente pelo
 * settings.js.
 */
function montarConfiguracoesParaApi(payloadPlano) {
  const configuracoes = { design: {}, preferencias: {} };

  if (payloadPlano.theme !== undefined) {
    configuracoes.design.tema = payloadPlano.theme;
  }

  if (payloadPlano['f-fonte'] !== undefined) {
    const indice = Number(payloadPlano['f-fonte']);
    const nome = TAMANHO_FONTE_POR_INDICE[indice];
    if (nome) configuracoes.design.tamanho_fonte = nome;
  }

  if (payloadPlano['f-idioma'] !== undefined) {
    configuracoes.preferencias.linguagem = [payloadPlano['f-idioma']];
  }

  // Remove seções que ficaram vazias (nada mapeado nelas)
  Object.keys(configuracoes).forEach(secao => {
    if (Object.keys(configuracoes[secao]).length === 0) delete configuracoes[secao];
  });

  return configuracoes;
}

/**
 * Envia as configurações atualizadas para a API.
 *
 * Retorna { ok: boolean, mensagem?: string }. Quem chama decide o que
 * fazer com a UI (reverter campos, manter save-bar visível, etc) --
 * esta função só cuida da chamada de rede e de extrair a mensagem de
 * erro que o backend manda (ver ConfiguracaoController/json_error).
 */
async function salvarConfiguracoesNaApi(payloadPlano) {
  const configuracoes = montarConfiguracoesParaApi(payloadPlano);
  if (Object.keys(configuracoes).length === 0) return { ok: true };

  try {
    const resposta = await fetch(CONFIGURACAO_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // front e API ficam em domínios/subdomínios diferentes -- 'same-origin' não enviaria o cookie httpOnly da sessão nesse caso
      body: JSON.stringify({ configuracoes }),
    });

    if (!resposta.ok) {
      // json_error retorna { success: false, message: "..." } -- ver
      // src/core/responses.py. Se o corpo não for esse formato (ex:
      // erro 500 sem JSON), cai no fallback genérico abaixo.
      let mensagem = 'Não foi possível salvar as configurações. Tente novamente.';
      try {
        const corpo = await resposta.json();
        if (corpo?.message) mensagem = corpo.message;
      } catch {
        // corpo não era JSON -- mantém a mensagem genérica
      }
      return { ok: false, mensagem };
    }

    return { ok: true };
  } catch (erro) {
    console.error('settings.js: erro de rede ao salvar configurações', erro);
    return {
      ok: false,
      mensagem: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
    };
  }
}

// ===== Abrir / fechar modal =====
const overlay = document.getElementById('settings-overlay');
const openBtn = document.getElementById('open-settings');
const closeBtn = document.getElementById('settings-close');

function openSettings() {
  overlay.classList.add('settings-overlay--visible');
  document.body.classList.add('no-scroll');
}

function closeSettings() {
  // Sair sem salvar descarta automaticamente as alterações do painel ativo
  revertActivePanel();
  limparFeedbackConfiguracoes();
  overlay.classList.remove('settings-overlay--visible');
  document.body.classList.remove('no-scroll');
}

openBtn.addEventListener('click', openSettings);
closeBtn.addEventListener('click', closeSettings);

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('settings-overlay--visible')) {
    closeSettings();
  }
});

// ===== Abas =====
const tabs = document.querySelectorAll('.settings-tab');
const panels = document.querySelectorAll('.settings-panel');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('settings-tab--active'));
    panels.forEach(p => p.classList.remove('settings-panel--active'));
    tab.classList.add('settings-tab--active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('settings-panel--active');
    // A save-bar reflete só o painel visível agora
    refreshSaveBarForActivePanel();
  });
});

function getActivePanel() {
  return document.querySelector('.settings-panel--active');
}

// ============================================
// Estado de "alterações pendentes" — por painel
// ============================================
const saveBar = document.getElementById('save-bar');

// Cada painel savable guarda seu próprio Map de valores iniciais
// e, se aplicável, sua própria escolha de tema pendente.
const panelState = new Map(); // panel element -> { initialValues: Map, initialTheme, pendingTheme }

document.querySelectorAll('.settings-panel[data-savable]').forEach(panel => {
  const trackedFields = panel.querySelectorAll('[data-track]');
  const initialValues = new Map();
  trackedFields.forEach(el => initialValues.set(el, el.value));

  const activeThemeBtn = panel.querySelector('.theme-option--active');

  panelState.set(panel, {
    initialValues,
    initialTheme: activeThemeBtn ? activeThemeBtn.dataset.themeOption : null,
    pendingTheme: null,
  });

  trackedFields.forEach(el => {
    el.addEventListener('input', () => refreshSaveBarForActivePanel());
    el.addEventListener('change', () => refreshSaveBarForActivePanel());
  });
});

function isPanelDirty(panel) {
  const state = panelState.get(panel);
  if (!state) return false;

  const trackedFields = panel.querySelectorAll('[data-track]');
  const fieldsDirty = [...trackedFields].some(el => el.value !== state.initialValues.get(el));
  const themeDirty = state.pendingTheme !== null && state.pendingTheme !== state.initialTheme;

  return fieldsDirty || themeDirty;
}

function refreshSaveBarForActivePanel() {
  const panel = getActivePanel();
  const savable = panel && panel.hasAttribute('data-savable');
  saveBar.classList.toggle('save-bar--visible', savable && isPanelDirty(panel));
}

// ===== Seleção de tema (aba Preferências) =====
document.querySelectorAll('.theme-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.settings-panel');
    const state = panelState.get(panel);
    if (!state) return;

    panel.querySelectorAll('.theme-option').forEach(b => b.classList.remove('theme-option--active'));
    btn.classList.add('theme-option--active');
    state.pendingTheme = btn.dataset.themeOption;
    document.documentElement.dataset.theme = state.pendingTheme; // preview imediato

    refreshSaveBarForActivePanel();
  });
});

// ===== Reverter apenas o painel ativo (Cancelar / fechar sem salvar) =====
function revertActivePanel() {
  const panel = getActivePanel();
  if (!panel || !panel.hasAttribute('data-savable')) return;

  const state = panelState.get(panel);
  if (!state) return;

  const trackedFields = panel.querySelectorAll('[data-track]');
  trackedFields.forEach(el => { el.value = state.initialValues.get(el); });

  if (state.pendingTheme !== null) {
    document.documentElement.dataset.theme = state.initialTheme;
    panel.querySelectorAll('.theme-option').forEach(b => {
      b.classList.toggle('theme-option--active', b.dataset.themeOption === state.initialTheme);
    });
    state.pendingTheme = null;
  }

  saveBar.classList.remove('save-bar--visible');
}

document.getElementById('btn-cancel').addEventListener('click', () => {
  revertActivePanel();
  limparFeedbackConfiguracoes();
});

// ===== Salvar — só afeta o painel ativo (hoje: Preferências) =====
const btnSave = document.getElementById('btn-save');

btnSave.addEventListener('click', async () => {
  const panel = getActivePanel();
  if (!panel || !panel.hasAttribute('data-savable')) return;

  const state = panelState.get(panel);
  if (!state) return;

  const trackedFields = panel.querySelectorAll('[data-track]');

  // Como o estado agora é por painel, o payload já sai isolado por contexto
  // (ex: só campos de Preferências), sem misturar com outras abas.
  const payload = {};
  trackedFields.forEach(el => { payload[el.id] = el.value; });
  if (state.pendingTheme !== null) payload.theme = state.pendingTheme;

  // Espera a API confirmar ANTES de aplicar como definitivo. Se der
  // erro (ex: valor fora do formato aceito), os campos continuam com
  // o que o usuário digitou e a save-bar continua visível -- ele pode
  // corrigir e tentar salvar de novo, sem perder o que já preencheu.
  btnSave.disabled = true;
  const resultado = await salvarConfiguracoesNaApi(payload);
  btnSave.disabled = false;

  if (!resultado.ok) {
    exibirFeedbackConfiguracoes(resultado.mensagem, 'erro');
    // Nota: o preview de tema (aplicado no clique do swatch, ver
    // sincronizarUiComTemaAtual/theme-option handler) NÃO é revertido
    // aqui de propósito -- o usuário ainda está com a save-bar aberta
    // e pode corrigir outro campo e tentar salvar de novo. Se ele
    // desistir, fechar o modal ou clicar Cancelar chama
    // revertActivePanel(), que aí sim desfaz o preview.
    return; // mantém campos e save-bar como estavam
  }

  trackedFields.forEach(el => state.initialValues.set(el, el.value));

  if (state.pendingTheme !== null) {
    state.initialTheme = state.pendingTheme;
    state.pendingTheme = null;
    localStorage.setItem(THEME_STORAGE_KEY, state.initialTheme);
  }

  // Reflete o que acabou de ser confirmado pela API também no
  // snapshot de sessionStorage (bion-dados-usuario), que
  // initHomePage.js relê em toda navegação de página e
  // preencherPainelPerfil.js trata como fonte de verdade.
  //
  // Sem isso, o valor salvo aqui fica correto no backend e em
  // localStorage (no caso do tema), mas a PRÓXIMA página lê o
  // snapshot velho do login via sessionStorage e "desfaz" a mudança
  // visualmente -- foi exatamente o bug observado com o tema antes
  // deste módulo existir. Usamos o mesmo payload já montado para a
  // API (montarConfiguracoesParaApi) para não duplicar a lógica de
  // mapeamento id-do-campo -> formato da API.
  const configuracoesAtualizadas = montarConfiguracoesParaApi(payload);
  if (configuracoesAtualizadas.design) {
    atualizarDesignCache(configuracoesAtualizadas.design);
  }
  if (configuracoesAtualizadas.preferencias) {
    atualizarPreferenciasCache(configuracoesAtualizadas.preferencias);
  }

  saveBar.classList.remove('save-bar--visible');
  exibirFeedbackSucessoTemporario('Configurações salvas com sucesso.');
});

// ============================================
// Sincroniza a UI do painel de Preferências com o tema já aplicado.
// O <html data-theme="..."> em si já foi setado o mais cedo possível
// por applyTheme.js (carregado no <head>, antes do primeiro paint --
// evita flash de tema errado enquanto este modal ainda está sendo
// buscado/injetado). Aqui só marcamos o swatch ativo certo e
// sincronizamos panelState, que dependem do modal já existir no DOM.
// ============================================
(function sincronizarUiComTemaAtual() {
  const atual = document.documentElement.dataset.theme;
  if (!atual) return;

  const prefsPanel = document.getElementById('panel-preferencias');
  if (!prefsPanel) return;

  prefsPanel.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('theme-option--active', b.dataset.themeOption === atual);
  });

  const state = panelState.get(prefsPanel);
  if (state) state.initialTheme = atual;
})();

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

// ============================================
// Modal de Alterar Senha (#senha-modal-overlay, ver settingsModal.html)
//
// Mesmo padrão do modal de TOTP acima: vive no mesmo partial de
// #settings-overlay, então já está garantido no DOM neste ponto.
// Diferente do TOTP, aqui a ação em si (trocar a senha) exige
// reconfirmação de identidade via pedirConfirmacao() (step-up) antes
// de chamar a API -- ver ../../../shared/stepUp.js. A string de ação
// usada é "alterar_senha", a mesma do decorator
// @acao_sensivel(acao="alterar_senha", ...) no controller.
//
// Validação de força de senha (12+ caracteres) é feita aqui client-
// side só para dar feedback rápido -- a validação real (força,
// repetição da senha atual) é sempre do backend, e qualquer erro que
// ele devolver é mostrado cru no modal.
// ============================================

const SENHA_MIN_CARACTERES = 12;

const senhaOverlay = document.getElementById('senha-modal-overlay');
const senhaBtnAbrir = document.getElementById('btn-alterar-senha');
const senhaBtnFechar = document.getElementById('senha-modal-close');
const senhaBtnCancelar = document.getElementById('btn-cancelar-senha');
const senhaForm = document.getElementById('senha-form');
const senhaInputNova = document.getElementById('senha-nova');
const senhaInputConfirmar = document.getElementById('senha-confirmar');
const senhaErroEl = document.getElementById('senha-erro');
const senhaBtnConfirmar = document.getElementById('btn-confirmar-senha');

function abrirModalSenha() {
  if (!senhaOverlay) return;
  senhaErroEl.textContent = '';
  senhaInputNova.value = '';
  senhaInputConfirmar.value = '';
  senhaOverlay.classList.add('senha-modal-overlay--visible');
  document.body.classList.add('no-scroll');
  senhaInputNova.focus();
}

function fecharModalSenha() {
  if (!senhaOverlay) return;
  senhaOverlay.classList.remove('senha-modal-overlay--visible');
  document.body.classList.remove('no-scroll');
}

function mostrarErroSenha(mensagem) {
  senhaErroEl.textContent = mensagem;
}

senhaBtnAbrir?.addEventListener('click', abrirModalSenha);
senhaBtnFechar?.addEventListener('click', fecharModalSenha);
senhaBtnCancelar?.addEventListener('click', fecharModalSenha);
senhaOverlay?.addEventListener('click', (e) => {
  if (e.target === senhaOverlay) fecharModalSenha();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && senhaOverlay?.classList.contains('senha-modal-overlay--visible')) {
    fecharModalSenha();
  }
});

senhaForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const senhaNova = senhaInputNova.value;
  const senhaConfirmar = senhaInputConfirmar.value;

  mostrarErroSenha('');

  // Validação client-side: só um pré-filtro rápido -- força de senha
  // de verdade (padrões, sequências etc) é sempre revalidada pelo
  // backend (ver validar_senha em schema_usuario.py).
  if (senhaNova.length < SENHA_MIN_CARACTERES) {
    mostrarErroSenha(`A senha precisa ter pelo menos ${SENHA_MIN_CARACTERES} caracteres.`);
    return;
  }
  if (senhaNova !== senhaConfirmar) {
    mostrarErroSenha('As senhas não coincidem.');
    return;
  }

  let token;
  try {
    token = await pedirConfirmacao('alterar_senha');
  } catch (erro) {
    if (erro instanceof ConfirmacaoCanceladaError) return; // usuário desistiu, sem erro no modal
    mostrarErroSenha(erro.message || 'Não foi possível confirmar sua identidade.');
    return;
  }

  senhaBtnConfirmar.disabled = true;
  try {
    const resposta = await fetch(`${URL_BASE_API}/usuarios/senha`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Stepup-Token': token,
      },
      credentials: 'include',
      body: JSON.stringify({ senha_nova: senhaNova }),
    });

    let corpo = null;
    try {
      corpo = await resposta.json();
    } catch {
      // corpo pode vir vazio em alguns erros -- segue com mensagem genérica
    }

    if (!resposta.ok) {
      mostrarErroSenha(corpo?.message || 'Não foi possível alterar a senha. Tente novamente.');
      return;
    }

    fecharModalSenha();
    exibirFeedbackSucessoTemporario(corpo?.message || 'Senha alterada com sucesso.');
  } catch (erro) {
    console.error('settings.js: erro de rede ao alterar senha', erro);
    mostrarErroSenha('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  } finally {
    senhaBtnConfirmar.disabled = false;
  }
});