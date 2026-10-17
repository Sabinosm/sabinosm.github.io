// PreencherAvatar.js
//
// Foto de perfil do usuário: exibe, envia e remove, mantendo o
// snapshot de sessão (userCache.js) sempre em dia.
//
// Fluxo de leitura (aplicarAvatar):
//   1. dados.usuario.avatar_url JÁ veio no /me (string ou null) -> usa
//      direto, ZERO chamadas à API. É o caminho normal.
//   2. Campo ausente (snapshot antigo, de antes do campo existir) ->
//      1 único GET /avatar, e o resultado é gravado no cache, então
//      as próximas navegações caem no caso 1.
//
// Sem foto (null), nada muda na tela: continua o avatar de iniciais
// que o próprio app gera. Com foto, ela vira o background-image do
// próprio círculo de avatar e as iniciais ficam transparentes (o
// elemento de iniciais É o círculo, então nenhum nó novo é criado e
// preencherIdentidade pode seguir reescrevendo o textContent sem
// apagar a foto). Se a imagem falhar ao carregar, as iniciais voltam.

import { URL_BASE_API } from './urlConfig.js';
import { atualizarAvatarCache } from './userCache.js';

// Prefixo do blueprint "usuario" -- ajuste aqui se o register_blueprint
// usar outro url_prefix.
const ENDPOINT_AVATAR = `${URL_BASE_API}/usuarios/avatar`;

// Elementos de avatar (sidebar e modal) -- cada um é o círculo que
// mostra as iniciais.
const IDS_INICIAIS = ['nav-avatar-iniciais', 'user-avatar-iniciais'];
const ID_BTN_REMOVER = 'btn-remover-foto';

// Evita duas consultas simultâneas ao servidor na mesma página.
let consultaEmAndamento = null;

function limparFoto(el) {
  // Sem foto: volta ao avatar de iniciais gerado pelo app.
  el.style.backgroundImage = '';
  el.style.backgroundSize = '';
  el.style.backgroundPosition = '';
  el.style.color = '';
  delete el.dataset.avatarUrl;
}

function renderizar(url) {
  IDS_INICIAIS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (!url) {
      limparFoto(el);
      return;
    }

    // Pré-carrega: só troca as iniciais pela foto se a imagem de fato
    // existir (arquivo apagado do bucket, rede fora -> iniciais ficam).
    // O dataset evita que uma resposta antiga sobrescreva uma troca
    // mais recente de foto.
    el.dataset.avatarUrl = url;
    const teste = new Image();
    teste.onload = () => {
      if (el.dataset.avatarUrl !== url) return;
      el.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.color = 'transparent'; // esconde as iniciais sem mexer no texto
    };
    teste.onerror = () => {
      if (el.dataset.avatarUrl === url) limparFoto(el);
    };
    teste.src = url;
  });

  // "Remover foto" só aparece quando existe foto para remover.
  const btnRemover = document.getElementById(ID_BTN_REMOVER);
  if (btnRemover) btnRemover.hidden = !url;
}

async function buscarDoServidor() {
  if (!consultaEmAndamento) {
    consultaEmAndamento = fetch(ENDPOINT_AVATAR, { method: 'GET', credentials: 'include' })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`GET /avatar respondeu ${resp.status}`);
        const corpo = await resp.json();
        return (corpo.data ?? corpo).url ?? null;
      })
      .finally(() => {
        consultaEmAndamento = null;
      });
  }
  return consultaEmAndamento;
}

async function lerErro(resp, padrao) {
  try {
    const corpo = await resp.json();
    return corpo.message || corpo.error || padrao;
  } catch {
    return padrao;
  }
}

/**
 * Exibe a foto de perfil, se houver. Chamada por preencherPainelPerfil
 * com `dados.usuario`. Nunca lança: se a consulta de fallback falhar,
 * o avatar de iniciais continua e o cache não é alterado (a próxima
 * página tenta de novo).
 */
export async function aplicarAvatar(usuario) {
  if (!usuario) return;

  if ('avatar_url' in usuario) {
    renderizar(usuario.avatar_url || null);
    return;
  }

  try {
    const url = await buscarDoServidor();
    atualizarAvatarCache(url);
    renderizar(url);
  } catch (erro) {
    console.error('avatar: não foi possível consultar a foto de perfil', erro);
  }
}

/**
 * Envia uma nova foto (POST /avatar, campo "file"), grava a URL no
 * cache e atualiza a tela. Lança Error com a mensagem do backend se
 * falhar (ex: arquivo acima de 4MB).
 *
 * @param {File} arquivo
 * @returns {Promise<string|null>} a nova URL pública
 */
export async function enviarAvatar(arquivo) {
  const form = new FormData();
  form.append('file', arquivo);

  const resp = await fetch(ENDPOINT_AVATAR, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  if (!resp.ok) throw new Error(await lerErro(resp, 'Não foi possível enviar a foto.'));

  const corpo = await resp.json();
  const url = (corpo.data ?? corpo).avatar_url ?? null;

  atualizarAvatarCache(url);
  renderizar(url);
  return url;
}

/**
 * Remove a foto (DELETE /avatar). Grava `null` no cache -- "sem foto,
 * já consultado" -- e volta ao avatar de iniciais. Um 404 (já não
 * havia foto) também é tratado como sucesso.
 */
export async function removerAvatar() {
  const resp = await fetch(ENDPOINT_AVATAR, { method: 'DELETE', credentials: 'include' });

  if (!resp.ok && resp.status !== 404) {
    throw new Error(await lerErro(resp, 'Não foi possível remover a foto.'));
  }

  atualizarAvatarCache(null);
  renderizar(null);
}