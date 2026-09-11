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

import { registrarNovoDispositivo, ErroRegistroDispositivo, removerDispositivoWebAuthn, ErroRemocaoDispositivo } from './webauthn.js';
import { atualizarCredenciaisWebauthnCache } from './userCache.js';

const THEME_STORAGE_KEY = 'bion-theme';

/**
 * Preenche toda a UI de perfil a partir do payload de /me.
 * @param {{ usuario: object, configuracoes: object, webauthn: object }} dados
 */
export function preencherPainelPerfil(dados) {
  const { usuario, configuracoes, webauthn } = dados;

  preencherIdentidade(usuario);
  preencherDadosInstitucionais(usuario);
  preencherDispositivos(webauthn);
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