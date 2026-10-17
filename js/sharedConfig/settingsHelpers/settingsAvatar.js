// settingsHelpers/settingsAvatar.js
//
// Liga os botões "Alterar foto" / "Remover foto" do painel User às
// funções de avatar.js (que cuidam da API, do cache de sessão e da
// tela). Como os demais helpers do modal, roda no top-level e assume
// que o HTML do modal já foi injetado por settingsLoader.js.

import { enviarAvatar, removerAvatar } from '../avatar.js';
import { exibirMensagem } from '../../shared/feedback.js';

const TAMANHO_MAXIMO = 4 * 1024 * 1024; // mesmo limite do backend (4MB)
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

const input = document.getElementById('input-foto');
const btnAlterar = document.getElementById('btn-alterar-foto');
const btnRemover = document.getElementById('btn-remover-foto');

function ocupado(ocupadoAgora) {
  if (btnAlterar) btnAlterar.disabled = ocupadoAgora;
  if (btnRemover) btnRemover.disabled = ocupadoAgora;
}

if (btnAlterar && input) {
  btnAlterar.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const arquivo = input.files?.[0];
    input.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!arquivo) return;

    // Validação local só para evitar um upload inútil; o backend
    // continua sendo quem valida de verdade.
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      exibirMensagem('Formato não aceito. Use JPG, PNG ou WebP.', 'erro');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      exibirMensagem('A imagem excede o limite de 4MB.', 'erro');
      return;
    }

    ocupado(true);
    try {
      await enviarAvatar(arquivo);
      exibirMensagem('Foto atualizada.', 'sucesso');
    } catch (erro) {
      exibirMensagem(erro.message, 'erro');
    } finally {
      ocupado(false);
    }
  });
}

if (btnRemover) {
  btnRemover.addEventListener('click', async () => {
    ocupado(true);
    try {
      await removerAvatar();
      exibirMensagem('Foto removida.', 'sucesso');
    } catch (erro) {
      exibirMensagem(erro.message, 'erro');
    } finally {
      ocupado(false);
    }
  });
}