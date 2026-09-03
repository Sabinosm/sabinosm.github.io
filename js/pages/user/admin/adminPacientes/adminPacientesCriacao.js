// adminPacientesCriacao.js
//
// Orquestra o formulário de criação de paciente
// (adminPacientesCriacao.html) -- SIMPLIFICADO: só dados pessoais
// (POST /pacientes/pessoal/). Consentimento LGPD e dados clínicos
// (alergias, medicamentos, doenças crônicas) NÃO fazem mais parte
// deste fluxo -- passaram a ser registrados durante a consulta (ver
// conversa que motivou esta simplificação; os arquivos do fluxo
// anterior com Consentimento/Dados clínicos ficaram obsoletos).
//
// Três ações possíveis, todas no mesmo formulário (sem passos/abas):
//   - Cancelar               -> não cria nada, volta para a lista
//   - Salvar e sair          -> POST, depois vai para a ficha do paciente
//   - Salvar e iniciar consulta -> POST, depois vai para o placeholder
//     de consulta. Só aparece para médico/enfermeiro (ver
//     souProfissionalDeSaude() em adminProfissionaisSessao.js) --
//     outros papéis (ex: admin) nunca veem esse botão.

import { ApiError, criarPacientePessoal } from "./adminPacientesApi.js";
import { validarEssencial } from "./adminPacientesCriacaoValidacoes.js";
import { souProfissionalDeSaude } from "./adminProfissionaisSessao.js";
import { exibirMensagem } from "/js/shared/feedback.js";

let enviando = false;

document.addEventListener('DOMContentLoaded', () => {
  if (souProfissionalDeSaude()) {
    document.getElementById('btn-salvar-consulta').hidden = false;
  }

  document.getElementById('btn-cancelar').addEventListener('click', () => {
    window.location.href = 'adminPacientes.html';
  });

  document.getElementById('btn-salvar-sair').addEventListener('click', () => salvar('ficha'));
  document.getElementById('btn-salvar-consulta').addEventListener('click', () => salvar('consulta'));
});

function lerCamposEssencial() {
  return {
    nome: document.getElementById('pac-nome').value.trim(),
    cpf: document.getElementById('pac-cpf').value.trim(),
    telefone: document.getElementById('pac-telefone').value.trim(),
    sexoBiologico: document.getElementById('pac-sexo').value,
    dataNascimento: document.getElementById('pac-nascimento').value,
    email: document.getElementById('pac-email').value.trim(),
    rg: document.getElementById('pac-rg').value.trim(),
    logradouro: document.getElementById('pac-logradouro').value.trim(),
    numeroResidencia: document.getElementById('pac-numero').value.trim(),
    cep: document.getElementById('pac-cep').value.trim(),
    bairro: document.getElementById('pac-bairro').value.trim(),
    contatoEmergenciaNome: document.getElementById('pac-emergencia-nome').value.trim(),
    contatoEmergenciaTelefone: document.getElementById('pac-emergencia-telefone').value.trim(),
    tipoSanguineo: document.getElementById('pac-tipo-sanguineo').value,
    dataPrimeiroAtendimento: document.getElementById('pac-primeiro-atendimento').value,
  };
}

/**
 * @param {'ficha'|'consulta'} destino
 */
async function salvar(destino) {
  if (enviando) return;

  const { payload, erros } = validarEssencial(lerCamposEssencial());
  limparErros(['pac-nome', 'pac-cpf', 'pac-telefone', 'pac-sexo', 'pac-nascimento']);

  if (Object.keys(erros).length > 0) {
    aplicarErros(erros);
    exibirMensagem('Confira os campos destacados antes de continuar.', 'erro');
    return;
  }

  enviando = true;
  const botaoClicado = destino === 'consulta'
    ? document.getElementById('btn-salvar-consulta')
    : document.getElementById('btn-salvar-sair');
  const textoOriginal = botaoClicado.textContent;
  botaoClicado.disabled = true;
  botaoClicado.textContent = 'Salvando…';
  exibirMensagem('', '');

  try {
    const resposta = await criarPacientePessoal(payload);
    const uuid = resposta?.data?.uuid;
    if (!uuid) throw new ApiError('O paciente foi criado, mas a resposta não trouxe o identificador esperado.', 0);

    if (destino === 'consulta') {
      // TODO: rota de consulta ainda não existe -- placeholder até
      // "Consultas" ser implementado. Quando existir, trocar por algo
      // como `consultaIniciar.html?paciente=${uuid}` (ou o fluxo que
      // for definido para iniciar atendimento). É aqui, na consulta,
      // que consentimento LGPD e dados clínicos (alergias,
      // medicamentos, doenças crônicas) passam a ser registrados.
      console.log('TODO: iniciar consulta para paciente recém-criado', uuid);
      window.location.href = `adminPacientesDetalhe.html?uuid=${encodeURIComponent(uuid)}`;
    } else {
      window.location.href = `adminPacientesDetalhe.html?uuid=${encodeURIComponent(uuid)}`;
    }
  } catch (erro) {
    const mensagem = erro instanceof ApiError ? erro.message : 'Não foi possível criar o paciente.';
    exibirMensagem(mensagem, 'erro');
    botaoClicado.disabled = false;
    botaoClicado.textContent = textoOriginal;
  } finally {
    enviando = false;
  }
}

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