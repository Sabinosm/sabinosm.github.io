//
// Lista de dispositivos WebAuthn da aba Segurança: renderização,
// cadastro e remoção.

import {
  registrarNovoDispositivo,
  ErroRegistroDispositivo,
  removerDispositivoWebAuthn,
  ErroRemocaoDispositivo,
} from '../../pages/auth/webauthn.js';
import { atualizarCredenciaisWebauthnCache } from '../userCache.js';

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

export function preencherDispositivos(webauthn) {
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