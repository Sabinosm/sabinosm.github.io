// preencherPainelPerfil.js
//
// Preenche a UI (sidebar + modal de configurações) com os dados
// retornados por /me: { usuario, configuracoes, webauthn }.
//
// Não busca dado nenhum sozinho -- recebe o payload já pronto (seja
// vindo de sessionStorage, salvo pelo afterLogin.js após o /me, seja
// de um fetch direto). Mantém a lógica de "onde exibir o quê" isolada
// da lógica de "como buscar".

const ICONES_DISPOSITIVO = {
  mobile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <rect x="5" y="2" width="14" height="20" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11 18h2" stroke-linecap="round"/>
  </svg>`,
  usb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <path d="M12 2v10" stroke-linecap="round"/>
    <path d="M8 8l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="9" y="12" width="6" height="8" rx="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  desktop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <rect x="2" y="4" width="20" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 21h8M12 18v3" stroke-linecap="round"/>
  </svg>`,
};

// Fallback para tipos que a API venha a introduzir sem o front ainda
// conhecer -- evita quebrar a lista inteira por causa de um item.
const ICONE_GENERICO = ICONES_DISPOSITIVO.desktop;

import { registrarNovoDispositivo, ErroRegistroDispositivo, removerDispositivoWebAuthn, ErroRemocaoDispositivo } from '../pages/auth/webauthn.js';
import { iniciarCadastroTOTP, confirmarCadastroTOTP, removerTOTP, ErroCadastroTOTP } from '../pages/auth/totp.js';
import { atualizarCredenciaisWebauthnCache, atualizarTotpCache } from './userCache.js';

const THEME_STORAGE_KEY = 'bion-theme';

/**
 * Preenche toda a UI de perfil a partir do payload de /me.
 * @param {{ usuario: object, configuracoes: object, webauthn: object, totp: object|null }} dados
 */
export function preencherPainelPerfil(dados) {
  const { usuario, configuracoes, webauthn, totp } = dados;

  preencherIdentidade(usuario);
  preencherDadosInstitucionais(usuario);
  preencherDispositivos(webauthn);
  preencherTotp(totp);
  atualizarAvisoUnicoFator(webauthn, totp);
  preencherTema(configuracoes);
}

/**
 * Sincroniza o tema com o valor vindo do payload (sessionStorage,
 * ver USER_CACHE_KEY em userCache.js -- este payload É o snapshot de
 * /me, não um fetch novo).
 *
 * themeLoader.js já aplicou o tema salvo em localStorage antes do
 * primeiro paint (evita FOUC). Aqui, sobrescrevemos com o valor do
 * snapshot -- cobre o caso de o usuário ter mudado o tema em outro
 * dispositivo/sessão desde a última vez que este navegador salvou
 * algo em localStorage.
 *
 * IMPORTANTE: desde a introdução de userCache.js, qualquer save de
 * configurações bem-sucedido (ver settings.js) já atualiza este
 * mesmo snapshot via atualizarDadosUsuarioCache(). Isso garante que
 * o `tema` lido aqui nunca fica "atrás" de uma mudança que o usuário
 * acabou de salvar na aba Preferências -- se ficar, o bug está na
 * gravação (settings.js não chamou atualizarDadosUsuarioCache), não
 * aqui.
 *
 * Se o valor do snapshot for igual ao que já está aplicado, isso é
 * essencialmente um no-op visual (sem flash).
 */
function preencherTema(configuracoes) {
  const tema = configuracoes?.design?.tema;
  if (!tema) return;

  document.documentElement.dataset.theme = tema;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, tema);
  } catch {
    // localStorage indisponível (modo privado restritivo, etc.) --
    // o tema ainda fica aplicado via data-theme nesta sessão.
  }

  sincronizarSwatchDoModal(tema);
}

/**
 * Se o modal de Configurações já estiver no DOM (settingsLoader.js já
 * rodou), marca o swatch de tema ativo e atualiza o initialTheme do
 * panelState do settings.js, para não aparecer como "alteração
 * pendente" na save-bar por causa de uma diferença que já veio
 * resolvida da API.
 *
 * Se o modal ainda não existir (ordem entre settingsLoader.js e este
 * módulo não é garantida), não faz nada aqui -- a auto-sincronização
 * que já existe em settings.js (sincronizarUiComTemaAtual, que roda
 * ao final do módulo) cobre esse caso lendo o data-theme já setado
 * acima.
 */
function sincronizarSwatchDoModal(tema) {
  const prefsPanel = document.getElementById('panel-preferencias');
  if (!prefsPanel) return;

  prefsPanel.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('theme-option--active', b.dataset.themeOption === tema);
  });
}

