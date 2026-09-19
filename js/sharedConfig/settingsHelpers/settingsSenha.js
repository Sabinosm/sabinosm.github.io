import { URL_BASE_API } from '../urlConfig.js';
import { pedirConfirmacao, ConfirmacaoCanceladaError } from '../stepup.js';
import { exibirFeedbackSucessoTemporario } from './settingsFeedback.js';

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
    console.error('settingsSenha.js: erro de rede ao alterar senha', erro);
    mostrarErroSenha('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  } finally {
    senhaBtnConfirmar.disabled = false;
  }
});