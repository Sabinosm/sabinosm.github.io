// adminPacienteCriacao.js
//
// Orquestra o formulário de criação de paciente
// (adminPacienteCriacao.html): passo Essencial -> passo Consentimento
// -> POST /pacientes/pessoal/ seguido de POST .../consentimentos (ou
// .../dispensar-emergencia).
//
// Único fluxo de criação, pensado para ser usado tanto em "Pacientes"
// quanto embutido dentro de uma consulta (ver conversa que originou
// este arquivo) -- por isso os campos do passo Essencial ficam
// restritos ao mínimo (nome, CPF, telefone, sexo, nascimento), com o
// resto (endereço, contato de emergência) atrás de um <details>
// opcional, para não pesar o caso de uso "médico cadastrando rápido
// durante a consulta".
//
// Blocos clínicos (alergias, doenças crônicas, medicamentos, tipo
// sanguíneo) NÃO fazem parte deste formulário -- são adicionados
// depois, quando fizer sentido, pela própria ficha do paciente.

import {
  ApiError,
  criarPacientePessoal,
  registrarConsentimento,
  dispensarConsentimentoEmergencia,
} from "./adminPacientesApi.js";
import { validarEssencial } from "./adminPacientesriacaoValidacoes.js";
import { exibirMensagem } from "/js/shared/feedback.js";

let modoConsentimento = 'normal'; // 'normal' | 'emergencia'
let enviando = false;

document.addEventListener('DOMContentLoaded', () => {
  configurarNavegacaoPassos();
  configurarToggleConsentimento();
  configurarSubmissao();
});

// ============================================
// Navegação entre os dois passos
// ============================================
function configurarNavegacaoPassos() {
  document.getElementById('btn-avancar-consentimento').addEventListener('click', () => {
    const { erros } = validarEssencial(lerCamposEssencial());
    limparErros(Object.keys(erros).concat(['pac-nome', 'pac-cpf', 'pac-telefone', 'pac-sexo', 'pac-nascimento']));

    if (Object.keys(erros).length > 0) {
      aplicarErros(erros);
      exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
      return;
    }

    limparFeedback();
    irParaPasso('consentimento');
  });

  document.getElementById('btn-voltar-essencial').addEventListener('click', () => {
    limparFeedback();
    irParaPasso('essencial');
  });
}