function iniciais(nomeCompleto) {
  if (!nomeCompleto) return '';
  const partes = nomeCompleto.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

function preencherIdentidade(usuario) {
  const sigla = iniciais(usuario.nome_completo);

  const navAvatar = document.getElementById('nav-avatar-iniciais');
  const navNome = document.getElementById('nav-nome-usuario');
  const userAvatar = document.getElementById('user-avatar-iniciais');
  const fNome = document.getElementById('f-nome');
  const fTelefone = document.getElementById('f-telefone');

  if (navAvatar) navAvatar.textContent = sigla;
  if (navNome) navNome.textContent = usuario.nome_completo ?? '';
  if (userAvatar) userAvatar.textContent = sigla;
  if (fNome) fNome.value = usuario.nome_completo ?? '';
  if (fTelefone) fTelefone.value = usuario.telefone ?? '';
}

function preencherDadosInstitucionais(usuario) {
  const crm = document.getElementById('user-crm');
  const email = document.getElementById('user-email');
  const login = document.getElementById('user-login');

  // CRM não está no dict de usuário atual (to_dict não lista esse
  // campo) -- deixa só a tag institucional até existir no backend.
  // Ajuste aqui quando o campo for exposto.
  if (crm && usuario.crm) {
    crm.prepend(document.createTextNode(usuario.crm + ' '));
  }

  if (email) email.prepend(document.createTextNode((usuario.email ?? '') + ' '));
  if (login) login.textContent = usuario.user_login ?? '';
}

function preencherDispositivos(webauthn) {
  const lista = document.getElementById('device-list');
  if (!lista) return;

  lista.innerHTML = '';

  const credenciais = webauthn?.credenciais ?? [];

  if (credenciais.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'field-hint';
    vazio.textContent = 'Nenhum dispositivo cadastrado ainda.';
    lista.appendChild(vazio);
  } else {
    credenciais.forEach(cred => {
      lista.appendChild(criarDeviceItem(cred));
    });
  }

  configurarBotaoAdicionarDispositivo();
}

/**
 * Liga o listener do botão "+ Adicionar novo dispositivo".
 *
 * `preencherDispositivos` roda toda vez que o payload de perfil é
 * (re)aplicado -- inclusive depois de um cadastro bem-sucedido, pra
 * re-renderizar a lista. `dataset.listenerAtivo` evita empilhar um
 * novo listener a cada uma dessas chamadas (o que faria o clique
 * disparar o fluxo de cadastro múltiplas vezes).
 */
function configurarBotaoAdicionarDispositivo() {
  const botao = document.getElementById('btn-add-device');
  if (!botao || botao.dataset.listenerAtivo) return;
  botao.dataset.listenerAtivo = 'true';

  botao.addEventListener('click', () => tratarCliqueAdicionarDispositivo(botao));
}

// ============================================
// TOTP (aplicativo autenticador)
// ============================================

/**
 * Alterna entre os estados "não configurado" / "configurado" da seção
 * TOTP, a partir do payload de /me (`totp: null` ou `totp: {...}`).
 */
function preencherTotp(totp) {
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

/**
 * ALTERADO: substitui atualizarAvisoRedundancia2fa (versão anterior,
 * baseada no conceito de "2FA vira obrigatório com 2+ fatores", que
 * não existe mais -- ver mfa.py). 2FA já é sempre obrigatório desde o
 * onboarding, então não há mais nada a "ativar" cadastrando um segundo
 * fator.
 *
 * O que ainda vale avisar: se o usuário tem EXATAMENTE 1 fator (1
 * WebAuthn XOR TOTP confirmado), esse é o único que existe -- o
 * backend bloqueia removê-lo sem antes cadastrar outro (ver
 * webauthn_2fa.py::remover_credencial e totp_2fa.py::remover_totp,
 * ambos retornam 409 nesse caso). O aviso aqui é só informativo, o
 * bloqueio de verdade acontece no backend -- mas evita o usuário
 * clicar em "Remover" sem saber por que vai falhar.
 */
function atualizarAvisoUnicoFator(webauthn, totp) {
  const aviso = document.getElementById('aviso-unico-fator');
  if (!aviso) return;

  const qtdWebauthn = webauthn?.credenciais?.length ?? 0;
  const temTotp = Boolean(totp?.confirmado);
  const totalFatores = qtdWebauthn + (temTotp ? 1 : 0);

  const exatamenteUmFator = totalFatores === 1;

  aviso.hidden = !exatamenteUmFator;
  if (exatamenteUmFator) {
    aviso.textContent = temTotp
      ? 'Este é seu único método de confirmação em duas etapas. Para removê-lo, cadastre antes uma chave de segurança (WebAuthn).'
      : 'Este é seu único método de confirmação em duas etapas. Para removê-lo, cadastre antes o aplicativo autenticador.';
  }
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

  renderizarQrCode(qrContainer, dados.otpauth_uri);
  secretTexto.textContent = `Ou digite manualmente: ${dados.secret_texto}`;
  inputCodigo.focus();
}

/**
 * Renderiza o QR code a partir da URI otpauth:// usando a lib
 * `qrcode` (window.QRCode) carregada via CDN. Se a lib não estiver
 * disponível por algum motivo, cai no texto do secret como única via
 * (já mostrado em #totp-secret-texto) -- não quebra o fluxo.
 */
function renderizarQrCode(container, otpauthUri) {
  if (typeof window.QRCode === 'undefined') {
    console.warn('Lib QRCode não carregada -- cadastro TOTP seguirá só com o secret em texto.');
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
ligarListenersFormularioTotp();

function ligarListenersFormularioTotp() {
  const form = document.getElementById('totp-form-confirmar');
  const btnCancelar = document.getElementById('btn-cancelar-cadastro-totp');
  form?.addEventListener('submit', tratarSubmitConfirmarTOTP);
  btnCancelar?.addEventListener('click', tratarCancelarCadastroTOTP);
}

/**
 * Pede o apelido do dispositivo, dispara o fluxo de registro
 * WebAuthn e, em caso de sucesso, sincroniza tanto a UI (lista de
 * dispositivos) quanto o snapshot em sessionStorage (userCache.js) --
 * do contrário o dispositivo apareceria só até a próxima navegação
 * de página, que releria o /me antigo do cache.
 *
 * TODO: substituir o window.prompt por um campo de texto real no
 * modal (e talvez um seletor de "tipo" de dispositivo) quando houver
 * tempo para desenhar essa UI -- por ora é o mínimo pra fechar o
 * fluxo ponta a ponta.
 */
async function tratarCliqueAdicionarDispositivo(botao) {
  const apelido = window.prompt(
    'Como quer chamar este dispositivo? (ex: "Notebook do trabalho")'
  );
  if (!apelido || !apelido.trim()) return;

  const textoOriginal = botao.textContent;
  botao.disabled = true;
  botao.textContent = 'Aguardando confirmação...';

  try {
    const { webauthn } = await registrarNovoDispositivo(apelido.trim(), 'desktop');
    atualizarCredenciaisWebauthnCache(webauthn.credenciais);
    preencherDispositivos(webauthn);
  } catch (erro) {
    console.error('Falha ao cadastrar dispositivo WebAuthn', erro);
    window.alert(
      erro instanceof ErroRegistroDispositivo
        ? erro.message
        : 'Não foi possível cadastrar o dispositivo.'
    );
  } finally {
    botao.disabled = false;
    botao.textContent = textoOriginal;
  }
}

function criarDeviceItem(cred) {
  const item = document.createElement('div');
  item.className = 'device-item';
  item.dataset.idCredencial = cred.id_credencial;

  const icone = document.createElement('div');
  icone.className = 'device-icon';
  icone.innerHTML = ICONES_DISPOSITIVO[cred.tipo] ?? ICONE_GENERICO;

  const info = document.createElement('div');
  info.className = 'device-info';

  const nome = document.createElement('p');
  nome.className = 'device-name';
  nome.textContent = cred.apelido;

  const meta = document.createElement('p');
  meta.className = 'device-meta';
  // Só "Adicionado em" -- a API não retorna último uso.
  meta.textContent = `Adicionado em ${cred.criado_em}`;

  info.append(nome, meta);

  const remover = document.createElement('button');
  remover.className = 'btn-ghost btn-ghost--sm';
  remover.textContent = 'Remover';
  remover.addEventListener('click', () => removerDispositivo(cred, item, remover));

  item.append(icone, info, remover);
  return item;
}

/**
 * Remove um dispositivo: confirma com o usuário, chama o backend
 * (removerDispositivoWebAuthn), e em caso de sucesso sincroniza tanto
 * a UI (re-renderiza a lista com preencherDispositivos) quanto o
 * snapshot em sessionStorage (atualizarCredenciaisWebauthnCache) --
 * mesmo cuidado já tomado em tratarCliqueAdicionarDispositivo, pra não
 * "voltar" o dispositivo removido na próxima navegação de página.
 *
 * Ação imediata, sem passar pela save-bar -- mesmo padrão já adotado
 * pro cadastro (ver comentário em settings.js sobre a aba Segurança).
 */
async function removerDispositivo(cred, elementoItem, botaoRemover) {
  const confirmou = window.confirm(
    `Remover "${cred.apelido}"? Você precisará cadastrar este dispositivo de novo para voltar a usá-lo no login.`
  );
  if (!confirmou) return;

  const textoOriginal = botaoRemover.textContent;
  botaoRemover.disabled = true;
  botaoRemover.textContent = 'Removendo...';

  try {
    const { webauthn } = await removerDispositivoWebAuthn(cred.id_credencial);
    atualizarCredenciaisWebauthnCache(webauthn.credenciais);
    preencherDispositivos(webauthn);
  } catch (erro) {
    console.error('Falha ao remover dispositivo WebAuthn', erro);
    window.alert(
      erro instanceof ErroRemocaoDispositivo
        ? erro.message
        : 'Não foi possível remover o dispositivo.'
    );
    botaoRemover.disabled = false;
    botaoRemover.textContent = textoOriginal;
  }
}