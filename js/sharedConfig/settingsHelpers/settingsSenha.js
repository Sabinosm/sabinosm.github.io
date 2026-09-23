import { URL_BASE_API } from '../urlConfig.js';
import { pedirConfirmacao, ConfirmacaoCanceladaError } from '../stepup.js';
import { exibirFeedbackSucessoTemporario } from './settingsFeedback.js';
import { ativarTogglesSenha } from '../passwordToggle.js';
import { validarSenha } from '../passwordValidation.js';

// ============================================
// Modal de Alterar Senha (#senha-modal-overlay, ver settingsModal.html)
//
// Mesmo padrão do modal de TOTP acima: vive no mesmo partial de
// #settings-overlay, então já está garantido no DOM neste ponto.
// Diferente do TOTP, aqui a ação em si (trocar a senha) exige
// reconfirmação de identidade via pedirConfirmacao() (step-up) --
// ver ../../../shared/stepUp.js. A string de ação usada é
// "alterar_senha", a mesma do decorator
// @acao_sensivel(acao="alterar_senha", ...) no controller.
//
// ALTERADO: o step-up agora acontece ANTES de abrir o form de nova
// senha (no clique de #btn-alterar-senha), não mais no submit. O
// token fica guardado em senhaStepupToken e é reaproveitado no PUT.
// Atenção: isso alarga a janela entre a confirmação de identidade e
// o uso do token -- se o usuário deixar o form de senha aberto sem
// enviar, o token pode expirar antes do submit; ver TTL de
// @acao_sensivel no backend e tratar a expiração no catch do fetch
// abaixo se necessário.
//
// Validação de força de senha (12+ caracteres) é feita aqui client-
// side só para dar feedback rápido -- a validação real (força,
// repetição da senha atual) é sempre do backend, e qualquer erro que
// ele devolver é mostrado cru no modal.
// ============================================

const senhaOverlay = document.getElementById('senha-modal-overlay');
const senhaBtnAbrir = document.getElementById('btn-alterar-senha');
const senhaBtnFechar = document.getElementById('senha-modal-close');
const senhaBtnCancelar = document.getElementById('btn-cancelar-senha');
const senhaForm = document.getElementById('senha-form');
const senhaInputNova = document.getElementById('senha-nova');
const senhaInputConfirmar = document.getElementById('senha-confirmar');
const senhaErroEl = document.getElementById('senha-erro');
const senhaBtnConfirmar = document.getElementById('btn-confirmar-senha');

ativarTogglesSenha([senhaInputNova, senhaInputConfirmar]);

// Token do step-up, obtido no clique de "Alterar senha" e consumido
// no submit do form. Null enquanto não há confirmação válida pendente.
let senhaStepupToken = null;

async function iniciarFluxoSenha() {
  senhaBtnAbrir.disabled = true;
  try {
    senhaStepupToken = await pedirConfirmacao('alterar_senha');
  } catch (erro) {
    if (!(erro instanceof ConfirmacaoCanceladaError)) {
      console.error('settingsSenha.js: erro no step-up ao abrir modal de senha', erro);
    }
    return; // usuário desistiu ou falhou a confirmação -- não abre o form
  } finally {
    senhaBtnAbrir.disabled = false;
  }

  abrirModalSenha();
}

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
  senhaStepupToken = null; // token só vale para este ciclo abrir->enviar
}

function mostrarErroSenha(mensagem) {
  senhaErroEl.textContent = mensagem;
}

senhaBtnAbrir?.addEventListener('click', iniciarFluxoSenha);
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

  // Pré-filtro client-side espelhando validar_senha() do backend (ver
  // ../sharedConfig/passwordValidation.js) -- só para feedback rápido. A
  // validação real e definitiva é sempre revalidada pelo backend (ver
  // validar_senha em schema_usuario.py), e qualquer erro que ele
  // devolver é mostrado cru no modal (bloco try/catch do fetch abaixo).
  const { valida: senhaValida, mensagem: mensagemSenha } = validarSenha(senhaNova);
  if (!senhaValida) {
    mostrarErroSenha(mensagemSenha);
    return;
  }
  if (senhaNova !== senhaConfirmar) {
    mostrarErroSenha('As senhas não coincidem.');
    return;
  }

  // Step-up já foi feito no clique de "Alterar senha" (ver
  // iniciarFluxoSenha). Se por algum motivo o token não estiver mais
  // disponível aqui (ex: expirou e foi limpo, ou o modal foi reaberto
  // de forma inesperada), não seguimos com um PUT fadado a 401 --
  // fechamos o form e mandamos o usuário refazer o fluxo do zero.
  if (!senhaStepupToken) {
    mostrarErroSenha('Sua confirmação de identidade expirou. Feche e tente novamente.');
    return;
  }

  senhaBtnConfirmar.disabled = true;
  try {
    const resposta = await fetch(`${URL_BASE_API}/usuarios/senha`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Stepup-Token': senhaStepupToken,
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
      // 401/419 aqui provavelmente significa token de step-up expirado
      // (janela alargada pela mudança de fluxo) -- mensagem do backend
      // é mostrada crua, mas vale considerar um caso especial se o
      // backend padronizar um código para "token expirado".
      mostrarErroSenha(corpo?.message || 'Não foi possível alterar a senha. Tente novamente.');
      return;
    }

    senhaStepupToken = null; // token de uso único, não deve ser reaproveitado
    fecharModalSenha();
    exibirFeedbackSucessoTemporario(corpo?.message || 'Senha alterada com sucesso.');
  } catch (erro) {
    console.error('settingsSenha.js: erro de rede ao alterar senha', erro);
    mostrarErroSenha('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  } finally {
    senhaBtnConfirmar.disabled = false;
  }
});