function irParaPasso(passo) {
  document.getElementById('painel-essencial').classList.toggle('creation-panel--active', passo === 'essencial');
  document.getElementById('painel-consentimento').classList.toggle('creation-panel--active', passo === 'consentimento');

  document.getElementById('step-indicator-essencial').classList.toggle('creation-step--active', passo === 'essencial');
  document.getElementById('step-indicator-essencial').classList.toggle('creation-step--concluido', passo === 'consentimento');
  document.getElementById('step-indicator-consentimento').classList.toggle('creation-step--active', passo === 'consentimento');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// Alternância consentimento normal <-> dispensa por emergência
// ============================================
function configurarToggleConsentimento() {
  const btnNormal = document.getElementById('btn-modo-normal');
  const btnEmergencia = document.getElementById('btn-modo-emergencia');
  const blocoNormal = document.getElementById('bloco-consentimento-normal');
  const blocoEmergencia = document.getElementById('bloco-consentimento-emergencia');

  function selecionar(modo) {
    modoConsentimento = modo;
    btnNormal.classList.toggle('consent-mode-option--active', modo === 'normal');
    btnEmergencia.classList.toggle('consent-mode-option--active', modo === 'emergencia');
    blocoNormal.style.display = modo === 'normal' ? '' : 'none';
    blocoEmergencia.classList.toggle('consent-emergencia-box--visivel', modo === 'emergencia');
  }

  btnNormal.addEventListener('click', () => selecionar('normal'));
  btnEmergencia.addEventListener('click', () => selecionar('emergencia'));

  selecionar('normal');
}

// ============================================
// Leitura dos campos
// ============================================
function lerCamposEssencial() {
  return {
    nome: document.getElementById('pac-nome').value.trim(),
    cpf: document.getElementById('pac-cpf').value.trim(),
    telefone: document.getElementById('pac-telefone').value.trim(),
    sexoBiologico: document.getElementById('pac-sexo').value,
    dataNascimento: document.getElementById('pac-nascimento').value,
    email: document.getElementById('pac-email').value.trim(),
    logradouro: document.getElementById('pac-logradouro').value.trim(),
    numeroResidencia: document.getElementById('pac-numero').value.trim(),
    cep: document.getElementById('pac-cep').value.trim(),
    contatoEmergenciaNome: document.getElementById('pac-emergencia-nome').value.trim(),
    contatoEmergenciaTelefone: document.getElementById('pac-emergencia-telefone').value.trim(),
  };
}

// ============================================
// Submissão final: cria paciente, depois registra/dispensa consentimento
// ============================================
function configurarSubmissao() {
  document.getElementById('btn-concluir-cadastro').addEventListener('click', enviarCadastro);
}

async function enviarCadastro() {
  if (enviando) return;

  // Revalida o essencial (defesa extra, caso o usuário tenha voltado
  // e mexido nos campos de novo antes de re-avançar).
  const { payload: payloadEssencial, erros } = validarEssencial(lerCamposEssencial());
  if (Object.keys(erros).length > 0) {
    irParaPasso('essencial');
    aplicarErros(erros);
    exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
    return;
  }

  let motivoEmergencia = '';
  if (modoConsentimento === 'emergencia') {
    motivoEmergencia = document.getElementById('pac-motivo-emergencia').value.trim();
    limparErros(['pac-motivo-emergencia']);
    if (!motivoEmergencia) {
      document.getElementById('pac-motivo-emergencia-error').textContent = 'Descreva o motivo da dispensa.';
      document.getElementById('pac-motivo-emergencia').closest('.field-group').classList.add('field-group--has-error');
      exibirMensagem('Informe a justificativa para dispensar o consentimento.', 'erro');
      return;
    }
  }

  enviando = true;
  const btnConcluir = document.getElementById('btn-concluir-cadastro');
  btnConcluir.disabled = true;
  const textoOriginal = btnConcluir.textContent;
  btnConcluir.textContent = 'Salvando…';
  exibirMensagem('', '');

  try {
    const respostaPaciente = await criarPacientePessoal(payloadEssencial);
    const uuid = respostaPaciente?.data?.uuid;
    if (!uuid) throw new ApiError('O paciente foi criado, mas a resposta não trouxe o identificador esperado.', 0);

    if (modoConsentimento === 'emergencia') {
      await dispensarConsentimentoEmergencia(uuid, motivoEmergencia);
    } else {
      const versaoTermo = document.getElementById('pac-versao-termo').value.trim() || 'v2.1';
      const canalColeta = document.getElementById('pac-canal-coleta').value;
      await registrarConsentimento(uuid, { versao_termo: versaoTermo, canal_coleta: canalColeta });
    }

    // Paciente criado com sucesso -- vai direto para a ficha, de onde
    // dá para adicionar alergias, medicamentos e doenças crônicas
    // quando fizer sentido (ver botões "Adicionar" já preparados lá).
    window.location.href = `adminPacienteDetalhe.html?uuid=${encodeURIComponent(uuid)}`;
  } catch (erro) {
    // Se o paciente já foi criado (uuid existe) mas o consentimento
    // falhou, não tentamos criar de novo -- isso duplicaria o
    // cadastro. Por ora só reportamos o erro; TODO: se isso for um
    // problema recorrente, considerar levar o usuário direto para a
    // ficha do paciente já criado, com um aviso para tentar registrar
    // o consentimento por lá.
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível concluir o cadastro do paciente.';
    exibirMensagem(mensagem, 'erro');
    btnConcluir.disabled = false;
    btnConcluir.textContent = textoOriginal;
  } finally {
    enviando = false;
  }
}

// ============================================
// Helpers de erro de campo (mesmo padrão visual de
// adminProfissionaisModal.js: classe field-group--has-error no pai)
// ============================================
function aplicarErros(erros) {
  Object.entries(erros).forEach(([id, mensagem]) => {
    const input = document.getElementById(id);
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = mensagem;
    const grupo = input?.closest('.field-group');
    grupo?.classList.add('field-group--has-error');
  });
}

function limparErros(ids) {
  ids.forEach(id => {
    const input = document.getElementById(id);
    const erroEl = document.getElementById(`${id}-error`);
    if (erroEl) erroEl.textContent = '';
    const grupo = input?.closest('.field-group');
    grupo?.classList.remove('field-group--has-error');
  });
}

function limparFeedback() {
  exibirMensagem('', '');
}