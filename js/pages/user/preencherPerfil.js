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
 * Sincroniza o tema com o valor vindo da API (fonte de verdade).
 *
 * themeLoader.js já aplicou o tema salvo em localStorage antes do
 * primeiro paint (evita FOUC). Aqui, assim que o payload de /me chega,
 * sobrescrevemos com o valor oficial da API -- cobre o caso de o
 * usuário ter mudado o tema em outro dispositivo/sessão desde a
 * última vez que este navegador salvou algo em localStorage.
 *
 * Se o valor da API for igual ao que já está aplicado, isso é
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
    return;
  }

  credenciais.forEach(cred => {
    lista.appendChild(criarDeviceItem(cred));
  });
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
  remover.addEventListener('click', () => removerDispositivo(cred.id_credencial, item));

  item.append(icone, info, remover);
  return item;
}

function removerDispositivo(idCredencial, elementoItem) {
  // TODO: chamar o endpoint de remoção de credencial WebAuthn aqui
  // (ação imediata, sem passar pela save-bar -- ver comentário em
  // settings.js sobre a aba Segurança).
  console.log('Remover credencial', idCredencial);
}